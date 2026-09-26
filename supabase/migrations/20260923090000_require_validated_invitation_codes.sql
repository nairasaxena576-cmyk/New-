-- Require a real, admin-issued, single-use invitation code to register,
-- and separate that gate from referral-attribution ("referrer_code").
--
-- ## Problem
--
-- The registration form has always marked "Invitation code" as required,
-- but create_user_profile() (20260902112453_20260902090000_referral_system)
-- never actually validated it: any 6+ character string satisfies the
-- frontend's client-side check, and the RPC's only use of that value was a
-- best-effort SELECT against user_profiles.referral_code — if nothing
-- matched, it silently proceeded with inviter_id = ''. The database was
-- never the authority the UI implied it was.
--
-- ## Solution
--
-- 1. A new invitation_codes table holds admin-issued, single-use codes.
--    It has zero grants to anon/authenticated and RLS enabled with no
--    policy, so it is reachable only from inside the two SECURITY DEFINER
--    functions below (the same trust boundary assign_first_admin_if_needed
--    already relies on to write user_profiles.role past RLS).
--
-- 2. create_user_profile() gains a new trailing parameter (p_referrer_code).
--    IMPORTANT: PostgreSQL function identity is (schema, name, argument
--    TYPE LIST) — this includes every declared parameter, regardless of
--    whether it has a default. A 7-argument type list is a DIFFERENT
--    identity from the existing 6-argument one, so CREATE OR REPLACE
--    FUNCTION alone would NOT replace the old function — it would create a
--    second, additional overload sitting alongside it, leaving the old,
--    invitation-unvalidated 6-argument create_user_profile fully present
--    and callable. That would completely undermine the mandatory
--    invitation gate this migration exists to add. To prevent that, this
--    migration explicitly DROPs the exact existing 6-argument signature
--    first, then creates the 7-argument version as the only
--    create_user_profile in the schema. A self-verification block at the
--    end of this migration confirms both facts (old gone, new present
--    exactly once) and aborts the whole migration if not.
--
--    The existing p_invitation_code parameter becomes the required,
--    validated, atomically-consumed registration gate; the new
--    p_referrer_code parameter takes over the OLD best-effort
--    referral-attribution lookup, unchanged in behavior — an unmatched or
--    absent referrer code is not an error, it only affects who (if anyone)
--    is credited as inviter_id. This keeps the two concepts genuinely
--    separate, as they are on the frontend: p_invitation_code is a gate,
--    p_referrer_code is optional attribution, and p_referral_code
--    (unchanged, third existing parameter) remains the NEW user's own
--    shareable code — unrelated to either.
--
-- 3. A new admin_generate_invitation_code() RPC lets an admin mint codes
--    for real users, following the exact IF NOT public.is_admin_user() ...
--    RAISE EXCEPTION pattern already used by admin_set_start_access and
--    every other admin_* RPC in this schema.
--
-- 4. The one bootstrap code (to register the very first account, which
--    still becomes admin only through the existing, UNCHANGED
--    assign_first_admin_if_needed) is deliberately NOT inserted by this
--    migration. The operator seeds it by hand via the SQL Editor after
--    this migration is applied — it must never appear in a migration file,
--    in frontend source, or in any committed artifact.
--
-- This migration does not touch assign_first_admin_if_needed, does not
-- modify any RLS policy on an existing table, does not grant anon anything,
-- and does not edit any prior migration file.

-- ============ 1. invitation_codes table ============

CREATE TABLE public.invitation_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  created_by   text,                -- admin's user_id; NULL for the bootstrap row
  created_at   timestamptz NOT NULL DEFAULT now(),
  used_by      text,                -- redeemer's user_id; NULL until used
  used_at      timestamptz,         -- NULL until used
  is_bootstrap boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX idx_invitation_codes_code ON public.invitation_codes(code);
CREATE INDEX idx_invitation_codes_used_by ON public.invitation_codes(used_by) WHERE used_by IS NOT NULL;

ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;
-- Deliberately zero CREATE POLICY statements: RLS enabled with no policy
-- denies every row to every role, matching admin_audit_log's pattern.

