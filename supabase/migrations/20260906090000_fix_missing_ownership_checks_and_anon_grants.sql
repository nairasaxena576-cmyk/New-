/*
# CRITICAL SECURITY FIX: missing ownership checks + anon execute grants

## Problem
Three SECURITY DEFINER RPCs took a client-supplied `p_user_id` parameter but
never verified that the calling user (auth.uid()) actually owned that id:

- get_user_profile_safe(p_user_id) — returns a user's FULL profile row
  (balance, email, phone, VIP level, referral code, etc.)
- submit_order(p_user_id, ...) — creates an order and mutates balance/commission
- complete_order(p_user_id, ...) — completes an order and mutates balance/commission

All three were also GRANTed to the `anon` role in addition to `authenticated`.
Combined, this meant ANY caller — including a fully unauthenticated client
using only the public anon key — could:
  1. Read any other user's private profile/financial data by guessing/
     enumerating user_id values, and
  2. Credit arbitrary, attacker-chosen commission amounts to any account
     (including their own) by calling the RPC directly (bypassing the UI),
     since p_commission/p_total_price were never validated against the
     caller's identity.

This is a full authorization bypass on money-moving endpoints.

## Fix
- Add `IF auth.uid()::text IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION`
  guards, matching the pattern already used correctly in
  create_user_profile() and submit_withdrawal_request().
- Revoke EXECUTE from `anon` on all three functions; only `authenticated`
  callers (who must additionally own the row) may call them.

Every existing frontend call site (src/lib/supabase/deposits.ts →
fetchUserProfile/submitOrderRpc/completeOrderRpc) already only ever passes
the caller's own session user id, so this tightens authorization without
changing any legitimate behavior.

This migration re-applies the full, unmodified function bodies from
20260905114303_20260905120000_fix_daily_reset_et_timezone.sql (the latest
prior versions) with only the ownership check added at the top.
*/

-- ============ get_user_profile_safe: add ownership check ============

CREATE OR REPLACE FUNCTION public.get_user_profile_safe(p_user_id text)
RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile user_profiles;
  v_pending_order RECORD;
  v_new_frozen numeric;
  v_new_shortage numeric;
  v_et_today date;
  v_needs_daily_reset boolean;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  v_et_today := public.et_today();

  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Lazy daily reset: if last order was on a previous ET day, zero the counters
  IF v_profile.last_order_date IS NOT NULL AND v_profile.last_order_date < v_et_today THEN
    v_needs_daily_reset := true;
  ELSIF v_profile.last_order_date IS NULL AND (v_profile.completed_today > 0 OR v_profile.today_commission > 0) THEN
    v_needs_daily_reset := true;
  ELSE
    v_needs_daily_reset := false;
  END IF;

  IF v_needs_daily_reset THEN
    UPDATE user_profiles
    SET completed_today = 0, today_commission = 0
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
  END IF;

  -- Frozen/shortage recalculation (existing logic)
  SELECT required_amount, total_price, commission, original_balance
  INTO v_pending_order
  FROM orders
  WHERE user_id = p_user_id AND status = 'pending_insufficient'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_profile.balance < 0 THEN
      v_new_frozen := v_pending_order.original_balance + v_pending_order.commission;
      v_new_shortage := -v_profile.balance;

      IF COALESCE(v_profile.frozen_amount, 0) <> v_new_frozen OR
         COALESCE(v_profile.pending_shortage, 0) <> v_new_shortage THEN
        UPDATE user_profiles
        SET frozen_amount = v_new_frozen,
            pending_shortage = v_new_shortage
        WHERE user_id = p_user_id
        RETURNING * INTO v_profile;
      END IF;
    ELSE
      IF COALESCE(v_profile.pending_shortage, 0) <> 0 THEN
        UPDATE user_profiles
        SET pending_shortage = 0
        WHERE user_id = p_user_id
        RETURNING * INTO v_profile;
      END IF;
    END IF;
  ELSE
    IF COALESCE(v_profile.frozen_amount, 0) <> 0 OR COALESCE(v_profile.pending_shortage, 0) <> 0 THEN
      UPDATE user_profiles
      SET frozen_amount = 0,
          pending_shortage = 0
      WHERE user_id = p_user_id
      RETURNING * INTO v_profile;
    END IF;
  END IF;

  RETURN v_profile;
