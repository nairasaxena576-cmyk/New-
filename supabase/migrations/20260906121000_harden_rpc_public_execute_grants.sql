/*
# Harden RPC EXECUTE grants: revoke implicit PUBLIC access

## Problem
PostgreSQL automatically grants EXECUTE to the PUBLIC pseudo-role on every
CREATE FUNCTION unless explicitly revoked. Five SECURITY DEFINER functions
never had that default revoked in any prior migration:

  - get_user_profile_safe(text)
  - submit_order(text, text, text, text, text, text, numeric, numeric,
      numeric, numeric, boolean, numeric, integer, text)
  - complete_order(text, text, text, text, text, text, numeric, numeric,
      numeric, numeric, boolean, numeric, integer, text)
  - get_user_lucky_settings(text)
  - assign_first_admin_if_needed(text)

Because every role (including `anon`) implicitly inherits PUBLIC grants,
the `REVOKE EXECUTE ... FROM anon` statements added for the first three of
these in 20260906090000_fix_missing_ownership_checks_and_anon_grants.sql
and reasserted in 20260906120000_secure_server_side_commission_calculation.sql
did not fully remove anon's ability to call them — only anon's own,
separate grant. The lingering PUBLIC grant meant `anon` could still
technically invoke these functions at the privilege-check layer.

In practice this was not exploitable: every one of these functions checks
`auth.uid()::text IS DISTINCT FROM p_user_id` (or, for
get_user_lucky_settings, that check OR is_admin_user()) before touching any
data, and for a true anon caller auth.uid() is NULL — which correctly fails
that check for any real p_user_id. The only way to slip past the check as
anon is to also pass p_user_id = NULL, and every subsequent query in these
functions is a `WHERE user_id = p_user_id` lookup, which never matches any
row when p_user_id is NULL (standard SQL NULL comparison semantics) — so no
data is read or written. Still, relying on that combination of behaviors
instead of an explicit grant restriction is fragile defense-in-depth, not a
deliberate one. This migration closes it properly.

is_admin_user(), create_user_profile(), and is_admin(text) already had
`REVOKE ALL ... FROM PUBLIC` applied (the latter in
20260906091501_lock_down_table_rls_policies.sql) — this migration brings
the remaining five functions in line with that existing pattern. None of
the five had a prior PUBLIC revoke, so nothing here is redundant.

## Fix
For each function: REVOKE ALL FROM PUBLIC, then explicitly (re-)GRANT
EXECUTE to `authenticated` only — the same role these functions were
already restricted to. No RLS, table grant, business logic, or commission
formula changes. No auth.uid()/admin checks, SECURITY DEFINER, or
search_path settings are touched — only the function-level EXECUTE
privilege.
*/

-- ============ get_user_profile_safe(text) ============
REVOKE ALL ON FUNCTION public.get_user_profile_safe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_profile_safe(text) TO authenticated;

-- ============ submit_order(...) ============
REVOKE ALL ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;

-- ============ complete_order(...) ============
REVOKE ALL ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;

-- ============ get_user_lucky_settings(text) ============
REVOKE ALL ON FUNCTION public.get_user_lucky_settings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_lucky_settings(text) TO authenticated;

-- ============ assign_first_admin_if_needed(text) ============
REVOKE ALL ON FUNCTION public.assign_first_admin_if_needed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_first_admin_if_needed(text) TO authenticated;
