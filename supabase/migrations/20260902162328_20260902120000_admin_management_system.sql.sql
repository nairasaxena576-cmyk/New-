/*
# Admin Management System: Per-User Lucky Product Settings, Ticket Message Editing, Audit Log

## Overview
This migration adds:
1. Per-user lucky product configuration table
2. Support message editing (edited_at, edited_by, is_edited fields)
3. Admin audit log table for tracking admin actions
4. Secure RPC functions for admin-only operations

## New Tables
- `user_lucky_settings` — per-user lucky product configuration
- `admin_audit_log` — audit trail for admin actions

## Modified Tables
- `support_messages` — add edited_at, edited_by, is_edited columns

## Security
- RLS on user_lucky_settings: users can read their own settings, only admin RPC can write
- RLS on admin_audit_log: only admin can read, only SECURITY DEFINER functions can insert
- New RPCs: admin_update_user_lucky_settings, admin_edit_ticket_message, admin_log_action
*/

-- =====================================================
-- 1. Per-user lucky product settings
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_lucky_settings (
  user_id text PRIMARY KEY,
  lucky_enabled boolean NOT NULL DEFAULT false,
  lucky_chance_percent numeric NOT NULL DEFAULT 0 CHECK (lucky_chance_percent >= 0 AND lucky_chance_percent <= 100),
  lucky_commission_percent numeric NOT NULL DEFAULT 0 CHECK (lucky_commission_percent >= 0 AND lucky_commission_percent <= 100),
  lucky_daily_limit integer NOT NULL DEFAULT 5 CHECK (lucky_daily_limit >= 0),
  lucky_min_price numeric DEFAULT NULL,
  lucky_max_price numeric DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text DEFAULT NULL
);

ALTER TABLE public.user_lucky_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_lucky_settings" ON public.user_lucky_settings;
CREATE POLICY "select_own_lucky_settings" ON public.user_lucky_settings
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "no_insert_lucky_settings" ON public.user_lucky_settings;
CREATE POLICY "no_insert_lucky_settings" ON public.user_lucky_settings
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "no_update_lucky_settings" ON public.user_lucky_settings;
CREATE POLICY "no_update_lucky_settings" ON public.user_lucky_settings
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "no_delete_lucky_settings" ON public.user_lucky_settings;
CREATE POLICY "no_delete_lucky_settings" ON public.user_lucky_settings
  FOR DELETE TO authenticated USING (false);

-- =====================================================
-- 2. Support message editing fields
-- =====================================================
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS edited_by text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;

-- =====================================================
-- 3. Admin audit log
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  customer_id text,
  action text NOT NULL,
  old_value text,
  new_value text,
  target_type text,
  target_id text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_customer ON public.admin_audit_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_log" ON public.admin_audit_log;
CREATE POLICY "admin_read_audit_log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "no_insert_audit_log" ON public.admin_audit_log;
CREATE POLICY "no_insert_audit_log" ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "no_update_audit_log" ON public.admin_audit_log;
CREATE POLICY "no_update_audit_log" ON public.admin_audit_log
  FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "no_delete_audit_log" ON public.admin_audit_log;
CREATE POLICY "no_delete_audit_log" ON public.admin_audit_log
  FOR DELETE TO authenticated USING (false);

-- =====================================================
-- 4. RPC: admin_update_user_lucky_settings
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_update_user_lucky_settings(
  p_admin_id text,
  p_user_id text,
  p_lucky_enabled boolean DEFAULT false,
  p_lucky_chance_percent numeric DEFAULT 0,
  p_lucky_commission_percent numeric DEFAULT 0,
  p_lucky_daily_limit integer DEFAULT 5,
  p_lucky_min_price numeric DEFAULT NULL,
  p_lucky_max_price numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old RECORD;
  v_old_json text;
  v_new_json text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  IF p_lucky_chance_percent < 0 OR p_lucky_chance_percent > 100 THEN
    RAISE EXCEPTION 'Lucky chance must be between 0 and 100';
  END IF;

  IF p_lucky_commission_percent < 0 OR p_lucky_commission_percent > 100 THEN
    RAISE EXCEPTION 'Lucky commission must be between 0 and 100';
  END IF;

  IF p_lucky_daily_limit < 0 THEN
    RAISE EXCEPTION 'Daily limit cannot be negative';
  END IF;

  SELECT * INTO v_old FROM user_lucky_settings WHERE user_id = p_user_id;

  v_old_json := CASE WHEN v_old IS NOT NULL THEN
    json_build_object(
      'lucky_enabled', v_old.lucky_enabled,
      'lucky_chance_percent', v_old.lucky_chance_percent,
      'lucky_commission_percent', v_old.lucky_commission_percent,
      'lucky_daily_limit', v_old.lucky_daily_limit,
      'lucky_min_price', v_old.lucky_min_price,
      'lucky_max_price', v_old.lucky_max_price
    )::text
  ELSE 'null' END;

  v_new_json := json_build_object(
    'lucky_enabled', p_lucky_enabled,
    'lucky_chance_percent', p_lucky_chance_percent,
    'lucky_commission_percent', p_lucky_commission_percent,
    'lucky_daily_limit', p_lucky_daily_limit,
    'lucky_min_price', p_lucky_min_price,
    'lucky_max_price', p_lucky_max_price
  )::text;

  INSERT INTO user_lucky_settings (
    user_id, lucky_enabled, lucky_chance_percent,
    lucky_commission_percent, lucky_daily_limit,
    lucky_min_price, lucky_max_price,
    updated_at, updated_by
  ) VALUES (
    p_user_id, p_lucky_enabled, p_lucky_chance_percent,
    p_lucky_commission_percent, p_lucky_daily_limit,
    p_lucky_min_price, p_lucky_max_price,
    now(), p_admin_id
  )
  ON CONFLICT (user_id) DO UPDATE SET
    lucky_enabled = EXCLUDED.lucky_enabled,
    lucky_chance_percent = EXCLUDED.lucky_chance_percent,
    lucky_commission_percent = EXCLUDED.lucky_commission_percent,
    lucky_daily_limit = EXCLUDED.lucky_daily_limit,
    lucky_min_price = EXCLUDED.lucky_min_price,
    lucky_max_price = EXCLUDED.lucky_max_price,
    updated_at = now(),
    updated_by = p_admin_id;

  INSERT INTO admin_audit_log (admin_id, customer_id, action, old_value, new_value, target_type, target_id, details)
  VALUES (
    p_admin_id, p_user_id, 'update_lucky_settings',
    v_old_json, v_new_json, 'user_lucky_settings', p_user_id,
    'Admin updated lucky product settings for user ' || p_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_lucky_settings TO authenticated;

-- =====================================================
-- 5. RPC: get_user_lucky_settings
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_lucky_settings(p_user_id text)
RETURNS user_lucky_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row user_lucky_settings;
BEGIN
  SELECT * INTO v_row FROM user_lucky_settings WHERE user_id = p_user_id;
  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_lucky_settings TO authenticated;

-- =====================================================
-- 6. RPC: admin_edit_ticket_message
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

  IF v_msg.sender_role <> 'admin' THEN
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

GRANT EXECUTE ON FUNCTION public.admin_edit_ticket_message TO authenticated;

-- =====================================================
-- 7. RPC: admin_log_action
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_admin_id text,
  p_action text,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL,
  p_customer_id text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_details text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  INSERT INTO admin_audit_log (admin_id, customer_id, action, old_value, new_value, target_type, target_id, details)
  VALUES (p_admin_id, p_customer_id, p_action, p_old_value, p_new_value, p_target_type, p_target_id, p_details);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_log_action TO authenticated;