END;
$function$;

-- ============ submit_order: add ownership check ============

CREATE OR REPLACE FUNCTION public.submit_order(
  p_user_id text, p_order_number text, p_task_number text,
  p_product_id text, p_product_name text, p_merchant text,
  p_unit_price numeric, p_total_price numeric, p_commission numeric,
  p_commission_rate numeric, p_is_lucky boolean,
  p_lucky_commission_percent numeric, p_vip_level integer, p_note text
)
RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile user_profiles;
  v_today date := public.et_today();
  v_completed_today integer;
  v_today_commission numeric;
  v_order_id uuid;
  v_current_balance numeric;
  v_existing_order RECORD;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_has_pending boolean;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  IF p_total_price < 0 OR p_commission < 0 THEN
    RAISE EXCEPTION 'Invalid order amount';
  END IF;

  SELECT balance, completed_today, today_commission, frozen_amount
  INTO v_current_balance, v_completed_today, v_today_commission, v_profile.frozen_amount
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT id, status INTO v_existing_order
  FROM orders WHERE order_number = p_order_number AND user_id = p_user_id;
  IF FOUND THEN
    SELECT * INTO v_profile FROM user_profiles WHERE user_id = p_user_id;
    RETURN v_profile;
  END IF;

  -- Guard: if balance is negative but there's no pending order, reset to 0
  IF v_current_balance < 0 THEN
    SELECT true INTO v_has_pending
    FROM orders
    WHERE user_id = p_user_id AND status = 'pending_insufficient'
    LIMIT 1;
    IF NOT v_has_pending THEN
      v_current_balance := 0;
      UPDATE user_profiles SET balance = 0 WHERE user_id = p_user_id;
    END IF;
  END IF;

  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- CASE 1: Sufficient balance — complete immediately, commission only
  IF v_current_balance >= p_total_price THEN
    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note, original_balance
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
      p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note, v_current_balance
    )
    RETURNING id INTO v_order_id;

    UPDATE user_profiles
    SET
      balance = balance + p_commission,
      frozen_amount = 0,
      pending_shortage = 0,
      lifetime_commission = lifetime_commission + p_commission,
      today_commission = v_today_commission + p_commission,
      completed_today = v_completed_today + 1,
      last_order_date = v_today
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;

    IF p_commission > 0 THEN
      FOR v_invited_user_id IN
        SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
      LOOP
        v_referral_bonus := p_commission * v_bonus_rate;
        UPDATE user_profiles
        SET balance = balance + v_referral_bonus,
            lifetime_commission = lifetime_commission + v_referral_bonus,
            total_referral_earned = total_referral_earned + v_referral_bonus
        WHERE user_id = v_invited_user_id;
        UPDATE user_profiles
        SET total_referral_given = total_referral_given + v_referral_bonus
        WHERE user_id = p_user_id;
        INSERT INTO referral_rewards (
          inviter_id, invited_user_id, order_id, order_number,
          original_reward, referral_bonus, bonus_rate
        ) VALUES (
          p_user_id, v_invited_user_id, v_order_id, p_order_number,
          p_commission, v_referral_bonus, v_bonus_rate
        )
        ON CONFLICT (order_id) DO NOTHING;
        INSERT INTO activity_logs (actor, action, target_type, target_id, details)
        VALUES (
          p_user_id, 'referral_bonus', 'referral', v_order_id::text,
          'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
          ' (25% of $' || p_commission || ' from order ' || p_order_number || ')'
        );
      END LOOP;
    END IF;

    RETURN v_profile;
  END IF;

  -- CASE 2: Insufficient balance — deduct price, preserve original balance
  INSERT INTO orders (
    user_id, order_number, task_number, product_id, product_name,
    merchant, unit_price, total_price, required_amount, commission, commission_rate,
    is_lucky, lucky_commission_percent, vip_level, status, note, original_balance
  ) VALUES (
    p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
    p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
    p_is_lucky, p_lucky_commission_percent, p_vip_level, 'pending_insufficient', p_note, v_current_balance
  )
  RETURNING id INTO v_order_id;

  UPDATE user_profiles
  SET
    balance = v_current_balance - p_total_price,
    frozen_amount = v_current_balance + p_commission,
    pending_shortage = p_total_price - v_current_balance
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$function$;

