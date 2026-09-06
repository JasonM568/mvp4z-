// 巽風｜未發布草稿的催促信內容
//
// 事故背景：2026-08-10 老師把晚子時日柱改成「不進位」存成草稿就離開，
// 一個月內每份報告仍用「進位」在排。系統知道這件事（DB 裡草稿好好躺著），
// 但沒有任何一個管道把它說出口，於是沒有人知道。
//
// 這個檔負責決定「什麼時候該催、催信寫什麼」。純函式、時間由參數傳入，
// 才能對「放了幾天」這種邊界寫測試。實際寄信與去重在 cron route。

export type PendingDraft = {
  /** 顯示用的區塊名，例如「排盤流派設定」。 */
  area: string;
  /** 後台頁面路徑，直接寫進信裡讓老師點得到。 */
  page: string;
  versionLabel: string;
  /** 草稿最後更新時間（ISO）。 */
  updatedAt: string;
  /** 目前根本沒有已發布版本（報告正在用程式預設值）。 */
  usingDefaults: boolean;
  /** 草稿與目前生效值的差異句子；流派才有，報告設定給空陣列。 */
  changes: string[];
};

export function daysSince(updatedAt: string, now: number): number {
  const then = new Date(updatedAt).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((now - then) / 86_400_000);
}

/**
 * 哪些草稿該被催。
 *
 * 兩個條件都要成立才催：
 * 1. 放超過 minAgeDays 天——當天存的草稿還在編輯中，催了只是噪音。
 * 2. 這份草稿真的會改變什麼——流派草稿若與生效值逐項相同（changes 為空）
 *    且目前已有發布版本，那它是個無作用草稿，催了也沒事可做。
 *
 * 報告設定的草稿沒有逐項 diff（設定是深層巢狀，硬做 diff 只會產出沒人讀的雜訊），
 * 所以只要存在且夠久就催——那份草稿本來就是老師打算發布卻沒發布的東西。
 */
export function selectStaleDrafts(
  drafts: PendingDraft[],
  now: number,
  minAgeDays: number
): PendingDraft[] {
  return drafts.filter((draft) => {
    if (daysSince(draft.updatedAt, now) < minAgeDays) return false;
    if (draft.changes.length === 0 && !draft.usingDefaults && draft.area.includes("流派")) return false;
    return true;
  });
}

/**
 * 催促信內容。沒有該催的草稿時回 null——不要為了「有跑過」而寄空信。
 *
 * 信裡刻意把差異逐條寫出來（「晚子時日柱：進位到隔日 → 不進位」），
 * 因為收信的人要能不登入就判斷這件事急不急。
 */
export function buildPendingDraftAlert(
  drafts: PendingDraft[],
  now: number,
  minAgeDays: number,
  siteUrl: string
): { subject: string; text: string; drafts: PendingDraft[] } | null {
  const stale = selectStaleDrafts(drafts, now, minAgeDays);
  if (!stale.length) return null;

  const longest = Math.max(...stale.map((draft) => daysSince(draft.updatedAt, now)));
  const subject =
    stale.length === 1
      ? `【巽風】${stale[0].area}有一份草稿已放 ${longest} 天未發布`
      : `【巽風】有 ${stale.length} 份設定草稿未發布，最久已放 ${longest} 天`;

  const lines: string[] = [
    "以下設定草稿已儲存但尚未發布。",
    "草稿不影響任何報告——要按「發布」才會生效。",
    ""
  ];

  for (const draft of stale) {
    lines.push(`■ ${draft.area}`);
    lines.push(`　版本：${draft.versionLabel}`);
    lines.push(`　已放置：${daysSince(draft.updatedAt, now)} 天（最後儲存 ${draft.updatedAt}）`);
    if (draft.usingDefaults) {
      lines.push("　目前狀態：還沒有發布過任何版本，報告正在使用程式內建的預設值。");
    }
    if (draft.changes.length) {
      lines.push("　這份草稿與目前生效值的差異：");
      for (const change of draft.changes) lines.push(`　　・${change}`);
    }
    lines.push(`　前往發布：${siteUrl}${draft.page}`);
    lines.push("");
  }

  lines.push("若這份草稿已經不需要了，可以直接在後台改回目前生效的設定再儲存，這封提醒就會停止。");

  return { subject, text: lines.join("\n"), drafts: stale };
}
