/*
# Fix overloaded RPCs, VIP-by-balance, and insufficient-balance protection

## Problem Summary
1. `approve_withdrawal` and `reject_withdrawal` each had TWO overloads
   (old: `(p_withdrawal_id, p_actor)` and new: `(p_withdrawal_id, p_admin_id, p_tx_hash, p_admin_note)`).
   PostgREST could resolve to the wrong overload, causing the old version
   (which double-deducted balance) to run instead of the new one.

2. The old `approve_withdrawal(p_withdrawal_id, p_actor)` deducted balance
   at approval time, but `submit_withdrawal_request` already deducts at
   submission time — causing double deduction.

3. The old `reject_withdrawal(p_withdrawal_id, p_actor)` did NOT return
   the reserved funds to the user's balance.

4. VIP level was computed from `total_deposits` in some places instead of
   current `balance`.

## Changes
1. DROP the old overloaded functions:
   - `approve_withdrawal(uuid, text)` — old 2-arg version
   - `reject_withdrawal(uuid, text)` — old 2-arg version

2. Recreate `approve_withdrawal` with the correct 4-arg signature
   (no balance deduction — funds already reserved at submission).

3. Recreate `reject_withdrawal` with the correct 3-arg signature
   (returns reserved funds to balance).

4. Both functions are idempotent (already approved/rejected = no-op).

5. Both functions check `is_admin()` for authorization.

6. `complete_order` already has the balance check (confirmed in DB).

7. `get_vip_from_balance` already exists for server-side VIP calculation.

## Security
- All functions are SECURITY DEFINER with `SET search_path TO 'public'`.
- Admin authorization checked via `is_admin()` in all admin RPCs.
- `complete_order` uses `FOR UPDATE` lock to prevent race conditions.
- Withdrawal approval/rejection uses `FOR UPDATE` lock for atomicity.
*/
DROP FUNCTION IF EXISTS public.approve_withdrawal(uuid, text);
DROP FUNCTION IF EXISTS public.reject_withdrawal(uuid, text);

-- Recreate approve_withdrawal with the correct signature
CREATE OR REPLACE FUNCTION public.approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id text,
  p_tx_hash text DEFAULT '',
  p_admin_note text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT user_id, amount, user_name, status
  INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already approved = no-op
  IF v_withdrawal.status = 'approved' THEN
    RETURN NULL;
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  -- Balance was already reserved (deducted) at submission time.
  -- Only update the withdrawal status and metadata.
  UPDATE withdrawals
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_admin_id,
      tx_hash = COALESCE(NULLIF(p_tx_hash, ''), tx_hash),
      admin_note = COALESCE(NULLIF(p_admin_note, ''), admin_note)
  WHERE id = p_withdrawal_id;

  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'approve_withdrawal',
    'withdrawal',
    p_withdrawal_id::text,
    'Admin approved withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name ||
    COALESCE(' Tx: ' || NULLIF(p_tx_hash, ''), '')
  );

  RETURN v_withdrawal.user_id;
END;
$function$;

-- Recreate reject_withdrawal with the correct signature
CREATE OR REPLACE FUNCTION public.reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_id text,
  p_reason text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
  v_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  SELECT user_id, amount, user_name, status
  INTO v_withdrawal
  FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already rejected = no-op
  IF v_withdrawal.status = 'rejected' THEN
    RETURN NULL;
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  -- Return the reserved amount to the user's balance
  UPDATE user_profiles
  SET balance = balance + v_withdrawal.amount
  WHERE user_id = v_withdrawal.user_id
  RETURNING balance INTO v_balance;

  UPDATE withdrawals
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = p_admin_id,
      rejection_reason = p_reason
  WHERE id = p_withdrawal_id;

  INSERT INTO activity_logs (actor, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'reject_withdrawal',
    'withdrawal',
    p_withdrawal_id::text,
    'Admin rejected withdrawal of $' || v_withdrawal.amount || ' for ' || v_withdrawal.user_name ||
    COALESCE(' Reason: ' || NULLIF(p_reason, ''), '')
  );

  RETURN v_withdrawal.user_id;
END;
$function$;

-- Ensure complete_order has the balance check (recreate to be safe)
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

  -- Credit commission to the user (task reward)
  UPDATE user_profiles
  SET
    balance = balance + p_commission,
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

-- Ensure get_vip_from_balance exists for server-side VIP calculation
CREATE OR REPLACE FUNCTION public.get_vip_from_balance(p_balance numeric)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT CASE
  WHEN p_balance >= 5000 THEN 3
  WHEN p_balance >= 3000 THEN 2
  WHEN p_balance >= 1000 THEN 1
  WHEN p_balance >= 10 THEN 0
  ELSE 0
END;
$function$;
