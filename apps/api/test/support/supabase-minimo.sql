-- Recria, num Postgres puro, o mínimo que o Supabase fornece e de que o SQL de
-- policy depende: o schema `auth` e os roles.
--
-- Sem isto, `supabase/policies/001_*.sql` falha no container por referenciar
-- `auth.users` e os roles `anon`/`authenticated`/`service_role`.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY,
  email text
);

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;
