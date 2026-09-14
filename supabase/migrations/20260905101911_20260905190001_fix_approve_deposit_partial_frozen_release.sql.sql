/*
# Fix approve_deposit to handle multiple pending orders (partial frozen release)

## Problem
approve_deposit set frozen_amount = 0 unconditionally when completing a
pending order. If the user had multiple pending_insufficient orders, this
would wipe frozen amounts belonging to other active orders.

## Fix
Calculate remaining frozen from OTHER pending orders and only release
the completed order's frozen portion.
*/

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
      -- Deposit fills the negative — restore: deposit + original_balance + commission
      v_new_balance := v_deposit.amount + v_pending_order.original_balance + v_pending_order.commission;

      -- Calculate remaining frozen from OTHER pending orders (if any)
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

-- Drop the test wrapper
DROP FUNCTION IF EXISTS public._test_approve_deposit(uuid);
