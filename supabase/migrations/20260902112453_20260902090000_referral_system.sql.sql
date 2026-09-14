-- =====================================================
-- REFERRAL SYSTEM MIGRATION
-- Direction: INVITER completes task → INVITED USER gets 25% bonus
-- =====================================================

-- 1. Add inviter_id to user_profiles (who invited this user)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS inviter_id text DEFAULT '';

-- 2. Add referral bonus tracking columns
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS total_referral_earned numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_referral_given numeric DEFAULT 0;

-- 3. Create referral_rewards table
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id text NOT NULL,          -- the user who completed the task
  invited_user_id text NOT NULL,      -- the user who receives the 25% bonus
  order_id uuid,                      -- the order that triggered the reward
  order_number text,
  original_reward numeric NOT NULL,   -- the inviter's original commission
  referral_bonus numeric NOT NULL,    -- 25% of original_reward
  bonus_rate numeric NOT NULL DEFAULT 0.25,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)                    -- prevent duplicate rewards per order
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_referral_rewards_inviter ON public.referral_rewards(inviter_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_invited ON public.referral_rewards(invited_user_id);

-- Enable RLS
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Policies: users can see their own referral rewards (as inviter or invited)
CREATE POLICY "select_own_referral_rewards" ON public.referral_rewards
  FOR SELECT TO authenticated
  USING (auth.uid()::text = inviter_id OR auth.uid()::text = invited_user_id);

-- No INSERT/UPDATE/DELETE via API — only the complete_order RPC creates these
CREATE POLICY "no_insert_referral_rewards" ON public.referral_rewards
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_update_referral_rewards" ON public.referral_rewards
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY "no_delete_referral_rewards" ON public.referral_rewards
  FOR DELETE TO authenticated USING (false);

-- =====================================================
-- 4. Upgrade create_user_profile to resolve inviter
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_user_id text,
  p_email text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT '',
  p_invitation_code text DEFAULT '',
  p_referral_code text DEFAULT ''
) RETURNS user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_row public.user_profiles;
  v_inviter_id text := '';
BEGIN
  -- Security: only the authenticated user themselves can create their profile
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  -- Check if profile already exists (idempotent)
  SELECT * INTO new_row FROM public.user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN new_row;
  END IF;

  -- Resolve inviter from the invitation/referral code
  -- The invitation_code field stores the CODE that this user entered
  -- We need to find WHO OWNS that code
  IF NULLIF(TRIM(p_invitation_code), '') IS NOT NULL THEN
    SELECT user_id INTO v_inviter_id
    FROM public.user_profiles
    WHERE referral_code = TRIM(p_invitation_code)
    LIMIT 1;

    -- Prevent self-referral
    IF v_inviter_id = p_user_id THEN
      v_inviter_id := '';
    END IF;
  END IF;

  -- Insert the new profile
  INSERT INTO public.user_profiles (
    user_id, email, full_name, phone,
    invitation_code, referral_code, inviter_id,
    role, status, vip_level,
    balance, total_deposits,
    lifetime_commission, today_commission,
    completed_today, remaining_orders,
    total_referral_earned, total_referral_given
  ) VALUES (
    p_user_id, p_email, p_full_name, p_phone,
    TRIM(p_invitation_code), p_referral_code, v_inviter_id,
    'user', 'active', 0,
    0, 0,
    0, 0,
    0, 38,
    0, 0
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$function$;

-- =====================================================
-- 5. Upgrade complete_order to pay 25% referral bonus
--    When INVITER completes a task, INVITED USER gets 25% extra
-- =====================================================
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
) RETURNS user_profiles
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
BEGIN
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

  -- Reset daily counters if it's a new day
  SELECT completed_today, today_commission INTO v_completed_today, v_today_commission
  FROM user_profiles WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_profiles (user_id, balance, total_deposits, lifetime_commission, today_commission, completed_today, last_order_date)
    VALUES (p_user_id, 0, 0, 0, 0, 0, v_today)
    ON CONFLICT (user_id) DO NOTHING;
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  IF (SELECT last_order_date FROM user_profiles WHERE user_id = p_user_id) IS DISTINCT FROM v_today THEN
    v_completed_today := 0;
    v_today_commission := 0;
  END IF;

  -- Atomically: credit commission to the task completer (inviter)
  -- balance = balance - price + price + commission = balance + commission
  UPDATE user_profiles
  SET
    balance = balance - p_total_price + p_total_price + p_commission,
    lifetime_commission = lifetime_commission + p_commission,
    today_commission = v_today_commission + p_commission,
    completed_today = v_completed_today + 1,
    last_order_date = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  -- =====================================================
  -- REFERRAL BONUS: Find users that THIS user invited
  -- When the inviter (p_user_id) earns commission,
  -- all users they invited get 25% of that commission
  -- =====================================================
  IF p_commission > 0 THEN
    -- Find all users who used this user's invitation code
    -- i.e., where inviter_id = p_user_id
    FOR v_invited_user_id IN
      SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
    LOOP
      v_referral_bonus := p_commission * v_bonus_rate;

      -- Credit the bonus to the invited user
      UPDATE user_profiles
      SET
        balance = balance + v_referral_bonus,
        lifetime_commission = lifetime_commission + v_referral_bonus,
        total_referral_earned = total_referral_earned + v_referral_bonus
      WHERE user_id = v_invited_user_id;

      -- Track total given by inviter
      UPDATE user_profiles
      SET total_referral_given = total_referral_given + v_referral_bonus
      WHERE user_id = p_user_id;

      -- Record the referral reward (idempotent via UNIQUE(order_id))
      INSERT INTO referral_rewards (
        inviter_id, invited_user_id, order_id, order_number,
        original_reward, referral_bonus, bonus_rate
      ) VALUES (
        p_user_id, v_invited_user_id, v_order_id, p_order_number,
        p_commission, v_referral_bonus, v_bonus_rate
      )
      ON CONFLICT (order_id) DO NOTHING;

      -- Log activity
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

-- Grant execute (same as before)
GRANT EXECUTE ON FUNCTION public.complete_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile TO authenticated;
