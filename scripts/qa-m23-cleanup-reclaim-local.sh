#!/usr/bin/env bash
set -euo pipefail

# Reproduce the M23 spike's cleanup_pending retry behavior using a disposable
# native PostgreSQL cluster. No Supabase, Storage, HTTP, or shared DB is used.
candidate_root="${QA_M23_SPIKE_ROOT:-/private/tmp/xunfeng-m23-spike}"
expected_sha="42175c1e00e3d8f12de4ee4e413852961de544b1"
candidate_sha="$(git -C "$candidate_root" rev-parse HEAD)"
if [[ "$candidate_sha" != "$expected_sha" ]]; then
  echo "Expected M23 spike $expected_sha; found $candidate_sha" >&2
  exit 2
fi

sql_file="$candidate_root/docs/release-drafts/m23_per_attempt_upload_intents_SPIKE_NOT_DEPLOY.sql"
if [[ ! -f "$sql_file" ]]; then
  echo "M23 spike SQL draft not found: $sql_file" >&2
  exit 2
fi

pg_bin="${QA_M23_PG_BIN:-$(dirname "$(command -v initdb)")}"
scratch="$(mktemp -d /private/tmp/qa-m23-reclaim.XXXXXX)"
data="$scratch/data"
socket="$scratch/socket"
log="$scratch/postgres.log"
port="$((54000 + RANDOM % 10000))"
mkdir -p "$socket"
started=0
cleanup() {
  if [[ "$started" == 1 ]]; then
    "$pg_bin/pg_ctl" -D "$data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$data" -A trust --no-locale -E UTF8 >/dev/null
"$pg_bin/pg_ctl" -D "$data" -l "$log" \
  -o "-k $socket -p $port -c listen_addresses=''" -w start >/dev/null
started=1

psql_cmd=("$pg_bin/psql" -X -h "$socket" -p "$port" -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.face_analysis_runs (
  id uuid primary key,
  user_id uuid not null,
  status text not null,
  storage_path text,
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  quality_result jsonb,
  error_code text,
  upload_claim_token uuid,
  upload_claimed_at timestamptz,
  deletion_pending boolean not null default false
);
create table public.face_analysis_events (
  run_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb
);
SQL

"${psql_cmd[@]}" -f "$sql_file" >/dev/null
"${psql_cmd[@]}" <<'SQL'
insert into public.face_analysis_runs (id, user_id, status)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'created'
);
insert into public.face_analysis_upload_intents (
  claim_token, run_id, user_id, storage_path, state
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/attempts/22222222-2222-4222-8222-222222222222/source.png',
  'pending'
);

do $$
declare
  first_claim jsonb;
  retry_claim jsonb;
  attempts integer;
  error_code text;
begin
  first_claim := public.claim_face_upload_intent_cleanup('22222222-2222-4222-8222-222222222222');
  if first_claim ->> 'state' <> 'cleanup_pending'
     or (first_claim ->> 'may_delete')::boolean is not true then
    raise exception 'unexpected first cleanup claim result: %', first_claim;
  end if;

  perform public.note_face_upload_cleanup_failure(
    '22222222-2222-4222-8222-222222222222', 'STORAGE_REMOVE_FAILED'
  );
  retry_claim := public.claim_face_upload_intent_cleanup('22222222-2222-4222-8222-222222222222');
  select cleanup_attempts, last_cleanup_error_code
    into attempts, error_code
    from public.face_analysis_upload_intents
    where claim_token = '22222222-2222-4222-8222-222222222222';

  if retry_claim ->> 'state' <> 'cleanup_pending'
     or (retry_claim ->> 'may_delete')::boolean is not false
     or attempts <> 1
     or error_code <> 'STORAGE_REMOVE_FAILED' then
    raise exception 'expected the retry to be denied while retaining the failure: %, attempts %, error %',
      retry_claim, attempts, error_code;
  end if;
  raise notice 'REPRODUCED: first claim may_delete=true; after STORAGE_REMOVE_FAILED, retry may_delete=false; cleanup_attempts=%', attempts;
end;
$$;
SQL

echo "Verified M23 cleanup retry gap against spike $candidate_sha. No Supabase or Storage service was contacted."
