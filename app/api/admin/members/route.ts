import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_COUNCIL_COST } from "@/lib/auth/tier";

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

    /**
     * 「卡住」＝資格還有效，但點數已經不夠產一份報告。
     *
     * 這一群在原本的列表裡看不出來：他們的狀態是 active、點數欄位也有數字，
     * 跟正常會員長得一模一樣。但 2026-09-22 查證時，13 位有效 trial 會員裡
     * 有 6 位剛好卡在 10 點——全部都是「註冊 30 點、產 1 份報告扣 20」的結果，
     * 而且 0 人付費、0 人開過結帳頁。這是最該被主動聯繫的一群。
     *
     * 只算 active：過期的人要的是續訂提醒，不是加購提醒，兩種名單不該混在一起。
     */
    const stuck = members.filter(
      (m) => m.status === "active" && m.credits_remaining < DEFAULT_COUNCIL_COST
    );

    return apiJson({
      ok: true,
      members,
      report_cost: DEFAULT_COUNCIL_COST,
      summary: {
        total: members.length,
        active: members.filter((m) => m.status === "active").length,
        stuck: stuck.length
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
