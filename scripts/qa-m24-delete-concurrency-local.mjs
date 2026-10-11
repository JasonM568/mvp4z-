#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const dbHost = process.env.QA_M24_DB_HOST || "/tmp";
const dbPort = process.env.QA_M24_DB_PORT || "55499";
const dbName = process.env.QA_M24_DB_NAME || "m24_fresh";
const dbUser = process.env.QA_M24_DB_USER || process.env.USER;
const n = Number(process.env.QA_M24_N || 20);

if (dbHost !== "/tmp" || dbPort !== "55499" || dbName !== "m24_fresh" || !dbUser) {
  throw new Error("Refusing M24 SQL fixture: only the dedicated local Unix socket /tmp:m24_fresh:55499 is allowed");
}
if (!Number.isInteger(n) || n !== 20) throw new Error("QA_M24_N must be exactly 20");

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-XAt", "-v", "ON_ERROR_STOP=1", "-h", dbHost, "-p", dbPort,
      "-U", dbUser, "-d", dbName, "-c", sql], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim())
      : reject(new Error(`psql exit ${code}: ${stderr.trim()}`)));
  });
}

const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const runId = randomUUID();
const ownerId = randomUUID();
const path = `${ownerId}/${runId}/source.png`;
const staleRunId = randomUUID();
const staleOwnerId = randomUUID();
const stalePath = `${staleOwnerId}/${staleRunId}/source.png`;
const preflight = await psql("select current_database() || '|' || current_setting('port') || '|' || coalesce(inet_server_addr()::text, 'unix-socket')");
if (preflight !== "m24_fresh|55499|unix-socket") {
  throw new Error(`Refusing M24 fixture on unexpected PostgreSQL target: ${preflight}`);
}
const functions = await psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_face_analysis_image_deletion','finalize_face_analysis_image_deletion')");
if (functions !== "2") throw new Error("M24 claim/finalize RPCs are missing from the isolated database");

try {
  await psql(`insert into public.face_analysis_runs (id,user_id,status,storage_path)
    values (${quote(runId)},${quote(ownerId)},'completed',${quote(path)});`);

  const claimSQL = `begin; set local role service_role;
    select result || '|' || storage_path || '|' || operation_id::text
      from public.claim_face_analysis_image_deletion(${quote(runId)},${quote(ownerId)});
    select pg_sleep(0.15); commit;`;
  const claims = await Promise.all(Array.from({ length: n }, () => psql(claimSQL)));
  const claimRows = claims.map((result) => result.split("\n").find((line) => line.startsWith("claimed|")));
  if (claimRows.some((line) => !line)) throw new Error(`Expected ${n} successful claims; got ${claimRows.filter(Boolean).length}`);
  const operationIds = new Set(claimRows.map((line) => line.split("|")[2]));
  if (operationIds.size !== 1) throw new Error(`Concurrent claims returned ${operationIds.size} operation ids`);
  const operationId = [...operationIds][0];

  const finalizeSQL = `begin; set local role service_role;
    select result from public.finalize_face_analysis_image_deletion(
      ${quote(runId)},${quote(ownerId)},${quote(operationId)}::uuid);
    select pg_sleep(0.1); commit;`;
  const finalizations = await Promise.all(Array.from({ length: n }, () => psql(finalizeSQL)));
  const results = finalizations.flatMap((result) => result.split("\n").filter((line) =>
    line === "deleted" || line === "already_deleted" || line === "conflict"));
  const deleted = results.filter((result) => result === "deleted").length;
  const alreadyDeleted = results.filter((result) => result === "already_deleted").length;
  if (results.length !== n || deleted !== 1 || alreadyDeleted !== n - 1) {
    throw new Error(`Expected deleted=1/already_deleted=${n - 1}; got ${JSON.stringify({ results, deleted, alreadyDeleted })}`);
  }

  const finalState = await psql(`select
      (storage_path is null)::text || '|' || (image_deleted_at is not null)::text || '|' ||
      (not deletion_pending)::text || '|' || (image_deletion_operation_id is null)::text || '|' ||
      (select count(*) from public.face_analysis_events where run_id = ${quote(runId)}
        and event_type = 'image_deleted_by_member')::text
    from public.face_analysis_runs where id = ${quote(runId)};`);
  if (finalState !== "true|true|true|true|1") throw new Error(`Unexpected final state: ${finalState}`);
  console.log(`M24 PostgreSQL concurrency passed: claims=${n}, operation_ids=${operationIds.size}, deleted=${deleted}, already_deleted=${alreadyDeleted}, final=${finalState}`);

  await psql(`insert into public.face_analysis_runs (id,user_id,status,storage_path)
    values (${quote(staleRunId)},${quote(staleOwnerId)},'completed',${quote(stalePath)});`);
  const oldClaimResult = await psql(`set role service_role;
    select result || '|' || operation_id::text
      from public.claim_face_analysis_image_deletion(${quote(staleRunId)},${quote(staleOwnerId)});`);
  const oldClaim = oldClaimResult.split("\n").find((line) => line.startsWith("claimed|"));
  if (!oldClaim) throw new Error(`Initial operation was not claimed: ${oldClaimResult}`);
  const oldOperationId = oldClaim.split("|")[1];
  await psql(`reset role; set role service_role;
    select public.release_face_analysis_image_deletion(${quote(staleRunId)},${quote(staleOwnerId)},${quote(oldOperationId)}::uuid)::text;`);
  const newClaimResult = await psql(`reset role; set role service_role;
    select result || '|' || operation_id::text
      from public.claim_face_analysis_image_deletion(${quote(staleRunId)},${quote(staleOwnerId)});`);
  const newClaim = newClaimResult.split("\n").find((line) => line.startsWith("claimed|"));
  if (!newClaim) throw new Error(`Retry operation was not claimed: ${newClaimResult}`);
  const newOperationId = newClaim.split("|")[1];
  if (newOperationId === oldOperationId) throw new Error("Retry reused the released operation id");
  const staleRelease = await psql(`reset role; set role service_role;
    select public.release_face_analysis_image_deletion(${quote(staleRunId)},${quote(staleOwnerId)},${quote(oldOperationId)}::uuid)::text;`);
  const claimState = await psql(`reset role;
    select deletion_pending::text || '|' || (image_deletion_operation_id=${quote(newOperationId)}::uuid)::text
    from public.face_analysis_runs where id=${quote(staleRunId)};`);
  const staleReleaseResult = staleRelease.split("\n").at(-1);
  const claimStateResult = claimState.split("\n").at(-1);
  if (staleReleaseResult !== "false" || claimStateResult !== "true|true") {
    throw new Error(`Stale release changed the new operation: release=${staleRelease}, state=${claimState}`);
  }
  console.log(`M24 stale operation isolation passed: old_release=${staleReleaseResult}, new_claim_preserved=${claimStateResult}`);
} finally {
  await psql(`delete from public.face_analysis_events where run_id in (${quote(runId)},${quote(staleRunId)});
    delete from public.face_analysis_runs where id in (${quote(runId)},${quote(staleRunId)});`);
  const residue = await psql(`select (select count(*) from public.face_analysis_runs where id in (${quote(runId)},${quote(staleRunId)}))::text || '|' ||
    (select count(*) from public.face_analysis_events where run_id in (${quote(runId)},${quote(staleRunId)}))::text;`);
  if (residue !== "0|0") throw new Error(`Fixture cleanup failed: ${residue}`);
  console.log("M24 PostgreSQL fixture cleanup passed: runs=0, events=0");
}
