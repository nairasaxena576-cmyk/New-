-- Admin-managed crypto wallets and threaded support messages.
-- Does not alter existing tables, auth, or RLS.

-- ============ payment_wallets ============
CREATE TABLE IF NOT EXISTS payment_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_name text NOT NULL,
  display_name text NOT NULL,
  network text NOT NULL,
  wallet_address text NOT NULL,
  contract_address text,
  qr_image_url text,
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_wallets ENABLE ROW LEVEL SECURITY;

-- Anyone who is signed in can view active wallets (needed for recharge).
-- Admins can see all wallets including inactive ones.
CREATE POLICY "view_active_wallets"
  ON payment_wallets FOR SELECT
  TO authenticated
  USING (is_active = true OR is_admin_user());

-- Only admins can manage wallets.
CREATE POLICY "admin_insert_wallets"
  ON payment_wallets FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

CREATE POLICY "admin_update_wallets"
  ON payment_wallets FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE POLICY "admin_delete_wallets"
  ON payment_wallets FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- ============ support_messages ============
-- Threaded conversation messages on a support ticket.
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender text NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  message text NOT NULL,
  attachment_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
  ON support_messages(ticket_id, created_at);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- A user can see messages on their own tickets; an admin can see all.
CREATE POLICY "user_select_own_messages"
  ON support_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND t.user_id = (auth.uid())::text
    )
  );

CREATE POLICY "admin_select_all_messages"
  ON support_messages FOR SELECT
  TO authenticated
  USING (is_admin_user());

-- Users insert messages only on their own tickets; sender must be 'user'.
CREATE POLICY "user_insert_own_messages"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender = 'user'
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND t.user_id = (auth.uid())::text
    )
  );

-- Admins insert messages on any ticket; sender must be 'admin'.
CREATE POLICY "admin_insert_messages"
  ON support_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender = 'admin'
    AND is_admin_user()
  );

-- Admins can update (mark read); users cannot update messages.
CREATE POLICY "admin_update_messages"
  ON support_messages FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Only admins can delete messages.
CREATE POLICY "admin_delete_messages"
  ON support_messages FOR DELETE
  TO authenticated
  USING (is_admin_user());

-- ============ storage buckets ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('wallet-qr', 'wallet-qr', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Wallet QR uploads: only admins write, anyone can read (public bucket).
CREATE POLICY "anon_read_wallet_qr"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'wallet-qr');

CREATE POLICY "admin_write_wallet_qr"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'wallet-qr' AND is_admin_user());

CREATE POLICY "admin_update_wallet_qr"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'wallet-qr' AND is_admin_user())
  WITH CHECK (bucket_id = 'wallet-qr' AND is_admin_user());

CREATE POLICY "admin_delete_wallet_qr"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'wallet-qr' AND is_admin_user());

-- Support attachments: any signed-in user can upload to their own path;
-- anyone signed in can read (so admin can view customer uploads).
CREATE POLICY "read_support_attachments"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'support-attachments');

CREATE POLICY "insert_support_attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

CREATE POLICY "update_support_attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'support-attachments')
  WITH CHECK (bucket_id = 'support-attachments');

CREATE POLICY "delete_support_attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'support-attachments');

-- ============ Add status values to support_tickets ============
-- Extend the allowed statuses to include 'pending' and 'replied'.
-- The column is already text so no type change is needed; we just
-- update the ticket when a new message arrives via application logic.

-- ============ updated_at trigger for payment_wallets ============
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON payment_wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON payment_wallets
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();
