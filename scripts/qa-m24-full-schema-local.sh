#!/usr/bin/env bash
set -euo pipefail

# Replays the pinned M24 candidate migrations into a disposable native PG16
# cluster with local Auth/Storage compatibility schemas, runs its guarded SQL
# contract once, verifies fixture cleanup, and destroys the cluster.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANDIDATE_ROOT="${M24_CANDIDATE_ROOT:-/private/tmp/xunfeng-m24-full-schema-test}"
EXPECTED_SHA=85ba785ae7c971654cb17e38c846ff52beba3b62
MIGRATIONS="$CANDIDATE_ROOT/supabase/migrations"
M24_TEST="$CANDIDATE_ROOT/supabase/tests/face_image_delete_recovery_full_schema.sql"
INITDB="$(command -v initdb)"
PG_CTL="$(command -v pg_ctl)"
PSQL="$(command -v psql)"
SCRATCH=""
PG_STARTED=0

fail() { echo "$*" >&2; exit 2; }
[[ -d "$CANDIDATE_ROOT/.git" || -f "$CANDIDATE_ROOT/.git" ]] || fail "M24 candidate checkout missing: $CANDIDATE_ROOT"
[[ "$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || fail "Unexpected M24 candidate SHA"
[[ -z "$(git -C "$CANDIDATE_ROOT" status --porcelain)" ]] || fail "M24 candidate worktree must be clean"
[[ -f "$M24_TEST" ]] || fail "M24 full-schema test is missing"

cleanup() {
  if [[ "$PG_STARTED" == 1 && -n "$SCRATCH" && -d "$SCRATCH/data" ]]; then
    "$PG_CTL" -D "$SCRATCH/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ -n "$SCRATCH" && "$SCRATCH" == /private/tmp/qa-m24-full.* && -d "$SCRATCH" ]]; then
    python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$SCRATCH"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

SCRATCH="$(mktemp -d /private/tmp/qa-m24-full.XXXXXX)"
mkdir -p "$SCRATCH/socket"
"$INITDB" -D "$SCRATCH/data" --auth=trust --no-locale -E UTF8 >/dev/null
"$PG_CTL" -D "$SCRATCH/data" -o "-F -k $SCRATCH/socket -p 64309 -c listen_addresses=''" -w start >/dev/null
PG_STARTED=1
DB_SUFFIX="$(python3 -c 'import secrets; print(secrets.token_hex(4))')"
DB_NAME="m24_full_$(date +%Y%m%d)_$DB_SUFFIX"
PGUSER="$(whoami)"
PSQL_BASE=("$PSQL" -X -h "$SCRATCH/socket" -p 64309 -U "$PGUSER" -v ON_ERROR_STOP=1 -q)
"${PSQL_BASE[@]}" -d postgres -c "create database \"$DB_NAME\";"
PSQL_DB=("$PSQL" -X -h "$SCRATCH/socket" -p 64309 -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q)

# These small Auth/Storage schemas satisfy migration DDL only. No Auth, REST,
# Storage server, external model, production credential, or remote DB is used.
"${PSQL_DB[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role, authenticator;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key);
SQL

migration_count=0
while IFS= read -r migration; do
  version="$(basename "$migration" | cut -d_ -f1)"
  [[ "$version" =~ ^[0-9]+$ ]] || fail "Invalid migration filename: $migration"
  "${PSQL_DB[@]}" -c 'begin;' -f "$migration" -c 'commit;' >/dev/null
  "${PSQL_DB[@]}" -c "insert into supabase_migrations.schema_migrations(version) values ('$version');"
  migration_count=$((migration_count + 1))
done < <(find "$MIGRATIONS" -maxdepth 1 -type f -name '*.sql' -print | sort)
[[ "$migration_count" == 54 ]] || fail "Expected 54 migrations, replayed $migration_count"

history="$("${PSQL_DB[@]}" -Atc "select count(*) || '|' || count(distinct version) from supabase_migrations.schema_migrations;")"
[[ "$history" == '54|54' ]] || fail "Migration history mismatch: $history"
echo "M24 candidate migration replay: $history versions"

if ! "${PSQL_DB[@]}" \
  -v m24_expected_database="$DB_NAME" \
  -v m24_disposable_marker="$DB_NAME" \
  -v m24_expected_port=64309 \
  -f "$M24_TEST" >"$SCRATCH/test.log" 2>&1; then
  cat "$SCRATCH/test.log" >&2
  fail "M24 guarded full-schema SQL test failed"
fi
echo 'M24 guarded full-schema SQL test: passed (psql exit 0)'

residual="$("${PSQL_DB[@]}" -Atc "select (select count(*) from public.face_analysis_runs where consent_version='m24-full-schema-test') || '|' || (select count(*) from public.face_analysis_events where run_id='11111111-1111-4111-8111-111111111111') || '|' || (select count(*) from public.profiles where email like 'm24-full-schema-%@example.test') || '|' || (select count(*) from public.m24_disposable_test_marker where consumed_at is not null);")"
[[ "$residual" == '0|0|0|1' ]] || fail "Unexpected M24 fixture/marker state: $residual"
echo "M24 QA run/event/profile fixtures: 0; consumed one-use marker: 1"
