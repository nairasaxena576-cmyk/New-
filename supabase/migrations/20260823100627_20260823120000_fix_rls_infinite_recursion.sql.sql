/*
# Fix infinite recursion in user_profiles RLS policies

## Problem
The admin_select_all_profiles and admin_update_all_profiles policies on user_profiles
contain a subquery that reads FROM user_profiles itself:

  EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = auth.uid()::text AND p.role = 'admin')

When any SELECT runs on user_profiles, Postgres evaluates ALL permissive SELECT policies.
The admin policy's subquery reads user_profiles again, which triggers policy evaluation
again, causing infinite recursion:

  ERROR: infinite recursion detected in policy for relation "user_profiles"

This caused EVERY query to user_profiles to fail with HTTP 500, breaking login,
registration, and all profile reads.

## Solution
Replace the self-referencing admin check with a SECURITY DEFINER function that
checks the caller's role without triggering RLS recursion. The function
is_admin_user() reads the caller's profile row as the postgres superuser
(bypassing RLS), so there's no recursive policy evaluation.

## Changes
1. Create is_admin_user() SECURITY DEFINER function that returns boolean
2. Rewrite admin_select_all_profiles to use is_admin_user() instead of subquery
3. Rewrite admin_update_all_profiles to use is_admin_user() instead of subquery
*/

-- 1. Create a SECURITY DEFINER helper that checks if the caller is an admin
-- This bypasses RLS so there's no recursive policy evaluation
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid()::text AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- 2. Rewrite admin SELECT policy to use the helper function (no recursion)
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
CREATE POLICY "admin_select_all_profiles"
ON user_profiles FOR SELECT
TO authenticated USING (public.is_admin_user());

-- 3. Rewrite admin UPDATE policy to use the helper function (no recursion)
DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
CREATE POLICY "admin_update_all_profiles"
ON user_profiles FOR UPDATE
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());