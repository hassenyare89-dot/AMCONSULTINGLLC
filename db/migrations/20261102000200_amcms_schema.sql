-- =====================================================================================
-- AM Consulting Management System (AMCMS) — core schema
--
-- Security model (unchanged from the original project):
--   * RLS is ENABLED on every table and NO policies are granted to anon/authenticated.
--   * Table privileges are revoked from anon/authenticated as defence in depth.
--   * All reads/writes are mediated by server functions that authenticate the user,
--     verify role permissions + MFA, and then use the service-role client.
-- This migration is ADDITIVE. Existing rows in driver_registrations / user_roles are kept.
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- helpers ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Human-friendly sequential numbers (e.g. D-000042)
CREATE SEQUENCE IF NOT EXISTS public.dispatch_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.project_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.estimate_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.quote_request_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.privacy_request_number_seq;

-- ---------- identity -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  phone text,
  title text,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_profiles_email_idx ON public.staff_profiles (lower(email));

CREATE TABLE IF NOT EXISTS public.login_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event text NOT NULL CHECK (event IN (
    'login_success','login_failed','login_blocked','logout','mfa_enrolled','mfa_verified',
    'mfa_failed','password_reset_requested','password_changed','session_timeout')),
  ip_hash text,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_audit_events_created_idx ON public.login_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_events_email_idx ON public.login_audit_events (lower(email), created_at DESC);

-- ---------- driver applications (existing table, extended) ---------------------------
ALTER TABLE public.driver_registrations ALTER COLUMN dot_number DROP NOT NULL;
ALTER TABLE public.driver_registrations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_privacy boolean,
  ADD COLUMN IF NOT EXISTS consent_contact boolean,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS info_request_note text,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;
-- Enforced for new/updated rows only; existing rows are not re-validated.
DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_status_chk
    CHECK (status IN ('new','reviewed','info_requested','approved','rejected','archived')) NOT VALID;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS driver_registrations_status_idx ON public.driver_registrations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS driver_registrations_email_idx ON public.driver_registrations (lower(email));
