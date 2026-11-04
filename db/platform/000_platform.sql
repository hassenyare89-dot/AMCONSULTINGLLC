-- =====================================================================================
-- AMCMS platform bootstrap for self-hosted PostgreSQL (replaces what Supabase provided).
-- Applied by scripts/migrate.mjs BEFORE the numbered migrations, on every run. Idempotent.
--
--   * Roles anon / authenticated / service_role: referenced by the migrations' GRANT/REVOKE
--     statements. No application connects as them (the app connects as the schema owner);
--     they exist so the hardening statements apply and stay tested.
--   * Schema auth: users, sessions and one-time tokens for the built-in authentication.
--   * storage.buckets: stand-in table the AMCMS migration seeds (files live on disk).
-- =====================================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'Missing roles anon/authenticated/service_role and no CREATEROLE privilege. Create them as an admin first (see docs/12-DEPLOY_DIGITALOCEAN.md).';
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  email_verified_at timestamptz,
  banned_until timestamptz,
  mfa_secret_enc text,
  mfa_pending_secret_enc text,
  mfa_enabled_at timestamptz,
  mfa_last_counter bigint,
  last_sign_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_key ON auth.users (lower(email));

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  aal text NOT NULL DEFAULT 'aal1' CHECK (aal IN ('aal1','aal2')),
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth.one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('password_reset','invite')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth.one_time_tokens (user_id, purpose);

-- Supabase's auth.uid() is referenced by the original migrations' policies/functions. With no
-- PostgREST, there is no per-request JWT: it returns NULL, so those policies deny by default.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM anon, authenticated;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
