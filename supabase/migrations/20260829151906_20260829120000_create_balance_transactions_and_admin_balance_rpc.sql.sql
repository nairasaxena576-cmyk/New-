/*
# Admin Balance Management — Audit Table + Secure RPC Functions

## Overview
Adds a full audit trail for every customer balance change and gives admins
secure, server-enforced functions to approve deposits, reject deposits, and
manually adjust balances. All privilege checks happen inside SECURITY DEFINER
functions so the browser cannot bypass them.

## New Tables
- `balance_transactions` — immutable audit log of every balance change.
  Columns: id, customer_id, admin_id, deposit_id (nullable), previous_balance,
  adjustment_amount, new_balance, adjustment_type ('credit' | 'debit'),
  reason, reference, created_at.

## New / Modified RPC Functions
1. `approve_deposit(p_deposit_id uuid, p_admin_id text)` — replaces the existing
   approve_deposit. Atomically marks the deposit approved (idempotent — rejects
   double-approve), credits balance + total_deposits, and writes an audit row.
2. `reject_deposit(p_deposit_id uuid, p_admin_id text, p_reason text)` — marks a
   pending deposit as rejected without touching balance. Idempotent.
3. `admin_adjust_balance(p_customer_id text, p_adjustment_type text, p_amount numeric,
   p_reason text, p_reference text)` — admin-only manual credit/debit. Validates
   the caller is an admin via user_profiles.role, validates amount > 0, updates
   balance atomically, and writes an audit row. Prevents debit below zero.

## Security
- RLS enabled on balance_transactions.
- SELECT limited to admins (role = 'admin') — customers cannot see other users'
  audit rows. A customer can see their own rows.
- INSERT/UPDATE/DELETE denied for all roles — rows are only written by the
  SECURITY DEFINER functions.
- All functions check `user_profiles.role = 'admin'` for the calling auth.uid().
- EXECUTE revoked from anon on all admin functions; granted to authenticated.
*/

-- ============ balance_transactions table ============

CREATE TABLE IF NOT EXISTS balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  admin_id text,
  deposit_id uuid,
  previous_balance numeric NOT NULL DEFAULT 0,
  adjustment_amount numeric NOT NULL DEFAULT 0,
  new_balance numeric NOT NULL DEFAULT 0,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('credit', 'debit')),
  reason text NOT NULL DEFAULT '',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_customer
  ON balance_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_balance_tx_deposit
  ON balance_transactions (deposit_id)
  WHERE deposit_id IS NOT NULL;

ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can see all rows; customers can see only their own
DROP POLICY IF EXISTS "balance_tx_select_admin_or_self" ON balance_transactions;
CREATE POLICY "balance_tx_select_admin_or_self"
  ON balance_transactions FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()::text
      AND user_profiles.role = 'admin'
    )
  );

-- No direct INSERT / UPDATE / DELETE through the data API — only via SECURITY DEFINER functions
DROP POLICY IF EXISTS "balance_tx_no_insert" ON balance_transactions;
CREATE POLICY "balance_tx_no_insert"
  ON balance_transactions FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "balance_tx_no_update" ON balance_transactions;
CREATE POLICY "balance_tx_no_update"
  ON balance_transactions FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "balance_tx_no_delete" ON balance_transactions;
CREATE POLICY "balance_tx_no_delete"
  ON balance_transactions FOR DELETE
  TO authenticated
  USING (false);

-- ============ Helper: is_admin check ============

CREATE OR REPLACE FUNCTION is_admin(p_uid text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.user_id = p_uid
    AND user_profiles.role = 'admin'
  );
$$;

-- ============ approve_deposit (enhanced with audit) ============

