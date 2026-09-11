// 課程報名的跟進狀態。
//
// 與付款狀態刻意分開：付款由 orders 表達，這裡表達的是「人有沒有被聯繫到」。
// 沒付款的報名才是最需要打電話的那一批，用付款狀態去篩會剛好把他們濾掉。

import { z } from "zod";

export const CONTACT_STATUSES = ["new", "contacted", "converted", "closed"] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** 後台顯示用。值刻意少——狀態一多，實務上就沒人維護了。 */
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "待聯繫",
  contacted: "已聯繫",
  converted: "已完成報名",
  closed: "已結案"
};

export const CONTACT_STATUS_HINTS: Record<ContactStatus, string> = {
  new: "還沒有人聯繫過這位報名者",
  contacted: "已聯繫，等對方回覆或再約時間",
  converted: "已完成報名，含線下補款、改期或轉其他梯次",
  closed: "婉拒、重複報名或聯絡不上"
};

export const adminRegistrationUpdateSchema = z
  .object({
    contact_status: z.enum(CONTACT_STATUSES).optional(),
    // 允許空字串＝清空備註。用 nullable 會讓前端得區分 null 與 ""，徒增分支。
    contact_note: z.string().max(2000).optional()
  })
  .refine((value) => value.contact_status !== undefined || value.contact_note !== undefined, {
    message: "沒有可更新的欄位"
  });

export type AdminRegistrationUpdate = z.infer<typeof adminRegistrationUpdateSchema>;