DROP TRIGGER IF EXISTS trg_driver_registrations_updated ON public.driver_registrations;
CREATE TRIGGER trg_driver_registrations_updated BEFORE UPDATE ON public.driver_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.driver_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.driver_registrations(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_status_history_reg_idx ON public.driver_status_history (registration_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.driver_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.driver_registrations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_notes_reg_idx ON public.driver_notes (registration_id, created_at DESC);

-- Secure applicant status links: only a SHA-256 hash of the random token is stored.
CREATE TABLE IF NOT EXISTS public.driver_status_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.driver_registrations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_status_tokens_reg_idx ON public.driver_status_tokens (registration_id);

-- ---------- drivers & fleet ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid UNIQUE REFERENCES public.driver_registrations(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  company_name text,
  email text,
  phone text,
  service_area text,
  usdot_number text,
  mc_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON public.drivers (status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS drivers_name_idx ON public.drivers (lower(full_name));

CREATE TABLE IF NOT EXISTS public.trucks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number text NOT NULL UNIQUE,
  owner_name text,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_type text NOT NULL DEFAULT 'tandem'
    CHECK (vehicle_type IN ('tandem','tri-axle','quad-axle','side-dump','super-dump','end-dump','other')),
  make text,
  model text,
  year integer CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  vin text CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  license_plate text,
  registration_state text CHECK (registration_state IS NULL OR registration_state ~ '^[A-Z]{2}$'),
  capacity_tons numeric(6,2) CHECK (capacity_tons IS NULL OR capacity_tons > 0),
  availability text NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','assigned','maintenance','out_of_service')),
  insurance_provider text,
  insurance_policy_ref text,
  insurance_expires_on date,
  registration_expires_on date,
  next_maintenance_on date,
  maintenance_notes text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trucks_driver_idx ON public.trucks (driver_id);
CREATE INDEX IF NOT EXISTS trucks_availability_idx ON public.trucks (availability) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS trucks_reg_exp_idx ON public.trucks (registration_expires_on);
CREATE INDEX IF NOT EXISTS trucks_ins_exp_idx ON public.trucks (insurance_expires_on);

CREATE TABLE IF NOT EXISTS public.truck_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  assigned_from timestamptz NOT NULL DEFAULT now(),
  assigned_to timestamptz,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS truck_assignments_truck_idx ON public.truck_assignments (truck_id, assigned_from DESC);

-- ---------- CRM ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  service_interest text,
  source text,
  account_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (lower(name));

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx ON public.customer_contacts (customer_id);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  location text,
  service_interest text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','contact_form','quote_request','appointment','referral','phone','email','other')),
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','contacted','qualified','proposal_sent','negotiation','won','lost')),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  lost_reason text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_stage_idx ON public.leads (stage, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_followup_idx ON public.leads (next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('note','call','email','meeting','stage_change','form_submission','task')),
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lead_activities_lead_idx ON public.lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_activities_customer_idx ON public.lead_activities (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  service text,
  message text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  consent_privacy boolean NOT NULL DEFAULT false,
  ip_hash text,
  email_delivered boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_submissions_created_idx ON public.contact_submissions (created_at DESC);

-- ---------- projects & dispatch -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text NOT NULL UNIQUE
    DEFAULT ('P-' || lpad(nextval('public.project_number_seq')::text, 5, '0')),
  name text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  address text,
  service_type text,
  start_date date,
  estimated_completion_date date,
  truck_requirements text,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','scheduled','active','on_hold','completed','cancelled')),
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estimate_id uuid,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (estimated_completion_date IS NULL OR start_date IS NULL OR estimated_completion_date >= start_date)
);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON public.projects (customer_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects (status) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('staff','driver','truck')),
  staff_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE CASCADE,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (resource_type = 'staff'  AND staff_id  IS NOT NULL AND driver_id IS NULL AND truck_id IS NULL) OR
    (resource_type = 'driver' AND driver_id IS NOT NULL AND staff_id  IS NULL AND truck_id IS NULL) OR
    (resource_type = 'truck'  AND truck_id  IS NOT NULL AND staff_id  IS NULL AND driver_id IS NULL))
);
CREATE INDEX IF NOT EXISTS project_resources_project_idx ON public.project_resources (project_id);

CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_number text NOT NULL UNIQUE
    DEFAULT ('D-' || lpad(nextval('public.dispatch_number_seq')::text, 6, '0')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  dispatcher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pickup_location text NOT NULL,
  destination text,
  material text,
  requirements text,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','scheduled','assigned','in_progress','completed','cancelled','on_hold')),
  notes text,
  completed_at timestamptz,
  completion_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start),
  CHECK (status NOT IN ('assigned','in_progress') OR driver_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS dispatch_jobs_start_idx ON public.dispatch_jobs (scheduled_start);
CREATE INDEX IF NOT EXISTS dispatch_jobs_status_idx ON public.dispatch_jobs (status);
CREATE INDEX IF NOT EXISTS dispatch_jobs_driver_idx ON public.dispatch_jobs (driver_id, scheduled_start);
CREATE INDEX IF NOT EXISTS dispatch_jobs_truck_idx ON public.dispatch_jobs (truck_id, scheduled_start);
CREATE INDEX IF NOT EXISTS dispatch_jobs_project_idx ON public.dispatch_jobs (project_id);
CREATE INDEX IF NOT EXISTS dispatch_jobs_dispatcher_idx ON public.dispatch_jobs (dispatcher_id);
-- Database-level backstop against double-booking a driver or truck (application checks first).
DO $$ BEGIN
  ALTER TABLE public.dispatch_jobs ADD CONSTRAINT dispatch_no_driver_overlap EXCLUDE USING gist
    (driver_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&)
    WHERE (driver_id IS NOT NULL AND status <> 'cancelled');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.dispatch_jobs ADD CONSTRAINT dispatch_no_truck_overlap EXCLUDE USING gist
    (truck_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&)
    WHERE (truck_id IS NOT NULL AND status <> 'cancelled');
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.dispatch_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_status_history_job_idx ON public.dispatch_status_history (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('phone','sms','email','radio','in_person','other')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  counterpart text,
  summary text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_communications_job_idx ON public.dispatch_communications (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.load_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  ticket_number text,
  material text,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'loads' CHECK (unit IN ('loads','tons','cubic_yards','hours')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS load_records_job_idx ON public.load_records (job_id);

CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS follow_up_tasks_assignee_idx ON public.follow_up_tasks (assigned_to, status, due_at);

-- ---------- quotes -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE
    DEFAULT ('QR-' || lpad(nextval('public.quote_request_number_seq')::text, 6, '0')),
  name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  service_type text NOT NULL,
  pickup_location text NOT NULL,
  destination text,
  truck_type text,
  truck_count integer CHECK (truck_count IS NULL OR truck_count BETWEEN 1 AND 500),
  material text,
  estimated_duration text,
  preferred_date date,
  details text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','estimated','closed')),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  consent_privacy boolean NOT NULL DEFAULT false,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx ON public.quote_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text,
  unit text NOT NULL DEFAULT 'hour' CHECK (unit IN ('hour','load','ton','cubic_yard','day','flat','mile')),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  minimum_quantity numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_number text NOT NULL UNIQUE
    DEFAULT ('Q-' || lpad(nextval('public.estimate_number_seq')::text, 6, '0')),
  quote_request_id uuid REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_company text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','accepted','declined','expired')),
  valid_until date,
  terms text,
  notes text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate < 1),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  public_token_hash text UNIQUE,
  public_token_expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  customer_response_note text,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimates_status_idx ON public.estimates (status, created_at DESC);
DO $$ BEGIN
  ALTER TABLE public.projects ADD CONSTRAINT projects_estimate_fk
    FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'hour',
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL,
  pricing_rule_id uuid REFERENCES public.pricing_rules(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON public.estimate_items (estimate_id, sort_order);

CREATE TABLE IF NOT EXISTS public.quote_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'staff' CHECK (actor_type IN ('staff','customer','system')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_status_history_est_idx ON public.quote_status_history (estimate_id, created_at DESC);

-- ---------- appointments -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company text,
  topic text NOT NULL,
  notes text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','confirmed','cancelled','completed','no_show')),
  staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  manage_token_hash text UNIQUE,
  consent_privacy boolean NOT NULL DEFAULT false,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_starts_idx ON public.appointments (starts_at);
DO $$ BEGIN
  ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist
    (tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('requested','confirmed'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ---------- CMS ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_sections (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.-]{2,80}$'),
  page text NOT NULL,
  title text NOT NULL,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','scheduled','changes_pending')),
  scheduled_at timestamptz,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL REFERENCES public.content_sections(key) ON DELETE CASCADE,
  data jsonb NOT NULL,
  action text NOT NULL CHECK (action IN ('save','publish','restore','schedule','unpublish')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_revisions_key_idx ON public.content_revisions (section_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.publishing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  section_key text NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL DEFAULT 'media',
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  kind text NOT NULL CHECK (kind IN ('image','video','model')),
  alt_text text,
  sha256 text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (char_length(question) BETWEEN 3 AND 300),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 8000),
  category text NOT NULL DEFAULT 'general',
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faq_entries_pub_idx ON public.faq_entries (published, category, sort_order);

-- ---------- documents ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'service_agreement','driver_registration','insurance','vehicle_registration',
    'project','customer_correspondence','policy','other')),
  entity_type text CHECK (entity_type IN ('driver','driver_application','truck','project','customer','company')),
  entity_id uuid,
  sensitivity text NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('internal','confidential','restricted')),
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  previous_version_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  is_current boolean NOT NULL DEFAULT true,
  expires_on date,
  retain_until date,
  scan_status text NOT NULL DEFAULT 'not_scanned' CHECK (scan_status IN ('not_scanned','clean','infected','error')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_entity_idx ON public.documents (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS documents_expiry_idx ON public.documents (expires_on) WHERE is_current AND archived_at IS NULL;

-- ---------- notifications ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  audience_permission text,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text CHECK (link IS NULL OR link ~ '^/'),
  dedupe_key text UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR audience_permission IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_audience_idx ON public.notifications (audience_permission, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','in_app')),
  template text NOT NULL,
  recipient text NOT NULL,
  subject text,
  status text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider_message_id text,
  error text,
  related_type text,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_delivery_created_idx ON public.notification_delivery_events (created_at DESC);

-- ---------- privacy & compliance -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE
    DEFAULT ('PR-' || lpad(nextval('public.privacy_request_number_seq')::text, 5, '0')),
  name text NOT NULL,
  email text NOT NULL,
  state_of_residence text,
  request_type text NOT NULL CHECK (request_type IN ('access','delete','correct','opt_out','portability','other')),
  details text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','verifying','in_progress','completed','denied')),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '45 days'),
  resolved_at timestamptz,
  resolution_note text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consent_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_email text NOT NULL,
  context text NOT NULL CHECK (context IN (
    'contact_form','driver_registration','quote_request','appointment','privacy_request','cookie_banner')),
  consent_type text NOT NULL CHECK (consent_type IN ('privacy_notice','contact','sms','marketing','analytics_cookies')),
  granted boolean NOT NULL,
  policy_version text NOT NULL,
  related_id uuid,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_records_email_idx ON public.consent_records (lower(subject_email));

-- ---------- audit log (append-only) -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text,
  changes jsonb,
  ip_hash text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

-- ---------- settings ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]{2,80}$'),
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.system_settings (key, value) VALUES
  ('appointments.business_hours', '{"timezone":"America/New_York","slot_minutes":30,"days":{"1":["09:00","17:00"],"2":["09:00","17:00"],"3":["09:00","17:00"],"4":["09:00","17:00"],"5":["09:00","17:00"]},"min_notice_hours":24,"max_days_ahead":45,"require_approval":true}'::jsonb),
  ('notifications.recipients', '{"leads":[],"drivers":[],"quotes":[],"appointments":[]}'::jsonb),
  ('quotes.defaults', '{"valid_days":30,"tax_rate":0,"terms":"This estimate is for planning purposes only and is not a binding commitment until confirmed in writing by AM Consulting LLC."}'::jsonb),
  ('retention.policy', '{"contact_submissions_days":730,"rejected_driver_applications_days":365,"login_audit_days":365,"privacy_requests_days":730}'::jsonb),
  ('security.session', '{"idle_timeout_minutes":30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------- rate limiting (shared across Worker isolates) ---------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.rate_limits AS r (key, hits, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN r.reset_at < now() THEN 1 ELSE r.hits + 1 END,
        reset_at = CASE WHEN r.reset_at < now() THEN now() + make_interval(secs => p_window_seconds) ELSE r.reset_at END
  RETURNING hits INTO v_hits;
  -- opportunistic cleanup
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE reset_at < now() - interval '1 hour';
  END IF;
  RETURN v_hits <= p_max;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

-- ---------- updated_at triggers -----------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_profiles','drivers','trucks','customers','customer_contacts','leads',
    'projects','dispatch_jobs','follow_up_tasks','quote_requests','pricing_rules','estimates',
    'appointments','content_sections','faq_entries','privacy_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- ---------- RLS: deny by default ----------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_profiles','login_audit_events','driver_status_history','driver_notes',
    'driver_status_tokens','drivers','trucks','truck_assignments','customers','customer_contacts','leads',
    'lead_activities','contact_submissions','projects','project_resources','dispatch_jobs',
    'dispatch_status_history','dispatch_communications','load_records','follow_up_tasks','quote_requests',
    'pricing_rules','estimates','estimate_items','quote_status_history','appointments','content_sections',
    'content_revisions','publishing_events','media_assets','faq_entries','documents','notifications',
    'notification_reads','notification_delivery_events','privacy_requests','consent_records','audit_logs',
    'system_settings','rate_limits']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
-- Existing tables: keep RLS, but also remove the broad SELECT grant (server mediates all reads).
REVOKE ALL ON public.driver_registrations FROM anon, authenticated;
-- user_roles: authenticated keeps SELECT (RLS limits it to the caller's own rows); nothing else.
REVOKE ALL ON public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_roles FROM authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ---------- storage buckets ---------------------------------------------------------
-- 'media'     : public website media (images, video, 3D models). Writes: server only.
-- 'documents' : PRIVATE. No storage policies => only the service role can read/write;
--               staff download via short-lived signed URLs issued after permission checks.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('media', 'media', true, 104857600,
    ARRAY['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm','model/gltf-binary']),
  ('documents', 'documents', false, 26214400,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'])
ON CONFLICT (id) DO NOTHING;
