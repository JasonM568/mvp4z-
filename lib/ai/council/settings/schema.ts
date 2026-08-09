// 巽風 council｜報告設定資料結構
//
// 這裡定義的是「風羿老師可以在後台編輯的專業內容」的欄位結構。
// 結構由程式決定（老師填欄位，不自由編輯整段 prompt），內容存在 DB。
//
// 三條紅線：
// 1. 任何欄位缺漏或驗證失敗，runtime 一律回退 DEFAULT_PROMPT_SETTINGS，
//    絕不讓後台設定問題打斷正在收費的報告路徑。
// 2. isLocked 的條目不得刪除——那些是刪掉會出事的（品牌露餡、技術字眼外洩）。
// 3. 含 token 的欄位若把 token 刪掉，存檔時要擋下來並說明原因。

import { z } from "zod";

// 可用變數與說明拆到 tokens.ts（不含 zod），讓後台頁面能只 import 常數
// 而不把 zod 拖進瀏覽器 bundle。這裡 re-export 保持既有 import 路徑可用。
export { PROMPT_TOKENS, TOKEN_DESCRIPTIONS } from "./tokens";
import { PROMPT_TOKENS } from "./tokens";

/**
 * 條列項目。isLocked 的不可刪除（後台會鎖住刪除鍵），但仍可微調文字。
 * requiredTokens 列出這條必須保留的變數，存檔時驗證。
 */
export const ruleItemSchema = z.object({
  text: z.string().trim().min(1, "條文不可空白").max(500, "單條規則請控制在 500 字內"),
  isLocked: z.boolean().default(false),
  requiredTokens: z.array(z.string()).default([]),
  /** 鎖定原因，顯示在後台讓老師知道為什麼不能刪。 */
  lockReason: z.string().default("")
});

export const personaSchema = z.object({
  /** 後台顯示用的分頁標籤，例如「主判讀分身」。 */
  label: z.string().trim().min(1),
  /** 人設描述，一行一句。 */
  lines: z.array(z.string().trim().min(1)).min(1, "至少要有一行人設描述"),
  /** 只有最終定稿分身用得到：報告必須包含的段落標題清單。 */
  formatHeading: z.string().default(""),
  formatItems: z.array(z.string().trim().min(1)).default([])
});

export const titledSectionSchema = z.object({
  title: z.string().trim().min(1, "段落標題不可空白"),
  items: z.array(z.string().trim().min(1)).default([]),
  body: z.string().default("")
});

export const actionWindowSchema = z.object({
  label: z.string().trim().min(1, "期別名稱不可空白"),
  fields: z.array(z.string().trim().min(1)).min(1, "每一期至少要有一個欄位")
});

export const termWeightsSchema = z.object({
  bazi: z.number().int().min(0).max(100),
  qimen: z.number().int().min(0).max(100),
  liuyao: z.number().int().min(0).max(100),
  meihua: z.number().int().min(0).max(100)
});

/** 兜底報告：LLM 全部失敗時交付的稿。這條路徑不扣點，改壞不影響收費。 */
export const fallbackReportSchema = z.object({
  reportTitle: z.string().trim().min(1),
  overview: titledSectionSchema,
  completeness: z.object({
    title: z.string().trim().min(1),
    headerRow: z.string().trim().min(1),
    rows: z.record(z.string(), z.string())
  }),
  termReadings: z.record(z.string(), z.string()),
  crossValidation: titledSectionSchema,
  actionPlan: z.object({ title: z.string().trim().min(1), windows: z.array(actionWindowSchema).min(1) }),
  finalAdvice: titledSectionSchema,
  disclaimer: titledSectionSchema,
  weights: termWeightsSchema
});

export const promptSettingsSchema = z.object({
  /** 給後台顯示的版本備註，不進 prompt。 */
  note: z.string().default(""),

  brand: z.object({
    heading: z.string().trim().min(1),
    items: z.array(ruleItemSchema).min(1)
  }),

  personas: z.object({
    main: personaSchema,
    strategy: personaSchema,
    attack: personaSchema,
    final: personaSchema
  }),

  qualityGate: z.object({
    heading: z.string().trim().min(1),
    brandRules: z.object({ title: z.string().trim().min(1), items: z.array(ruleItemSchema).min(1) }),
    formatRules: z.object({ title: z.string().trim().min(1), items: z.array(ruleItemSchema).min(1) }),
    contentRules: z.object({ title: z.string().trim().min(1), items: z.array(ruleItemSchema).min(1) })
  }),

  reportSkeleton: z.object({
    heading: z.string().trim().min(1),
    formatRules: z.object({ title: z.string().trim().min(1), items: z.array(ruleItemSchema).min(1) }),
    termInstruction: z.object({ title: z.string().trim().min(1), body: z.string().trim().min(1) }),
    layoutHeading: z.string().trim().min(1),
    reportTitle: z.string().trim().min(1),
    overview: titledSectionSchema,
    completeness: z.object({
      title: z.string().trim().min(1),
      intro: z.string().trim().min(1),
      headerRow: z.string().trim().min(1)
    }),
    /** 每一術獨立判讀的固定小節，各術共用。 */
    termSubsections: z.array(z.string().trim().min(1)).min(1),
    crossValidation: titledSectionSchema,
    actionPlan: z.object({ title: z.string().trim().min(1), windows: z.array(actionWindowSchema).min(1) }),
    finalRecommendation: titledSectionSchema,
    disclaimer: titledSectionSchema
  }),

  fallbackReport: fallbackReportSchema,

  /**
   * 老師勾選要納入 prompt 的文件。由文件庫管理，這裡只存 id 與當下字數，
   * 讓渲染端不必再查一次 DB，也讓歷史版本能還原當時納入了哪些文件。
   */
  includedDocuments: z
    .array(z.object({ id: z.string(), title: z.string(), charCount: z.number().int().min(0) }))
    .default([])
});

export type PromptSettings = z.infer<typeof promptSettingsSchema>;
export type RuleItem = z.infer<typeof ruleItemSchema>;
export type Persona = z.infer<typeof personaSchema>;

/**
 * 納入 prompt 的文件總字數上限。
 *
 * 為什麼要有上限：這些文字會跟著 prompt 一起注入，而一份報告的 prompt
 * 會被送出 7 次（三個模型各兩輪 + 終稿），字數成本是七倍，
 * 而且 prompt 過長會擠壓每次呼叫 45 秒的視窗導致逾時。
 */
export const DOCUMENT_CHAR_BUDGET = 6000;
