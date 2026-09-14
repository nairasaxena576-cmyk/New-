/*
# Fix user_profiles user_id mismatch and clean up demo data

## Problem
The user_profiles table stores user_id as text, but some existing rows have fake IDs 
(usr_001, adm_001, usr_0fd523py) that don't match real auth.users IDs.
This means when a real user logs in, fetchUserProfile(userId) returns null because
the auth user's UUID doesn't match the fake text ID in user_profiles.

## Changes
1. Fix the real user's profile: update user_id from 'usr_0fd523py' to their actual auth UUID.
2. Delete the two demo profile rows (usr_001, adm_001) that have no corresponding auth.users entry.
3. Remove the overly permissive anon_* policies on user_profiles — they allow anyone to read/insert all profiles.
4. Keep the proper authenticated-only ownership policies.
5. Fix the admin_select_all_profiles policy to use a simpler, correct subquery.
*/

-- 1. Fix the real user's profile to use their actual auth UUID
UPDATE user_profiles 
SET user_id = '703dacfb-28aa-4d80-b3a8-ac4627856c92'
WHERE user_id = 'usr_0fd523py' AND email = 'hamphayvanh@gmail.com';

-- 2. Delete demo profiles that have no corresponding auth.users entry
-- usr_001 (user@nexbuy.io) and adm_001 (admin@nexbuy.io) are demo data
DELETE FROM user_profiles WHERE user_id IN ('usr_001', 'adm_001');

-- 3. Remove overly permissive anon policies
DROP POLICY IF EXISTS "anon_select_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "anon_insert_user_profiles" ON user_profiles;

-- 4. Ensure proper ownership policies exist (drop + recreate to be safe)
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;
CREATE POLICY "select_own_profile"
ON user_profiles FOR SELECT
TO authenticated USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
CREATE POLICY "insert_own_profile"
ON user_profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
CREATE POLICY "update_own_profile"
ON user_profiles FOR UPDATE
TO authenticated USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);

-- 5. Fix admin policy — admin can read all profiles and update role/status
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
CREATE POLICY "admin_select_all_profiles"
ON user_profiles FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
);

DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
CREATE POLICY "admin_update_all_profiles"
ON user_profiles FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')
);

-- 6. Add a unique constraint on user_id if not exists (prevents duplicate profiles)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_id_key') THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;