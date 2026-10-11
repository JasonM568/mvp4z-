#!/usr/bin/env bash
set -euo pipefail

# Disposable native PostgreSQL contract check for C21. This is a minimal schema
# harness, not a substitute for a full Supabase migration replay or HTTP test.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANDIDATE_ROOT="${C21_CANDIDATE_ROOT:-/private/tmp/xunfeng-c21-policy-signoff}"
EXPECTED_SHA=1af894375ed06af34960e237cf9b25bd6c48a601
BASE_MIGRATION="$CANDIDATE_ROOT/supabase/migrations/20261007120000_qimen_signoffs.sql"
C21_MIGRATION="$CANDIDATE_ROOT/supabase/migrations/20261012090000_policy_school_qimen_atomic_audit.sql"
C21_SQL_TEST="$CANDIDATE_ROOT/supabase/tests/policy_school_qimen_atomic_audit.sql"
INITDB="$(command -v initdb)"
PG_CTL="$(command -v pg_ctl)"
PSQL="$(command -v psql)"
SCRATCH=""
PG_STARTED=0

fail() { echo "$*" >&2; exit 2; }
[[ -d "$CANDIDATE_ROOT/.git" || -f "$CANDIDATE_ROOT/.git" ]] || fail "C21 checkout missing: $CANDIDATE_ROOT"
[[ "$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || fail "Unexpected C21 candidate SHA"
[[ -z "$(git -C "$CANDIDATE_ROOT" status --porcelain)" ]] || fail "C21 candidate worktree must be clean"
for file in "$BASE_MIGRATION" "$C21_MIGRATION" "$C21_SQL_TEST"; do [[ -f "$file" ]] || fail "Missing test input: $file"; done

cleanup() {
  if [[ "$PG_STARTED" == 1 && -n "$SCRATCH" && -d "$SCRATCH/data" ]]; then
    "$PSQL" -X -h "$SCRATCH/socket" -p 63117 -U "$(whoami)" -d postgres -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 || true
delete from public.admin_audit_logs where target_id in (
  select id::text from public.ai_prompt_profiles where created_by in (select id from public.profiles where email like 'qa-c21-race-%@example.test')
  union all
  select id::text from public.ai_school_profiles where created_by in (select id from public.profiles where email like 'qa-c21-race-%@example.test')
);
delete from public.ai_prompt_profiles where created_by in (select id from public.profiles where email like 'qa-c21-race-%@example.test');
delete from public.ai_school_profiles where created_by in (select id from public.profiles where email like 'qa-c21-race-%@example.test');
delete from public.profiles where email like 'qa-c21-race-%@example.test';
SQL
    "$PG_CTL" -D "$SCRATCH/data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  if [[ -n "$SCRATCH" && "$SCRATCH" == /private/tmp/qa-c21-isolated.* && -d "$SCRATCH" ]]; then
    python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$SCRATCH"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

SCRATCH="$(mktemp -d /private/tmp/qa-c21-isolated.XXXXXX)"
mkdir -p "$SCRATCH/socket"
"$INITDB" -D "$SCRATCH/data" --auth=trust --no-locale -E UTF8 >/dev/null
# Unique local socket directory and disabled TCP listener isolate this cluster.
"$PG_CTL" -D "$SCRATCH/data" -o "-F -k $SCRATCH/socket -p 63117 -c listen_addresses=''" -w start >/dev/null
PG_STARTED=1
PSQL_ARGS=("$PSQL" -X -h "$SCRATCH/socket" -p 63117 -U "$(whoami)" -d postgres -v ON_ERROR_STOP=1 -At)

"${PSQL_ARGS[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key, email text unique, name text, role text not null check (role in ('admin','member')));
create table public.ai_prompt_profiles (
 id uuid primary key default gen_random_uuid(), version_label text not null, status text not null,
 settings jsonb not null, created_by uuid, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), published_at timestamptz
);
create table public.ai_school_profiles (
 id uuid primary key default gen_random_uuid(), version_label text not null, status text not null,
 settings jsonb not null, decided_by text, created_by uuid, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), published_at timestamptz
);
create table public.admin_audit_logs (
 id uuid primary key default gen_random_uuid(), admin_user_id uuid, action text not null,
 target_type text not null, target_id text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles to service_role;
grant select, update on public.ai_prompt_profiles, public.ai_school_profiles to service_role;
grant insert on public.admin_audit_logs to service_role;
SQL
"${PSQL_ARGS[@]}" -f "$BASE_MIGRATION" >/dev/null
"${PSQL_ARGS[@]}" -f "$C21_MIGRATION" >/dev/null

for round in $(seq 1 10); do
  "${PSQL_ARGS[@]}" -f "$C21_SQL_TEST" >/dev/null
  echo "C21 SQL audit-fault/ACL contract $round/10 passed"
done

run_race() {
  local kind="$1" round="$2" admin_a admin_b current_id draft_id email_a email_b table target_type out a b state audits
  admin_a="$(uuidgen | tr '[:upper:]' '[:lower:]')"; admin_b="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  current_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"; draft_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  email_a="qa-c21-race-${kind}-${round}-a@example.test"; email_b="qa-c21-race-${kind}-${round}-b@example.test"
  "${PSQL_ARGS[@]}" -q -v admin_a="$admin_a" -v admin_b="$admin_b" -v email_a="$email_a" -v email_b="$email_b" <<'SQL'
insert into public.profiles (id,email,name,role) values (:'admin_a',:'email_a','QA A','admin'), (:'admin_b',:'email_b','QA B','admin');
SQL
  if [[ "$kind" == prompt ]]; then
    table=ai_prompt_profiles; target_type=ai_prompt_profile
    "${PSQL_ARGS[@]}" -q -v current_id="$current_id" -v draft_id="$draft_id" -v admin_a="$admin_a" -v round="$round" <<'SQL'
insert into public.ai_prompt_profiles(id,version_label,status,settings,created_by)
values (:'current_id','current','published','{"version":"old"}',:'admin_a'), (:'draft_id','draft-' || :'round','draft','{"version":"draft"}',:'admin_a');
SQL
    cmd_a="select public.publish_settings_profile_with_audit('prompt','$draft_id','draft-$round','{\"version\":\"draft\"}'::jsonb,(select updated_at from public.ai_prompt_profiles where id='$draft_id'),null,'$admin_a');"
    cmd_b="select public.publish_settings_profile_with_audit('prompt','$draft_id','draft-$round','{\"version\":\"draft\"}'::jsonb,(select updated_at from public.ai_prompt_profiles where id='$draft_id'),null,'$admin_b');"
  else
    table=ai_school_profiles; target_type=ai_school_profile
    "${PSQL_ARGS[@]}" -q -v current_id="$current_id" -v draft_id="$draft_id" -v admin_a="$admin_a" -v round="$round" <<'SQL'
insert into public.ai_school_profiles(id,version_label,status,settings,decided_by,created_by)
values (:'current_id','current','published','{"version":"old"}','Old Teacher',:'admin_a'), (:'draft_id','draft-' || :'round','draft','{"version":"draft"}','QA Teacher',:'admin_a');
SQL
    cmd_a="select public.publish_settings_profile_with_audit('school','$draft_id','draft-$round','{\"version\":\"draft\"}'::jsonb,(select updated_at from public.ai_school_profiles where id='$draft_id'),jsonb_build_object('decidedBy','QA Teacher','decidedAt',current_date::text),'$admin_a');"
    cmd_b="select public.publish_settings_profile_with_audit('school','$draft_id','draft-$round','{\"version\":\"draft\"}'::jsonb,(select updated_at from public.ai_school_profiles where id='$draft_id'),jsonb_build_object('decidedBy','QA Teacher','decidedAt',current_date::text),'$admin_b');"
  fi
  out="$(mktemp -d "$SCRATCH/race.XXXXXX")"
  ( { echo 'select pg_sleep(0.2);'; echo 'set role service_role;'; echo "$cmd_a"; } | "${PSQL_ARGS[@]}" >"$out/a" ) & local pid_a=$!
  ( { echo 'select pg_sleep(0.2);'; echo 'set role service_role;'; echo "$cmd_b"; } | "${PSQL_ARGS[@]}" >"$out/b" ) & local pid_b=$!
  wait "$pid_a"; wait "$pid_b"
  a="$(cat "$out/a")"; b="$(cat "$out/b")"
  [[ "$(printf '%s\n%s\n' "$a" "$b" | grep -c '"conflict": false' || true)" == 1 ]] || fail "$kind round $round winner count mismatch"
  [[ "$(printf '%s\n%s\n' "$a" "$b" | grep -c '"conflict": true' || true)" == 1 ]] || fail "$kind round $round conflict count mismatch"
  state="$("${PSQL_ARGS[@]}" -c "select count(*) filter(where status='published') || '|' || count(*) filter(where status='archived') from public.$table where id in ('$current_id','$draft_id');")"
  audits="$("${PSQL_ARGS[@]}" -c "select count(*) from public.admin_audit_logs where target_type='$target_type' and target_id='$draft_id';")"
  [[ "$state" == '1|1' && "$audits" == 1 ]] || fail "$kind round $round final state mismatch: $state / audit $audits"
  "${PSQL_ARGS[@]}" -q -v admin_a="$admin_a" -v admin_b="$admin_b" -v current_id="$current_id" -v draft_id="$draft_id" <<'SQL'
delete from public.admin_audit_logs where target_id = :'draft_id';
delete from public.ai_prompt_profiles where id in (:'current_id',:'draft_id');
delete from public.ai_school_profiles where id in (:'current_id',:'draft_id');
delete from public.profiles where id in (:'admin_a',:'admin_b');
SQL
  audits="$("${PSQL_ARGS[@]}" -c "select count(*) from public.admin_audit_logs where target_id='$draft_id';")"
  [[ "$audits" == 0 ]] || fail "$kind round $round leaked audit rows"
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$out"
  echo "$kind publish race $round/10 passed: one winner, one conflict, one audit; fixture cleaned"
}

for round in $(seq 1 10); do run_race prompt "$round"; done
for round in $(seq 1 10); do run_race school "$round"; done
remaining="$("${PSQL_ARGS[@]}" -c "select (select count(*) from profiles where email like 'qa-c21-race-%@example.test') || '|' || (select count(*) from ai_prompt_profiles where created_by in (select id from profiles where email like 'qa-c21-race-%@example.test')) || '|' || (select count(*) from ai_school_profiles where created_by in (select id from profiles where email like 'qa-c21-race-%@example.test')) || '|' || (select count(*) from qimen_signoffs) || '|' || (select count(*) from admin_audit_logs);")"
[[ "$remaining" == '0|0|0|0|0' ]] || fail "C21 scratch fixtures remain: $remaining"
echo 'C21 fixtures after race suite: 0'
