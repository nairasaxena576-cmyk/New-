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