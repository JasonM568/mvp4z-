// 巽風｜流派草稿與生效值的差異描述
//
// 抽出來的理由：這段是這次事故的核心補救——2026-08-10 老師把晚子時日柱改成
// 「不進位」存成草稿後就離開，一個月內每份報告仍用「進位」在排，而後台沒有
// 任何一處把這件事說出口。這個函式就是要把它說出口，所以它必須有測試。
//
// 純函式、無 I/O，輸出直接是可顯示的中文句子。

import type { SchoolConfig } from "@/lib/yixue/school/types";

/**
 * 流派選項轉人話。老師不該為了知道自己改了什麼而去讀 lateZiDayPillar 這種欄位名。
 *
 * 值的措辭刻意不重複欄位名——輸出是「晚子時日柱：進位到隔日 → 不進位」，
 * 把欄位名寫進值裡會變成「晚子時日柱：晚子時日柱進位到隔日 → …」。
 */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  trueSolarTime: {
    off: "不校正",
    longitude: "只校正經度時差",
    "longitude+eot": "經度時差＋均時差"
  },
  lateZiDayPillar: {
    next: "進位到隔日",
    same: "不進位，仍算當日"
  },
  earlyLateZiHourPillar: {
    split: "分開算",
    merge: "合併，不分"
  },
  termTieBreak: {
    instant: "依精確時刻",
    day: "當日整日歸新月"
  }
};

const FIELD_LABELS: Record<string, string> = {
  trueSolarTime: "真太陽時校正",
  lateZiDayPillar: "晚子時日柱",
  earlyLateZiHourPillar: "早晚子時柱",
  termTieBreak: "交節判定",
  defaultLongitude: "預設經度"
};

export function describeSchoolValue(field: string, value: unknown): string {
  const table = VALUE_LABELS[field];
  if (table && typeof value === "string" && table[value]) return table[value];
  return String(value);
}

/**
 * 草稿與目前生效值的逐項差異。
 *
 * 回空陣列有兩種意思，呼叫端都當「不必催發布」處理：
 * 沒有草稿，或草稿內容與生效值相同。
 *
 * 刻意只比對 calendar 內的已知欄位：草稿是 DB 來的 jsonb，形狀不可信，
 * 多出來的欄位一律忽略而不是報錯——這頁的職責是提醒，不是驗證。
 */
export function diffSchool(live: SchoolConfig, draft: unknown): string[] {
  if (!draft || typeof draft !== "object") return [];
  const draftCalendar = (draft as { calendar?: unknown }).calendar;
  if (!draftCalendar || typeof draftCalendar !== "object") return [];

  const after = draftCalendar as Record<string, unknown>;
  const before = live.calendar as unknown as Record<string, unknown>;

  const changes: string[] = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    if (!(field in after)) continue;
    if (before[field] === after[field]) continue;
    changes.push(
      `${FIELD_LABELS[field]}：${describeSchoolValue(field, before[field])} → ${describeSchoolValue(field, after[field])}`
    );
  }
  return changes;
}
