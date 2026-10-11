// Explicit local-only integration test. Skipped in the ordinary unit suite.
// Run on candidate worktree with QA_FACE_M20_E2E=true and a local Supabase env.
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { generateFaceReport } from "@/lib/face-analysis/report";

vi.mock("@/lib/face-analysis/vision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/face-analysis/vision")>();
  return {
    ...actual,
    runFaceVisionProvider: vi.fn(async () => {
      const { e2eVision } = await import("@/lib/face-analysis/__fixtures__/vision");
      return e2eVision;
    })
  };
});
vi.mock("@/lib/face-analysis/report", () => ({
  generateFaceReport: vi.fn(async () => ({
    report: { summary: "QA deterministic isolated report" },
    trace: { tokensInput: 11, tokensOutput: 7, model: "qa-stub" }
  })),
  renderFaceReportText: vi.fn(() => "QA deterministic isolated report")
}));

const enabled = process.env.QA_FACE_M20_E2E === "true";
(enabled ? describe : describe.skip)("M20 fresh analyze local accounting", () => {
  it("settles once, denies B, and does not charge after provider failure", async () => {
    const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(apiUrl)
      || !anonKey || !serviceKey || process.env.FACE_ANALYSIS_ENABLED !== "true") {
      throw new Error("Refusing non-local or incomplete QA configuration");
    }
    const service = createClient(apiUrl, serviceKey, { auth: { persistSession: false } });
    const auth = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
    const tag = crypto.randomBytes(5).toString("hex");
    const users: Array<{ authId: string; profileId: string; token: string }> = [];
    const runs: string[] = [];
    const paths: string[] = [];
    let entitlementId: string | undefined;
    let checks = 0;
    function check(condition: boolean, label: string) {
      checks++;
      console.log(`${condition ? "PASS" : "FAIL"} ${label}`);
      expect(condition, label).toBe(true);
    }
    async function member(index: number) {
      const email = `qa-m20-fresh-${tag}-${index}@example.test`;
      const password = `QA-${crypto.randomBytes(12).toString("hex")}`;
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (made.error || !made.data.user) throw new Error("Cannot create QA Auth user");
      const authId = made.data.user.id;
      const user = { authId, profileId: "", token: "" };
      users.push(user);
      const { data: profile, error: profileError } = await service.from("profiles")
        .insert({ auth_user_id: authId, email, name: `QA M20 ${index}`, role: "member" })
        .select("id").single();
      if (profileError || !profile) throw profileError || new Error("Cannot create profile");
      user.profileId = profile.id;
      const login = await auth.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session?.access_token) throw new Error("Cannot sign in QA user");
      user.token = login.data.session.access_token;
      return user;
    }
    async function run(ownerId: string) {
      const id = crypto.randomUUID();
      const path = `${ownerId}/${id}/source.png`;
      const uploaded = await service.storage.from("face-analysis-uploads").upload(path,
        Buffer.from("89504e470d0a1a0a", "hex"), { contentType: "image/png" });
      if (uploaded.error) throw uploaded.error;
      paths.push(path);
      const { error } = await service.from("face_analysis_runs").insert({
        id, request_id: crypto.randomUUID(), user_id: ownerId, mode: "self",
        consent_version: "qa-local", status: "uploaded", storage_path: path,
        mime_type: "image/png", subject_age: 41,
        quality_result: { passed: true, faceCount: 1, faceCoverage: 0.5,
          blurScore: 0.5, brightnessScore: 0.5,
          pose: { yaw: 0, pitch: 0, roll: 0 },
          occlusion: { eyes: false, nose: false, mouth: false }, reasons: [] }
      });
      if (error) throw error;
      runs.push(id);
      return id;
    }
    async function call(id: string, token: string) {
      const { POST } = await import("@/app/api/face-analysis/runs/[id]/analyze/route");
      const request = new NextRequest(`http://127.0.0.1:3999/api/face-analysis/runs/${id}/analyze`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}"
      });
      const response = await POST(request, { params: Promise.resolve({ id }) });
      return { status: response.status, body: await response.json() };
    }
    async function accounting(id: string, ownerId: string) {
      const [{ data: runRow }, { data: usage }, { data: ledger }, { data: entitlement }] = await Promise.all([
        service.from("face_analysis_runs").select("status,report_text,report_structured,usage_log_id,credits_charged,analysis_attempts,error_code").eq("id", id).single(),
        service.from("usage_logs").select("id,type").eq("user_id", ownerId).eq("type", "face_analysis"),
        service.from("credit_transactions").select("id,type,amount,balance_after,ref_id").eq("source", "ai_face_analysis").eq("ref_id", id),
        service.from("member_entitlements").select("credits_remaining").eq("id", entitlementId).single()
      ]);
      return { runRow, usage: usage || [], ledger: ledger || [], balance: entitlement?.credits_remaining };
    }
    try {
      const a = await member(1);
      const b = await member(2);
      const { data: plan, error: planError } = await service.from("plans")
        .select("id").eq("code", "single_report").single();
      if (planError || !plan) throw planError || new Error("Local single_report plan missing");
      const { data: entitlement, error: entitlementError } = await service.from("member_entitlements")
        .insert({ user_id: a.profileId, plan_id: plan.id, status: "active", credits_remaining: 40,
          expires_at: new Date(Date.now() + 86_400_000).toISOString() })
        .select("id").single();
      if (entitlementError || !entitlement) throw entitlementError || new Error("Cannot seed entitlement");
      entitlementId = entitlement.id;
      const goodId = await run(a.profileId);
      const denied = await call(goodId, b.token);
      check(denied.status === 404, "B cannot analyze A's uploaded run");
      const before = await accounting(goodId, a.profileId);
      check(before.runRow?.status === "uploaded" && before.usage.length === 0
        && before.ledger.length === 0 && before.balance === 40, "preflight accounting clean");
      const success = await call(goodId, a.token);
      check(success.status === 200 && success.body.ok === true && success.body.creditsCharged === 20,
        "A fresh analyze succeeds and reports 20 credits");
      const settled = await accounting(goodId, a.profileId);
      check(settled.runRow?.status === "completed" && Boolean(settled.runRow.report_text)
        && Boolean(settled.runRow.report_structured), "new report persisted");
      check(settled.usage.length === 1 && settled.usage[0].id === settled.runRow?.usage_log_id,
        "one usage row linked to run");
      check(settled.ledger.length === 1 && settled.ledger[0].type === "debit"
        && settled.ledger[0].amount === -20 && settled.ledger[0].balance_after === 20
        && settled.runRow?.credits_charged === 20 && settled.balance === 20,
        "ledger, charged count and balance agree");
      const repeated = await call(goodId, a.token);
      const repeatedState = await accounting(goodId, a.profileId);
      check(repeated.status === 200 && repeatedState.usage.length === 1
        && repeatedState.ledger.length === 1 && repeatedState.balance === 20,
        "completed retry neither logs nor charges again");
      const failedId = await run(a.profileId);
      vi.mocked(generateFaceReport).mockRejectedValueOnce(new Error("FACE_REPORT_PROVIDER_ERROR"));
      const failure = await call(failedId, a.token);
      check(failure.status >= 500, "controlled report provider failure returns error");
      const failed = await accounting(failedId, a.profileId);
      check(failed.runRow?.status === "failed" && failed.runRow?.credits_charged === 0
        && failed.runRow?.report_text === null, "failed run has no charged report");
      check(failed.usage.length === 1 && failed.ledger.length === 0 && failed.balance === 20,
        "provider failure adds no usage, ledger or balance change");
      check((await call(failedId, b.token)).status === 404, "B cannot analyze A's failed run");
      console.log(`${checks}/${checks} fresh analyze local checks passed`);
    } finally {
      const cleanupErrors: string[] = [];
      function cleaned(error: { message: string } | null, label: string) {
        if (error) cleanupErrors.push(`${label}: ${error.message}`);
      }
      if (runs.length) {
        cleaned((await service.from("face_analysis_events").delete().in("run_id", runs)).error, "events");
        cleaned((await service.from("face_analysis_runs").delete().in("id", runs)).error, "runs");
        cleaned((await service.from("credit_transactions").delete().in("ref_id", runs)).error, "ledger");
      }
      for (const user of users) if (user.profileId) cleaned((await service.from("usage_logs").delete()
        .eq("user_id", user.profileId).eq("type", "face_analysis")).error, "usage");
      if (entitlementId) cleaned((await service.from("member_entitlements").delete()
        .eq("id", entitlementId)).error, "entitlement");
      for (const path of paths) cleaned((await service.storage.from("face-analysis-uploads")
        .remove([path])).error, "Storage");
      for (const user of users) {
        if (user.profileId) cleaned((await service.from("profiles").delete()
          .eq("id", user.profileId)).error, "profile");
        cleaned((await service.auth.admin.deleteUser(user.authId)).error, "Auth");
      }
      const { data: leftovers } = runs.length
        ? await service.from("face_analysis_runs").select("id").in("id", runs)
        : { data: [] };
      expect(leftovers || [], "QA run fixtures cleaned").toHaveLength(0);
      expect(cleanupErrors, "QA cleanup errors").toEqual([]);
      const profileIds = users.map((user) => user.profileId).filter(Boolean);
      if (profileIds.length) {
        for (const table of ["profiles", "usage_logs", "credit_transactions", "face_analysis_events"] as const) {
          const column = table === "profiles" ? "id" : "user_id";
          const { data, error } = await service.from(table).select("id").in(column, profileIds);
          expect(error, `${table} cleanup query`).toBeNull();
          expect(data || [], `${table} fixtures cleaned`).toHaveLength(0);
        }
      }
      if (entitlementId) {
        const { data, error } = await service.from("member_entitlements")
          .select("id").eq("id", entitlementId);
        expect(error, "entitlement cleanup query").toBeNull();
        expect(data || [], "entitlement fixture cleaned").toHaveLength(0);
      }
      for (const user of users) {
        const found = await service.auth.admin.getUserById(user.authId);
        expect(found.data.user, "Auth fixture cleaned").toBeNull();
      }
      for (const path of paths) {
        const { error } = await service.storage.from("face-analysis-uploads").download(path);
        expect(error, "QA image fixture removed").not.toBeNull();
      }
      console.log("QA Auth/profile/run/usage/ledger/entitlement/Storage fixtures cleaned");
    }
  }, 120_000);
});
