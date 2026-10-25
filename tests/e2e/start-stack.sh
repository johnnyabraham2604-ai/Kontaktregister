#!/usr/bin/env bash
# Startet einen lokalen Nachbau von Supabase (Postgres 16, Supabase Auth, PostgREST) plus einen
# Resend-Nachbau und die App. Nur für Tests auf Linux mit installiertem PostgreSQL 16.
# Aufruf aus dem Projektordner: bash tests/e2e/start-stack.sh   danach: python3 tests/e2e/e2e.py
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
W="$HERE/.work"; mkdir -p "$W/bin" "$W/shots"
PGBIN=/usr/lib/postgresql/16/bin
JWT_SECRET=local-register-test-secret-0123456789abcdef
PGDATA=/var/tmp/register-e2e-pg

if [ ! -x "$W/bin/postgrest" ]; then
  curl -sSL -o "$W/postgrest.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xJf "$W/postgrest.tar.xz" -C "$W/bin"
fi
if [ ! -x "$W/auth/auth" ]; then
  curl -sSL -o "$W/auth.tar.gz" https://github.com/supabase/auth/releases/download/v2.177.0/auth-v2.177.0-x86.tar.gz
  mkdir -p "$W/auth" && tar -xzf "$W/auth.tar.gz" -C "$W/auth"
fi

# Postgres (läuft nicht als root)
if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
  su postgres -s /bin/bash -c "$PGBIN/initdb -D $PGDATA/data -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
  echo "listen_addresses='127.0.0.1'" >> "$PGDATA/data/postgresql.conf"; echo "port=54322" >> "$PGDATA/data/postgresql.conf"
fi
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA/data -l $PGDATA/pg.log -o '-k $PGDATA' start" || true
sleep 2
PSQL="psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "drop database if exists register_e2e" 2>/dev/null || true
if ! $PSQL -tAc "select 1 from pg_roles where rolname='authenticator'" | grep -q 1; then
$PSQL <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authpw';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole noinherit password 'gotruepw';
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;
grant create on database postgres to supabase_auth_admin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create extension if not exists pgcrypto;
SQL
fi

ANON_KEY=$(node "$HERE/jwt.mjs" $JWT_SECRET anon); SERVICE_KEY=$(node "$HERE/jwt.mjs" $JWT_SECRET service_role)

# Supabase Auth
( env GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_DB_DRIVER=postgres \
  "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:gotruepw@127.0.0.1:54322/postgres?search_path=auth&sslmode=disable" \
  GOTRUE_DB_MIGRATIONS_PATH="$W/auth/migrations" GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_JWT_SECRET=$JWT_SECRET \
  GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_DISABLE_SIGNUP=true \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_LOG_LEVEL=warn \
  nohup "$W/auth/auth" > "$W/gotrue.log" 2>&1 & )
sleep 4

# Schema der App, Speicher-Stub (Supabase Storage gibt es lokal nicht)
if ! $PSQL -tAc "select 1 from information_schema.tables where table_name='people'" | grep -q 1; then
  $PSQL -f "$ROOT/supabase/migrations/20261025000001_schema.sql"
  $PSQL <<'SQL'
create schema if not exists storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
SQL
  $PSQL -f "$ROOT/supabase/migrations/20261025000002_storage.sql"
fi

( env PGRST_DB_URI="postgres://authenticator:authpw@127.0.0.1:54322/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET=$JWT_SECRET PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_MAX_ROWS=1000 \
  nohup "$W/bin/postgrest" > "$W/postgrest.log" 2>&1 & )
( nohup node "$HERE/gateway.mjs" > "$W/gateway.log" 2>&1 & )
( SENT_LOG="$W/sent.jsonl" nohup node "$HERE/fake-resend.mjs" > "$W/fake-resend.log" 2>&1 & )
sleep 2

for u in "johnny@example.org:Register-Test-2026!" "fremd@example.org:Fremd-Test-2026!"; do
  curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H "content-type: application/json" -d "{\"email\":\"${u%%:*}\",\"password\":\"${u#*:}\",\"email_confirm\":true}" > /dev/null
done

cat > "$W/app.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
RESEND_API_KEY=re_local_test
RESEND_API_URL=http://127.0.0.1:54330/emails
CRON_SECRET=local-cron-secret-0123456789
APP_URL=http://localhost:3000
ALLOWED_EMAIL=johnny@example.org
ALERT_EMAIL=johnny@example.org
NEXT_TELEMETRY_DISABLED=1
ENV
cd "$ROOT" && set -a && source "$W/app.env" && set +a && npx next build > "$W/build.log" 2>&1 && ( nohup npx next start -p 3000 > "$W/next.log" 2>&1 & )
sleep 4
echo "Stack läuft. App: http://localhost:3000 (johnny@example.org / Register-Test-2026!). Test: python3 tests/e2e/e2e.py"
