/*
# Preserve Original Balance — Restore on Deposit

## Purpose
When a pending order is filled by a deposit, do NOT simply add deposit to the
negative balance. Instead restore: deposit + original_balance + commission.

Example:
- Balance $200, Order $300, Commission $3
- After submit: balance = -$100, frozen = $203, original_balance stored = $200
- Deposit $300 → balance = $300 + $200 + $3 = $503 (order auto-completes)

## Changes

### orders table
- Add original_balance column (stores balance before order was placed)

### submit_order (insufficient case)
- Stores original_balance on the order row
- balance = original - total_price (goes negative)
- frozen = original + commission
- shortage = total_price - original

### approve_deposit (rewritten)
- If pending order + deposit covers negative:
  - balance = deposit + original_balance + commission
  - order → completed, frozen = 0, shortage = 0
  - counters + referral bonuses updated
- If pending order + deposit NOT enough:
  - balance = current + deposit (simple addition, still negative)
  - shortage = -(new balance), frozen unchanged
- If no pending order:
  - balance = current + deposit, clear frozen/shortage

### get_user_profile_safe
- For pending orders with balance < 0: frozen = original_balance + commission
- For pending orders with balance >= 0: order should be completed already
- No pending orders: clear everything

## Security
- All functions SECURITY DEFINER, SET search_path TO 'public'
*/

-- Add original_balance column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_balance numeric DEFAULT 0;

-- ============ submit_order ============
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

  -- balance goes negative, frozen = original + commission
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

-- ============ complete_order ============
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
  v_existing_order RECORD;
BEGIN
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

GRANT EXECUTE ON FUNCTION complete_order TO anon, authenticated;