REVOKE ALL ON public.invitation_codes FROM PUBLIC, anon, authenticated;
-- No SELECT/INSERT/UPDATE/DELETE grant to anon or authenticated at all —
-- not even read-only. Only reachable via the two SECURITY DEFINER
-- functions below, which bypass RLS/grants as the table owner (postgres).

-- ============ 2. create_user_profile(): add p_referrer_code, ============
-- ============    make p_invitation_code a real, validated gate  ============

-- Explicitly remove the OLD 6-argument overload first. Function identity in
-- PostgreSQL is keyed on the full declared argument TYPE list, not on how
-- many of those arguments have defaults — so a 7-argument version below
-- would NOT replace this one on its own; it would coexist as a second,
-- separate overload with the unvalidated invitation-code behavior still
-- live and callable. IF EXISTS keeps this statement safe to re-run (a
-- second application of this migration finds nothing to drop here).
DROP FUNCTION IF EXISTS public.create_user_profile(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_user_id text,
  p_email text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT '',
  p_invitation_code text DEFAULT '',
  p_referral_code text DEFAULT '',
  p_referrer_code text DEFAULT ''
) RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row public.user_profiles;
  v_inviter_id text := '';
  v_gate_code text;
BEGIN
  -- Security: only the authenticated user themselves can create their profile
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  -- Idempotent: a retried call for an already-completed user (e.g. the
  -- confirm-email flow's completeUserProfile() running again on the next
  -- session restore) is a pure read. It never re-validates or re-consumes
  -- an invitation code, so a retry can never require — or cost — a second
  -- code.
  SELECT * INTO new_row FROM public.user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN new_row;
  END IF;

  -- ---- Invitation code: REQUIRED registration gate ----
  -- Validated against invitation_codes and atomically consumed in the same
  -- statement: the UPDATE ... WHERE used_by IS NULL clause IS the
  -- concurrency lock. Two simultaneous callers with the same code race on
  -- this row; Postgres serializes them, the first commits used_by, the
  -- second finds zero matching rows and is rejected. If anything later in
  -- this function fails, the whole function body — including this UPDATE —
  -- rolls back together, so a code can never end up "consumed but no
  -- profile created."
  v_gate_code := NULLIF(TRIM(p_invitation_code), '');
  IF v_gate_code IS NULL THEN
    RAISE EXCEPTION 'Invitation code is required';
  END IF;

  UPDATE public.invitation_codes
  SET used_by = p_user_id, used_at = now()
  WHERE code = v_gate_code AND used_by IS NULL
  RETURNING code INTO v_gate_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already-used invitation code';
  END IF;

  -- ---- Referrer code: OPTIONAL, attribution only, never consumed ----
  -- Unmatched or absent referrer codes are not an error — this mirrors the
  -- exact pre-existing referral-lookup semantics (previously driven by
  -- p_invitation_code before this migration split the two concepts apart).
  -- Only the invitation-code gate above is new/strict.
  IF NULLIF(TRIM(p_referrer_code), '') IS NOT NULL THEN
    SELECT user_id INTO v_inviter_id
    FROM public.user_profiles
    WHERE referral_code = TRIM(p_referrer_code)
    LIMIT 1;

    -- Prevent self-referral
    IF v_inviter_id = p_user_id THEN
      v_inviter_id := '';
    END IF;
  END IF;

  -- Insert the new profile
  INSERT INTO public.user_profiles (
    user_id, email, full_name, phone,
    invitation_code, referral_code, inviter_id,
    role, status, vip_level,
    balance, total_deposits,
    lifetime_commission, today_commission,
    completed_today, remaining_orders,
    total_referral_earned, total_referral_given
  ) VALUES (
    p_user_id, p_email, p_full_name, p_phone,
    TRIM(p_invitation_code), p_referral_code, v_inviter_id,
    'user', 'active', 0,
    0, 0,
    0, 0,
    0, 38,
    0, 0
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_profile(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_profile(text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(text, text, text, text, text, text, text) TO authenticated;

-- ============ 2b. Self-verification ============
-- Runs only at the moment this migration is actually applied by the
-- operator (not executed as part of writing this file). Aborts the entire
-- migration transaction — rolling back everything above — if any check
-- fails, so a partially-correct state can never be left behind silently.
--
-- IMPORTANT: this identifies create_user_profile by pg_proc.pronargs
-- (argument count) and pg_proc.proargtypes (the argument type OID vector)
-- — never by pg_get_function_identity_arguments()'s DISPLAY text. That
-- function reconstructs a full name-and-type declaration list whenever a
-- function's parameters were declared with names — e.g. 'p_user_id text,
-- p_email text, p_full_name text, ...' — not a bare, name-free type list.
-- Every create_user_profile parameter in this schema has always been
-- named, so an earlier version of this check, which compared against the
-- hardcoded name-free string 'text, text, text, text, text, text[, text]',
-- could never match anything real: the "old 6-arg gone" check was a silent
-- no-op, and the "new 7-arg exists" check unconditionally raised
-- 'new 7-argument create_user_profile not found' even when it existed —
-- rolling back this entire transaction, including the DROP FUNCTION that
-- had already succeeded, and leaving the old 6-argument function in place.
-- pronargs/proargtypes are structured catalog columns, not display
-- formatting, so they carry no such ambiguity.
DO $$
DECLARE
  v_count integer;
  v_nargs integer;
  v_all_text boolean;
BEGIN
  -- 1. The old 6-argument overload must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_user_profile'
      AND p.pronargs = 6
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: old 6-argument create_user_profile still exists';
  END IF;

  -- 2. Exactly one create_user_profile must exist in the schema.
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_user_profile';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Migration verification failed: expected exactly 1 create_user_profile, found %', v_count;
  END IF;

  -- 3. That one function must have exactly 7 arguments, all of type text.
  SELECT p.pronargs INTO v_nargs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_user_profile';

  IF v_nargs <> 7 THEN
    RAISE EXCEPTION 'Migration verification failed: create_user_profile has % argument(s), expected 7', v_nargs;
  END IF;

  SELECT bool_and(argtype = 'text'::regtype) INTO v_all_text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL unnest(p.proargtypes::oid[]) AS argtype
  WHERE n.nspname = 'public' AND p.proname = 'create_user_profile';

  IF NOT COALESCE(v_all_text, false) THEN
    RAISE EXCEPTION 'Migration verification failed: create_user_profile does not have 7 text arguments';
  END IF;
END $$;

-- ============ 3. admin_generate_invitation_code() ============

CREATE OR REPLACE FUNCTION public.admin_generate_invitation_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- Server-generated, unpredictable, never derived from anything the
  -- caller supplies.
  v_code := 'HWK-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10));

  INSERT INTO public.invitation_codes (code, created_by, is_bootstrap)
  VALUES (v_code, auth.uid()::text, false);

  -- Only ever returns the code it just created — this function cannot be
  -- used to enumerate or list existing codes; there is no corresponding
  -- SELECT grant on invitation_codes for anyone to fall back on.
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_generate_invitation_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_generate_invitation_code() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_invitation_code() TO authenticated;

-- ============ 4. Bootstrap code: NOT inserted here ============
-- After this migration is applied, the operator must run, by hand, in the
-- Supabase SQL Editor (never committed, never scripted):
--
--   INSERT INTO public.invitation_codes (code, is_bootstrap)
--   VALUES ('<operator-chosen code>', true);
--
-- The first real account registers through the normal /register form using
-- that code — the identical create_user_profile() path every other user
-- goes through. There is no special-cased "first user" branch anywhere in
-- this function; assign_first_admin_if_needed (unchanged, called from the
-- frontend's completeUserProfile(), not from this function) is what
-- promotes that first successful registrant to admin.
