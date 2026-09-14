/*
# Create deposits and orders tables for VIP and order tracking

## Purpose
Replaces all mock/hard-coded VIP logic with database-backed deposit tracking.
VIP level is automatically derived from the sum of a user's approved deposits.

## New Tables

### deposits
Tracks user recharge (top-up) requests and their admin approval status.
- id (uuid, PK)
- user_id (text) — mock user ID, e.g. 'usr_001'
- user_email (text) — denormalized for admin display
- user_name (text) — denormalized for admin display
- amount (numeric) — deposit amount in USD
- method (text) — 'bank' or 'usdt'
- status (text) — 'pending', 'approved', or 'rejected'
- screenshot_url (text) — base64 data URL of payment proof
- transaction_id (text) — user-provided transaction reference
- note (text) — optional user note
- created_at (timestamptz) — request timestamp
- reviewed_at (timestamptz) — when admin acted

### orders
Tracks completed product optimization tasks (orders submitted from the Start page).
- id (uuid, PK)
- user_id (text)
- order_number (text) — e.g. NBX-20260728-123456
- task_number (text) — e.g. TASK-ABCD1234
- product_id (text)
- product_name (text)
- merchant (text)
- unit_price (numeric)
- total_price (numeric)
- commission (numeric) — earned commission amount
- commission_rate (numeric) — percentage applied
- is_lucky (boolean) — whether product was a lucky product
- lucky_commission_percent (numeric) — admin-assigned rate if lucky
- vip_level (integer) — VIP level at time of order
- status (text) — 'completed'
- note (text)
- created_at (timestamptz)

## Security
- RLS enabled on both tables.
- Policies use TO anon, authenticated because this app uses mock auth
  (localStorage-based, not Supabase auth). The anon-key client must be
  able to read and write its own data.

## Seed Data
- 3 approved deposits for demo user 'usr_001' totaling $6,000 (VIP3 eligibility: $5,000+)
*/

CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'bank',
  status text NOT NULL DEFAULT 'pending',
  screenshot_url text,
  transaction_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deposits" ON deposits;
CREATE POLICY "anon_select_deposits" ON deposits FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_deposits" ON deposits;
CREATE POLICY "anon_insert_deposits" ON deposits FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_deposits" ON deposits;
CREATE POLICY "anon_update_deposits" ON deposits FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_deposits" ON deposits;
CREATE POLICY "anon_delete_deposits" ON deposits FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  order_number text NOT NULL,
  task_number text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  merchant text NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  commission numeric NOT NULL,
  commission_rate numeric NOT NULL,
  is_lucky boolean NOT NULL DEFAULT false,
  lucky_commission_percent numeric NOT NULL DEFAULT 0,
  vip_level integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Seed approved deposits for demo user 'usr_001' ($6,000 total → VIP3)
INSERT INTO deposits (user_id, user_email, user_name, amount, method, status, created_at, reviewed_at)
SELECT 'usr_001', 'user@nexbuy.io', 'Alex Morgan', 2000, 'bank', 'approved', '2026-07-10T09:30:00Z', '2026-07-10T10:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM deposits WHERE user_id = 'usr_001' AND amount = 2000 AND method = 'bank' AND status = 'approved' AND created_at = '2026-07-10T09:30:00Z');

INSERT INTO deposits (user_id, user_email, user_name, amount, method, status, created_at, reviewed_at)
SELECT 'usr_001', 'user@nexbuy.io', 'Alex Morgan', 2000, 'usdt', 'approved', '2026-07-15T14:12:00Z', '2026-07-15T14:30:00Z'
WHERE NOT EXISTS (SELECT 1 FROM deposits WHERE user_id = 'usr_001' AND amount = 2000 AND method = 'usdt' AND status = 'approved' AND created_at = '2026-07-15T14:12:00Z');

INSERT INTO deposits (user_id, user_email, user_name, amount, method, status, created_at, reviewed_at)
SELECT 'usr_001', 'user@nexbuy.io', 'Alex Morgan', 2000, 'bank', 'approved', '2026-07-20T11:45:00Z', '2026-07-20T12:00:00Z'
WHERE NOT EXISTS (SELECT 1 FROM deposits WHERE user_id = 'usr_001' AND amount = 2000 AND method = 'bank' AND status = 'approved' AND created_at = '2026-07-20T11:45:00Z');
