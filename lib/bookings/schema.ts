// 巽風預約諮詢｜資料驗證
// 公開表單接受訪客送出，admin 端有更寬鬆的編輯權限

import { z } from "zod";

export const BOOKING_STATUSES = ["pending", "contacted", "confirmed", "completed", "cancelled", "spam"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const publicBookingSchema = z.object({
  name: z.string().trim().min(1, "請填寫姓名").max(80),
  email: z.string().trim().email("Email 格式錯誤").max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(80).optional().or(z.literal("")),
  service: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  size: z.string().trim().max(80).optional(),
  budget: z.string().trim().max(80).optional(),
  urgency: z.string().trim().max(80).optional(),
  schedule: z.string().trim().max(120).optional(),
  message: z.string().trim().max(4000).optional(),
  source: z.string().trim().max(40).optional()
}).refine((data) => data.email || data.phone, {
  message: "請至少填寫 Email 或電話 / LINE 其中之一",
  path: ["email"]
});

export const adminBookingUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  admin_note: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  follow_up_at: z.string().datetime().nullable().optional()
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
export type AdminBookingUpdate = z.infer<typeof adminBookingUpdateSchema>;
