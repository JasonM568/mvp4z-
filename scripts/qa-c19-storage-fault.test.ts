import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Isolated stateful boundary: no network, shared Storage, or database is touched.
const fixture = vi.hoisted(() => ({
  documents: new Map<string, { id: string; storage_path: string }>(),
  objects: new Map<string, Uint8Array>(),
  audits: [] as Array<{ action: string; documentId: string; storagePath: string }>,
  calls: [] as string[],
  uploadedPath: "" as string,
  failRemove: false,
  throwAfterUpload: false
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => ({ mode: "role", profile: { id: "qa-c19-admin" } })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: { p_id?: string }) => {
      fixture.calls.push(`rpc:${name}`);
      if (name === "create_ai_document_with_audit" && fixture.throwAfterUpload) {
        throw new Error("injected RPC transport failure after successful upload");
      }
      if (name === "delete_ai_document_with_audit") {
        const document = fixture.documents.get(args.p_id || "");
        if (!document) return { data: null, error: { code: "P0002", message: "not found" } };
        fixture.documents.delete(document.id);
        fixture.audits.push({ action: "document.delete", documentId: document.id, storagePath: document.storage_path });
        return { data: document, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("yixue-documents");
        return {
          upload: async (path: string, bytes: Uint8Array) => {
            fixture.calls.push("storage:upload");
            fixture.uploadedPath = path;
            fixture.objects.set(path, bytes);
            return { error: null };
          },
          remove: async (paths: string[]) => {
            fixture.calls.push("storage:remove");
            if (fixture.failRemove) return { error: { name: "InjectedStorageFailure" } };
            paths.forEach((path) => fixture.objects.delete(path));
            return { error: null };
          }
        };
      }
    }
  })
}));

import { POST } from "../app/api/admin/documents/route";
import { DELETE } from "../app/api/admin/documents/[id]/route";

describe("C19 Storage failure isolation QA", () => {
  beforeEach(() => {
    fixture.calls.length = 0;
    fixture.uploadedPath = "";
    fixture.failRemove = true;
    fixture.throwAfterUpload = false;
  });

  afterEach(() => {
    expect(fixture.documents.size, "document fixture cleanup").toBe(0);
    expect(fixture.objects.size, "Storage fixture cleanup").toBe(0);
    expect(fixture.audits.length, "audit fixture cleanup").toBe(0);
  });

  it("POST outer catch returns 500, logs the orphan path, and never creates a document", async () => {
    fixture.throwAfterUpload = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const form = new FormData();
      form.set("file", new File(["isolated C19 fixture"], "qa-c19.txt", { type: "text/plain" }));
      const response = await POST(new NextRequest("http://localhost/api/admin/documents", {
        method: "POST",
        body: form
      }));

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("暫存檔清理失敗") });
      expect(fixture.calls).toEqual([
        "storage:upload", "rpc:create_ai_document_with_audit", "storage:remove"
      ]);
      expect(fixture.uploadedPath).toMatch(/^qa-c19-admin\/.+\.txt$/);
      expect(errorLog).toHaveBeenCalledWith("C19 document upload compensation failed", {
        storagePath: fixture.uploadedPath,
        storageCode: "InjectedStorageFailure"
      });
      expect(fixture.documents.size).toBe(0);
      expect(fixture.audits).toEqual([]);
      expect([...fixture.objects.keys()]).toEqual([fixture.uploadedPath]);
    } finally {
      fixture.objects.delete(fixture.uploadedPath);
      errorLog.mockRestore();
    }
  });

  it("DELETE returns 503 after committed DB/audit, leaves a scannable path, then retries as 404", async () => {
    const id = "qa-c19-document";
    const path = "qa-c19-admin/qa-c19-document.txt";
    fixture.documents.set(id, { id, storage_path: path });
    fixture.objects.set(path, new Uint8Array([81, 65]));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = () => new NextRequest(`http://localhost/api/admin/documents/${id}`, { method: "DELETE" });
    const context = { params: Promise.resolve({ id }) };
    try {
      const response = await DELETE(request(), context);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("稽核已完成") });
      expect(fixture.documents.size).toBe(0);
      expect(fixture.audits).toEqual([{ action: "document.delete", documentId: id, storagePath: path }]);
      expect([...fixture.objects.keys()]).toEqual([path]);
      expect(errorLog).toHaveBeenCalledWith("C19 deleted document storage cleanup failed", {
        documentId: id,
        storagePath: path,
        storageCode: "InjectedStorageFailure"
      });

      const retry = await DELETE(request(), context);
      expect(retry.status).toBe(404);
      expect(fixture.audits).toHaveLength(1);
      expect(fixture.calls).toEqual([
        "rpc:delete_ai_document_with_audit", "storage:remove", "rpc:delete_ai_document_with_audit"
      ]);
    } finally {
      fixture.objects.delete(path);
      fixture.documents.delete(id);
      fixture.audits.length = 0;
      errorLog.mockRestore();
    }
  });
});
