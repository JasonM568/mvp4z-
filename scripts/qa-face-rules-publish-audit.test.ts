import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAdminAudit: vi.fn(),
  invalidateFaceRuleProfileCache: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  auditRows: [] as Array<Record<string, unknown>>,
  auditInsertFails: false,
  updateFailureStatus: null as string | null
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mocks.requireAdmin,
  writeAdminAudit: mocks.writeAdminAudit
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/face-analysis/rule-profiles", () => ({
  invalidateFaceRuleProfileCache: mocks.invalidateFaceRuleProfileCache
}));

import { POST as publishPOST } from "../app/api/admin/face-rules/publish/route";
import { POST as saveDraftPOST } from "../app/api/admin/face-rules/route";

const existingPublished = {
  id: "current-profile",
  version_label: "v1",
  settings: { schemaVersion: "1.0" },
  status: "published"
};
const draft = {
  id: "draft-profile",
  version_label: "v2",
  settings: { schemaVersion: "1.0" },
  status: "draft"
};

function makeAdminClient() {
  return {
    from: (table: string) => {
      if (table === "admin_audit_logs") {
        let insertPayload: Record<string, unknown> | null = null;
        const auditQuery = {
          insert: (payload: Record<string, unknown>) => {
            insertPayload = payload;
            return auditQuery;
          },
          then: (resolve: (result: { error: Error | null }) => unknown, reject?: (error: unknown) => unknown) =>
            Promise.resolve().then(() => {
              if (mocks.auditInsertFails) return { error: new Error("injected audit insert failure") };
              if (insertPayload) mocks.auditRows.push({ ...insertPayload });
              return { error: null };
            }).then(resolve, reject)
        };
        return auditQuery;
      }
      if (table !== "face_rule_profiles") throw new Error(`Unexpected table ${table}`);
      let filters: Record<string, unknown> = {};
      let updatePayload: Record<string, unknown> | null = null;
      let insertPayload: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => ({
          data: mocks.rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) || null,
          error: null
        }),
        insert: (payload: Record<string, unknown>) => {
          insertPayload = payload;
          return query;
        },
        single: async () => {
          if (!insertPayload) return { data: null, error: new Error("expected insert payload") };
          const row = { ...insertPayload, id: "new-draft" };
          mocks.rows.push(row);
          return { data: { id: row.id }, error: null };
        },
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return query;
        },
        then: (resolve: (result: { error: Error | null }) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve().then(() => {
            if (mocks.updateFailureStatus && updatePayload?.status === mocks.updateFailureStatus) {
              return { error: new Error(`injected ${mocks.updateFailureStatus} update failure`) };
            }
            for (const row of mocks.rows) {
              if (Object.entries(filters).every(([key, value]) => row[key] === value)) Object.assign(row, updatePayload);
            }
            return { error: null };
          }).then(resolve, reject)
      };
      return query;
    }
  };
}

function request() {
  return new NextRequest("http://localhost/api/admin/face-rules/publish", { method: "POST" });
}

const savePayload = {
  versionLabel: "v3",
  note: "QA draft",
  decidedBy: "QA",
  settings: {
    schemaVersion: "1.0",
    palaces: ["命宮", "官祿宮", "父母宮", "福德宮", "遷移宮", "兄弟宮", "夫妻宮", "子女宮", "疾厄宮", "財帛宮", "奴僕宮", "田宅宮"]
      .map((name) => ({ name, primary: ["eyes"], auxiliary: [] }))
  }
};

function saveRequest(payload: unknown = savePayload) {
  return new NextRequest("http://localhost/api/admin/face-rules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

describe("QA: admin face-rule publish audit boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ ...existingPublished }, { ...draft }];
    mocks.auditRows = [];
    mocks.auditInsertFails = false;
    mocks.updateFailureStatus = null;
    mocks.requireAdmin.mockResolvedValue({ profile: { id: "qa-admin" } });
    mocks.createSupabaseAdminClient.mockReturnValue(makeAdminClient());
    mocks.writeAdminAudit.mockImplementation(async (input) => {
      // Mirror lib/auth/admin.ts: await insert result, but do not inspect its `error` field.
      await mocks.createSupabaseAdminClient().from("admin_audit_logs").insert({
        admin_user_id: input.adminUserId || null,
        action: input.action,
        target_type: input.targetType || null,
        target_id: input.targetId || null,
        metadata: input.metadata || {}
      });
    });
  });

  it("publishes the draft, archives the previous profile, and writes named audit on success", async () => {
    const response = await publishPOST(request());

    expect(response.status).toBe(200);
    expect(mocks.rows).toEqual([
      expect.objectContaining({ id: "current-profile", status: "archived" }),
      expect.objectContaining({ id: "draft-profile", status: "published", published_at: expect.any(String) })
    ]);
    expect(mocks.auditRows).toEqual([expect.objectContaining({
      admin_user_id: "qa-admin", action: "face_rules.publish", target_id: "draft-profile"
    })]);
    expect(mocks.invalidateFaceRuleProfileCache).toHaveBeenCalledOnce();
  });

  it("returns 400 without writing when no draft exists", async () => {
    mocks.rows = [{ ...existingPublished }];

    const response = await publishPOST(request());

    expect(response.status).toBe(400);
    expect(mocks.rows).toEqual([expect.objectContaining({ id: "current-profile", status: "published" })]);
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it("reproduces a false-success response when audit insert returns an error", async () => {
    mocks.auditInsertFails = true;

    const response = await publishPOST(request());

    expect(response.status).toBe(200);
    expect(mocks.rows).toEqual([
      expect.objectContaining({ id: "current-profile", status: "archived" }),
      expect.objectContaining({ id: "draft-profile", status: "published" })
    ]);
    expect(mocks.auditRows).toEqual([]);
    expect(mocks.invalidateFaceRuleProfileCache).toHaveBeenCalledOnce();
  });

  it("reproduces a no-published-profile gap when publishing fails after archiving", async () => {
    mocks.updateFailureStatus = "published";

    const response = await publishPOST(request());

    expect(response.status).toBe(500);
    expect(mocks.rows).toEqual([
      expect.objectContaining({ id: "current-profile", status: "archived" }),
      expect.objectContaining({ id: "draft-profile", status: "draft" })
    ]);
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it("also returns success when draft insert commits but its audit insert fails", async () => {
    mocks.rows = [{ ...existingPublished }];
    mocks.auditInsertFails = true;

    const response = await saveDraftPOST(saveRequest());

    expect(response.status).toBe(200);
    expect(mocks.rows).toEqual([
      expect.objectContaining({ id: "current-profile", status: "published" }),
      expect.objectContaining({ id: "new-draft", status: "draft", version_label: "v3" })
    ]);
    expect(mocks.auditRows).toEqual([]);
  });

  it("rejects an oversized version label before writing a draft", async () => {
    mocks.rows = [{ ...existingPublished }];

    const response = await saveDraftPOST(saveRequest({ ...savePayload, versionLabel: "v".repeat(81) }));

    expect(response.status).toBe(400);
    expect(mocks.rows).toEqual([expect.objectContaining({ id: "current-profile", status: "published" })]);
    expect(mocks.auditRows).toEqual([]);
  });
});
