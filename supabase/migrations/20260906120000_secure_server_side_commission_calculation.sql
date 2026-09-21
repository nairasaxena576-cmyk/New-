/*
# Make commission/price/VIP calculation authoritative on the server

## Problem
submit_order and complete_order accepted p_unit_price, p_total_price,
p_commission, p_commission_rate, p_vip_level, p_is_lucky and
p_lucky_commission_percent directly from the client and trusted them
verbatim (only a `>= 0` sanity check existed, added in the prior
ownership-check migration). An authenticated user could call the RPC
directly (bypassing the UI) with a fabricated commission amount and have
it credited to their own balance, or claim an arbitrary product price.

## Fix
submit_order now re-derives every monetary value itself from authoritative
tables, using only the client-supplied p_product_id to look up the real
product row:

  unit_price = total_price = products.price          (looked up by id)
  vip_level  = highest vip_config.level whose min_deposit <= current balance
  rate       = products.is_lucky
                 ? COALESCE(user_lucky_settings.lucky_commission_percent, products.lucky_commission_percent)
                 : vip_config.commission_rate for the computed vip_level
  commission = ROUND(total_price * rate / 100, 2)

This is the exact formula already implemented client-side in
src/lib/start/helpers.ts (buildTask) and src/lib/vip-config.ts
(computeVipLevel) — nothing about the business formula changes, only
where it is computed and trusted.

complete_order only ever retries an EXISTING pending_insufficient order
(see src/pages/user/start.tsx handleSend — it's called when
hasPendingOrder && balance >= 0). That order row's commission/price were
already computed and stored by submit_order itself (and, since the prior
RLS-lockdown migration, `orders` has no direct client write path at all —
RPC-only). So complete_order now sources its monetary values from the
EXISTING order row by (order_number, user_id) when one is found, instead
of the client parameters — preserving the commission the user was
originally promised. Only in the fallback branch where no matching order
row exists does it fall back to the same fresh-computation path as
submit_order.

The p_unit_price/p_total_price/p_commission/p_commission_rate/p_is_lucky/
p_lucky_commission_percent/p_vip_level parameters are kept on both
function signatures for frontend compatibility (the app still sends them)
but are no longer used for any monetary computation or storage.

Ownership checks (auth.uid() = p_user_id) and the anon/authenticated
grants from the prior migration are unchanged and preserved below.
*/

-- ============ submit_order: server-derived price/VIP/commission ============

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
  -- Server-derived, authoritative monetary values (client params above are
  -- accepted for compatibility but never used for computation/storage).
  v_product RECORD;
  v_vip_level integer;
  v_commission_rate numeric;
  v_unit_price numeric;
  v_total_price numeric;
  v_commission numeric;
  v_user_lucky_rate numeric;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  -- Authoritative product lookup — price and lucky configuration come from
  -- the database, never from the client.
  SELECT id, price, is_lucky, lucky_commission_percent
  INTO v_product
  FROM products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  -- Defensive floor: product price should never be negative in practice
  -- (admin-set data), but never let a bad row invert the balance math below.
  v_unit_price := GREATEST(v_product.price, 0);
  v_total_price := v_unit_price; -- quantity is always 1 (see buildTask)

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

  -- Authoritative VIP level: highest tier whose min_deposit threshold the
  -- user's CURRENT balance meets (mirrors computeVipLevel() in vip-config.ts).
  SELECT level INTO v_vip_level
  FROM vip_config
  WHERE min_deposit <= v_current_balance
  ORDER BY level DESC
  LIMIT 1;
  IF NOT FOUND THEN
    v_vip_level := 0;
  END IF;

  -- Authoritative commission rate (mirrors buildTask() in helpers.ts).
  IF v_product.is_lucky THEN
    SELECT lucky_commission_percent INTO v_user_lucky_rate
    FROM user_lucky_settings
    WHERE user_id = p_user_id;
    v_commission_rate := COALESCE(v_user_lucky_rate, v_product.lucky_commission_percent);
  ELSE
    SELECT commission_rate INTO v_commission_rate
    FROM vip_config
    WHERE level = v_vip_level;
    IF NOT FOUND THEN
      v_commission_rate := 0;
    END IF;
  END IF;

  v_commission := GREATEST(ROUND(v_total_price * COALESCE(v_commission_rate, 0) / 100, 2), 0);

  -- CASE 1: Sufficient balance — complete immediately, commission only
  IF v_current_balance >= v_total_price THEN
    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note, original_balance
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, v_unit_price, v_total_price, v_total_price, v_commission, v_commission_rate,
      v_product.is_lucky, v_product.lucky_commission_percent, v_vip_level, 'completed', p_note, v_current_balance
    )
    RETURNING id INTO v_order_id;

    UPDATE user_profiles
    SET
      balance = balance + v_commission,
      frozen_amount = 0,
      pending_shortage = 0,
      lifetime_commission = lifetime_commission + v_commission,
      today_commission = v_today_commission + v_commission,
      completed_today = v_completed_today + 1,
      last_order_date = v_today
    WHERE user_id = p_user_id
    RETURNING * INTO v_profile;

    IF v_commission > 0 THEN
      FOR v_invited_user_id IN
        SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
      LOOP
        v_referral_bonus := v_commission * v_bonus_rate;
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
          v_commission, v_referral_bonus, v_bonus_rate
        )
        ON CONFLICT (order_id) DO NOTHING;
        INSERT INTO activity_logs (actor, action, target_type, target_id, details)
        VALUES (
          p_user_id, 'referral_bonus', 'referral', v_order_id::text,
          'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
          ' (25% of $' || v_commission || ' from order ' || p_order_number || ')'
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
    p_merchant, v_unit_price, v_total_price, v_total_price, v_commission, v_commission_rate,
    v_product.is_lucky, v_product.lucky_commission_percent, v_vip_level, 'pending_insufficient', p_note, v_current_balance
  )
  RETURNING id INTO v_order_id;

  UPDATE user_profiles
  SET
    balance = v_current_balance - v_total_price,
    frozen_amount = v_current_balance + v_commission,
    pending_shortage = v_total_price - v_current_balance
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$function$;

