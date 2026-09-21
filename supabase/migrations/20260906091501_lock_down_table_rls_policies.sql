/*
# CRITICAL SECURITY FIX: lock down direct table access (RLS + grants)

## Problem
Several tables were left with "mock auth" / early-development RLS policies
that grant `USING (true)` / `WITH CHECK (true)` to `anon, authenticated`,
i.e. full CRUD with no ownership or admin check at all:
  deposits, orders, withdrawals, vip_config, announcements, activity_logs,
  products.

Separately, `user_profiles` has row-scoped "own row" INSERT/UPDATE policies
(`auth.uid()::text = user_id`) but — because Postgres RLS is row-scoped, not
column-scoped — those policies place NO restriction on which columns a user
may write. Since the app never performs a direct `.from('user_profiles')
.insert()/.update()` call (all profile creation/mutation already goes
through SECURITY DEFINER RPCs: create_user_profile, admin_adjust_balance,
submit_order, complete_order, admin_set_start_access, etc. — verified by
repo-wide search), this direct-table access path is unused by the app but
still reachable by anyone with a valid session via a raw PostgREST call,
letting any authenticated user set their own `role = 'admin'`, `balance`,
`vip_level`, etc. directly.

Combined, an unauthenticated caller (using only the public anon key) could
read/forge/delete other users' deposits, orders and withdrawals (including
flipping a pending withdrawal to "approved" or swapping its payout wallet
address), and any authenticated user could grant themselves admin or an
arbitrary balance — completely bypassing every SECURITY DEFINER RPC and its
authorization checks.

## Fix
- `user_profiles`: revoke direct INSERT/UPDATE grants from `authenticated`
  entirely. All profile creation/mutation must go through the existing
  SECURITY DEFINER RPCs (unaffected by this — they run as the function
  owner and do not depend on caller grants).
- `deposits`, `orders`, `withdrawals`, `activity_logs`: replace the
  `anon`/`true` policies with row-owner-or-admin SELECT policies, and drop
  direct INSERT/UPDATE/DELETE for everything that already goes through an
  RPC (submit_order, complete_order, submit_withdrawal_request,
  approve_deposit, approve/reject_withdrawal, log_activity — all
  SECURITY DEFINER and unaffected by table-level grants). `deposits` keeps
  a narrow authenticated INSERT policy (own row, status forced to
  'pending') because recharge.tsx submits deposit requests via a direct
  insert, not an RPC.
- `vip_config`, `announcements`, `products`: keep public SELECT (these are
  legitimately public catalog/config data), but restrict INSERT/UPDATE/
  DELETE to admins only (verified these three ARE written via direct
  `.update()/.insert()/.delete()` calls from the admin panel, not RPCs).
- `is_admin(text)`: was missing `REVOKE ALL FROM PUBLIC`, making
  admin-status of any user_id checkable by anyone. Locked down to match
  `is_admin_user()`/`is_admin()`.

All SELECT/INSERT policies below use `public.is_admin_user()`, the existing
SECURITY DEFINER helper (already used successfully for user_profiles' own
admin policies without recursion, since it evaluates as the function owner).
*/

-- ============ user_profiles: remove direct write access ============
-- All creation/mutation already goes through SECURITY DEFINER RPCs.
REVOKE INSERT, UPDATE ON public.user_profiles FROM authenticated;

-- ============ deposits ============
DROP POLICY IF EXISTS "anon_select_deposits" ON deposits;
DROP POLICY IF EXISTS "anon_insert_deposits" ON deposits;
DROP POLICY IF EXISTS "anon_update_deposits" ON deposits;
DROP POLICY IF EXISTS "anon_delete_deposits" ON deposits;

CREATE POLICY "select_own_or_admin_deposits" ON deposits FOR SELECT
  TO authenticated USING (auth.uid()::text = user_id OR public.is_admin_user());

