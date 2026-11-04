-- =====================================================================================
-- Georgia dump truck registration form (Nov 2026). ADDITIVE: existing rows are kept;
-- every new column is nullable so registrations made with the old form stay valid.
--   * truck_type / availability now hold comma-separated values (multi-select).
--   * dispatch essentials: payload capacity, current truck location, travel radius.
--   * recommended: CDL class, insurance active, preferred materials.
--   * Georgia operating attestation (timestamped).
--   * fleet trucks gain the 'single-axle' vehicle type.
-- =====================================================================================

ALTER TABLE public.driver_registrations
  ADD COLUMN IF NOT EXISTS payload_capacity numeric(7,2),
  ADD COLUMN IF NOT EXISTS payload_unit text,
  ADD COLUMN IF NOT EXISTS current_location text,
  ADD COLUMN IF NOT EXISTS cdl_class text,
  ADD COLUMN IF NOT EXISTS insurance_active boolean,
  ADD COLUMN IF NOT EXISTS preferred_materials text,
  ADD COLUMN IF NOT EXISTS travel_radius text,
  ADD COLUMN IF NOT EXISTS georgia_attested boolean,
  ADD COLUMN IF NOT EXISTS georgia_attested_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_payload_chk
    CHECK (payload_capacity IS NULL OR (payload_capacity > 0 AND payload_capacity <= 200));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_payload_unit_chk
    CHECK (payload_unit IS NULL OR payload_unit IN ('tons','cubic-yards'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_cdl_chk
    CHECK (cdl_class IS NULL OR cdl_class IN ('A','B'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_radius_chk
    CHECK (travel_radius IS NULL OR travel_radius IN ('25','50','100','statewide'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_registrations ADD CONSTRAINT driver_registrations_location_len_chk
    CHECK (current_location IS NULL OR char_length(current_location) <= 120);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS driver_registrations_location_idx
  ON public.driver_registrations (lower(current_location));

-- Fleet: allow single-axle dump trucks.
ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_vehicle_type_check;
ALTER TABLE public.trucks ADD CONSTRAINT trucks_vehicle_type_check
  CHECK (vehicle_type IN ('single-axle','tandem','tri-axle','quad-axle','side-dump','super-dump','end-dump','other'));

-- Consent log: record the Georgia operating attestation alongside privacy/contact consent.
ALTER TABLE public.consent_records DROP CONSTRAINT IF EXISTS consent_records_consent_type_check;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_consent_type_check
  CHECK (consent_type IN ('privacy_notice','contact','sms','marketing','analytics_cookies',
                          'georgia_operating_attestation'));
