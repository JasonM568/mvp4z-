# M22 正式站安全回歸計畫（僅規劃，未執行）

關聯審查單：[QA-FS-M22](qa-fs-m22-review-2026-10-11.md)。執行前須由 Tech Lead 核准部署、資料清理與零付費品質測試路徑，確認正式專案、備份／回復方案、B3 安全 gate、核准 migration 清單與 app SHA 相符。僅用專用 QA 帳號、全新 run、合成照片；不使用真實會員／照片。若正式站沒有可核准的零付費品質路徑，品質拒絕→合格及其寫入檢查只在隔離／preview 執行，正式站記「未驗」，不可判通過。**正式庫禁止安裝 event INSERT 故障 trigger；故障注入及同 claim 重試只在隔離／preview。**

**發布前置更新：**另有 critical [QA-FS-M23](../qa/qa-fs-m23-face-storage-compensation-orphan-2026-10-11.md)。`15631e7` 單獨發布不能解除雙故障孤兒照片與同格式重試受阻。M23 Option A 僅為隔離原型，尚缺 reconciler、真 Storage 故障驗證、完整 migration replay 與 Tech Lead 採納；正式執行前須以核准的整合 SHA、migration 清單及 M23 驗收結果取代本計畫的 M22 專用欄位。

| 項目／步驟 | 預期與證據 | 清理 |
|---|---|---|
| 發布核對：唯讀查版本、ACL、站點與健康狀態 | 部署 SHA 與核准版一致；M19 `12010000`→C19 `12020000`→M21 `12030000`→M22 `12040000`，以及核准的 M23 版本均有唯一 history；anon／authenticated 不可執行 upload-result RPC，service_role 可執行；無未解 migration drift／5xx | 無測試資料 |
| 授權：匿名、A 帳號操作 B 的 run；A 操作自有 run | 匿名 401；跨帳號 404／拒絕且 B 的 run、Storage、event、點數不變；自有 run 可進流程。保留去識別化 HTTP 與 DB 前後快照 | 刪除專用 A/B run；如新建 QA 帳號，按核准流程刪除 |
| 品質流程：A 的同一 run 先提交合成不合格圖、再提交合格圖 | 拒絕後 `quality_rejected`、無私有照片、點數／ledger 不變；合格後 `uploaded`、私有 Storage 僅 1 物件、`quality_rejected`／`quality_passed` 各 1 event、claim 已釋放、attempts=2；上傳階段不扣點。保留回應、run／event／Storage／餘額快照 | 先保存去識別化證據，再依核准刪除 run、物件、專用帳號；核對殘留 0 |
| 同 run 重送：合格後再送、同時送兩次；錯檔／空檔 | 已完成 run 回 409；並發至多 1 次完成，其餘 409，不增重複 event／物件／扣點；空檔 400 且 attempts 不增。記錄每個 HTTP 狀態及最終 DB／Storage | 同上；不得碰其他會員資料 |
| 前端：桌機與 320／375 px，拒絕→重試→合格、載入與錯誤狀態 | 提示可讀、按鈕忙碌時防重送、無橫向溢出或遮擋；品質檢查免費與完整報告扣點時點清楚。保存遮蔽個資截圖 | 清瀏覽器 QA session／本機檔案 |
| 隔離／preview 專項：event INSERT 故障後同 claim 重試 | 首次 500，run 仍 `created`、path 空、Storage／event 0；解除故障後同 run 成功，path 指向存在物件，event 1；不用正式庫 trigger | 移除故障注入；專用 run／Storage／帳號殘留 0 |

**執行紀錄欄（待填）：**核准單／Tech Lead ___；正式專案 ref（不含密鑰）___；前版 SHA ___／部署 SHA ___／Vercel deployment ID ___；核准 migration history 與時間（M19→C19→M21→M22，若納 M23 則續列）___；QA 帳號代號／run ID ___；測試窗口／操作者 ___；零付費路徑核准證據 ___；逐項結果／證據連結 ___；清理人／時間／殘留核對 ___。

**放行條件：**核准版、版本／ACL、授權、可執行案例及清理均通過，無未處置 BLOCKER／critical；M23 須有可驗證的單物件恢復與同格式重試結果。未能在正式站安全執行者明列「未驗」並由 Tech Lead 決定是否接受剩餘風險。**立即停止／回退觸發：**跨會員存取、非預期扣點或付費模型呼叫、run 指向不存在照片、重複 event／物件、持續 5xx、版本／ACL 不符、QA 資料無法清淨。先停止測試與流量放行、保存去識別化證據並通知 Tech Lead；DB 不自行回滾或刪 migration。若 M23 採用每次上傳獨立路徑，舊 M22 app 無法讀取新路徑，須先備妥可讀新舊路徑的核准回退版本，不得直接回前一 SHA。
