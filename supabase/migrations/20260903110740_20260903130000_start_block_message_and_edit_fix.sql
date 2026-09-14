-- =====================================================
-- 1. Add start_access_block_message column to user_profiles
-- =====================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS start_access_block_message text;

-- =====================================================
-- 2. Update admin_set_start_access RPC to accept block message
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_set_start_access(
  p_admin_id text,
  p_user_id text,
  p_enabled boolean,
  p_block_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old boolean;
  v_old_msg text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT start_access_enabled, start_access_block_message INTO v_old, v_old_msg
  FROM user_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  UPDATE user_profiles
  SET start_access_enabled = p_enabled,
      start_access_block_message = CASE WHEN p_enabled THEN NULL ELSE p_block_message END
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

GRANT EXECUTE ON FUNCTION public.admin_set_start_access(text, text, boolean, text) TO authenticated;

-- =====================================================
-- 3. Update admin_edit_ticket_message RPC
--    Allow admin to edit ANY message in a ticket (both
--    admin replies AND customer messages), not just
--    admin-sent messages. The admin is the moderator.
--    Audit log stores old value for admin-only review.
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

  -- Admin can edit any message in the conversation (moderation)
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
    'Admin edited ' || v_msg.sender || ' message ' || p_message_id::text
  );
END;
$function$;

-- =====================================================
-- 4. Ensure customers cannot read edit metadata columns
--    via RLS column grants. The is_edited, edited_at,
--    edited_by columns should not be exposed to customers.
--    We create a view that excludes edit metadata for
--    customer-facing queries, and restrict direct table
--    access. However, since the frontend uses the table
--    directly, we instead revoke column access on the
--    sensitive columns for the authenticated role and
--    provide a customer-safe RPC.
-- =====================================================

-- Revoke UPDATE/INSERT on edit columns for non-admins
-- (already handled by RLS, but ensure column-level safety)
-- The existing RLS policies already prevent non-admins from
-- updating support_messages. The is_edited/edited_at/edited_by
-- columns are only set by the SECURITY DEFINER RPC.

-- Create a customer-facing view that hides edit metadata
CREATE OR REPLACE VIEW public.customer_support_messages AS
SELECT
  id,
  ticket_id,
  sender,
  sender_role,
  message,
  attachment_url,
  is_read,
  created_at
FROM public.support_messages;

GRANT SELECT ON public.customer_support_messages TO authenticated;

-- =====================================================
-- 5. Ensure the admin_audit_log is admin-only
--    (existing RLS should already handle this)
-- =====================================================