-- recharge.tsx inserts its own deposit request directly (not via RPC);
-- force ownership and force status to 'pending' regardless of client input.
CREATE POLICY "insert_own_pending_deposit" ON deposits FOR INSERT
  TO authenticated WITH CHECK (auth.uid()::text = user_id AND status = 'pending');

-- No direct UPDATE/DELETE policy: approve_deposit/reject_deposit RPCs
-- (SECURITY DEFINER) perform all status transitions and bypass RLS.

REVOKE ALL ON public.deposits FROM anon;
REVOKE DELETE, UPDATE ON public.deposits FROM authenticated;

-- ============ orders ============
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;

CREATE POLICY "select_own_or_admin_orders" ON orders FOR SELECT
  TO authenticated USING (auth.uid()::text = user_id OR public.is_admin_user());

-- No direct INSERT/UPDATE/DELETE policy: submit_order/complete_order RPCs
-- (SECURITY DEFINER) are the only writers and bypass RLS.

REVOKE ALL ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;

-- ============ withdrawals ============
DROP POLICY IF EXISTS "anon_select_withdrawals" ON withdrawals;
DROP POLICY IF EXISTS "anon_insert_withdrawals" ON withdrawals;

CREATE POLICY "select_own_or_admin_withdrawals" ON withdrawals FOR SELECT
  TO authenticated USING (auth.uid()::text = user_id OR public.is_admin_user());

-- No direct INSERT/UPDATE/DELETE policy: submit_withdrawal_request /
-- approve_withdrawal / reject_withdrawal RPCs are the only writers.

REVOKE ALL ON public.withdrawals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawals FROM authenticated;

-- ============ activity_logs (admin audit trail) ============
DROP POLICY IF EXISTS "anon_select_activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "anon_insert_activity_logs" ON activity_logs;

CREATE POLICY "admin_select_activity_logs" ON activity_logs FOR SELECT
  TO authenticated USING (public.is_admin_user());

-- No direct INSERT policy: log_activity RPC (SECURITY DEFINER) is the only writer.

REVOKE ALL ON public.activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.activity_logs FROM authenticated;

-- ============ vip_config: public read, admin-only write ============
DROP POLICY IF EXISTS "anon_insert_vip_config" ON vip_config;
DROP POLICY IF EXISTS "anon_update_vip_config" ON vip_config;
DROP POLICY IF EXISTS "anon_delete_vip_config" ON vip_config;

CREATE POLICY "admin_insert_vip_config" ON vip_config FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_update_vip_config" ON vip_config FOR UPDATE
  TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_delete_vip_config" ON vip_config FOR DELETE
  TO authenticated USING (public.is_admin_user());

REVOKE INSERT, UPDATE, DELETE ON public.vip_config FROM anon;

-- ============ announcements: public read, admin-only write ============
DROP POLICY IF EXISTS "anon_insert_announcements" ON announcements;
DROP POLICY IF EXISTS "anon_update_announcements" ON announcements;
DROP POLICY IF EXISTS "anon_delete_announcements" ON announcements;

CREATE POLICY "admin_insert_announcements" ON announcements FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_update_announcements" ON announcements FOR UPDATE
  TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_delete_announcements" ON announcements FOR DELETE
  TO authenticated USING (public.is_admin_user());

REVOKE INSERT, UPDATE, DELETE ON public.announcements FROM anon;

-- ============ products: public read, admin-only write ============
DROP POLICY IF EXISTS "anon_insert_products" ON products;
DROP POLICY IF EXISTS "anon_update_products" ON products;
DROP POLICY IF EXISTS "anon_delete_products" ON products;

CREATE POLICY "admin_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_update_products" ON products FOR UPDATE
  TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "admin_delete_products" ON products FOR DELETE
  TO authenticated USING (public.is_admin_user());

REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;

-- ============ is_admin(text): close world-executable info leak ============
REVOKE ALL ON FUNCTION public.is_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(text) TO authenticated;