-- ============ complete_order: honor the existing order's stored values ============

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
  -- Server-derived, authoritative monetary values for this completion.
  v_unit_price numeric;
  v_total_price numeric;
  v_commission numeric;
  v_commission_rate numeric;
  v_is_lucky boolean;
  v_lucky_commission_percent numeric;
  v_vip_level integer;
  v_product RECORD;
  v_user_lucky_rate numeric;
BEGIN
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  SELECT balance, completed_today, today_commission, frozen_amount, pending_shortage
  INTO v_current_balance, v_completed_today, v_today_commission, v_profile.frozen_amount, v_profile.pending_shortage
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT id, status, unit_price, total_price, commission, commission_rate,
         is_lucky, lucky_commission_percent, vip_level
  INTO v_existing_order
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
    -- Honor the commission/price this order was already promised at
    -- submit_order time — do not silently re-price it using today's
    -- product/VIP config, and do not trust the client's parameters.
    v_unit_price := v_existing_order.unit_price;
    v_total_price := v_existing_order.total_price;
    v_commission := v_existing_order.commission;
    v_commission_rate := v_existing_order.commission_rate;
    v_is_lucky := v_existing_order.is_lucky;
    v_lucky_commission_percent := v_existing_order.lucky_commission_percent;
    v_vip_level := v_existing_order.vip_level;

    UPDATE orders SET status = 'completed'
    WHERE id = v_existing_order.id;
    v_order_id := v_existing_order.id;
  ELSE
    -- No prior order row to honor — fall back to the same fresh,
    -- authoritative computation submit_order uses.
    SELECT id, price, is_lucky, lucky_commission_percent
    INTO v_product
    FROM products
    WHERE id = p_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', p_product_id;
    END IF;

    v_unit_price := GREATEST(v_product.price, 0);
    v_total_price := v_unit_price;
    v_is_lucky := v_product.is_lucky;
    v_lucky_commission_percent := v_product.lucky_commission_percent;

    SELECT level INTO v_vip_level
    FROM vip_config
    WHERE min_deposit <= v_current_balance
    ORDER BY level DESC
    LIMIT 1;
    IF NOT FOUND THEN
      v_vip_level := 0;
    END IF;

    IF v_product.is_lucky THEN
      SELECT lucky_commission_percent INTO v_user_lucky_rate
      FROM user_lucky_settings
      WHERE user_id = p_user_id;
      v_commission_rate := COALESCE(v_user_lucky_rate, v_product.lucky_commission_percent);
    ELSE
      SELECT commission_rate INTO v_commission_rate
      FROM vip_config
      WHERE level = v_vip_level;
      IF NOT FOUND THEN
        v_commission_rate := 0;
      END IF;
    END IF;

    v_commission := GREATEST(ROUND(v_total_price * COALESCE(v_commission_rate, 0) / 100, 2), 0);

    INSERT INTO orders (
      user_id, order_number, task_number, product_id, product_name,
      merchant, unit_price, total_price, required_amount, commission, commission_rate,
      is_lucky, lucky_commission_percent, vip_level, status, note, original_balance
    ) VALUES (
      p_user_id, p_order_number, p_task_number, p_product_id, p_product_name,
      p_merchant, v_unit_price, v_total_price, v_total_price, v_commission, v_commission_rate,
      v_is_lucky, v_lucky_commission_percent, v_vip_level, 'completed', p_note, v_current_balance
    )
    RETURNING id INTO v_order_id;
  END IF;

  UPDATE user_profiles
  SET
    balance = balance + v_commission,
    frozen_amount = 0,
    pending_shortage = 0,
    lifetime_commission = lifetime_commission + v_commission,
    today_commission = v_today_commission + v_commission,
    completed_today = v_completed_today + 1,
    last_order_date = v_today
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  IF v_commission > 0 THEN
    FOR v_invited_user_id IN
      SELECT user_id FROM user_profiles WHERE inviter_id = p_user_id
    LOOP
      v_referral_bonus := v_commission * v_bonus_rate;
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
        v_commission, v_referral_bonus, v_bonus_rate
      )
      ON CONFLICT (order_id) DO NOTHING;
      INSERT INTO activity_logs (actor, action, target_type, target_id, details)
      VALUES (
        p_user_id, 'referral_bonus', 'referral', v_order_id::text,
        'Referral bonus of $' || v_referral_bonus || ' paid to invited user ' || v_invited_user_id ||
        ' (25% of $' || v_commission || ' from order ' || p_order_number || ')'
      );
    END LOOP;
  END IF;

  RETURN v_profile;
END;
$function$;

-- ============ Re-assert grants unchanged from the prior migration ============
-- CREATE OR REPLACE preserves existing ACLs on an unchanged signature, but
-- re-asserting explicitly here documents and guarantees the intended state:
-- authenticated (and ownership-checked) callers only, never anon.

REVOKE EXECUTE ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order(text, text, text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, integer, text) TO authenticated;
