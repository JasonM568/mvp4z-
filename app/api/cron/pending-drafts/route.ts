// Cron：未發布草稿的催促信
//
// 為什麼需要這支：後台已經會顯示「這份草稿還沒發布」，但那要有人打開後台才看得到。
// 2026-08-10 老師存了一份把晚子時日柱改成「不進位」的草稿就離開，一個月沒有人再打開那頁，
// 於是每份報告都繼續用「進位」在排。狀態只顯示在畫面上，等同沒有人被告知。
//
// 這支每天跑一次，把該催的草稿寄給 ADMIN_ALERT_EMAILS（或 ADMIN_EMAILS）——
// 老師的信箱本來就在裡面，所以提醒直接到他手上，不必經過營運轉達。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendAdminAlert } from "@/lib/notifications/admin-alerts";
import { loadPromptSettings, invalidatePromptSettingsCache } from "@/lib/ai/council/settings/load";
import { loadSchool, invalidateSchoolCache } from "@/lib/school-settings/load";
import { diffSchool } from "@/lib/school-settings/diff";
import { buildPendingDraftAlert, type PendingDraft } from "@/lib/admin/pending-drafts";

/** 草稿放超過這麼多天才催。當天存的還在編輯中，催了只是噪音。 */
const MIN_AGE_DAYS = 3;

/** 同一份草稿最多這麼多天催一次。天天寄只會讓人把信設成已讀規則。 */
const RENOTIFY_DAYS = 7;

const ALERT_ACTION = "pending_draft.alerted";

type DraftRow = { id: string; version_label: string; settings: unknown; updated_at: string };

async function readDraft(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: "ai_prompt_profiles" | "ai_school_profiles"
): Promise<DraftRow | null> {
  try {
    const { data, error } = await admin
      .from(table)
      .select("id, version_label, settings, updated_at")
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as DraftRow) || null;
  } catch {
    return null;
  }
}

/**
 * 這份草稿最近是不是已經催過了。
 *
 * 去重狀態直接記在 admin_audit_logs，不另外開表：這本來就是「系統對這份草稿做了什麼」，
 * 記在稽核軌跡裡既是去重依據也是可查的歷史。
 */
async function recentlyAlerted(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  targetId: string,
  now: number
): Promise<boolean> {
  const since = new Date(now - RENOTIFY_DAYS * 86_400_000).toISOString();
  try {
    const { data, error } = await admin
      .from("admin_audit_logs")
      .select("id")
      .eq("action", ALERT_ACTION)
      .eq("target_id", targetId)
      .gte("created_at", since)
      .limit(1);
    if (error) return false;
    return Boolean(data?.length);
  } catch {
    // 查不到就當作沒催過。寧可多寄一封，也不要因為稽核表出問題而永遠不提醒。
    return false;
  }
}

async function run(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("Authorization") || "";
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const admin = createSupabaseAdminClient();

  // 跟後台看到的必須是同一個真相，所以照樣清快取後問同一組 loader。
  invalidatePromptSettingsCache();
  invalidateSchoolCache();

  const [prompt, school, promptDraft, schoolDraft] = await Promise.all([
    loadPromptSettings(now),
    loadSchool(now),
    readDraft(admin, "ai_prompt_profiles"),
    readDraft(admin, "ai_school_profiles")
  ]);

  const candidates: Array<{ id: string; draft: PendingDraft }> = [];

  if (promptDraft) {
    candidates.push({
      id: promptDraft.id,
      draft: {
        area: "報告內容設定",
        page: "/admin/prompt-settings",
        versionLabel: promptDraft.version_label,
        updatedAt: promptDraft.updated_at,
        usingDefaults: !prompt.profileId,
        changes: []
      }
    });
  }

  if (schoolDraft) {
    candidates.push({
      id: schoolDraft.id,
      draft: {
        area: "排盤流派設定",
        page: "/admin/school-settings",
        versionLabel: schoolDraft.version_label,
        updatedAt: schoolDraft.updated_at,
        usingDefaults: !school.profileId,
        changes: diffSchool(school.school, schoolDraft.settings)
      }
    });
  }

  // 先濾掉最近催過的，再交給 buildPendingDraftAlert 決定內容——
  // 這樣「該不該催」的規則只有一份，在那支純函式裡。
  const fresh: Array<{ id: string; draft: PendingDraft }> = [];
  for (const candidate of candidates) {
    if (await recentlyAlerted(admin, candidate.id, now)) continue;
    fresh.push(candidate);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xunfeng.tw";
  const alert = buildPendingDraftAlert(
    fresh.map((item) => item.draft),
    now,
    MIN_AGE_DAYS,
    siteUrl
  );

  if (!alert) {
    return NextResponse.json({
      ok: true,
      checked: candidates.length,
      skipped_recently_alerted: candidates.length - fresh.length,
      alerted: 0
    });
  }

  const sent = await sendAdminAlert({ subject: alert.subject, text: alert.text });

  // 只有真的寄出去才記，否則寄信失敗會被誤認成已通知而靜默 7 天。
  if (sent.ok) {
    const alerted = new Set(alert.drafts.map((draft) => draft.area));
    for (const candidate of fresh) {
      if (!alerted.has(candidate.draft.area)) continue;
      await admin.from("admin_audit_logs").insert({
        admin_user_id: null,
        action: ALERT_ACTION,
        target_type: "settings_draft",
        target_id: candidate.id,
        metadata: {
          area: candidate.draft.area,
          version_label: candidate.draft.versionLabel,
          changes: candidate.draft.changes
        }
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    skipped_recently_alerted: candidates.length - fresh.length,
    alerted: alert.drafts.length,
    email_sent: sent.ok,
    email_skipped_reason: sent.ok ? null : (sent as { reason?: string }).reason || "send_failed",
    subject: alert.subject
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
