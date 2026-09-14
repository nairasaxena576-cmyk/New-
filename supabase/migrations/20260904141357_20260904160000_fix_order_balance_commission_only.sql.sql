/*
# Fix complete_order: commission-only balance update + balance check

## Purpose
The `complete_order` RPC previously deducted the product price from the
user's balance and then added it back (net: only commission, but the
intermediate deduction could make balance go negative). The new requirement
is explicit:

1. When the user has SUFFICIENT balance: complete the order normally.
   Do NOT deduct the product price. Only ADD the earned commission.
   Balance = balance + commission (never goes negative from an order).

2. When the user has INSUFFICIENT balance: reject the order atomically.
   Do NOT create an order row. Do NOT modify the balance.
   Raise an exception so the frontend can show the "Insufficient Balance"
   modal with the shortage amount.

## Changes
1. `complete_order` — restored the `v_current_balance < p_total_price`
   check that raises an exception before any INSERT or UPDATE.
   Changed the balance formula from
     `balance = balance - p_total_price + p_commission`
   to
     `balance = balance + p_commission`
   (only credit commission; never deduct product price).
   The `frozen_amount` update is preserved.
   Referral bonus logic is preserved.
   `FOR UPDATE` row lock is preserved for race-condition safety.

## Security
- Function remains SECURITY DEFINER with `SET search_path TO 'public'`.
- No RLS policy changes.
- No new tables or columns.
*/

CREATE OR REPLACE FUNCTION public.complete_order(
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
)
RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile user_profiles;
  v_today date := CURRENT_DATE;
  v_completed_today integer;
  v_today_commission numeric;
  v_order_id uuid;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_current_balance numeric;
BEGIN
  -- Atomically check and lock the user's balance
  SELECT balance, completed_today, today_commission
  INTO v_current_balance, v_completed_today, v_today_commission
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Check sufficient balance BEFORE creating the order
  IF v_current_balance < p_total_price THEN
    RAISE EXCEPTION 'Insufficient balance. Required: $%, Available: $%', p_total_price, v_current_balance;
  END IF;

  -- Reset daily counters if it's a new day
  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- Insert the order row
  INSERT INTO orders (
    user_id, order_number, task_number, product_id, product_name,
    merchant, unit_price, total_price, commission, commission_rate,
    is_lucky, lucky_commission_percent, vip_level, status, note
  ) VALUES (
    p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
    p_merchant, p_unit_price, p_total_price, p_commission, p_commission_rate,
    p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note
  )
  RETURNING id INTO v_order_id;

  -- Credit commission only (do NOT deduct product price from balance)
  UPDATE user_profiles
  SET
    balance = balance + p_commission,
    frozen_amount = frozen_amount + p_total_price + p_commission,
    lifetime_commission = lifetime_commission + p_commission,
    today_commission = v_today_commission + p_commission,
    completed_today = v_completed_today + 1,
    last_order_date = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  -- Referral bonus
  IF p_commission > 0 THEN
    FOR v_invited_user_id IN
      SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
    LOOP
      v_referral_bonus := p_commission * v_bonus_rate;

      UPDATE user_profiles
      SET
        balance = balance + v_referral_bonus,
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
        p_user_id,
        'referral_bonus',
        'referral',
        v_order_id::text,
        'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
        ' (25% of $' || p_commission || ' from order ' || p_order_number || ')'
      );
    END LOOP;
  END IF;

  RETURN v_profile;
END;
$function$;
