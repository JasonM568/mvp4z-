# SPEC-04｜面相報告紀錄、刪除與管理後台

## 1. 文件資訊

| 欄位 | 內容 |
|---|---|
| 版本 | 1.0.0 |
| 日期 | 2026-08-06 |
| 狀態 | Ready after SPEC-01/02/03 |

## 2. 概述

提供會員歷史報告、資料刪除、逾期照片清理、管理員營運觀測與稽核能力，使面相功能具備正式營運所需的隱私與維運閉環。

## 3. 範圍

### 包含

- 會員自己的報告列表、詳情與刪除。
- 24 小時照片清理 cron。
- admin 執行紀錄、錯誤、成本與點數查詢。
- 隱私政策與同意版本更新。
- 基礎漏斗指標。

### 不包含

- 真人老師批改工作台。
- 社群分享公開連結。
- 推薦碼、任務換點、行銷自動化。
- 模型訓練資料集建立。

## 4. 技術環境與約束

- 會員列表不得回傳 `storage_path`、provider 原始 payload 或內部 prompt。
- 刪除為使用者明確操作：照片立即刪除；報告可選擇只刪照片或刪除整筆。
- 整筆刪除須保留最小化財務稽核資料（run id、user id、credits charged、時間、刪除時間），報告內容與 vision_result 清空。
- cron endpoint 必須使用既有 Vercel cron 驗證慣例，批次處理且可重入。
- admin 查看任何照片預覽均需寫 `face_analysis_events`。

## 5. 相依與執行順序

1. 建立會員 history API 與頁面。
2. 建立 delete API 與 Storage 清理。
3. 建立 `/api/cron/cleanup-face-images` 與 `vercel.json` 排程。
4. 建立 `/admin/face-analysis` 列表與詳情。
5. 更新隱私頁、同意文案與營運指標。

## 6. API 與畫面

- `GET /api/face-analysis/runs?cursor=&limit=20`：只回本人 completed/failed runs。
- `GET /api/face-analysis/runs/{id}`：本人報告詳情。
- `DELETE /api/face-analysis/runs/{id}/image`：立即刪原圖並寫 event。
- `DELETE /api/face-analysis/runs/{id}`：清除報告內容與圖片，保留最小稽核 stub。
- `POST /api/cron/cleanup-face-images`：每小時排程，兩件事——(1) 刪除 `image_expires_at <= now()` 且未刪的 object；(2) 收尾逾時 run：`created` > 30 分鐘與 `uploaded` / `quality_rejected` > 24 小時標為 `expired`，`analyzing` > 15 分鐘標為 `failed`（`ANALYSIS_TIMEOUT`）。沒有 (2)，中斷的任務會永遠算在併發額度裡，累積後該會員建立新任務會一直被 429 擋下。
- `GET /api/admin/face-analysis`：admin filter status/date/model/error，server-side pagination。
- `GET /api/admin/face-analysis/{id}`：成本、token、latency、quality、規則 trace 與 audit；預設不含圖片。

會員頁顯示日期、模式、狀態、報告摘要、扣點、照片是否已刪除；不得用人臉縮圖作永久歷史封面。

## 7. 角色與權限

| 功能 | 會員本人 | Admin |
|---|---:|---:|
| 讀報告 | 是 | 是 |
| 刪自己照片／報告 | 是 | 是 |
| 讀模型成本與錯誤 trace | 否 | 是 |
| 看原圖 | 僅 24h 內自己的短效預覽 | 需明確操作＋audit |
| 調整點數 | 否 | 沿用既有 admin credits API |

## 8. 任務清單與驗收標準

- [ ] 會員 A 無法透過修改 id 取得／刪除會員 B 資料。
- [ ] 刪除圖片後 Storage object 不存在、signed URL 失效、`image_deleted_at` 有值。
- [ ] 整筆刪除後 report、vision、quality、storage_path 清空，財務 stub 保留。
- [ ] cron 重複執行不報錯、不重複刪除、不影響未到期圖片。
- [ ] admin 每次請求圖片預覽都產生 audit event，URL 五分鐘內失效。
- [ ] 儀表板可看：開始數、品質通過率、分析成功率、平均耗時、平均成本、扣點總額、主要失敗碼。
- [ ] 指標不得保存或呈現臉部照片、姓名、email 等不必要個資。
- [ ] privacy 頁明示處理目的、第三方 AI、保存期限、刪除方式、第三人照片同意與免責。
- [ ] 全流程通過 `npm run build`，既有 council、chat、付款與會員頁無 regression。

## 9. 非功能要求與 Agent 執行指示

- 列表採 cursor pagination，禁止一次撈全表。
- admin filter 欄位建立必要索引；避免把 JSON 大欄位放進列表 select。
- cron 每批最多 100 筆，個別失敗不中止整批，失敗寫 event 供下次重試。
- 保持既有 admin shell、CSS 與 server-side admin 驗證方式。
- 提交時附資料刪除測試紀錄、cron 重入測試及隱私資料流清單。
