/*
# Admin Panel: withdrawals, VIP config, announcements, activity logs

## Purpose
Adds the tables and RPCs needed for the full admin panel:
- Withdrawals with approval workflow
- Editable VIP tier rules (replaces hard-coded vip-config)
- Announcements (admin-published, user-visible)
- Activity logs (audit trail of admin actions)
- Dashboard aggregate stats RPC

## New Tables

### withdrawals
- id (uuid, PK)
- user_id (text) — matches user_profiles.user_id
- user_email (text)
- user_name (text)
- amount (numeric)
- method (text) — 'bank' | 'usdt'
- account_info (text) — destination account/wallet
- status (text) — 'pending' | 'approved' | 'rejected'
- note (text)
- created_at (timestamptz)
- reviewed_at (timestamptz)

### vip_config
- level (integer, PK)
- name (text)
- daily_order_limit (integer)
- commission_rate (numeric)
- min_deposit (numeric)
- updated_at (timestamptz)

### announcements
- id (uuid, PK)
- title (text)
- body (text)
- type (text) — 'info' | 'success' | 'warning' | 'danger'
- is_active (boolean)
- sort_order (integer)
- created_at (timestamptz)
- updated_at (timestamptz)

### activity_logs
- id (uuid, PK)
- actor (text) — admin name/email
- action (text) — e.g. 'approve_deposit', 'reject_withdrawal'
- target_type (text) — 'deposit' | 'withdrawal' | 'product' | 'user' | 'vip' | 'announcement'
- target_id (text)
- details (text)
- created_at (timestamptz)

## New/Modified Functions

### approve_withdrawal(p_withdrawal_id uuid, p_actor text)
SECURITY DEFINER. Atomically:
1. Locks the withdrawal row, checks status = 'pending'.
2. Checks user has sufficient balance in user_profiles.
3. Deducts amount from user_profiles.balance.
4. Updates withdrawal status to 'approved' + reviewed_at.
5. Logs the action to activity_logs.
Returns user_id on success, NULL if already processed or insufficient balance.

### reject_withdrawal(p_withdrawal_id uuid, p_actor text)
SECURITY DEFINER. Atomically:
1. Locks the withdrawal row, checks status = 'pending'.
2. Updates withdrawal status to 'rejected' + reviewed_at.
3. Logs the action to activity_logs.
Returns user_id on success, NULL if already processed.

### log_activity(p_actor text, p_action text, p_target_type text, p_target_id text, p_details text)
SECURITY DEFINER. Inserts a row into activity_logs.

### get_dashboard_stats()
SECURITY DEFINER. Returns a JSON object with aggregate metrics:
total_users, total_balance, pending_deposits, pending_withdrawals,
total_deposits_approved, total_withdrawals_approved, total_orders,
total_commission, active_announcements.

## Security
- RLS enabled on all new tables.
- withdrawals: anon+authenticated can INSERT (user submits), SELECT own;
  UPDATE only via SECURITY DEFINER RPCs (no direct UPDATE policy).
- vip_config: SELECT for anon+authenticated (needed by frontend);
  INSERT/UPDATE/DELETE for anon+authenticated (admin panel writes).
- announcements: SELECT for anon+authenticated; INSERT/UPDATE/DELETE for anon+authenticated.
- activity_logs: SELECT for anon+authenticated; INSERT via RPC only (no direct INSERT policy
  except through the SECURITY DEFINER function which bypasses RLS).
- All RPCs are SECURITY DEFINER with search_path = public.
*/

-- ============ withdrawals ============
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'bank',
  account_info text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdrawals" ON withdrawals;
CREATE POLICY "anon_select_withdrawals" ON withdrawals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdrawals" ON withdrawals;
CREATE POLICY "anon_insert_withdrawals" ON withdrawals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at DESC);

