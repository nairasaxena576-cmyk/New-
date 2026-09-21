/*
# Fix IDOR on get_user_lucky_settings + race condition in first-admin bootstrap

## Problem 1: get_user_lucky_settings(p_user_id) — IDOR
No ownership or admin check: any authenticated user could read another
user's per-user lucky-product settings (chance %, commission %, daily
limit, price range) by passing an arbitrary user_id. The legitimate admin
flow (manage-user-modal.tsx) calls this for a user OTHER than the caller,
so the fix must allow either the row owner OR an admin — not owner-only.

## Problem 2: assign_first_admin_if_needed — bootstrap race condition
`IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin') THEN
UPDATE ... END IF` has no row lock, so two concurrent calls during the
very first registration window can both pass the NOT EXISTS check before
either UPDATE commits, promoting more than one user to admin. Fixed by
taking a transaction-scoped advisory lock so concurrent callers serialize.
*/

CREATE OR REPLACE FUNCTION public.get_user_lucky_settings(p_user_id text)
RETURNS user_lucky_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row user_lucky_settings;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  SELECT * INTO v_row FROM user_lucky_settings WHERE user_id = p_user_id;
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_first_admin_if_needed(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  -- Serialize concurrent bootstrap attempts so at most one caller can
  -- win the "no admin exists yet" race.
  PERFORM pg_advisory_xact_lock(hashtext('assign_first_admin_if_needed'));

  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin') THEN
    UPDATE user_profiles SET role = 'admin' WHERE user_id = p_user_id;
  END IF;
END;
$$;
