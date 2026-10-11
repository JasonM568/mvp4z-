# QA-FS-M23｜面相照片雙故障後孤兒檔與重送受阻

**狀態／嚴重度：**新開、待 X-PM 排序與 Tech Lead 審核；**critical（復原能力與私有照片留存）**。屬 M22 邊界的新票，不把 M22 原子 DB 修補判為失敗；候選 `15631e7` 未修改、未部署。

**影響：**面相品質合格上傳。DB `record_face_upload_result` 事件 INSERT 失敗使 run/event 交易回滾；若 Storage 補償 `remove` 同時失敗，固定 `source.<ext>` 仍存私有照片，run 卻無 `storage_path`。相同格式重送會先撞 `upsert:false`，消耗最多 5 次品質檢查額度，使用者可能無法在同一 run 完成；照片亦不在 DB 引用與一般 run 清理路徑內。這是**未引用私有資料留存風險**，目前沒有照片公開外洩證據。

**重現（只用隔離 QA run／合成照片與可控 stub）：**
1. 建立專用會員與 `created` run；在該 run 精確注入 `face_analysis_events` INSERT 故障，品質服務回合格；令 Storage 首次 upload 成功、補償 remove 失敗。
2. POST `/api/face-analysis/runs/{runId}/upload`；記錄 HTTP、run／event／claim／attempt、精確 Storage key 與點數。
3. 解除 event 故障，以上次相同 normalized extension 重送；檢查是否在 Storage upload 遇既存 key；再測上限前後的重送結果。測畢清除故障與專用 fixture／物件。

**預期／實際與證據邊界：**預期失敗後不留無引用的私有物件，或有持久、可稽核、精確到單一 key 的補清與安全重試機制；不因系統故障使同 run 永久無法上傳。工程唯讀審核與一次 disposable route stateful stub 見 `/private/tmp/xunfeng-m22-storage-compensation-failure-review-2026-10-11.md`。QA 自有 `scripts/qa-m23-storage-double-fault.test.ts` 導入候選 route 與真 Storage helper，以隔離 DB／Storage／品質替身重現 **1/1**：首次 HTTP 500、run=`created`／path NULL／event 0／claim 釋放／attempt 1，但物件 1；同 extension 第 2～5 次均 409／attempt 增至 5，第 6 次 429。候選 route 的 `.catch(() => false)`、固定 path 與 `upsert:false` 支持此路徑。**真 Supabase Storage remove 故障、真 Storage duplicate 狀態碼、跨服務 HTTP＋DB＋Storage 雙故障尚未實測；上述 HTTP 是隔離 route 呼叫與替身回應，不是實際網路端點。**

**驗收標準：**
- 雙故障後 run/event 仍一致，沒有 run 指向不存在的照片；每個已寫入而未引用的私有 key 有可靠的留存紀錄、告警與可稽核補清路徑，或確實被安全移除。不得以 prefix-wide 刪除或 `upsert:true` 覆蓋來掩蓋競態。
- 同 extension 的後續重送可在有界時間內恢復，或明確引導使用者建立新 run 並確保舊孤兒檔被清除；不得靜默耗盡 attempts。是否返還／重設次數屬產品規則，由 X-PM／Tech Lead 決定。
- 單 key 清理須核對 profile/run、DB 引用、claim／stale worker 與物件清單；不得刪有引用照片或 `report.pdf`。匿名與其他會員不可讀取或清理該照片；點數／ledger 不變。
- 在隔離環境以 QA 自有 fixture 重跑雙故障、同格式重試與正常拒絕→合格、N=2 並發；逐次比對 HTTP、run、event、Storage、claim、attempt、點數，結束後 fixture／孤兒檔 0。正式庫不得安裝故障 trigger。

**派工／複驗：**X-PM 排優先序、工程1提出設計；QA 以獨立 stub 先確認路由狀態，再以可精確注入的隔離 Storage／DB 完成跨服務複驗。正式部署與會員驗收另設 gate；本票未修／未驗時明列剩餘風險。
