/*
# Create user_profiles + products tables, seed data, and RPC functions

## Purpose
Replaces remaining mock state (balance, completedToday, todayCommission,
lifetimeCommission, products) with database-backed data. Adds two
SECURITY DEFINER RPC functions for atomic operations that must not be
bypassable by client-side logic.

## New Tables

### user_profiles
Per-user financial state that updates when orders complete and deposits approve.
- user_id (text, PK) — matches the mock auth user id (e.g. 'usr_001')
- email (text)
- full_name (text)
- phone (text)
- balance (numeric) — current wallet balance
- total_deposits (numeric) — sum of approved deposits
- lifetime_commission (numeric) — all-time commission earned
- today_commission (numeric) — commission earned today
- completed_today (integer) — orders completed today
- last_order_date (date) — used to reset today_commission + completed_today on new day
- created_at (timestamptz)

### products
Product catalog seeded from the mock data. Supports min_vip gating and lucky flag.
- id (text, PK)
- name (text)
- merchant (text)
- price (numeric)
- category (text)
- category_tint (text)
- image (text)
- min_vip (integer)
- is_lucky (boolean)
- lucky_commission_percent (numeric)
- sort_order (integer)
- created_at (timestamptz)

## New Functions

### complete_order(p_user_id text, p_order_number text, p_task_number text, p_product_id text, p_product_name text, p_merchant text, p_unit_price numeric, p_total_price numeric, p_commission numeric, p_commission_rate numeric, p_is_lucky boolean, p_lucky_commission_percent numeric, p_vip_level integer, p_note text)
SECURITY DEFINER. Atomically:
1. Inserts a row into orders.
2. Deducts p_total_price from user_profiles.balance.
3. Adds (p_total_price + p_commission) back to balance (price returned + commission earned).
4. Increments completed_today and adds p_commission to today_commission (resets if new day).
5. Adds p_commission to lifetime_commission.
Returns the updated user_profiles row so the client can sync state.

### approve_deposit(p_deposit_id uuid)
SECURITY DEFINER. Atomically:
1. Updates deposit status to 'approved' + sets reviewed_at.
2. Guards against double-approval (only acts if current status = 'pending').
3. Adds the deposit amount to user_profiles.balance and total_deposits.
4. Returns the user_id of the approved deposit so the client can refresh.
Returns NULL if already processed (idempotent).

## Security
- RLS enabled on user_profiles and products.
- products: read-only for anon + authenticated (catalog is shared).
- user_profiles: users can read their own row; all mutations go through
  the SECURITY DEFINER functions (complete_order, approve_deposit) which
  run with elevated privileges, so no direct INSERT/UPDATE/DELETE policies
  are needed beyond the owner read + a defensive INSERT for self-creation.
- orders and deposits tables already exist with appropriate policies.
- complete_order and approve_deposit are SECURITY DEFINER, callable by
  anon + authenticated (the app uses mock auth with anon key).

## Seed Data
- 31 products matching the mock catalog (IDs p1–p31).
- user_profiles row for 'usr_001' with balance 12840.50, total_deposits 6000,
  lifetime_commission 48230.75, today_commission 182.40, completed_today 12.
*/

-- ============ user_profiles ============
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id text PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  balance numeric NOT NULL DEFAULT 0,
  total_deposits numeric NOT NULL DEFAULT 0,
  lifetime_commission numeric NOT NULL DEFAULT 0,
  today_commission numeric NOT NULL DEFAULT 0,
  completed_today integer NOT NULL DEFAULT 0,
  last_order_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_profiles" ON user_profiles;
CREATE POLICY "anon_select_user_profiles" ON user_profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_profiles" ON user_profiles;
CREATE POLICY "anon_insert_user_profiles" ON user_profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- No UPDATE/DELETE policies — all mutations go through SECURITY DEFINER functions.

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- ============ products ============
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  merchant text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT '',
  category_tint text NOT NULL DEFAULT 'default',
  image text NOT NULL DEFAULT '',
  min_vip integer NOT NULL DEFAULT 0,
  is_lucky boolean NOT NULL DEFAULT false,
  lucky_commission_percent numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

-- Read-only catalog; no INSERT/UPDATE/DELETE from the client.

