
-- Explicit deny write policies on driver_registrations (writes flow through service role, which bypasses RLS)
CREATE POLICY "Deny anon insert on driver_registrations"
  ON public.driver_registrations FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Deny update on driver_registrations"
  ON public.driver_registrations FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny delete on driver_registrations"
  ON public.driver_registrations FOR DELETE TO anon, authenticated USING (false);

-- Explicit deny write policies on user_roles (only service role / SECURITY DEFINER functions may write)
CREATE POLICY "Deny insert on user_roles"
  ON public.user_roles FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Deny update on user_roles"
  ON public.user_roles FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny delete on user_roles"
  ON public.user_roles FOR DELETE TO anon, authenticated USING (false);

-- Restrict SECURITY DEFINER function execution: revoke from PUBLIC/anon, keep for authenticated (RLS needs it) and service_role
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated, service_role;
