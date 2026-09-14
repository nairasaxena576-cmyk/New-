/*
# Implement frozen-balance order model

## Purpose
Replace the old "reject insufficient orders" model with a frozen-balance model:
1. When a user submits an order they can't afford, the order is saved as
   'pending_insufficient' in the orders table. The wallet balance goes
   negative by the shortage amount, and frozen_amount is set to the shortage.
2. When a deposit is approved, the balance increases and frozen_amount is
   recalculated automatically from the pending order's required_amount.
3. When frozen_amount reaches 0 and balance >= 0, the user can complete
   the SAME order. Completion only adds commission — the product price is
   NOT deducted again (it was already represented by the negative/frozen
   amount).

## New Columns
### user_profiles.pending_shortage (numeric, default 0)
Tracks the shortage amount for the current pending order. When 0, there is
no pending insufficient order.

### orders.required_amount (numeric, default 0)
The total_price required for the order. Used to recalculate frozen_amount
when deposits are approved.

## New Functions
### submit_order(...)
SECURITY DEFINER. Atomically:
1. If user has sufficient balance (balance >= p_total_price): inserts order
   with status 'completed', credits commission to balance, updates counters.
   Returns the updated user_profiles row.
2. If user has insufficient balance: inserts order with status 'pending_insufficient',
   sets balance = balance - p_total_price (goes negative), sets frozen_amount =
   |new balance| if balance < 0 (i.e. the shortage), sets pending_shortage.
   Does NOT credit commission. Returns the updated user_profiles row.
Uses FOR UPDATE lock to prevent race conditions. Idempotency: if an order
with the same order_number already exists, returns the current profile
without creating a duplicate.

## Modified Functions
### complete_order(...)
Now only works when the user has no pending shortage (frozen_amount = 0).
Credits ONLY commission. Clears frozen_amount and pending_shortage.
The product price is NOT deducted (already represented by the frozen period).

### approve_deposit(p_deposit_id uuid, p_admin_id text)
After crediting the deposit amount to balance, recalculates frozen_amount
from the user's pending_insufficient order (if any). If the new balance
covers the required_amount, frozen_amount and pending_shortage are set to 0.

## Security
- All functions remain SECURITY DEFINER with SET search_path TO 'public'.
- No RLS policy changes.
- FOR UPDATE row locks used for atomicity.
*/

-- ============ Add columns ============
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS pending_shortage numeric NOT NULL DEFAULT 0;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS required_amount numeric NOT NULL DEFAULT 0;

-- ============ submit_order function ============
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
  v_frozen numeric;
  v_existing_order RECORD;
  v_invited_user_id text;
  v_referral_bonus numeric;
  v_bonus_rate numeric := 0.25;
BEGIN
  -- Lock the user's balance
  SELECT balance, completed_today, today_commission, frozen_amount
  INTO v_current_balance, v_completed_today, v_today_commission, v_frozen
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Idempotency: if order with same order_number exists, return current profile
  SELECT id, status INTO v_existing_order
  FROM orders WHERE order_number = p_order_number AND user_id = p_user_id;
  IF FOUND THEN
    SELECT * INTO v_profile FROM user_profiles WHERE user_id = p_user_id;
    RETURN v_profile;
  END IF;

  -- Reset daily counters if it's a new day
  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- CASE 1: Sufficient balance — complete the order immediately
  IF v_current_balance >= p_total_price THEN
    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
      p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note
    )
    RETURNING id INTO v_order_id;

    -- Credit commission only (do NOT deduct product price)
    UPDATE user_profiles
    SET
      balance = balance + p_commission,
      frozen_amount = frozen_amount + p_total_price + p_commission,
      lifetime_commission = lifetime_commission + p_commission,
      today_commission = v_today_commission + p_commission,
      completed_today = v_completed_today + 1,
      last_order_date = v_today,
      pending_shortage = 0
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;

    -- Referral bonus
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

  -- CASE 2: Insufficient balance — create pending_insufficient order
  -- Balance goes negative by the shortage, frozen_amount = shortage
  INSERT INTO orders (
    user_id, order_number, task_number, product_id, product_name,
    merchant, unit_price, total_price, required_amount, commission, commission_rate,
    is_lucky, lucky_commission_percent, vip_level, status, note
  ) VALUES (
    p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
    p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
    p_is_lucky, p_lucky_commission_percent, p_vip_level, 'pending_insufficient', p_note
  )
  RETURNING id INTO v_order_id;

  -- Balance goes negative by the shortage amount
  -- new balance = current - total_price (negative if total_price > current)
  -- frozen_amount = |new balance| if new balance < 0, i.e. the shortage
  UPDATE user_profiles
  SET
    balance = balance - p_total_price,
    frozen_amount = GREATEST(0, -(balance - p_total_price)),
    pending_shortage = GREATEST(0, p_total_price - balance)
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$function$;

