-- =====================================================
-- 1. Add crypto/network fields to withdrawals
-- =====================================================
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS network text DEFAULT '',
  ADD COLUMN IF NOT EXISTS wallet_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

-- =====================================================
-- 2. Add admin management fields to support_tickets
-- =====================================================
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS assigned_admin text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- =====================================================
-- 3. Add sender_role to support_messages
-- =====================================================
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS sender_role text DEFAULT 'user'; -- 'user' | 'admin'

-- =====================================================
-- 4. Upgrade approve_withdrawal RPC
--    - Admin check via is_admin()
--    - Accept p_tx_hash, p_admin_note, p_admin_id
--    - Idempotent (double-approve returns NULL)
--    - Record admin who approved
-- =====================================================
CREATE OR REPLACE FUNCTION public.approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id text,
  p_tx_hash text DEFAULT '',
  p_admin_note text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
BEGIN
  -- Admin authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT user_id, amount, user_name, status
  INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already approved = no-op
  IF v_withdrawal.status = 'approved' THEN
    RETURN NULL;
  END IF;

  -- Only pending can be approved
  IF v_withdrawal.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  -- Check sufficient balance (should have been reserved at submission)
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

  -- Update withdrawal with tx_hash, admin info
  UPDATE withdrawals
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_admin_id,
      tx_hash = COALESCE(NULLIF(p_tx_hash, ''), tx_hash),
      admin_note = COALESCE(NULLIF(p_admin_note, ''), admin_note)
  WHERE id = p_withdrawal_id;

  -- Log the action
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'approve_withdrawal',
    'withdrawal',
    p_withdrawal_id::text,
    'Admin approved withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name ||
    COALESCE(' Tx: ' || NULLIF(p_tx_hash, ''), '')
  );

  RETURN v_withdrawal.user_id;
END;
$function$;

-- =====================================================
-- 5. Upgrade reject_withdrawal RPC
--    - Admin check
--    - Accept p_reason, p_admin_id
--    - Return reserved amount to balance
--    - Idempotent
-- =====================================================
CREATE OR REPLACE FUNCTION public.reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id text,
  p_reason text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
  v_balance numeric;
BEGIN
  -- Admin authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT user_id, amount, user_name, status
  INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already rejected = no-op
  IF v_withdrawal.status = 'rejected' THEN
    RETURN NULL;
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  -- Return the reserved amount to the user's balance
  -- (funds were reserved/deducted at submission time)
  UPDATE user_profiles
  SET balance = balance + v_withdrawal.amount
  WHERE user_id = v_withdrawal.user_id
  RETURNING balance INTO v_balance;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = p_admin_id,
      rejection_reason = p_reason
  WHERE id = p_withdrawal_id;

  -- Log the action
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'reject_withdrawal',
    'withdrawal',
    p_withdrawal_id::text,
    'Admin rejected withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name ||
    COALESCE(' Reason: ' || NULLIF(p_reason, ''), '')
  );

  RETURN v_withdrawal.user_id;
END;
$function$;

-- =====================================================
-- 6. Create submit_withdrawal_request RPC
--    - Deducts (reserves) balance at submission
--    - Validates amount > 0 and <= balance
--    - Prevents duplicate pending requests (optional)
--    - Only the authenticated user can submit their own
-- =====================================================
CREATE OR REPLACE FUNCTION public.submit_withdrawal_request(
  p_user_id text,
  p_user_email text,
  p_user_name text,
  p_amount numeric,
  p_method text,
  p_currency text DEFAULT 'USD',
  p_network text DEFAULT '',
  p_wallet_address text DEFAULT '',
  p_account_name text DEFAULT '',
  p_account_info text DEFAULT '',
  p_note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_id uuid;
BEGIN
  -- User must be authenticated and submitting for themselves
  IF auth.uid()::text IS NULL OR auth.uid()::text <> p_user_id THEN
    RAISE EXCEPTION 'Permission denied: you can only submit withdrawals for yourself';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  -- Check and reserve balance atomically
  SELECT balance INTO v_balance
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: $%, Requested: $%', v_balance, p_amount;
  END IF;

  -- Reserve the funds (deduct immediately)
  UPDATE user_profiles
  SET balance = balance - p_amount
  WHERE user_id = p_user_id;

  -- Create the withdrawal request
  INSERT INTO withdrawals (
    user_id, user_email, user_name, amount, method,
    currency, network, wallet_address, account_name, account_info,
    note, status
  ) VALUES (
    p_user_id, p_user_email, p_user_name, p_amount, p_method,
    p_currency, p_network, p_wallet_address, p_account_name, p_account_info,
    p_note, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- =====================================================
-- 7. Create admin_reply_ticket RPC
--    - Admin check
--    - Inserts message as admin
--    - Updates ticket status
--    - Logs activity
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_reply_ticket(
  p_ticket_id uuid,
  p_admin_id text,
  p_message text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_msg_id uuid;
  v_ticket RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  IF NULLIF(TRIM(p_message), '') IS NULL THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  SELECT id, subject, user_name INTO v_ticket
  FROM support_tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  -- Insert admin message
  INSERT INTO support_messages (ticket_id, sender, sender_role, message)
  VALUES (p_ticket_id, 'admin', 'admin', p_message)
  RETURNING id INTO v_msg_id;

  -- Update ticket status to replied
  UPDATE support_tickets
  SET status = 'replied',
      replied_at = now(),
      updated_at = now()
  WHERE id = p_ticket_id;

  -- Log activity
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'reply_ticket',
    'support_ticket',
    p_ticket_id::text,
    'Admin replied to ticket #' || p_ticket_id::text || ' (' || v_ticket.subject || ')'
  );

  RETURN v_msg_id;
END;
$function$;

-- =====================================================
-- 8. Create update_ticket_status RPC (admin only)
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_ticket_status_admin(
  p_ticket_id uuid,
  p_admin_id text,
  p_status text,
  p_priority text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_status text;
  v_old_priority text;
  v_ticket RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT status, priority, subject INTO v_ticket
  FROM support_tickets WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  v_old_status := v_ticket.status;
  v_old_priority := v_ticket.priority;

  UPDATE support_tickets
  SET status = p_status,
      priority = COALESCE(p_priority, priority),
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      updated_at = now(),
      closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE closed_at END
  WHERE id = p_ticket_id;

  -- Log activity
  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'update_ticket_status',
    'support_ticket',
    p_ticket_id::text,
    'Admin changed ticket #' || p_ticket_id::text || ' status from ' || v_old_status || ' to ' || p_status
  );
END;
$function$;

-- =====================================================
-- 9. Grant execute on new RPCs
-- =====================================================
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_withdrawal_request(text, text, text, numeric, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reply_ticket(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_status_admin(uuid, text, text, text, text) TO authenticated;