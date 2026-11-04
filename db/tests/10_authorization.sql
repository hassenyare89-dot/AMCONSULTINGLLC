-- Database authorization tests. Run by scripts/test-db.sh after all migrations.
-- Every failed expectation raises an exception (non-zero exit).
\set ON_ERROR_STOP on

-- 1. anon and authenticated must not be able to read or write any AMCMS table.
DO $$
DECLARE
  t text; r text; ok boolean;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      IF has_table_privilege(r, format('public.%I', t), 'SELECT')
         OR has_table_privilege(r, format('public.%I', t), 'INSERT')
         OR has_table_privilege(r, format('public.%I', t), 'UPDATE')
         OR has_table_privilege(r, format('public.%I', t), 'DELETE') THEN
        -- user_roles keeps its original "read own roles" grant (RLS-limited) from the first migration.
        IF NOT (t = 'user_roles' AND r = 'authenticated'
                AND NOT has_table_privilege(r, 'public.user_roles', 'INSERT')) THEN
          RAISE EXCEPTION 'role % has privileges on public.%', r, t;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2. RLS must be enabled on every public table.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
    RAISE EXCEPTION 'RLS disabled on public.%', t.relname;
  END LOOP;
END $$;

-- 3. Privileged functions are not executable by anon/authenticated.
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rate_limit_hit executable by client roles';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_first_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'claim_first_admin executable by authenticated';
  END IF;
END $$;

-- 4. A real attempt as anon fails.
SET ROLE anon;
DO $$ BEGIN
  PERFORM 1 FROM public.driver_registrations LIMIT 1;
  RAISE EXCEPTION 'anon could read driver_registrations';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.leads (name) VALUES ('x');
  RAISE EXCEPTION 'anon could insert leads';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- 5. Behavioural checks as the schema owner (the role the application connects as).
-- (no SET ROLE: runs as the owner)
-- rate limiter
DO $$ BEGIN
  IF NOT public.rate_limit_hit('t:1', 2, 60) THEN RAISE EXCEPTION 'rl hit 1'; END IF;
  IF NOT public.rate_limit_hit('t:1', 2, 60) THEN RAISE EXCEPTION 'rl hit 2'; END IF;
  IF public.rate_limit_hit('t:1', 2, 60) THEN RAISE EXCEPTION 'rl hit 3 should be blocked'; END IF;
END $$;
-- dispatch double-booking backstop
INSERT INTO public.drivers (id, full_name) VALUES ('00000000-0000-0000-0000-0000000000d1', 'Test Driver');
INSERT INTO public.dispatch_jobs (pickup_location, driver_id, status, scheduled_start, scheduled_end)
VALUES ('Site A', '00000000-0000-0000-0000-0000000000d1', 'assigned', '2030-01-01 08:00Z', '2030-01-01 12:00Z');
DO $$ BEGIN
  INSERT INTO public.dispatch_jobs (pickup_location, driver_id, status, scheduled_start, scheduled_end)
  VALUES ('Site B', '00000000-0000-0000-0000-0000000000d1', 'assigned', '2030-01-01 11:00Z', '2030-01-01 13:00Z');
  RAISE EXCEPTION 'overlapping dispatch accepted';
EXCEPTION WHEN exclusion_violation THEN NULL; END $$;
-- back-to-back is fine; cancelled jobs do not block
INSERT INTO public.dispatch_jobs (pickup_location, driver_id, status, scheduled_start, scheduled_end)
VALUES ('Site C', '00000000-0000-0000-0000-0000000000d1', 'assigned', '2030-01-01 12:00Z', '2030-01-01 14:00Z');
INSERT INTO public.dispatch_jobs (pickup_location, driver_id, status, scheduled_start, scheduled_end)
VALUES ('Site D', '00000000-0000-0000-0000-0000000000d1', 'cancelled', '2030-01-01 08:00Z', '2030-01-01 09:00Z');
-- assigned requires a driver
DO $$ BEGIN
  INSERT INTO public.dispatch_jobs (pickup_location, status, scheduled_start, scheduled_end)
  VALUES ('Site E', 'assigned', '2030-01-02 08:00Z', '2030-01-02 09:00Z');
  RAISE EXCEPTION 'assigned without driver accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
-- appointments double-booking
INSERT INTO public.appointments (name, email, topic, starts_at, ends_at)
VALUES ('A', 'a@example.com', 'consult', '2030-02-01 14:00Z', '2030-02-01 14:30Z');
DO $$ BEGIN
  INSERT INTO public.appointments (name, email, topic, starts_at, ends_at)
  VALUES ('B', 'b@example.com', 'consult', '2030-02-01 14:15Z', '2030-02-01 14:45Z');
  RAISE EXCEPTION 'overlapping appointment accepted';
EXCEPTION WHEN exclusion_violation THEN NULL; END $$;
-- audit log is append-only
INSERT INTO public.audit_logs (action, entity_type) VALUES ('test', 'test');
DO $$ BEGIN
  UPDATE public.audit_logs SET action = 'tampered';
  RAISE EXCEPTION 'audit log update accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'audit_logs is append-only' THEN RAISE; END IF;
END $$;
DO $$ BEGIN
  DELETE FROM public.audit_logs;
  RAISE EXCEPTION 'audit log delete accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'audit_logs is append-only' THEN RAISE; END IF;
END $$;
-- VIN validation
DO $$ BEGIN
  INSERT INTO public.trucks (unit_number, vin) VALUES ('T-1', 'BADVIN');
  RAISE EXCEPTION 'invalid VIN accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
-- human numbers
DO $$ DECLARE n text; BEGIN
  INSERT INTO public.projects (name) VALUES ('Proj') RETURNING project_number INTO n;
  IF n !~ '^P-\d{5}$' THEN RAISE EXCEPTION 'bad project number %', n; END IF;
END $$;
-- legacy rows survive: an old-status row inserted before constraint would remain; new bad status rejected
DO $$ BEGIN
  INSERT INTO public.driver_registrations (owner_name,email,phone,truck_type,truck_count,service_area,availability,status)
  VALUES ('x','x@example.com','5555555','tandem',1,'ATL','full-time','bogus');
  RAISE EXCEPTION 'bogus driver status accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
RESET ROLE;
SELECT 'ALL DATABASE AUTHORIZATION TESTS PASSED' AS result;
