/*
# Add registration fields to user_profiles and create support system tables

## 1. user_profiles — new columns
- `role` (text, default 'user') — 'user' or 'admin'
- `status` (text, default 'active') — 'active', 'suspended', 'pending'
- `vip_level` (int, default 0) — explicit VIP level
- `remaining_orders` (int, default 38) — daily remaining order count
- `invitation_code` (text, default '') — code used during registration
- `referral_code` (text, default '') — user's own referral code

## 2. support_tickets — new table
- Stores customer support tickets created by users
- Columns: id, user_id, user_email, user_name, subject, category, priority, status, message, admin_reply, created_at, updated_at, replied_at

## 3. faq_entries — new table
- Stores FAQ entries manageable by admin
- Columns: id, question, answer, category, sort_order, is_active, created_at, updated_at

## 4. chat_messages — new table
- Stores live chat messages between users and admin
- Columns: id, user_id, user_email, user_name, sender, message, is_read, created_at

## 5. Security (RLS)
- user_profiles: users can read/update own row; all rows readable by authenticated (admin needs visibility)
- support_tickets: users can read/insert own tickets; admin can read all
- faq_entries: readable by all authenticated; only admin writes (enforced via app)
- chat_messages: users can read/insert own messages; admin can read all
*/

-- ============ 1. user_profiles additions ============

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'role') THEN
    ALTER TABLE user_profiles ADD COLUMN role text NOT NULL DEFAULT 'user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'status') THEN
    ALTER TABLE user_profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'vip_level') THEN
    ALTER TABLE user_profiles ADD COLUMN vip_level integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'remaining_orders') THEN
    ALTER TABLE user_profiles ADD COLUMN remaining_orders integer NOT NULL DEFAULT 38;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'invitation_code') THEN
    ALTER TABLE user_profiles ADD COLUMN invitation_code text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'referral_code') THEN
    ALTER TABLE user_profiles ADD COLUMN referral_code text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ============ 2. support_tickets ============

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  message text NOT NULL,
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tickets" ON support_tickets;
CREATE POLICY "select_own_tickets"
ON support_tickets FOR SELECT
TO authenticated USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "insert_own_tickets" ON support_tickets;
CREATE POLICY "insert_own_tickets"
ON support_tickets FOR INSERT
TO authenticated WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "update_own_tickets" ON support_tickets;
CREATE POLICY "update_own_tickets"
ON support_tickets FOR UPDATE
TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "admin_select_all_tickets" ON support_tickets;
CREATE POLICY "admin_select_all_tickets"
ON support_tickets FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_all_tickets" ON support_tickets;
CREATE POLICY "admin_update_all_tickets"
ON support_tickets FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- ============ 3. faq_entries ============

CREATE TABLE IF NOT EXISTS faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_faq" ON faq_entries;
CREATE POLICY "read_faq"
ON faq_entries FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_faq" ON faq_entries;
CREATE POLICY "admin_insert_faq"
ON faq_entries FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_faq" ON faq_entries;
CREATE POLICY "admin_update_faq"
ON faq_entries FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_delete_faq" ON faq_entries;
CREATE POLICY "admin_delete_faq"
ON faq_entries FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

-- ============ 4. chat_messages ============

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  sender text NOT NULL DEFAULT 'user',
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_chat" ON chat_messages;
CREATE POLICY "select_own_chat"
ON chat_messages FOR SELECT
TO authenticated USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "insert_own_chat" ON chat_messages;
CREATE POLICY "insert_own_chat"
ON chat_messages FOR INSERT
TO authenticated WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "admin_select_all_chat" ON chat_messages;
CREATE POLICY "admin_select_all_chat"
ON chat_messages FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_insert_chat" ON chat_messages;
CREATE POLICY "admin_insert_chat"
ON chat_messages FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_chat" ON chat_messages;
CREATE POLICY "admin_update_chat"
ON chat_messages FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.user_id = auth.uid()::text AND user_profiles.role = 'admin')
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- ============ 5. user_profiles policies (own row read/update) ============

DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;
CREATE POLICY "select_own_profile"
ON user_profiles FOR SELECT
TO authenticated USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
CREATE POLICY "insert_own_profile"
ON user_profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
CREATE POLICY "update_own_profile"
ON user_profiles FOR UPDATE
TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

-- Admin can read all profiles
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
CREATE POLICY "admin_select_all_profiles"
ON user_profiles FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
);

-- Seed a few FAQ entries
INSERT INTO faq_entries (question, answer, category, sort_order) VALUES
  ('How do I deposit funds?', 'Go to the Recharge page, choose a payment method (bank transfer or USDT), and upload a payment screenshot. Your deposit will be reviewed within 5–30 minutes.', 'account', 1),
  ('How do I withdraw my earnings?', 'Visit the Withdrawal page, enter the amount and your bank or USDT wallet details. Withdrawals are processed within 1–3 business days.', 'account', 2),
  ('How are VIP levels determined?', 'VIP levels are based on your total approved deposits. The more you deposit, the higher your VIP level and commission rate.', 'vip', 3),
  ('What is a lucky product?', 'Lucky products come with a fixed commission percentage set by the admin. They appear randomly in your assigned tasks for a chance to earn extra commission.', 'tasks', 4),
  ('How many tasks can I complete per day?', 'Your daily task limit depends on your VIP level. VIP0 starts at 38 tasks per day, scaling up to 60 at VIP3.', 'tasks', 5),
  ('Is my account secure?', 'Your account is protected by email/password authentication. Never share your password with anyone. Our support team will never ask for your password.', 'security', 6)
ON CONFLICT DO NOTHING;