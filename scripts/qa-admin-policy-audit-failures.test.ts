import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireNamedAdmin: vi.fn(),
  writeAdminAudit: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadSchool: vi.fn(),
  auditInsertFails: false,
  auditRows: [] as Array<Record<string, unknown>>,
  rows: {} as Record<string, Array<Record<string, unknown>>>
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mocks.requireAdmin,
  requireNamedAdmin: mocks.requireNamedAdmin,
  writeAdminAudit: mocks.writeAdminAudit
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/auth/member", () => ({
  errorMessage: (error: Error) => error.message,
  errorStatus: (error: { status?: number }) => error.status || 500,
  readJson: async (request: NextRequest, schema: { parse(value: unknown): unknown }) => schema.parse(await request.json()),
  statusError: (message: string, status: number) => Object.assign(new Error(message), { status })
}));
vi.mock("@/lib/ai/council/settings/schema", () => ({
  promptSettingsSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) }
}));
vi.mock("@/lib/ai/council/settings/validate", () => ({ validateSettings: () => [] }));
vi.mock("@/lib/ai/council/settings/load", () => ({
  invalidatePromptSettingsCache: vi.fn(),
  PROMPT_SETTINGS_CACHE_SECONDS: 30
}));
vi.mock("@/lib/yixue/school/schema", () => ({ schoolConfigSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) } }));
vi.mock("@/lib/school-settings/load", () => ({
  invalidateSchoolCache: vi.fn(),
  SCHOOL_CACHE_SECONDS: 30,
  loadSchool: mocks.loadSchool
}));
vi.mock("@/lib/school-settings/qimen-signoff", () => ({ invalidateQimenSignoffCache: vi.fn() }));
vi.mock("@/lib/yixue/qimen/qimen", () => ({
  buildQimenChart: () => ({ chart: "QA" }),
  QIMEN_RULE_VERSION: "qa-rule-v1"
}));
vi.mock("@/lib/yixue/qimen/review", () => ({
  QIMEN_REVIEW_CASES: [
    { id: "case1", year: 2026, month: 1, day: 2, hour: 3, minute: 0, label: "A" },
    { id: "case2", year: 2026, month: 2, day: 3, hour: 4, minute: 0, label: "B" },
    { id: "case3", year: 2026, month: 3, day: 4, hour: 5, minute: 0, label: "C" }
  ],
  qimenGrid: () => [],
  qimenHeadlines: () => []
}));
vi.mock("@/lib/yixue/calendar/tyme", () => ({ makeSolarTime: () => ({}) }));

import { POST as publishPromptPOST } from "../app/api/admin/prompt-settings/publish/route";
import { POST as publishSchoolPOST } from "../app/api/admin/school-settings/publish/route";
import { POST as signoffPOST } from "../app/api/admin/qimen-review/signoff/route";
import { POST as providerApprovalPOST, DELETE as providerApprovalDELETE } from "../app/api/admin/face-provider-approval/route";

function makeAdminClient() {
  return {
    from: (table: string) => {
      let filters: Record<string, unknown> = {};
      let insertPayload: Record<string, unknown> | null = null;
      let upsertPayload: Record<string, unknown> | null = null;
      let updatePayload: Record<string, unknown> | null = null;
      const tableRows = () => mocks.rows[table] || (mocks.rows[table] = []);
      const matches = (row: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => row[key] === value);
      const mutate = () => {
        if (updatePayload) for (const row of tableRows().filter(matches)) Object.assign(row, updatePayload);
        if (upsertPayload) {
          const row = tableRows().find((candidate) => candidate.provider === upsertPayload?.provider);
          if (row) Object.assign(row, upsertPayload);
          else tableRows().push({ ...upsertPayload, id: "qa-provider-approval" });
        }
        if (insertPayload && table !== "admin_audit_logs") tableRows().push({ ...insertPayload, id: "qa-row" });
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        maybeSingle: async () => {
          if (updatePayload) mutate();
          return { data: tableRows().find(matches) || null, error: null };
        },
        single: async () => {
          if (table === "admin_audit_logs") {
            if (mocks.auditInsertFails) return { data: null, error: new Error("injected audit failure") };
            if (insertPayload) mocks.auditRows.push({ ...insertPayload });
            return { data: { id: "qa-audit" }, error: null };
          }
          mutate();
          return { data: tableRows().at(-1) || null, error: null };
        },
        insert: (payload: Record<string, unknown>) => { insertPayload = payload; return query; },
        upsert: (payload: Record<string, unknown>) => { upsertPayload = payload; return query; },
        update: (payload: Record<string, unknown>) => { updatePayload = payload; return query; },
        then: (resolve: (result: { error: Error | null }) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve().then(() => {
            if (table === "admin_audit_logs") {
              if (mocks.auditInsertFails) return { error: new Error("injected audit failure") };
              if (insertPayload) mocks.auditRows.push({ ...insertPayload });
            } else mutate();
            return { error: null };
          }).then(resolve, reject)
      };
      return query;
    }
  };
}

function request(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json", authorization: "Bearer qa-admin" },
      body: JSON.stringify(body)
    })
  });
}

