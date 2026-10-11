#!/usr/bin/env bash
set -euo pipefail

# Local-only concurrent character-budget check; every fixture is unique and removed.
QA_ENV_FILE="${1:?Pass a local Supabase connection.private.env path}"
test -f "$QA_ENV_FILE"
set -a
source "$QA_ENV_FILE"
set +a
if [[ ! "${DB_URL:-}" =~ ^postgres(ql)?://[^@]+@(localhost|127\.0\.0\.1):[0-9]+/ ]]; then
  echo 'Refusing non-local DB_URL' >&2
  exit 1
fi

QA_ID_A="$(uuidgen | tr '[:upper:]' '[:lower:]')"
QA_ID_B="$(uuidgen | tr '[:upper:]' '[:lower:]')"
QA_OUT_A="$(mktemp)"
QA_OUT_B="$(mktemp)"
QA_PID_A=''
QA_PID_B=''
cleanup() {
  if [[ -n "$QA_PID_A" ]]; then kill "$QA_PID_A" 2>/dev/null || true; fi
  if [[ -n "$QA_PID_B" ]]; then kill "$QA_PID_B" 2>/dev/null || true; fi
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "
    delete from public.admin_audit_logs where target_id in ('$QA_ID_A', '$QA_ID_B');
    delete from public.ai_documents where id in ('$QA_ID_A', '$QA_ID_B');
  " >/dev/null 2>&1 || true
  rm -f "$QA_OUT_A" "$QA_OUT_B"
}
trap cleanup EXIT

QA_BASELINE="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c \
  'select coalesce(sum(char_count),0) from public.ai_documents where include_in_prompt=true')"
QA_BUDGET="$((QA_BASELINE + 150000))"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "
  insert into public.ai_documents
    (id,title,category,storage_path,original_name,mime_type,size_bytes,extracted_text,char_count,include_in_prompt)
  values
    ('$QA_ID_A','QA budget A','reference','qa-budget/$QA_ID_A.txt','a.txt','text/plain',80000,repeat('a',80000),80000,false),
    ('$QA_ID_B','QA budget B','reference','qa-budget/$QA_ID_B.txt','b.txt','text/plain',80000,repeat('b',80000),80000,false);
" >/dev/null

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "select public.update_ai_document_with_audit('$QA_ID_A','{\"include_in_prompt\":true}'::jsonb,null,$QA_BUDGET)" >"$QA_OUT_A" 2>&1 &
QA_PID_A=$!
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "select public.update_ai_document_with_audit('$QA_ID_B','{\"include_in_prompt\":true}'::jsonb,null,$QA_BUDGET)" >"$QA_OUT_B" 2>&1 &
QA_PID_B=$!
set +e
wait "$QA_PID_A"; QA_STATUS_A=$?
QA_PID_A=''
wait "$QA_PID_B"; QA_STATUS_B=$?
QA_PID_B=''
set -e
if [[ "$QA_STATUS_A" -eq "$QA_STATUS_B" ]]; then
  echo "FAIL: expected one success and one rejection ($QA_STATUS_A/$QA_STATUS_B)" >&2
  exit 1
fi
QA_RESULT="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "
  select
    (select count(*) from public.ai_documents where id in ('$QA_ID_A','$QA_ID_B') and include_in_prompt),
    (select count(*) from public.admin_audit_logs where action='documents.update' and target_id in ('$QA_ID_A','$QA_ID_B')),
    (select coalesce(sum(char_count),0) from public.ai_documents where include_in_prompt=true) <= $QA_BUDGET;
")"
if [[ "$QA_RESULT" != '1|1|t' ]]; then
  echo "FAIL: expected one enabled, one audit, budget respected ($QA_RESULT)" >&2
  exit 1
fi
cleanup
trap - EXIT
QA_REMAINS="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c "
  select
    (select count(*) from public.ai_documents where id in ('$QA_ID_A','$QA_ID_B')),
    (select count(*) from public.admin_audit_logs where target_id in ('$QA_ID_A','$QA_ID_B'));
")"
if [[ "$QA_REMAINS" != '0|0' ]]; then
  echo "FAIL: QA budget fixtures remain ($QA_REMAINS)" >&2
  exit 1
fi
echo 'PASS C19 concurrent character budget: one enabled, one rejected, one audit, total within budget (1/1)'
