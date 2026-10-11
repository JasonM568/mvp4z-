#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANDIDATE_ROOT="${QA_C23_CANDIDATE_ROOT:-/private/tmp/xunfeng-c20-c23}"
PG_PORT="${QA_C23_PG_PORT:-55497}"
PG_USER="$(id -un)"
MIGRATION="$CANDIDATE_ROOT/supabase/migrations/20261012070000_invoice_issue_durable_outbox.sql"
SQL_TEST="$CANDIDATE_ROOT/supabase/tests/invoice_issue_durable_outbox.sql"

for tool in initdb pg_ctl createdb psql shasum awk rg git; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 2; }
done
[[ "$PG_PORT" =~ ^[0-9]+$ ]] && (( PG_PORT >= 1024 && PG_PORT <= 65535 )) || {
  echo "QA_C23_PG_PORT must be an unused local port number" >&2
  exit 2
}
test -f "$MIGRATION" || { echo "candidate migration missing" >&2; exit 2; }
test -f "$SQL_TEST" || { echo "candidate SQL test missing" >&2; exit 2; }

TMP_DIR="$(mktemp -d /private/tmp/xunfeng-c23-qa.XXXXXX)"
PGDATA="$TMP_DIR/pgdata"
SOCKET_DIR="$TMP_DIR/socket"
mkdir -p "$SOCKET_DIR"
MIGRATION_SHA="$(shasum -a 256 "$MIGRATION" | awk '{print $1}')"
SQL_TEST_SHA="$(shasum -a 256 "$SQL_TEST" | awk '{print $1}')"

cleanup() {
  if test -d "$PGDATA"; then pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

initdb -D "$PGDATA" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject >/dev/null
pg_ctl -D "$PGDATA" -o "-F -p $PG_PORT -k $SOCKET_DIR -c listen_addresses=''" -l "$TMP_DIR/postgres.log" start >/dev/null
createdb -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" c23_qa

psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key, email text, role text);
create table public.plans (id uuid primary key, code text, name text, price integer, credits integer, duration_days integer);
create table public.orders (
  id uuid primary key,
  order_no text unique not null,
  user_id uuid not null references public.profiles(id),
  plan_id uuid not null references public.plans(id),
  amount integer not null,
  status text not null
);
-- Match the pre-existing refund migration privilege required by FOR KEY SHARE.
grant select, update on public.orders to service_role;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null,
  provider text not null,
  invoice_number text,
  random_code text,
  invoice_date timestamptz,
  buyer_type text,
  buyer_name text,
  buyer_id text,
  buyer_email text,
  carrier_type text,
  carrier_num text,
  donation_code text,
  total_amount integer,
  tax_type text,
  status text,
  error_code text,
  error_msg text,
  retry_count integer,
  last_attempted_at timestamptz,
  raw_request jsonb,
  raw_response jsonb,
  provider_trans_no text,
  created_at timestamptz not null default now()
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb
);
SQL

psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa -f "$MIGRATION" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa -f "$SQL_TEST" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa <<'SQL' >/dev/null
insert into public.profiles(id, email, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'qa-c23-concurrency@example.test', 'member');
insert into public.plans(id, code, name, price, credits, duration_days)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'qa-c23-concurrency', 'QA', 1, 0, 1);
insert into public.orders(id, order_no, user_id, plan_id, amount, status)
values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'QA_C23_SHARED_ORDER_A', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 199, 'paid'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'QA_C23_SHARED_ORDER_B', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 299, 'paid');
SQL

run_claim() {
  local order_id="$1"
  PGOPTIONS='-c role=service_role' psql -X -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa <<SQL
begin;
select public.begin_ezpay_invoice_issue(
  '$order_id', 'stage', '12345678', 'QA_C23_SHARED_ORDER_',
  'qa-collision-fingerprint', 'synthetic-only',
  '{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","total_amount":199}',
  null, 'admin_manual'
)->>'outcome';
select pg_sleep(0.2);
commit;
SQL
}

run_claim 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1' >"$TMP_DIR/claim-a.out" &
CLAIM_A_PID=$!
sleep 0.05
run_claim 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2' >"$TMP_DIR/claim-b.out" &
CLAIM_B_PID=$!
wait "$CLAIM_A_PID"
wait "$CLAIM_B_PID"
for output in "$TMP_DIR/claim-a.out" "$TMP_DIR/claim-b.out"; do
  rg -q '^merchant_order_conflict$' "$output" || { cat "$output" >&2; echo "parallel collision was not rejected" >&2; exit 1; }
done

SIDE_EFFECTS="$(psql -X -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PG_PORT" -U "$PG_USER" -d c23_qa -c "select (select count(*) from public.invoice_issue_outbox where order_id in ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2')) + (select count(*) from public.invoice_issue_external_refs where merchant_order_no='QA_C23_SHARED_ORDER_') + (select count(*) from public.invoices where order_id in ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2')) + (select count(*) from public.admin_audit_logs where target_id in ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','dddddddd-dddd-4ddd-8ddd-ddddddddddd2'))")"
test "$SIDE_EFFECTS" = "0" || { echo "collision case had business side effects: $SIDE_EFFECTS" >&2; exit 1; }

printf 'C23 migration SHA256: %s\n' "$MIGRATION_SHA"
printf 'C23 SQL test SHA256: %s\n' "$SQL_TEST_SHA"
printf 'C23 candidate HEAD: %s\n' "$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)"
printf 'collision pairs: same amount + different amount rejected by candidate SQL contract; parallel same-reference calls: 2/2 conflict; business side effects: 0\n'
