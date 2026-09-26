-- Add a narrowly-scoped, admin-only read path for invitation_codes.
--
-- ## Problem
--
-- 20260923090000_require_validated_invitation_codes.sql intentionally left
-- invitation_codes with zero PUBLIC/anon/authenticated grants and RLS
-- enabled with no policy — the table is reachable only from inside
-- SECURITY DEFINER functions. That migration added
-- admin_generate_invitation_code(), which returns only the single code it
-- just created. It did not add any way to list/review existing codes, so
-- there is currently no secure path for an admin UI to show invitation-code
-- history/status. `supabase.from('invitation_codes').select('*')` would
-- fail outright (no grant) and, if a grant were added to make it work,
-- would let every authenticated user list every invitation code —
-- violating the table's intended admin-only trust boundary.
--
-- ## Solution
--
-- A single new SECURITY DEFINER function, admin_list_invitation_codes(),
-- following the exact same authorization pattern as
-- admin_generate_invitation_code() (is_admin_user() gate, authenticated-
-- only grant, anon/PUBLIC revoked). It returns only the columns an admin
-- UI needs to display code/status/created/used-by information — not the
-- internal `id` primary key, which the UI has no use for (the unique
-- `code` column already serves as a stable list key). No new RLS policy is
-- added to invitation_codes; the table remains completely inaccessible
-- except through this function and the two SECURITY DEFINER functions from
-- the prior migration.
--
-- This migration does not modify 20260923090000_require_validated_
-- invitation_codes.sql, does not touch create_user_profile,
-- admin_generate_invitation_code, or assign_first_admin_if_needed, and does
-- not add any INSERT/UPDATE/DELETE capability — codes remain
-- non-editable from the application layer, exactly as before.

CREATE OR REPLACE FUNCTION public.admin_list_invitation_codes()
RETURNS TABLE (
  code text,
  created_by text,
  created_at timestamptz,
  used_by text,
  used_at timestamptz,
  is_bootstrap boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  RETURN QUERY
  SELECT ic.code, ic.created_by, ic.created_at, ic.used_by, ic.used_at, ic.is_bootstrap
  FROM public.invitation_codes ic
  ORDER BY ic.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_invitation_codes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_invitation_codes() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_invitation_codes() TO authenticated;
