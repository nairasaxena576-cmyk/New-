/*
# Dynamic Frozen Amount Recalculation on Profile Fetch

## Purpose
Ensure frozen_amount is ALWAYS correct regardless of how the balance changed.
Previously frozen_amount was only recalculated inside approve_deposit, so it
could go stale if the balance changed via admin adjustment, withdrawal, or
old data from before the formula fix.

## Changes

### get_user_profile_safe (new RPC)
- SECURITY DEFINER function that:
  1. Locks the user_profiles row FOR UPDATE
  2. Looks for the user's most recent pending_insufficient order
  3. Recalculates frozen_amount and pending_shortage:
     - If balance >= required_amount: frozen = 0, shortage = 0
     - If balance < required_amount: frozen = total_price + commission, shortage = required - balance
  4. Updates stored frozen_amount/pending_shortage if they changed
  5. Returns the corrected user_profiles row
- If no pending order exists, ensures frozen = 0 and shortage = 0

### One-time data fix
- Recalculates frozen_amount for ALL existing users with pending_insufficient orders
- Clears frozen for users whose balance now covers their pending order

## Security
- SECURITY DEFINER, SET search_path TO 'public'
- Granted to anon + authenticated
*/

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
  v_changed boolean := false;
BEGIN
  -- Lock and fetch the profile row
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Look for the most recent pending_insufficient order
  SELECT required_amount, total_price, commission
  INTO v_pending_order
  FROM orders
  WHERE user_id = p_user_id AND status = 'pending_insufficient'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Recalculate based on current balance
    IF v_profile.balance >= v_pending_order.required_amount THEN
      v_new_frozen := 0;
      v_new_shortage := 0;
    ELSE
      v_new_frozen := v_pending_order.total_price + v_pending_order.commission;
      v_new_shortage := v_pending_order.required_amount - v_profile.balance;
    END IF;
  ELSE
    -- No pending order — frozen and shortage must be 0
    v_new_frozen := 0;
    v_new_shortage := 0;
  END IF;

  -- Only write if values changed (avoids unnecessary updates)
  IF COALESCE(v_profile.frozen_amount, 0) <> v_new_frozen OR
     COALESCE(v_profile.pending_shortage, 0) <> v_new_shortage THEN
    UPDATE user_profiles
    SET frozen_amount = v_new_frozen,
        pending_shortage = v_new_shortage
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;
    v_changed := true;
  END IF;

  RETURN v_profile;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_user_profile_safe TO anon, authenticated;

-- One-time fix: recalculate frozen_amount for all users with pending_insufficient orders
DO $$
DECLARE
  r RECORD;
  v_new_frozen numeric;
  v_new_shortage numeric;
BEGIN
  FOR r IN
    SELECT DISTINCT up.user_id, up.balance, up.frozen_amount, up.pending_shortage,
           o.required_amount, o.total_price, o.commission
    FROM user_profiles up
    JOIN orders o ON o.user_id = up.user_id AND o.status = 'pending_insufficient'
  LOOP
    IF r.balance >= r.required_amount THEN
      v_new_frozen := 0;
      v_new_shortage := 0;
    ELSE
      v_new_frozen := r.total_price + r.commission;
      v_new_shortage := r.required_amount - r.balance;
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

-- Also clear frozen for users with NO pending orders but stale frozen > 0
UPDATE user_profiles
SET frozen_amount = 0, pending_shortage = 0
WHERE frozen_amount > 0
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM orders WHERE status = 'pending_insufficient'
  );
