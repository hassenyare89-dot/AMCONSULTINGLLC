-- =====================================================================================
-- One-time cluster setup, run by a PostgreSQL superuser (Docker runs it automatically on
-- first start via deploy/postgres-init/). Creates:
--   * the application login role (NOT a superuser) that owns the AMCMS database and schema
--   * NOLOGIN roles anon / authenticated / service_role referenced by the migrations' grants
--   * the application database
-- Usage: psql -v app_user=amcms -v app_password='...' -v app_db=amcms -f db/platform/roles.sql
-- =====================================================================================
\set ON_ERROR_STOP on
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE ROLE %I NOLOGIN', r) FROM unnest(ARRAY['anon','authenticated','service_role']) AS r
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
