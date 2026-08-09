# SPEC-03｜面相分析、AI 報告與原子扣點

## 1. 文件資訊

| 欄位 | 內容 |
|---|---|
| 版本 | 1.0.0 |
| 日期 | 2026-08-06 |
| 狀態 | Ready after SPEC-01/02 |
| 點數 | 完整報告固定 20 點／次 |

## 2. 概述

以「影像模型產生受限結構化觀察 → 巽風規則引擎解讀 → LLM 生成民俗文化報告」完成正式分析。只有通過 schema 與安全檢查的完整報告才扣點。

## 3. 範圍

### 包含

- 分析啟動 API、冪等與併發控制。
- 影像結構化觀察、十二宮／流年規則引擎。
- AI 報告生成與 Zod 驗證。
- 成功後原子扣 20 點。
- 儀式／掃描畫面與正式報告頁。

### 不包含

- 宣稱科學準確率或疾病診斷。
- 人格犯罪預測、受保護屬性推論。
- 真人老師服務與單次高階商品。
- 直接由 LLM 決定照片品質或點數。

## 4. 技術環境與約束

- API：`POST /api/face-analysis/runs/[id]/analyze`，Node runtime，`maxDuration` 依 Vercel 方案設置。
- 成本與點數：沿用有效 `member_entitlements`；固定 20 點，定義於 `lib/auth/face-tier.ts`，不得由 client/env 任意覆寫。
- 採 charge-on-success：先預檢餘額，合格報告生成並寫入後，再以 PostgreSQL function 原子扣點。
- 同一 `run_id` 完成後重送必須回既有結果，不再次呼叫 provider 或扣點。
- provider key、原始照片、signed URL 不得進 prompt log、model_trace 或錯誤訊息。
- Vision provider 必須設定禁止訓練／Zero Data Retention；若供應商無法滿足，功能不得上正式環境。OpenAI 不可只靠 `store:false` 判定，須由管理員確認 Platform Data controls 已核准並啟用 ZDR，再同時設定 `FACE_VISION_ZERO_RETENTION=true`、`FACE_VISION_RETENTION_MODE=zero_data_retention` 與核准日期。

## 5. 相依與執行順序

1. 建立 `lib/face-analysis/vision.ts` provider adapter。
2. 建立 `lib/face-analysis/rules.ts` 純函式規則引擎。
3. 建立 `lib/face-analysis/report-schema.ts`。
4. 建立 analyze route 與 run lock。
5. 建立 `commit_face_analysis_credit` migration `20260809160100_face_analysis_atomic_commit.sql`。
6. 建立掃描與報告 UI。
7. 建立安全、競態、fallback 與 E2E 測試。

## 6. 分析與輸出模型

### Vision 允許輸出

- 可見拍攝品質、臉部位置與幾何 landmark。
- 額、眉眼、鼻、口、下庭等區域的可見明暗、對稱與遮擋描述。
- 所有觀察必須附 `confidence` 0–1；低於門檻不得進規則引擎。

### 禁止輸出

- 身分辨識、與名人比對、真實年齡推測。
- 種族、國籍、宗教、政治、性傾向、疾病、身心障礙、犯罪傾向。
- 「此人能不能信」等由臉直接推論人格的確定性結論。

### 規則引擎輸入／輸出

規則引擎只吃 validated vision JSON、mode、subject_age，不直接讀圖片。輸出：`overallTrend`、`palaces[]`、`flowYear`、`observations[]`、`cautions[]`、`actionPlan[]`，每項包含規則 ID 與資料依據，便於稽核。

### 正式報告 schema

- `summary`：100–180 字。
- `photoQuality`：實際品質說明。
- `currentTrend`：趨勢式、非確定式語言。
- `palaces`：十二宮，每宮 `name/status/evidence/interpretation/advice`。
- `flowYear`：僅 subject_age 有值時產生九執／75 流年段落。
- `mode=self`：財務、事業、感情、人際、作息與 30/60/90 天行動。
- `mode=other`：只輸出合作／相處觀察框架，不宣稱信任、忠誠或人格真相。
- `disclaimer`：固定 server 文案，不由 LLM 自由生成。

### 失敗策略

- vision、schema、安全檢查或 final quality gate 失敗：run=`failed`，扣 0 點，可重試一次。
- 若報告已生成但原子扣點發生餘額競態：沿用 council 慣例，交付該份報告、`credits_charged=0`、寫警告事件，不重複生成。
- 不得以通用固定模板冒充成功的個人化報告。

## 7. 角色與權限

- 只有 run 擁有者可啟動與讀取報告。
- 有效 trial/basic/pro/vip 且餘額 >=20 才可啟動。
- 啟動前必須顯示「本次成功產出將扣 20 點」並重新勾選同意。
- admin 可查看執行狀態、成本與錯誤；預設不顯示原圖，查看短效預覽須留下 audit event。

## 8. 任務清單與驗收標準

- [ ] analyze route 對未登入、他人 run、品質未過、點數不足回正確 4xx。
- [ ] 每次分析以 DB lock/CAS 防止同一 run 併發執行。
- [ ] `commit_face_analysis_credit` 同 transaction 更新 balance、寫 debit transaction、更新 run。
- [ ] credit source 固定 `ai_face_analysis`，ref_id 使用 run id。
- [ ] provider 失敗、schema 失敗、timeout 均扣 0 點。
- [ ] 完成報告扣 20 點一次；相同請求重送餘額不變。
- [ ] 前端掃描中攔截關頁，重新進入後可依 run id 恢復狀態／結果。
- [ ] 報告不得出現敏感屬性、疾病診斷、保證獲利、犯罪或可信度斷言。
- [ ] 非人臉圖片永遠不得進 LLM。
- [ ] 針對兩個會員同時消耗同一 entitlement 的競態測試，餘額不得成為負數。

## 9. 非功能要求與 Agent 執行指示

- 建立 provider abstraction，第一個 provider 可替換，不把 SDK 呼叫散落於 route。
- 規則引擎必須有固定 fixture 的單元測試；相同結構化輸入產生相同規則結果。
- P95 報告時間目標 90 秒；timeout 時提供可恢復的狀態，不要求使用者重新上傳。
- usage_logs.type=`face_analysis`；只存必要摘要，不存圖片或完整 prompt。
- 完成後執行 build、單元、API、RLS、扣點競態與安全內容測試。
