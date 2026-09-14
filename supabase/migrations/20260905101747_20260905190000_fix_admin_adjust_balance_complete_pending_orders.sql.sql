/*
# Fix admin_adjust_balance to complete pending orders and release frozen amount

## Problem
When admin credits a user's balance via "Manage Balance" modal, the function
only added to balance. It did NOT:
- Check for pending_insufficient orders
- Complete the pending order if balance becomes sufficient
- Release frozen_amount
- Clear pending_shortage

This left users with a positive balance but still-frozen funds and a stuck
pending order.

## Fix
When adjustment_type = 'credit' and the new balance >= 0, check for a
pending_insufficient order. If found, complete it using the same formula
as approve_deposit: deposit + original_balance + commission.
Release frozen_amount and pending_shortage accordingly.

For debits, keep existing behavior (no pending order logic needed).
*/

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
  v_today date := CURRENT_DATE;
  v_completed_today integer;
  v_today_commission numeric;
  v_last_order_date date;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
  v_remaining_frozen numeric;
  v_other_frozen numeric;
BEGIN
  -- Verify caller is admin
  v_admin_id := auth.uid()::text;
  IF NOT is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  -- Validate adjustment type
  IF p_adjustment_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Invalid adjustment type: must be credit or debit';
  END IF;

  -- Validate amount
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Get current balance with row lock
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

  -- For credits: check if this completes a pending_insufficient order
  IF p_adjustment_type = 'credit' AND v_new_balance >= 0 THEN
    SELECT id, order_number, original_balance, total_price, commission
    INTO v_pending_order
    FROM orders
    WHERE user_id = p_customer_id AND status = 'pending_insufficient'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Credit fills the shortage — restore: credit_amount + original_balance + commission
      v_new_balance := p_amount + v_pending_order.original_balance + v_pending_order.commission;

      -- Calculate remaining frozen from OTHER pending orders (if any)
      SELECT COALESCE(SUM(o.original_balance + o.commission), 0)
      INTO v_other_frozen
      FROM orders o
      WHERE o.user_id = p_customer_id
        AND o.status = 'pending_insufficient'
        AND o.id <> v_pending_order.id;

      -- Complete the pending order
      UPDATE orders SET status = 'completed'
      WHERE id = v_pending_order.id;

      -- Update profile: restore balance, release only this order's frozen, keep other frozen
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

      -- Pay referral bonuses
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
      -- No pending order — simple credit, clear frozen/shortage if zero
      UPDATE user_profiles
      SET balance = v_new_balance, frozen_amount = 0, pending_shortage = 0
      WHERE user_id = p_customer_id;
    END IF;
  ELSE
    -- Debit or credit that doesn't fill shortage — simple balance update
    UPDATE user_profiles
    SET balance = v_new_balance
    WHERE user_id = p_customer_id;
  END IF;

  -- Write audit record
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