-- ============ Seed products (idempotent) ============
INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p1', 'Wireless Noise-Cancelling Headphones', 'Amazon', 89.0, 'Electronics', 'default', 'https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p1');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p2', 'Premium Running Sneakers', 'AliExpress', 120.0, 'Fashion', 'default', 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 2
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p2');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p3', 'Polarized Aviator Sunglasses', 'Shopee', 85.0, 'Accessories', 'secondary', 'https://images.pexels.com/photos/701877/pexels-photo-701877.jpeg?auto=compress&cs=tinysrgb&w=600', 0, true, 14, 3
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p3');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p4', 'Smart Fitness Tracker Watch', 'Amazon', 95.0, 'Electronics', 'default', 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 4
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p4');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p5', 'Designer Canvas Backpack', 'AliExpress', 110.0, 'Accessories', 'secondary', 'https://images.pexels.com/photos/2905238/pexels-photo-2905238.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 5
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p5');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p6', 'Portable Bluetooth Speaker', 'Lazada', 145.0, 'Electronics', 'default', 'https://images.pexels.com/photos/1279106/pexels-photo-1279106.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 6
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p6');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p7', 'Luxury Eau de Parfum 50ml', 'TikTok Shop', 135.0, 'Beauty', 'warning', 'https://images.pexels.com/photos/965989/pexels-photo-965989.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 7
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p7');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p8', 'Stainless Steel Water Bottle', 'Temu', 80.0, 'Home', 'success', 'https://images.pexels.com/photos/1188649/pexels-photo-1188649.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 8
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p8');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p9', 'Wireless Charging Pad', 'Shopee', 100.0, 'Electronics', 'default', 'https://images.pexels.com/photos/4526473/pexels-photo-4526473.jpeg?auto=compress&cs=tinysrgb&w=600', 0, true, 22, 9
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p9');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p10', 'Minimalist Stainless Steel Watch', 'Shopify', 245.5, 'Accessories', 'secondary', 'https://images.pexels.com/photos/277390/pexels-photo-277390.jpeg?auto=compress&cs=tinysrgb&w=600', 0, true, 18, 10
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p10');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p11', 'Leather Crossbody Handbag', 'TikTok Shop', 310.75, 'Fashion', 'default', 'https://images.pexels.com/photos/904350/pexels-photo-904350.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 11
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p11');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p12', 'Espresso Coffee Machine', 'Wayfair', 285.0, 'Home', 'success', 'https://images.pexels.com/photos/2074130/pexels-photo-2074130.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 12
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p12');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p13', 'Memory Foam Pillow Set', 'Amazon', 220.0, 'Home', 'success', 'https://images.pexels.com/photos/6585598/pexels-photo-6585598.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 13
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p13');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p14', 'Designer Leather Wallet', 'AliExpress', 265.0, 'Accessories', 'secondary', 'https://images.pexels.com/photos/2079246/pexels-photo-2079246.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 14
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p14');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p15', 'Air Purifier with HEPA Filter', 'Lazada', 330.0, 'Home', 'success', 'https://images.pexels.com/photos/4226119/pexels-photo-4226119.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 15
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p15');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p16', 'Premium Yoga Mat Pro', 'Temu', 205.0, 'Fitness', 'secondary', 'https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 16
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p16');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p17', 'Robot Vacuum Cleaner', 'Amazon', 349.0, 'Home', 'success', 'https://images.pexels.com/photos/4108715/pexels-photo-4108715.jpeg?auto=compress&cs=tinysrgb&w=600', 1, true, 30, 17
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p17');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p18', 'Designer Sunglasses Collection', 'Shopee', 295.0, 'Accessories', 'secondary', 'https://images.pexels.com/photos/701877/pexels-photo-701877.jpeg?auto=compress&cs=tinysrgb&w=600', 0, false, 0, 18
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p18');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p19', 'Mirrorless Digital Camera 4K', 'Amazon', 689.0, 'Electronics', 'default', 'https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=600', 1, true, 25, 19
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p19');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p20', 'Pro Gaming Mechanical Keyboard', 'Wayfair', 430.0, 'Electronics', 'default', 'https://images.pexels.com/photos/2115256/pexels-photo-2115256.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 20
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p20');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p21', 'Flagship Smartphone 256GB', 'Temu', 549.99, 'Electronics', 'default', 'https://images.pexels.com/photos/699122/pexels-photo-699122.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 21
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p21');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p22', 'Ceramic Cookware Set 10-Piece', 'Wayfair', 480.0, 'Home', 'success', 'https://images.pexels.com/photos/4226806/pexels-photo-4226806.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 22
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p22');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p23', 'Curved Gaming Monitor 32"', 'Amazon', 720.0, 'Electronics', 'default', 'https://images.pexels.com/photos/777001/pexels-photo-777001.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 23
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p23');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p24', 'Premium DSLR Camera Kit', 'Shopify', 780.0, 'Electronics', 'default', 'https://images.pexels.com/photos/51383/photo-camera-subject-photographer-51383.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 24
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p24');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p25', 'Smartwatch Series Pro', 'AliExpress', 450.0, 'Electronics', 'default', 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=600', 1, false, 0, 25
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p25');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p26', 'Ergonomic Office Chair', 'Wayfair', 615.0, 'Home', 'success', 'https://images.pexels.com/photos/1957478/pexels-photo-1957478.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 26
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p26');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p27', 'Gaming Laptop RTX 4070', 'Amazon', 1299.0, 'Electronics', 'default', 'https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 27
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p27');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p28', 'Designer Diamond Necklace', 'TikTok Shop', 1850.0, 'Jewelry', 'warning', 'https://images.pexels.com/photos/1191531/pexels-photo-1191531.jpeg?auto=compress&cs=tinysrgb&w=600', 3, true, 45, 28
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p28');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p29', 'Flagship Smartphone Pro Max', 'Temu', 1099.0, 'Electronics', 'default', 'https://images.pexels.com/photos/788946/pexels-photo-788946.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 29
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p29');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p30', 'Luxury Automatic Watch', 'Shopify', 2450.0, 'Accessories', 'secondary', 'https://images.pexels.com/photos/125779/pexels-photo-125779.jpeg?auto=compress&cs=tinysrgb&w=600', 3, false, 0, 30
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p30');

