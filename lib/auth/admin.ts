import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerProfile, statusError } from "@/lib/auth/member";

export async function requireAdmin(request: NextRequest) {
  const adminKey = request.headers.get("X-Admin-Key") || "";
  if (process.env.ADMIN_KEY && adminKey && adminKey === process.env.ADMIN_KEY) {
    return { mode: "admin_key" as const, profile: null };
  }

  const { profile } = await requireBearerProfile(request);
  if (profile.role !== "admin") throw statusError("需要管理員權限", 403);
  return { mode: "role" as const, profile };
}

export async function writeAdminAudit(input: {
  adminUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("admin_audit_logs").insert({
    admin_user_id: input.adminUserId || null,
    action: input.action,
    target_type: input.targetType || null,
    target_id: input.targetId || null,
    metadata: input.metadata || {}
  });
}

export function createActivationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((value) => chars[value % chars.length])
      .join("");
  return `XF-${part()}-${part()}`;
}
