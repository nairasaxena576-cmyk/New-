/*
# Create admin check and role assignment functions

## Functions
1. `has_any_admin()` — SECURITY DEFINER function that checks if any admin exists. Used during registration to determine if the first user should become admin.
2. `assign_first_admin_if_needed(p_user_id text)` — SECURITY DEFINER function that promotes the given user to admin if no admin exists yet.
*/

CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.assign_first_admin_if_needed(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'admin') THEN
    UPDATE user_profiles SET role = 'admin' WHERE user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_any_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_first_admin_if_needed(text) TO authenticated;