#!/usr/bin/env bash
set -euo pipefail

# C22 DB-only concurrency test. Refuses all endpoints except the named QA stack.
: "${QA_C22_DATABASE_URL:?Set QA_C22_DATABASE_URL to the disposable C22 DB URL}"
: "${QA_C22_DISPOSABLE_PROJECT:?Set QA_C22_DISPOSABLE_PROJECT to the expected project id}"
[[ "$QA_C22_DISPOSABLE_PROJECT" == "qa-c22-independent-20261012" ]] || {
  echo "Refusing unexpected disposable project id" >&2
  exit 2
}
python3 - "$QA_C22_DATABASE_URL" <<'PY'
import sys
from urllib.parse import urlparse

u = urlparse(sys.argv[1])
if (u.scheme, u.hostname, u.port, u.path) != ("postgresql", "127.0.0.1", 59841, "/postgres"):
    raise SystemExit("Refusing database URL outside the dedicated local C22 stack")
PY

psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL'
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 55
     or (select count(distinct version) from supabase_migrations.schema_migrations) <> 55
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261012080000') then
    raise exception 'unexpected migration history for C22 QA stack';
  end if;
  if exists (select 1 from public.face_provider_approvals where provider = 'openai')
     or exists (select 1 from public.profiles where email like 'qa-c22-race-%@example.test') then
    raise exception 'C22 fixture namespace is not empty';
  end if;
end;
$$;
SQL

output_dir=""
cleanup() {
  psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL'
delete from public.admin_audit_logs
where target_type = 'face_provider_approval'
  and target_id in (select id::text from public.face_provider_approvals where provider = 'openai');
delete from public.face_provider_approvals where provider = 'openai';
delete from public.profiles where email like 'qa-c22-race-%@example.test';
SQL
  if [[ -n "$output_dir" && "$output_dir" == /private/tmp/qa-c22-race.* && -d "$output_dir" ]]; then
    rm -rf -- "$output_dir"
  fi
}
trap cleanup EXIT

for round in $(seq 1 10); do
  admin_a="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  admin_b="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  email_a="qa-c22-race-${round}-a@example.test"
  email_b="qa-c22-race-${round}-b@example.test"
  psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -q \
    -v admin_a="$admin_a" -v admin_b="$admin_b" -v email_a="$email_a" -v email_b="$email_b" <<'SQL'
insert into public.profiles (id, email, name, role)
values (:'admin_a', :'email_a', 'QA C22 race A', 'admin'),
       (:'admin_b', :'email_b', 'QA C22 race B', 'admin');
SQL

  output_dir="$(mktemp -d /private/tmp/qa-c22-race.XXXXXX)"
  psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
    -v admin_a="$admin_a" >"$output_dir/a" <<'SQL' &
set role service_role;
select public.manage_face_provider_approval(
  'approve',
  jsonb_build_object('organizationLabel','QA Organization','projectLabel','QA C22 Race','approvedAt',current_date::text,'attested',true,'note',''),
  :'admin_a'
);
SQL
  pid_a=$!
  psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
    -v admin_b="$admin_b" >"$output_dir/b" <<'SQL' &
set role service_role;
select public.manage_face_provider_approval(
  'approve',
  jsonb_build_object('organizationLabel','QA Organization','projectLabel','QA C22 Race','approvedAt',current_date::text,'attested',true,'note',''),
  :'admin_b'
);
SQL
  pid_b=$!
  wait "$pid_a"
  wait "$pid_b"

  changed_true="$(cat "$output_dir/a" "$output_dir/b" | grep -c '"changed": true' || true)"
  changed_false="$(cat "$output_dir/a" "$output_dir/b" | grep -c '"changed": false' || true)"
  [[ "$changed_true" == "1" && "$changed_false" == "1" ]] || {
    echo "C22 race round $round: expected one changed=true and one changed=false" >&2
    cat "$output_dir/a" "$output_dir/b" >&2
    exit 1
  }

  state="$(psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
    "select count(*) || '|' || count(*) filter (where status='active') from public.face_provider_approvals where provider='openai'; select count(*) from public.admin_audit_logs where target_type='face_provider_approval';" | tr '\n' '|')"
  [[ "$state" == "1|1|1|" ]] || {
    echo "C22 race round $round: unexpected persisted approval/audit counts: $state" >&2
    exit 1
  }

  cleanup
  rm -rf -- "$output_dir"
  output_dir=""
  echo "round $round: 1 changed, 1 idempotent no-op, approval/audit each 1; cleaned"
done

trap - EXIT
cleanup
remaining="$(psql "$QA_C22_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select (select count(*) from public.face_provider_approvals where provider='openai') || '|' || (select count(*) from public.profiles where email like 'qa-c22-race-%@example.test') || '|' || (select count(*) from public.admin_audit_logs where target_type='face_provider_approval');")"
[[ "$remaining" == "0|0|0" ]] || {
  echo "C22 cleanup verification failed: $remaining" >&2
  exit 1
}
echo "C22 fixture cleanup: 0 approvals, 0 profiles, 0 audit rows"