-- ============ complete_order: add ownership check ============

CREATE OR REPLACE FUNCTION public.complete_order(
  p_user_id text, p_order_number text, p_task_number text,
  p_product_id text, p_product_name text, p_merchant text,
  p_unit_price numeric, p_total_price numeric, p_commission numeric,
  p_commission_rate numeric, p_is_lucky boolean,
  p_lucky_commission_percent numeric, p_vip_level integer, p_note text
)
RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile user_profiles;
  v_today date := public.et_today();
  v_completed_today integer;
  v_today_commission numeric;
  v_order_id uuid;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_current_balance numeric;
  v_existing_order RECORD;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  IF p_total_price < 0 OR p_commission < 0 THEN
    RAISE EXCEPTION 'Invalid order amount';
  END IF;

  SELECT balance, completed_today, today_commission, frozen_amount, pending_shortage
  INTO v_current_balance, v_completed_today, v_today_commission, v_profile.frozen_amount, v_profile.pending_shortage
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT id, status INTO v_existing_order
  FROM orders WHERE order_number = p_order_number AND user_id = p_user_id;
  IF FOUND AND v_existing_order.status = 'completed' THEN
    SELECT * INTO v_profile FROM user_profiles WHERE user_id = p_user_id;
    RETURN v_profile;
  END IF;

  IF v_current_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient balance. Required deposit: $%', -v_current_balance;
  END IF;

  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  IF FOUND THEN
    UPDATE orders SET status = 'completed'
    WHERE id = v_existing_order.id;
    v_order_id := v_existing_order.id;
  ELSE
    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note, original_balance
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
      p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note, v_current_balance
    )
    RETURNING id INTO v_order_id;
  END IF;

  UPDATE user_profiles
  SET
    balance = balance + p_commission,
    frozen_amount = 0,
    pending_shortage = 0,
    lifetime_commission = lifetime_commission + p_commission,
    today_commission = v_today_commission + p_commission,
    completed_today = v_completed_today + 1,
    last_order_date = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  IF p_commission > 0 THEN
    FOR v_invited_user_id IN
      SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
    LOOP
      v_referral_bonus := p_commission * v_bonus_rate;
      UPDATE user_profiles
      SET balance = balance + v_referral_bonus,
          lifetime_commission = lifetime_commission + v_referral_bonus,
          total_referral_earned = total_referral_earned + v_referral_bonus
      WHERE user_id = v_invited_user_id;
      UPDATE user_profiles
      SET total_referral_given = total_referral_given + v_referral_bonus
      WHERE user_id = p_user_id;
      INSERT INTO referral_rewards (
        inviter_id, invited_user_id, order_id, order_number,
        original_reward, referral_bonus, bonus_rate
      ) VALUES (
        p_user_id, v_invited_user_id, v_order_id, p_order_number,
        p_commission, v_referral_bonus, v_bonus_rate
      )
      ON CONFLICT (order_id) DO NOTHING;
      INSERT INTO activity_logs (actor, action, target_type, target_id, details)
      VALUES (
        p_user_id, 'referral_bonus', 'referral', v_order_id::text,
        'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
        ' (25% of $' || p_commission || ' from order ' || p_order_number || ')'
      );
    END LOOP;
  END IF;

  RETURN v_profile;
END;
$function$;

-- ============ Lock down grants: remove anon access ============

REVOKE EXECUTE ON FUNCTION public.get_user_profile_safe(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_user_profile_safe(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;
