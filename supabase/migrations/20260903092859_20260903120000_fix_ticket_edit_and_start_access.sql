-- =====================================================
-- 1. Fix admin_edit_ticket_message RPC
--    The original checks v_msg.sender_role <> 'admin', but sender_role
--    defaults to 'user' and admin_reply_ticket sets it correctly.
--    However some admin messages were inserted via insertTicketMessage
--    (frontend direct insert) which doesn't set sender_role, so it
--    defaults to 'user'. The reliable field is `sender`.
--    Fix: check sender = 'admin' instead of sender_role = 'admin'.
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_edit_ticket_message(
  p_message_id uuid,
  p_admin_id text,
  p_new_message text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_msg RECORD;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  IF NULLIF(TRIM(p_new_message), '') IS NULL THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  SELECT * INTO v_msg FROM support_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  -- Use `sender` field (reliable) instead of `sender_role` (defaults to 'user')
  IF v_msg.sender <> 'admin' THEN
    RAISE EXCEPTION 'You can only edit admin messages';
  END IF;

  UPDATE support_messages
  SET message = p_new_message,
      edited_at = now(),
      edited_by = p_admin_id,
      is_edited = true
  WHERE id = p_message_id;

  INSERT INTO admin_audit_log (admin_id, action, old_value, new_value, target_type, target_id, details)
  VALUES (
    p_admin_id, 'edit_ticket_message',
    v_msg.message, p_new_message,
    'support_message', p_message_id::text,
    'Admin edited support message ' || p_message_id::text
  );
END;
$function$;

-- =====================================================
-- 2. Add start_access_enabled column to user_profiles
--    Default TRUE so existing + new customers keep access.
-- =====================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS start_access_enabled boolean NOT NULL DEFAULT true;

-- =====================================================
-- 3. RPC: admin_set_start_access
--    Allows admin to enable/disable Start page access per user.
--    SECURITY DEFINER + is_admin_user() check.
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_set_start_access(
  p_admin_id text,
  p_user_id text,
  p_enabled boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old boolean;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT start_access_enabled INTO v_old FROM user_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  UPDATE user_profiles
  SET start_access_enabled = p_enabled
  WHERE user_id = p_user_id;

  INSERT INTO admin_audit_log (admin_id, customer_id, action, old_value, new_value, target_type, target_id, details)
  VALUES (
    p_admin_id, p_user_id, 'set_start_access',
    v_old::text, p_enabled::text,
    'user_profiles', p_user_id,
    'Admin ' || CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END || ' Start access for user ' || p_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean) TO authenticated;

-- =====================================================
-- 4. Ensure customers can READ their own start_access_enabled
--    (existing SELECT policies on user_profiles already allow
--     users to read their own row, so no new policy needed.
--     But we must ensure no UPDATE policy allows self-modification
--     of start_access_enabled. The existing update policy only
--     allows updating specific columns, so we're safe.)
-- =====================================================
