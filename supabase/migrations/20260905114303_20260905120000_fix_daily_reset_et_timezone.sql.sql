/*
# Fix daily task reset to use America/New_York timezone

## Problem
All daily counter logic used CURRENT_DATE which returns UTC date.
The reset only happened lazily inside submit_order/complete_order/approve_deposit,
never when the user simply loads their dashboard. Users who completed all
daily tasks were permanently stuck because get_user_profile_safe did not
reset the counter, and the start button was disabled so they couldn't
trigger the lazy reset.

## Fix
1. get_user_profile_safe: reset completed_today and today_commission when
   last_order_date is a previous America/New_York calendar day.
2. submit_order, complete_order, approve_deposit: use America/New_York
   date instead of CURRENT_DATE for the daily boundary check.
3. admin_adjust_balance: same timezone fix.

This is a lazy reset — it triggers on profile load, no cron needed.
*/

-- Helper: get current date in America/New_York
CREATE OR REPLACE FUNCTION public.et_today()
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/New_York')::date;
$$;

-- Fix get_user_profile_safe: reset daily counters on new ET day
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

-- Fix submit_order: use ET date for daily boundary
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

-- Fix complete_order: use ET date for daily boundary
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

-- Fix approve_deposit: use ET date for daily boundary
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
  v_today date := public.et_today();
  v_completed_today integer;
  v_today_commission numeric;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_other_frozen numeric;
BEGIN
  IF NOT is_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Not authorized: admin access required (auth.uid=%)', auth.uid();
  END IF;

  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found: %', p_deposit_id;
  END IF;

  IF v_deposit.status <> 'pending' THEN
    RAISE EXCEPTION 'Deposit already processed (status=%)', v_deposit.status;
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
      v_new_balance := v_deposit.amount + v_pending_order.original_balance + v_pending_order.commission;

      SELECT COALESCE(SUM(o.original_balance + o.commission), 0)
      INTO v_other_frozen
      FROM orders o
      WHERE o.user_id = v_deposit.user_id
        AND o.status = 'pending_insufficient'
        AND o.id <> v_pending_order.id;

      UPDATE orders SET status = 'completed'
      WHERE id = v_pending_order.id;

      UPDATE user_profiles
      SET
        balance = v_new_balance,
        frozen_amount = v_other_frozen,
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
      v_new_balance := v_prev_balance + v_deposit.amount;

      UPDATE user_profiles
      SET
        balance = v_new_balance,
        pending_shortage = -v_new_balance,
        total_deposits = total_deposits + v_deposit.amount
      WHERE user_id = v_deposit.user_id;
    END IF;
  ELSE
    v_new_balance := v_prev_balance + v_deposit.amount;

    UPDATE user_profiles
    SET
      balance = v_new_balance,
      frozen_amount = 0,
      pending_shortage = 0,
      total_deposits = total_deposits + v_deposit.amount
    WHERE user_id = v_deposit.user_id;
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

-- Fix admin_adjust_balance: use ET date for daily boundary
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_customer_id text,
  p_adjustment_type text,
  p_amount numeric,
  p_reason text DEFAULT '',
  p_reference text DEFAULT ''
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id text;
  v_prev_balance numeric;
  v_new_balance numeric;
  v_adj_amount numeric;
  v_pending_order RECORD;
  v_today date := public.et_today();
  v_completed_today integer;
  v_today_commission numeric;
  v_last_order_date date;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_other_frozen numeric;