GRANT EXECUTE ON FUNCTION submit_order TO anon, authenticated;

-- ============ complete_order — only adds commission, clears frozen ============
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
  v_frozen numeric;
  v_pending_shortage numeric;
  v_existing_order RECORD;
BEGIN
  -- Lock the user's balance
  SELECT balance, completed_today, today_commission, frozen_amount, pending_shortage
  INTO v_current_balance, v_completed_today, v_today_commission, v_frozen, v_pending_shortage
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Idempotency: if this order is already completed, return current profile
  SELECT id, status INTO v_existing_order
  FROM orders WHERE order_number = p_order_number AND user_id = p_user_id;
  IF FOUND AND v_existing_order.status = 'completed' THEN
    SELECT * INTO v_profile FROM user_profiles WHERE user_id = p_user_id;
    RETURN v_profile;
  END IF;

  -- Reset daily counters if it's a new day
  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- Insert or update the order row as completed
  IF FOUND THEN
    -- Update existing pending_insufficient order to completed
    UPDATE orders SET status = 'completed'
    WHERE id = v_existing_order.id
    RETURNING id INTO v_order_id;
    v_order_id := v_existing_order.id;
  ELSE
    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, p_unit_price, p_total_price, p_total_price, p_commission, p_commission_rate,
      p_is_lucky, p_lucky_commission_percent, p_vip_level, 'completed', p_note
    )
    RETURNING id INTO v_order_id;
  END IF;

  -- Credit commission only, clear frozen/pending_shortage
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

  -- Referral bonus
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

-- ============ approve_deposit — recalculate frozen_amount after deposit ============
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
  v_new_frozen numeric;
  v_new_shortage numeric;
BEGIN
  -- Verify caller is admin
  IF NOT is_admin(auth.uid()::text) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  -- Lock the deposit row and check it's still pending
  SELECT user_id, amount, status INTO v_deposit
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already processed
  IF v_deposit.status <> 'pending' THEN
    RETURN NULL;
  END IF;

  -- Get current balance
  SELECT balance INTO v_prev_balance
  FROM user_profiles WHERE user_id = v_deposit.user_id;
  IF v_prev_balance IS NULL THEN
    v_prev_balance := 0;
  END IF;

  v_new_balance := v_prev_balance + v_deposit.amount;

  -- Update deposit status
  UPDATE deposits
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_deposit_id;

  -- Credit balance + total_deposits
  INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
  VALUES (v_deposit.user_id, v_deposit.amount, v_deposit.amount, 0, 0, 0, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = user_profiles.balance + v_deposit.amount,
      total_deposits = user_profiles.total_deposits + v_deposit.amount;

  -- Recalculate frozen_amount from the user's pending_insufficient order
  SELECT required_amount, total_price INTO v_pending_order
  FROM orders
  WHERE user_id = v_deposit.user_id AND status = 'pending_insufficient'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- new balance after deposit vs required amount
    IF v_new_balance >= v_pending_order.required_amount THEN
      -- Fully covered — clear frozen and shortage
      v_new_frozen := 0;
      v_new_shortage := 0;
    ELSE
      -- Still short — frozen = remaining shortage
      v_new_frozen := v_pending_order.required_amount - v_new_balance;
      v_new_shortage := v_new_frozen;
    END IF;

    UPDATE user_profiles
    SET frozen_amount = v_new_frozen,
        pending_shortage = v_new_shortage
    WHERE user_id = v_deposit.user_id;
  ELSE
    -- No pending order — ensure frozen/shortage are 0
    UPDATE user_profiles
    SET frozen_amount = 0,
        pending_shortage = 0
    WHERE user_id = v_deposit.user_id
      AND (frozen_amount > 0 OR pending_shortage > 0);
  END IF;

  -- Write audit record
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

-- Drop the old single-arg overload if it still exists
DROP FUNCTION IF EXISTS public.approve_deposit(uuid);