describe("QA: policy/signoff/provider mutations with audit insert failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditInsertFails = true;
    mocks.auditRows = [];
    mocks.rows = {
      ai_prompt_profiles: [
        { id: "prompt-current", status: "published" },
        { id: "prompt-draft", status: "draft", version_label: "v2", settings: {} }
      ],
      ai_school_profiles: [
        { id: "school-current", status: "published" },
        { id: "school-draft", status: "draft", version_label: "v2", settings: {}, decided_by: "QA" }
      ],
      face_provider_approvals: [{ id: "qa-provider-approval", provider: "openai", status: "active" }],
      qimen_signoffs: []
    };
    mocks.requireAdmin.mockResolvedValue({ profile: { id: "qa-admin" } });
    mocks.requireNamedAdmin.mockResolvedValue({ profile: { id: "qa-admin" } });
    mocks.loadSchool.mockResolvedValue({ school: {} });
    mocks.createSupabaseAdminClient.mockReturnValue(makeAdminClient());
    mocks.writeAdminAudit.mockImplementation(async (input) => {
      await mocks.createSupabaseAdminClient().from("admin_audit_logs").insert({
        admin_user_id: input.adminUserId || null,
        action: input.action,
        target_type: input.targetType || null,
        target_id: input.targetId || null,
        metadata: input.metadata || {}
      });
    });
  });

  it("prompt publish succeeds although profile changes and audit is absent", async () => {
    const response = await publishPromptPOST(request("http://localhost/api/admin/prompt-settings/publish"));

    expect(response.status).toBe(200);
    expect(mocks.rows.ai_prompt_profiles).toEqual([
      expect.objectContaining({ id: "prompt-current", status: "archived" }),
      expect.objectContaining({ id: "prompt-draft", status: "published" })
    ]);
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("school publish succeeds although signed configuration changes and audit is absent", async () => {
    const response = await publishSchoolPOST(request("http://localhost/api/admin/school-settings/publish"));

    expect(response.status).toBe(200);
    expect(mocks.rows.ai_school_profiles).toEqual([
      expect.objectContaining({ id: "school-current", status: "archived" }),
      expect.objectContaining({ id: "school-draft", status: "published", settings: expect.objectContaining({ decidedBy: "QA" }) })
    ]);
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("qimen signoff row persists and returns success without its audit", async () => {
    const response = await signoffPOST(request("http://localhost/api/admin/qimen-review/signoff", {
      signed_by: "QA teacher",
      results: ["case1", "case2", "case3"].map((id) => ({ id, match: true })),
      note: ""
    }));

    expect(response.status).toBe(200);
    expect(mocks.rows.qimen_signoffs).toHaveLength(1);
    expect(mocks.rows.qimen_signoffs[0]).toMatchObject({ approved: true, signed_by: "QA teacher" });
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("provider approval becomes active and returns success without its audit", async () => {
    const response = await providerApprovalPOST(request("http://localhost/api/admin/face-provider-approval", {
      organizationLabel: "QA Org",
      projectLabel: "QA Project",
      approvedAt: "2026-10-10",
      attested: true,
      note: "local test"
    }));

    expect(response.status).toBe(200);
    expect(mocks.rows.face_provider_approvals[0]).toMatchObject({ status: "active", verified_by: "qa-admin" });
    expect(mocks.auditRows).toHaveLength(0);
  });

  it("provider approval revocation persists and returns success without its audit", async () => {
    const response = await providerApprovalDELETE(request("http://localhost/api/admin/face-provider-approval"));

    expect(response.status).toBe(200);
    expect(mocks.rows.face_provider_approvals[0]).toMatchObject({ status: "revoked", provider: "openai" });
    expect(mocks.auditRows).toHaveLength(0);
  });
});