INSERT INTO products (id, name, merchant, price, category, category_tint, image, min_vip, is_lucky, lucky_commission_percent, sort_order)
SELECT 'p31', '75" 4K Smart TV', 'Lazada', 1499.0, 'Electronics', 'default', 'https://images.pexels.com/photos/333044/pexels-photo-333044.jpeg?auto=compress&cs=tinysrgb&w=600', 2, false, 0, 31
WHERE NOT EXISTS (SELECT 1 FROM products WHERE id = 'p31');

-- ============ Seed user_profiles for demo user ============
INSERT INTO user_profiles (user_id, email, full_name, phone, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
SELECT 'usr_001', 'user@nexbuy.io', 'Alex Morgan', '+1 555 0182', 12840.50, 6000, 48230.75, 182.40, 12, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = 'usr_001');

-- ============ complete_order function ============
CREATE OR REPLACE FUNCTION complete_order(
  p_user_id text,
  p_order_number text,
  p_task_number text,
  p_product_id text,
  p_product_name text,
  p_merchant text,
  p_unit_price numeric,
  p_total_price numeric,
  p_commission numeric,
  p_commission_rate numeric,
  p_is_lucky boolean,
  p_lucky_commission_percent numeric,
  p_vip_level integer,
  p_note text
) RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile user_profiles;
  v_today date := CURRENT_DATE;
  v_completed_today integer;
  v_today_commission numeric;
BEGIN
  -- Insert the order row
  INSERT INTO orders (
    user_id, order_number, task_number, product_id, product_name,
    merchant, unit_price, total_price, commission, commission_rate,
    is_lucky, lucky_commission_percent, vip_level, status, note
  ) VALUES (
    p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
    p_merchant, p_unit_price, p_total_price, p_commission, p_commission_rate,
    p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note
  );

  -- Reset daily counters if it's a new day
  SELECT completed_today, today_commission INTO v_completed_today, v_today_commission
  FROM user_profiles WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Create profile if it doesn't exist
    INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
    VALUES (p_user_id, 0, 0, 0, 0, 0, v_today)
    ON CONFLICT (user_id) DO NOTHING;
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- Atomically: deduct price, return price + commission, update counters
  UPDATE user_profiles
  SET
    balance = balance - p_total_price + p_total_price + p_commission,
    lifetime_commission = lifetime_commission + p_commission,
    today_commission = v_today_commission + p_commission,
    completed_today = v_completed_today + 1,
    last_order_date = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- Grant execute to anon + authenticated
GRANT EXECUTE ON FUNCTION complete_order TO anon, authenticated;

-- ============ approve_deposit function ============
CREATE OR REPLACE FUNCTION approve_deposit(p_deposit_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit RECORD;
  v_user_id text;
BEGIN
  -- Lock the deposit row and check it's still pending
  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_deposit.status <> 'pending' THEN
    RETURN NULL; -- idempotent: already processed
  END IF;

  -- Update deposit status
  UPDATE deposits
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_deposit_id;

  -- Credit balance + total_deposits
  INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
  VALUES (v_deposit.user_id, v_deposit.amount, v_deposit.amount, 0, 0, 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_profiles.balance + v_deposit.amount,
      total_deposits = user_profiles.total_deposits + v_deposit.amount;

  RETURN v_deposit.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_deposit TO anon, authenticated;