BEGIN
  v_admin_id := auth.uid()::text;
  IF NOT is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  IF p_adjustment_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid adjustment type: must be credit or debit';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT balance, completed_today, today_commission, last_order_date
  INTO v_prev_balance, v_completed_today, v_today_commission, v_last_order_date
  FROM user_profiles WHERE user_id = p_customer_id
  FOR UPDATE;

  IF v_prev_balance IS NULL THEN
    v_prev_balance := 0;
  END IF;

  IF v_last_order_date IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  IF p_adjustment_type = 'credit' THEN
    v_adj_amount := p_amount;
    v_new_balance := v_prev_balance + p_amount;
  ELSE
    v_adj_amount := -p_amount;
    v_new_balance := v_prev_balance - p_amount;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient balance: cannot debit below zero';
    END IF;
  END IF;

  IF p_adjustment_type = 'credit' AND v_new_balance >= 0 THEN
    SELECT id, order_number, original_balance, total_price, commission
    INTO v_pending_order
    FROM orders
    WHERE user_id = p_customer_id AND status = 'pending_insufficient'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_new_balance := p_amount + v_pending_order.original_balance + v_pending_order.commission;

      SELECT COALESCE(SUM(o.original_balance + o.commission), 0)
      INTO v_other_frozen
      FROM orders o
      WHERE o.user_id = p_customer_id
        AND o.status = 'pending_insufficient'
        AND o.id <> v_pending_order.id;

      UPDATE orders SET status = 'completed'
      WHERE id = v_pending_order.id;

      UPDATE user_profiles
      SET
        balance = v_new_balance,
        frozen_amount = v_other_frozen,
        pending_shortage = 0,
        lifetime_commission = lifetime_commission + v_pending_order.commission,
        today_commission = v_today_commission + v_pending_order.commission,
        completed_today = v_completed_today + 1,
        last_order_date = v_today
      WHERE user_id = p_customer_id;

      IF v_pending_order.commission > 0 THEN
        FOR v_invited_user_id IN
          SELECT user_id FROM user_profiles WHERE inviter_id = p_customer_id
        LOOP
          v_referral_bonus := v_pending_order.commission * v_bonus_rate;
          UPDATE user_profiles
          SET balance = balance + v_referral_bonus,
              lifetime_commission = lifetime_commission + v_referral_bonus,
              total_referral_earned = total_referral_earned + v_referral_bonus
          WHERE user_id = v_invited_user_id;
          UPDATE user_profiles
          SET total_referral_given = total_referral_given + v_referral_bonus
          WHERE user_id = p_customer_id;
          INSERT INTO referral_rewards (
            inviter_id, invited_user_id, order_id, order_number,
            original_reward, referral_bonus, bonus_rate
          ) VALUES (
            p_customer_id, v_invited_user_id, v_pending_order.id, v_pending_order.order_number,
            v_pending_order.commission, v_referral_bonus, v_bonus_rate
          )
          ON CONFLICT (order_id) DO NOTHING;
          INSERT INTO activity_logs (actor, action, target_type, target_id, details)
          VALUES (
            p_customer_id, 'referral_bonus', 'referral', v_pending_order.id::text,
            'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
            ' (25% of $' || v_pending_order.commission || ' from order ' || v_pending_order.order_number || ')'
          );
        END LOOP;
      END IF;

      INSERT INTO activity_logs (actor, action, target_type, target_id, details)
      VALUES (
        p_customer_id, 'order_auto_completed', 'order', v_pending_order.id::text,
        'Order ' || v_pending_order.order_number || ' auto-completed on balance credit. ' ||
        'Balance restored to $' || v_new_balance || ' (credit $' || p_amount ||
        ' + original $' || v_pending_order.original_balance || ' + commission $' || v_pending_order.commission || ')'
      );
    ELSE
      UPDATE user_profiles
      SET balance = v_new_balance, frozen_amount = 0, pending_shortage = 0
      WHERE user_id = p_customer_id;
    END IF;
  ELSE
    UPDATE user_profiles
    SET balance = v_new_balance
    WHERE user_id = p_customer_id;
  END IF;

  INSERT INTO balance_transactions
  (customer_id, admin_id, deposit_id, previous_balance, adjustment_amount,
  new_balance, adjustment_type, reason, reference)
  VALUES
  (p_customer_id, v_admin_id, NULL, v_prev_balance,
  v_adj_amount, v_new_balance, p_adjustment_type,
  COALESCE(NULLIF(p_reason, ''), 'Manual adjustment'),
  COALESCE(NULLIF(p_reference, ''), NULL));

  RETURN v_new_balance;
END;
$function$;