CREATE OR REPLACE FUNCTION approve_deposit(p_deposit_id uuid, p_admin_id text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deposit RECORD;
  v_prev_balance numeric;
  v_new_balance numeric;
BEGIN
  -- Verify caller is admin
  IF NOT is_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  -- Lock the deposit row and check it's still pending
  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already processed
  IF v_deposit.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- Get current balance (may not have a profile yet)
  SELECT balance INTO v_prev_balance
  FROM user_profiles WHERE user_id = v_deposit.user_id;

  IF v_prev_balance IS NULL THEN
    v_prev_balance := 0;
  END IF;

  v_new_balance := v_prev_balance + v_deposit.amount;

  -- Update deposit status
  UPDATE deposits
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_deposit_id;

  -- Credit balance + total_deposits (upsert profile)
  INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
  VALUES (v_deposit.user_id, v_deposit.amount, v_deposit.amount, 0, 0, 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_profiles.balance + v_deposit.amount,
      total_deposits = user_profiles.total_deposits + v_deposit.amount;

  -- Write audit record
  INSERT INTO balance_transactions
    (customer_id, admin_id, deposit_id, previous_balance, adjustment_amount,
     new_balance, adjustment_type, reason, reference)
  VALUES
    (v_deposit.user_id, p_admin_id, p_deposit_id, v_prev_balance,
     v_deposit.amount, v_new_balance, 'credit',
     'Deposit approved', p_deposit_id::text);

  RETURN v_deposit.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_deposit(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION approve_deposit(uuid, text) TO authenticated;

-- ============ reject_deposit ============

CREATE OR REPLACE FUNCTION reject_deposit(p_deposit_id uuid, p_admin_id text DEFAULT '', p_reason text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deposit RECORD;
BEGIN
  -- Verify caller is admin
  IF NOT is_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  -- Lock and check
  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: only reject pending deposits
  IF v_deposit.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- Mark rejected, do NOT touch balance
  UPDATE deposits
  SET status = 'rejected', reviewed_at = now(),
      note = COALESCE(NULLIF(p_reason, ''), note)
  WHERE id = p_deposit_id;

  RETURN v_deposit.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION reject_deposit(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION reject_deposit(uuid, text, text) TO authenticated;

-- ============ admin_adjust_balance ============

CREATE OR REPLACE FUNCTION admin_adjust_balance(
  p_customer_id text,
  p_adjustment_type text,
  p_amount numeric,
  p_reason text DEFAULT '',
  p_reference text DEFAULT ''
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id text;
  v_prev_balance numeric;
  v_new_balance numeric;
  v_adj_amount numeric;
BEGIN
  -- Verify caller is admin
  v_admin_id := auth.uid()::text;
  IF NOT is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  -- Validate adjustment type
  IF p_adjustment_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid adjustment type: must be credit or debit';
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Get current balance
  SELECT balance INTO v_prev_balance
  FROM user_profiles WHERE user_id = p_customer_id;

  IF v_prev_balance IS NULL THEN
    v_prev_balance := 0;
  END IF;

  IF p_adjustment_type = 'credit' THEN
    v_adj_amount := p_amount;
    v_new_balance := v_prev_balance + p_amount;
  ELSE
    v_adj_amount := -p_amount;
    v_new_balance := v_prev_balance - p_amount;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient balance: cannot debit below zero';
    END IF;
  END IF;

  -- Update balance atomically (upsert profile if needed)
  INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
  VALUES (p_customer_id, v_new_balance, 0, 0, 0, 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = v_new_balance;

  -- Write audit record
  INSERT INTO balance_transactions
    (customer_id, admin_id, deposit_id, previous_balance, adjustment_amount,
     new_balance, adjustment_type, reason, reference)
  VALUES
    (p_customer_id, v_admin_id, NULL, v_prev_balance,
     v_adj_amount, v_new_balance, p_adjustment_type,
     COALESCE(NULLIF(p_reason, ''), 'Manual adjustment'),
     COALESCE(NULLIF(p_reference, ''), NULL));

  RETURN v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_adjust_balance(text, text, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_adjust_balance(text, text, numeric, text, text) TO authenticated;
