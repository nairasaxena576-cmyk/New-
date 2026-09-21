-- Harden remaining admin-only RPCs: log_activity and get_dashboard_stats
--
-- Problem: two SECURITY DEFINER functions, created once in
-- 20260801082240_create_admin_panel_tables_and_rpcs.sql and never touched
-- by any later migration (including the 6 security migrations that
-- hardened every other RPC in this schema), had no authorization check at
-- all and were still GRANTed EXECUTE to anon:
--
--   - log_activity(text, text, text, text, text) inserts a row into
--     activity_logs (the admin audit trail) with fully client-supplied
--     actor/action/details and no check on who is calling. Any
--     unauthenticated caller could forge arbitrary audit-log entries,
--     including ones impersonating real admins performing real actions.
--
--   - get_dashboard_stats() returns platform-wide aggregate financial
--     metrics (total balance across every user, total approved deposits
--     and withdrawals, total commission, user counts) with no check on
--     who is calling. Any unauthenticated caller could read these
--     aggregates.
--
-- Both are called exclusively from admin pages in the frontend, via the
-- logActivity()/fetchDashboardStats() wrappers in
-- src/lib/supabase/deposits.ts, verified by repo-wide search, so
-- restricting them to authenticated admins only does not remove any
-- legitimate behavior.
--
-- Fix: reuse the existing, already-hardened Hawksem admin-check pattern,
-- public.is_admin_user() (SECURITY DEFINER, checks auth.uid() against
-- user_profiles.role = 'admin', already REVOKE ALL FROM PUBLIC'd in
-- 20260823100627_..._fix_rls_infinite_recursion.sql.sql), the same
-- function already used internally by admin_reply_ticket,
-- update_ticket_status_admin, admin_edit_ticket_message, and
-- admin_set_start_access. No new authorization mechanism is introduced.
--
-- For each function:
--   1. Re-create with the exact same signature, return type, and
--      business logic, adding an admin check as the first statement in
--      the body.
--   2. REVOKE EXECUTE FROM anon (and FROM PUBLIC, for the same
--      defense-in-depth reason applied to every other RPC in
--      20260906121000_harden_rpc_public_execute_grants.sql; neither
--      function ever had an explicit PUBLIC revoke either).
--   3. GRANT EXECUTE TO authenticated only.
--
-- REVOKE/GRANT statements are plain SQL grants: they are inherently
-- idempotent (re-running them changes nothing if already applied) and
-- require no version-specific syntax, so this migration is valid on
-- PostgreSQL 17.6.

-- ============ log_activity: add admin check ============

CREATE OR REPLACE FUNCTION log_activity(
  p_actor text,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (p_actor, p_action, p_target_type, p_target_id, p_details);
END;
$$;

REVOKE ALL ON FUNCTION log_activity(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_activity(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION log_activity(text, text, text, text, text) TO authenticated;

-- ============ get_dashboard_stats: add admin check ============

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM user_profiles),
    'total_balance', (SELECT COALESCE(sum(balance), 0) FROM user_profiles),
    'pending_deposits', (SELECT count(*) FROM deposits WHERE status = 'pending'),
    'pending_withdrawals', (SELECT count(*) FROM withdrawals WHERE status = 'pending'),
    'total_deposits_approved', (SELECT COALESCE(sum(amount), 0) FROM deposits WHERE status = 'approved'),
    'total_withdrawals_approved', (SELECT COALESCE(sum(amount), 0) FROM withdrawals WHERE status = 'approved'),
    'total_orders', (SELECT count(*) FROM orders),
    'total_commission', (SELECT COALESCE(sum(commission), 0) FROM orders),
    'active_announcements', (SELECT count(*) FROM announcements WHERE is_active = true),
    'total_products', (SELECT count(*) FROM products),
    'lucky_products', (SELECT count(*) FROM products WHERE is_lucky = true)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_dashboard_stats() FROM anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;
