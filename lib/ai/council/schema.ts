// 巽風 council API 輸入驗證
// 對應前台 app/member-ai/decision/page.tsx 送來的表單結構

import { z } from "zod";

export const councilSchema = z.object({
  question: z.string().trim().min(2, "請輸入問題").max(2000, "問題過長"),
  context: z.string().trim().max(4000).optional().default(""),
  topic: z.string().trim().max(40).optional(),
  deliverableMode: z.string().trim().max(40).optional(),
  clientProfile: z.string().trim().max(120).optional(),
  yixue: z
    .object({
      clientName: z.string().trim().max(40).optional(),
      gender: z.string().trim().max(20).optional(),
      birth: z
        .object({
          calendar: z.string().optional(),
          isLeapMonth: z.string().optional(),
          year: z.union([z.number(), z.string()]).optional(),
          month: z.union([z.number(), z.string()]).optional(),
          day: z.union([z.number(), z.string()]).optional(),
          hourBranch: z.string().optional(),
          timeKnown: z.string().optional()
        })
        .optional(),
      eventTime: z
        .object({
          year: z.union([z.number(), z.string()]).optional(),
          month: z.union([z.number(), z.string()]).optional(),
          day: z.union([z.number(), z.string()]).optional(),
          hour: z.union([z.number(), z.string()]).optional(),
          minute: z.union([z.number(), z.string()]).optional()
        })
        .optional(),
      modules: z
        .object({
          bazi: z.boolean().optional(),
          qimen: z.boolean().optional(),
          liuyao: z.boolean().optional(),
          meihua: z.boolean().optional()
        })
        .optional(),
      qimen: z
        .object({
          mode: z.string().optional(),
          direction: z.string().optional()
        })
        .optional(),
      liuyao: z
        .object({
          mode: z.string().optional(),
          yao: z.array(z.string()).optional()
        })
        .optional(),
      meihua: z
        .object({
          mode: z.string().optional(),
          upperTrigram: z.string().optional(),
          lowerTrigram: z.string().optional()
        })
        .optional()
    })
    .optional()
});

export type CouncilRequest = z.infer<typeof councilSchema>;
