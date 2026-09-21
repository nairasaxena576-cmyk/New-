-- Harden standing default privileges + remaining anon function grants +
-- unnecessary authenticated table privileges
--
-- Problem (confirmed live against the production database, not assumed):
--
-- 1. pg_default_acl on the public schema, granted by role postgres, gives
--    anon full CRUD on every future table (arwdDxtm), full EXECUTE on
--    every future function, and full USAGE-class privileges on every
--    future sequence -- automatically, at object-creation time, with no
--    per-migration action required. This is the root cause of the
--    excess-anon-privilege problem fixed for existing objects in
--    20260906123000_restrict_anon_table_privileges.sql: it will
--    silently reappear on the next new table or function unless this
--    standing rule itself is changed.
--
-- 2. Live pg_proc.proacl inspection (not the advisor's summary alone)
--    shows anon can currently execute a further ~20 SECURITY DEFINER
--    functions via two distinct mechanisms: some carry a direct anon
--    grant (from the default-privileges rule above, applied when they
--    were created), others carry no direct anon entry but are reachable
--    via a PUBLIC grant (which anon, like every role, inherits). Neither
--    "REVOKE ... FROM PUBLIC" alone nor "REVOKE ... FROM anon" alone is
--    guaranteed to close both paths on every function, so this migration
--    does both for every function listed, regardless of which mechanism
--    currently applies to it.
--
--    Every function below was independently traced in the prior audit
--    and found to already reject an anon caller via its own auth.uid()/
--    is_admin()/is_admin_user() check or a NOT NULL column constraint --
--    this migration closes the grant-level gap as defense-in-depth, it
--    is not fixing a demonstrated live exploit. Confirmed via a direct
--    codebase search that none of these functions are ever called from
--    the frontend without an authenticated session; has_any_admin() and
--    get_vip_from_balance(numeric) are not called from the frontend at
--    all (internal-use helpers only), so there is no genuinely-public
--    function in this list.
--
-- 3. Live pg_class.relacl inspection shows `authenticated` holds
--    TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN on user_profiles,
--    orders, deposits, withdrawals, and activity_logs (also DELETE on
--    user_profiles specifically) -- none of this was ever explicitly
--    granted; it is the same default-privileges residue as (1). None of
--    it is required: every legitimate write to these five tables goes
--    through a SECURITY DEFINER RPC (unaffected by this table-level
--    revoke, since those functions run as their owner) except
--    recharge.tsx's direct INSERT into deposits, which only needs
--    INSERT + SELECT and keeps both here.
--
-- This migration only changes privileges/default-privileges. It does
-- not modify any RLS policy, any function body, any table structure, or
-- any data. REVOKE/GRANT and ALTER DEFAULT PRIVILEGES are idempotent:
-- re-running this file changes nothing if already applied. No
-- version-specific syntax beyond MAINTAIN (added in PostgreSQL 15,
-- present in 17.6) is used.

-- ============ PART 1: standing default privileges ============
-- Applies only to objects postgres creates in public FROM NOW ON --
-- this cannot and does not alter any existing object's privileges.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- ============ PART 2: remaining anon-executable functions ============
-- Exact signatures verified live via pg_proc / pg_get_function_identity_arguments
-- immediately before writing this migration.

REVOKE ALL ON FUNCTION public.admin_adjust_balance(text, text, numeric, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(text, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(text, text, numeric, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_deposit(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_deposit(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_deposit(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_withdrawal(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_withdrawal(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_deposit(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_deposit(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_deposit(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_withdrawal_request(text, text, text, numeric, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_withdrawal_request(text, text, text, numeric, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_withdrawal_request(text, text, text, numeric, text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reply_ticket(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reply_ticket(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_ticket(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_ticket_status_admin(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_ticket_status_admin(uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_ticket_status_admin(uuid, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_edit_ticket_message(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_edit_ticket_message(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_ticket_message(uuid, text, text) TO authenticated;

-- admin_set_start_access: two live overloads, both hardened
REVOKE ALL ON FUNCTION public.admin_set_start_access(text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_start_access(text, text, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_user_lucky_settings(text, text, boolean, numeric, numeric, integer, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_user_lucky_settings(text, text, boolean, numeric, numeric, integer, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_lucky_settings(text, text, boolean, numeric, numeric, integer, numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_log_action(text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_log_action(text, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, text, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_user_profile(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_user_profile(text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_user_profile(text, text, text, text, text, text) TO authenticated;

-- Not called from the frontend at all (internal helper); hardened anyway
-- for defense-in-depth consistency with the rest of this schema.
REVOKE ALL ON FUNCTION public.has_any_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_any_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- Not called from the frontend at all (internal helper); hardened anyway
-- for the same reason as has_any_admin() above.
REVOKE ALL ON FUNCTION public.get_vip_from_balance(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vip_from_balance(numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vip_from_balance(numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_lucky_settings(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_lucky_settings(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_lucky_settings(text) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_first_admin_if_needed(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_first_admin_if_needed(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_first_admin_if_needed(text) TO authenticated;

-- ============ PART 3: unnecessary authenticated table privileges ============
-- Removes only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN (and DELETE, which
-- none of these five tables' legitimate flows use -- all real deletes,
-- where they exist at all, happen only via SECURITY DEFINER RPCs).
-- SELECT is preserved on all five; INSERT is preserved on deposits
-- (recharge.tsx submits a deposit request via a direct table insert).
-- Revoking a privilege a role does not currently hold is a harmless
-- no-op, so this is safe to apply uniformly across all five tables.

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.user_profiles, public.orders, public.deposits, public.withdrawals, public.activity_logs
  FROM authenticated;