-- ============ approve_deposit ============
CREATE OR REPLACE FUNCTION public.approve_deposit(p_deposit_id uuid, p_admin_id text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deposit RECORD;
  v_prev_balance numeric;
  v_new_balance numeric;
  v_pending_order RECORD;
  v_last_order_date date;
  v_today date := CURRENT_DATE;
  v_completed_today integer;
  v_today_commission numeric;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
BEGIN
  IF NOT is_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_deposit.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  SELECT balance, completed_today, today_commission, last_order_date
  INTO v_prev_balance, v_completed_today, v_today_commission, v_last_order_date
  FROM user_profiles WHERE user_id = v_deposit.user_id
  FOR UPDATE;

  IF v_prev_balance IS NULL THEN
    v_prev_balance := 0;
  END IF;

  IF v_last_order_date IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  UPDATE deposits
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_deposit_id;

  SELECT id, order_number, original_balance, total_price, commission
  INTO v_pending_order
  FROM orders
  WHERE user_id = v_deposit.user_id AND status = 'pending_insufficient'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_prev_balance + v_deposit.amount >= 0 THEN
      -- Deposit fills the negative — restore: deposit + original_balance + commission
      v_new_balance := v_deposit.amount + v_pending_order.original_balance + v_pending_order.commission;

      UPDATE orders SET status = 'completed'
      WHERE id = v_pending_order.id;

      UPDATE user_profiles
      SET
        balance = v_new_balance,
        frozen_amount = 0,
        pending_shortage = 0,
        total_deposits = total_deposits + v_deposit.amount,
        lifetime_commission = lifetime_commission + v_pending_order.commission,
        today_commission = v_today_commission + v_pending_order.commission,
        completed_today = v_completed_today + 1,
        last_order_date = v_today
      WHERE user_id = v_deposit.user_id;

      IF v_pending_order.commission > 0 THEN
        FOR v_invited_user_id IN
          SELECT user_id FROM user_profiles WHERE inviter_id = v_deposit.user_id
        LOOP
          v_referral_bonus := v_pending_order.commission * v_bonus_rate;
          UPDATE user_profiles
          SET balance = balance + v_referral_bonus,
              lifetime_commission = lifetime_commission + v_referral_bonus,
              total_referral_earned = total_referral_earned + v_referral_bonus
          WHERE user_id = v_invited_user_id;
          UPDATE user_profiles
          SET total_referral_given = total_referral_given + v_referral_bonus
          WHERE user_id = v_deposit.user_id;
          INSERT INTO referral_rewards (
            inviter_id, invited_user_id, order_id, order_number,
            original_reward, referral_bonus, bonus_rate
          ) VALUES (
            v_deposit.user_id, v_invited_user_id, v_pending_order.id, v_pending_order.order_number,
            v_pending_order.commission, v_referral_bonus, v_bonus_rate
          )
          ON CONFLICT (order_id) DO NOTHING;
          INSERT INTO activity_logs (actor, action, target_type, target_id, details)
          VALUES (
            v_deposit.user_id, 'referral_bonus', 'referral', v_pending_order.id::text,
            'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
            ' (25% of $' || v_pending_order.commission || ' from order ' || v_pending_order.order_number || ')'
          );
        END LOOP;
      END IF;

      INSERT INTO activity_logs (actor, action, target_type, target_id, details)
      VALUES (
        v_deposit.user_id, 'order_auto_completed', 'order', v_pending_order.id::text,
        'Order ' || v_pending_order.order_number || ' auto-completed on deposit. ' ||
        'Balance restored to $' || v_new_balance || ' (deposit $' || v_deposit.amount ||
        ' + original $' || v_pending_order.original_balance || ' + commission $' || v_pending_order.commission || ')'
      );
    ELSE
      -- Deposit not enough — simple addition, still negative
      v_new_balance := v_prev_balance + v_deposit.amount;

      UPDATE user_profiles
      SET
        balance = v_new_balance,
        pending_shortage = -v_new_balance,
        total_deposits = total_deposits + v_deposit.amount
      WHERE user_id = v_deposit.user_id;
    END IF;
  ELSE
    -- No pending order — simple addition
    v_new_balance := v_prev_balance + v_deposit.amount;

    UPDATE user_profiles
    SET
      balance = v_new_balance,
      frozen_amount = 0,
      pending_shortage = 0,
      total_deposits = total_deposits + v_deposit.amount
    WHERE user_id = v_deposit.user_id
      AND (frozen_amount > 0 OR pending_shortage > 0);

    IF NOT FOUND THEN
      UPDATE user_profiles
      SET
        balance = v_new_balance,
        total_deposits = total_deposits + v_deposit.amount
      WHERE user_id = v_deposit.user_id;
    END IF;
  END IF;

  INSERT INTO balance_transactions
  (customer_id, admin_id, deposit_id, previous_balance, adjustment_amount,
  new_balance, adjustment_type, reason, reference)
  VALUES
  (v_deposit.user_id, p_admin_id, p_deposit_id, v_prev_balance,
  v_deposit.amount, v_new_balance, 'credit',
  'Deposit approved', p_deposit_id::text);

  RETURN v_deposit.user_id;
END;
$function$;

-- ============ get_user_profile_safe ============
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
BEGIN
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

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

GRANT EXECUTE ON FUNCTION get_user_profile_safe TO anon, authenticated;

-- ============ One-time data fix ============
UPDATE orders
SET original_balance = up.balance + orders.total_price
FROM user_profiles up
WHERE orders.user_id = up.user_id
  AND orders.status = 'pending_insufficient'
  AND (orders.original_balance IS NULL OR orders.original_balance = 0);

DO $$
DECLARE
  r RECORD;
  v_new_frozen numeric;
  v_new_shortage numeric;
BEGIN
  FOR r IN
    SELECT DISTINCT up.user_id, up.balance, up.frozen_amount, up.pending_shortage,
           o.original_balance, o.commission
    FROM user_profiles up
    JOIN orders o ON o.user_id = up.user_id AND o.status = 'pending_insufficient'
  LOOP
    IF r.balance < 0 THEN
      v_new_frozen := r.original_balance + r.commission;
      v_new_shortage := -r.balance;
    ELSE
      v_new_frozen := r.frozen_amount;
      v_new_shortage := 0;
    END IF;

    IF COALESCE(r.frozen_amount, 0) <> v_new_frozen OR
       COALESCE(r.pending_shortage, 0) <> v_new_shortage THEN
      UPDATE user_profiles
      SET frozen_amount = v_new_frozen,
          pending_shortage = v_new_shortage
      WHERE user_id = r.user_id;
    END IF;
  END LOOP;
END $$;

UPDATE user_profiles
SET frozen_amount = 0, pending_shortage = 0
WHERE frozen_amount > 0
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM orders WHERE status = 'pending_insufficient'
  );
