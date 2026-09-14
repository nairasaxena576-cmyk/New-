/*
# Create SECURITY DEFINER function for user profile creation

## Problem
When a new user registers via supabase.auth.signUp(), the auth account is created
successfully, but the subsequent INSERT into user_profiles can fail if:
1. The signUp response doesn't include an active session (email confirmation flow)
2. RLS policies require auth.uid() to match user_id, but the session isn't established yet

This causes the profile row to never be created, so the user can't log in or use the app.

## Solution
Create a SECURITY DEFINER function `create_user_profile` that:
- Accepts user_id, email, full_name, phone, invitation_code, referral_code
- Inserts the profile row with all required defaults
- Runs as the postgres user (bypasses RLS)
- Is callable only by authenticated users
- Verifies the caller's auth.uid() matches the p_user_id parameter (security check)
- Returns the created profile row

This ensures profile creation always succeeds after auth account creation,
without disabling RLS on the table itself.
*/

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_user_id text,
  p_email text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT '',
  p_invitation_code text DEFAULT '',
  p_referral_code text DEFAULT ''
) RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_row public.user_profiles;
BEGIN
  -- Security: only the authenticated user themselves can create their profile
  IF auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not match user_id';
  END IF;

  -- Check if profile already exists (idempotent)
  SELECT * INTO new_row FROM user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN new_row;
  END IF;

  -- Insert the new profile with all required defaults
  INSERT INTO user_profiles (
    user_id, email, full_name, phone,
    invitation_code, referral_code,
    role, status, vip_level,
    balance, total_deposits,
    lifetime_commission, today_commission,
    completed_today, remaining_orders
  ) VALUES (
    p_user_id, p_email, p_full_name, p_phone,
    p_invitation_code, p_referral_code,
    'user', 'active', 0,
    0, 0,
    0, 0,
    0, 38
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.create_user_profile(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_profile(text, text, text, text, text, text) TO authenticated;