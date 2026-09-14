/*
# Fix Stale Data and Guard Against Broken States

## Problems found
1. Users with negative balance but NO pending_insufficient order (stale from old migrations)
   - When they submit a new order, their broken negative balance gets stored as original_balance
   - This produces wrong math on deposit: deposit + (-200) + commission instead of deposit + 200 + commission
2. Users with positive balance but still have pending_insufficient order (deposit approved before auto-complete logic)
   - Order is stuck, should have been auto-completed

## Fixes

### Data fix 1: Reset stale negative balances
- Users with balance < 0 AND no pending_insufficient order → reset balance to 0
- These are orphaned states from old migration churn

### Data fix 2: Auto-complete stuck pending orders
- Users with balance >= 0 AND pending_insufficient order → complete the order
- Apply the restore formula: balance = current_balance + commission (price was already deducted)
- Actually since balance is already positive (deposit was credited via old logic),
  just mark order completed and add commission, clear frozen/shortage

### submit_order guard
- If balance < 0 and no pending order, reset balance to 0 before processing
- This prevents storing a broken negative as original_balance
*/

-- Fix 1: Reset stale negative balances for users with no pending orders
UPDATE user_profiles
SET balance = 0,
    frozen_amount = 0,
    pending_shortage = 0
WHERE balance < 0
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM orders WHERE status = 'pending_insufficient'
  );

-- Fix 2: Auto-complete stuck pending orders where balance >= 0
DO $$
DECLARE
  r RECORD;
  v_today date := CURRENT_DATE;
  v_completed_today integer;
  v_today_commission numeric;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
BEGIN
  FOR r IN
    SELECT o.id, o.order_number, o.user_id, o.commission, o.original_balance,
           up.balance, up.completed_today, up.today_commission, up.last_order_date
    FROM orders o
    JOIN user_profiles up ON up.user_id = o.user_id
    WHERE o.status = 'pending_insufficient' AND up.balance >= 0
  LOOP
    -- Reset daily counters if new day
    IF r.last_order_date IS DISTINCT FROM v_today THEN
      v_completed_today := 0;
      v_today_commission := 0;
    ELSE
      v_completed_today := r.completed_today;
      v_today_commission := r.today_commission;
    END IF;

    -- Complete the order
    UPDATE orders SET status = 'completed' WHERE id = r.id;

    -- Add commission to balance, clear frozen/shortage
    UPDATE user_profiles
    SET
      balance = balance + r.commission,
      frozen_amount = 0,
      pending_shortage = 0,
      lifetime_commission = lifetime_commission + r.commission,
      today_commission = v_today_commission + r.commission,
      completed_today = v_completed_today + 1,
      last_order_date = v_today
    WHERE user_id = r.user_id;

    -- Pay referral bonuses
    IF r.commission > 0 THEN
      FOR v_invited_user_id IN
        SELECT user_id FROM user_profiles WHERE inviter_id = r.user_id
      LOOP
        v_referral_bonus := r.commission * v_bonus_rate;
        UPDATE user_profiles
        SET balance = balance + v_referral_bonus,
            lifetime_commission = lifetime_commission + v_referral_bonus,
            total_referral_earned = total_referral_earned + v_referral_bonus
        WHERE user_id = v_invited_user_id;
        UPDATE user_profiles
        SET total_referral_given = total_referral_given + v_referral_bonus
        WHERE user_id = r.user_id;
        INSERT INTO referral_rewards (
          inviter_id, invited_user_id, order_id, order_number,
          original_reward, referral_bonus, bonus_rate
        ) VALUES (
          r.user_id, v_invited_user_id, r.id, r.order_number,
          r.commission, v_referral_bonus, v_bonus_rate
        )
        ON CONFLICT (order_id) DO NOTHING;
      END LOOP;
    END IF;

    INSERT INTO activity_logs (actor, action, target_type, target_id, details)
    VALUES (
      r.user_id, 'order_auto_completed', 'order', r.id::text,
      'Stuck order ' || r.order_number || ' auto-completed during data fix. Commission $' || r.commission || ' credited.'
    );
  END LOOP;
END $$;

-- Add guard to submit_order: if balance < 0 with no pending order, reset to 0 first
CREATE OR REPLACE FUNCTION public.submit_order(
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
  v_current_balance numeric;
  v_existing_order RECORD;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_has_pending boolean;
BEGIN
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
  -- (prevents stale negative from being stored as original_balance)
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

GRANT EXECUTE ON FUNCTION submit_order TO anon, authenticated;
