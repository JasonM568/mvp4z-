# SPEC-01｜面相分析基礎建設、資料與隱私

## 1. 文件資訊

| 欄位 | 內容 |
|---|---|
| 版本 | 1.0.0 |
| 日期 | 2026-08-06 |
| 狀態 | Ready for implementation |
| 專案 | `xunfeng-official-v2` |
| 相依 | 現有 Supabase Auth、profiles、member_entitlements、usage_logs |

## 2. 概述

為 `/member-ai/face` 建立後端可信的資料模型、私有照片儲存、RLS、報告生命週期及共用型別。此 SPEC 只建立地基，不實作相機 UI 或 AI 報告。

## 3. 範圍

### 包含

- 新增私有 Storage bucket `face-analysis-uploads`。
- 新增 `face_analysis_runs` 與 `face_analysis_events`。
- 建立會員本人與 admin 的 RLS。
- 建立照片保存期限與刪除狀態。
- 建立 TypeScript/Zod 共用 schema。

### 不包含

- 人臉偵測與品質演算法。
- LLM 呼叫、扣點、報告 UI。
- 任務換點、推薦碼、單次商品金流。

## 4. 技術環境與約束

- migration 接續易學後台的 0015～0017，建立 `supabase/migrations/0018_face_analysis_foundation.sql`。
- `service_role` 只能在 server-side 使用。
- 原始照片不得寫入 `public/assets`、Git、log、usage_logs.prompt 或第三方分析服務。
- Storage bucket 必須 private；下載只允許短效 signed URL，最長 5 分鐘。
- 照片 object path：`{profile_id}/{run_id}/source.{ext}`，不得使用原始檔名。
- 支援 JPEG、PNG、WebP；上限 10 MB；解碼後最長邊上限 4096 px。
- API 不得接受 client 傳入的 `user_id`、`credits_charged` 或分析成功狀態。

## 5. 相依與執行順序

1. 新增 migration 與 RLS。
2. 新增 `lib/face-analysis/schema.ts`。
3. 新增 `lib/face-analysis/types.ts`。
4. 建立 Storage 管理 helper。
5. 補 migration/RLS 自動測試。

## 6. 資料模型

### `face_analysis_runs`

| 欄位 | 型別 | 規則 |
|---|---|---|
| id | uuid | PK，`gen_random_uuid()` |
| request_id | uuid | unique，供冪等 |
| user_id | uuid | FK profiles，not null |
| entitlement_id | uuid | FK member_entitlements，可於免費品質檢測階段為 null |
| mode | text | `self` / `other` |
| subject_age | integer | null 或 1–120 |
| consent_version | text | not null |
| third_party_consent | boolean | mode=other 時必須 true |
| status | text | `created/uploaded/quality_rejected/analyzing/completed/failed/deleted` |
| storage_path | text | nullable，禁止回傳至一般列表 API |
| mime_type | text | allowlist |
| file_size | integer | 1–10485760 |
| width/height | integer | nullable，解碼後寫入 |
| quality_result | jsonb | 結構見下方 |
| vision_result | jsonb | 僅保存允許的非敏感結構化觀察 |
| report_structured | jsonb | nullable |
| report_text | text | nullable |
| model_trace | jsonb | provider、model、token、latency；不得含照片 |
| usage_log_id | uuid | FK usage_logs |
| credits_charged | integer | default 0，>=0 |
| error_code | text | nullable，禁止存 secret/完整 provider payload |
| image_expires_at | timestamptz | 預設 created_at + 24 hours |
| image_deleted_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| created_at/updated_at | timestamptz | not null |

約束：`mode='other'` 時 `third_party_consent=true`；`status='completed'` 時 `report_text` 與 `report_structured` 必須存在。

### `quality_result` JSON

```json
{
  "faceCount": 1,
  "faceCoverage": 0.42,
  "blurScore": 0.88,
  "brightnessScore": 0.74,
  "pose": { "yaw": 2.1, "pitch": -1.4, "roll": 0.8 },
  "occlusion": { "eyes": false, "nose": false, "mouth": false },
  "passed": true,
  "reasons": []
}
```

所有 score 正規化為 0–1；門檻集中於 `lib/face-analysis/config.ts`，不得散落在 UI。

### `face_analysis_events`

保存狀態轉換與管理操作：`run_id`、`user_id`、`event_type`、`metadata`、`created_at`。metadata 不得存照片、完整報告或敏感憑證。

## 7. 角色與權限

| 動作 | 訪客 | 會員本人 | Admin |
|---|---:|---:|---:|
| 建立分析 | 否 | 是 | 是 |
| 讀取自己的報告 | 否 | 是 | 是 |
| 讀取他人報告 | 否 | 否 | 是 |
| 直接讀 Storage object | 否 | 否 | 否 |
| 取得短效預覽 URL | 否 | 僅自己、未過期 | 是 |
| 刪除自己的照片／報告 | 否 | 是 | 是 |
| 修改扣點或完成狀態 | 否 | 否 | 僅 server service role |

## 8. 任務清單與驗收標準

- [ ] 建立兩張表、索引、check constraint、updated_at trigger。
- [ ] 對兩表啟用 RLS；client 不可 insert/update 任意 user_id。
- [ ] 建立 private bucket 與 object policy。
- [ ] 提供 `createRun`、`storePrivateImage`、`deleteRunImage` server helper。
- [ ] 提供 Zod schema，拒絕未知 mode、超齡、錯誤 MIME 與超大檔。
- [ ] migration 重跑不造成重複 policy/bucket 或資料破壞。
- [ ] 測試會員 A 無法取得會員 B 的 run 或 signed URL。
- [ ] log 掃描確認不出現 Base64、signed URL、service role key。

## 9. 非功能要求與 Agent 執行指示

- 所有 DB 狀態以 server 為準；禁止先在前端假設成功。
- 不修改既有 migration；新增 0015。
- 保持現有 RLS/admin 慣例與命名方式。
- 完成後執行 typecheck/build 與新增的資料層測試，附 migration 套用與 rollback 說明。
