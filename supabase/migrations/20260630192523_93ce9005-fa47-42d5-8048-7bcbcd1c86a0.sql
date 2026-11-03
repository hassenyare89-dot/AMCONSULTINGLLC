
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Allow the first signed-in user to claim admin when no admin exists.
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  has_any boolean;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_any;
  IF has_any THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin')
    ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

-- Driver registrations
CREATE TABLE public.driver_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_name text NOT NULL,
  company_name text,
  email text NOT NULL,
  phone text NOT NULL,
  dot_number text NOT NULL,
  mc_number text,
  truck_type text NOT NULL,
  truck_count integer NOT NULL,
  service_area text NOT NULL,
  availability text NOT NULL,
  notes text,
  ip text,
  status text NOT NULL DEFAULT 'new'
);

CREATE INDEX driver_registrations_created_at_idx ON public.driver_registrations (created_at DESC);
CREATE INDEX driver_registrations_availability_idx ON public.driver_registrations (availability);

GRANT SELECT ON public.driver_registrations TO authenticated;
GRANT ALL ON public.driver_registrations TO service_role;
ALTER TABLE public.driver_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read driver registrations"
  ON public.driver_registrations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