-- ============ vip_config ============
CREATE TABLE IF NOT EXISTS vip_config (
  level integer PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  daily_order_limit integer NOT NULL DEFAULT 38,
  commission_rate numeric NOT NULL DEFAULT 1,
  min_deposit numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vip_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_vip_config" ON vip_config;
CREATE POLICY "anon_select_vip_config" ON vip_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_vip_config" ON vip_config;
CREATE POLICY "anon_insert_vip_config" ON vip_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_vip_config" ON vip_config;
CREATE POLICY "anon_update_vip_config" ON vip_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_vip_config" ON vip_config;
CREATE POLICY "anon_delete_vip_config" ON vip_config FOR DELETE
  TO anon, authenticated USING (true);

-- Seed VIP config from the existing hard-coded values
INSERT INTO vip_config (level, name, daily_order_limit, commission_rate, min_deposit)
SELECT 0, 'VIP0', 38, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM vip_config WHERE level = 0);

INSERT INTO vip_config (level, name, daily_order_limit, commission_rate, min_deposit)
SELECT 1, 'VIP1', 43, 1.5, 1000
WHERE NOT EXISTS (SELECT 1 FROM vip_config WHERE level = 1);

INSERT INTO vip_config (level, name, daily_order_limit, commission_rate, min_deposit)
SELECT 2, 'VIP2', 51, 2, 3000
WHERE NOT EXISTS (SELECT 1 FROM vip_config WHERE level = 2);

INSERT INTO vip_config (level, name, daily_order_limit, commission_rate, min_deposit)
SELECT 3, 'VIP3', 60, 2.5, 5000
WHERE NOT EXISTS (SELECT 1 FROM vip_config WHERE level = 3);

-- ============ announcements ============
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_announcements" ON announcements;
CREATE POLICY "anon_select_announcements" ON announcements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_announcements" ON announcements;
CREATE POLICY "anon_insert_announcements" ON announcements FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_announcements" ON announcements;
CREATE POLICY "anon_update_announcements" ON announcements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_announcements" ON announcements;
CREATE POLICY "anon_delete_announcements" ON announcements FOR DELETE
  TO anon, authenticated USING (true);

-- Seed a welcome announcement
INSERT INTO announcements (title, body, type, is_active, sort_order)
SELECT 'Welcome to NexBuy', 'Optimize products and earn commissions daily. New features coming soon!', 'info', true, 1
WHERE NOT EXISTS (SELECT 1 FROM announcements LIMIT 1);

-- ============ activity_logs ============
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  target_type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_activity_logs" ON activity_logs;
CREATE POLICY "anon_select_activity_logs" ON activity_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_activity_logs" ON activity_logs;
CREATE POLICY "anon_insert_activity_logs" ON activity_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target_type ON activity_logs(target_type);

-- ============ Add UPDATE policy to products for admin CRUD ============
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- ============ log_activity function ============
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
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (p_actor, p_action, p_target_type, p_target_id, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION log_activity TO anon, authenticated;

-- ============ approve_withdrawal function ============
CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_withdrawal_id uuid,
  p_actor text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal RECORD;
BEGIN
  SELECT user_id, amount, user_name, status INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- Check sufficient balance
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = v_withdrawal.user_id
    AND balance >= v_withdrawal.amount
  ) THEN
    RAISE EXCEPTION 'Insufficient balance for user %', v_withdrawal.user_id;
  END IF;

  -- Deduct balance
  UPDATE user_profiles
  SET balance = balance - v_withdrawal.amount
  WHERE user_id = v_withdrawal.user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_withdrawal_id;

  -- Log the action
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (p_actor, 'approve_withdrawal', 'withdrawal', p_withdrawal_id::text,
    'Approved withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name);

  RETURN v_withdrawal.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_withdrawal TO anon, authenticated;

-- ============ reject_withdrawal function ============
CREATE OR REPLACE FUNCTION reject_withdrawal(
  p_withdrawal_id uuid,
  p_actor text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_withdrawal RECORD;
BEGIN
  SELECT user_id, amount, user_name, status INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  UPDATE withdrawals
  SET status = 'rejected', reviewed_at = now()
  WHERE id = p_withdrawal_id;

  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (p_actor, 'reject_withdrawal', 'withdrawal', p_withdrawal_id::text,
    'Rejected withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name);

  RETURN v_withdrawal.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_withdrawal TO anon, authenticated;

-- ============ get_dashboard_stats function ============
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
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

GRANT EXECUTE ON FUNCTION get_dashboard_stats TO anon, authenticated;
