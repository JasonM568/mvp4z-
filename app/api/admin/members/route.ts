import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, name, email, phone, role, created_at, member_entitlements(status, credits_remaining, expires_at, plans(code, name))")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const members = (profiles || []).map((profile) => {
      const entitlements = Array.isArray(profile.member_entitlements)
        ? profile.member_entitlements
        : profile.member_entitlements
          ? [profile.member_entitlements]
          : [];
      const now = new Date().toISOString();
      const entitlement =
        entitlements.find((item) => item.status === "active" && item.expires_at && item.expires_at >= now) ||
        entitlements
          .slice()
          .sort((a, b) => String(b.expires_at || "").localeCompare(String(a.expires_at || "")))[0];
      const plan = Array.isArray(entitlement?.plans) ? entitlement?.plans[0] : entitlement?.plans;
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        plan: plan?.code || "free",
        status: entitlement?.status === "active" && entitlement?.expires_at >= now ? "active" : entitlement ? "expired" : "pending",
        credits_remaining: entitlement?.credits_remaining || 0,
        expires_at: entitlement?.expires_at || null,
        created_at: profile.created_at
      };
    });

    return apiJson({ ok: true, members });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
