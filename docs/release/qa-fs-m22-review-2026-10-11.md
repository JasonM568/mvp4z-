# QA-FS-M22 發布審查單｜待 Tech Lead 簽核

**Goal / Problem：**事件寫入故障時，run 可能指向已刪照片。候選 `15631e7`（基底 `b04b08e`）以同一 RPC 交易寫 run 與 event。

**Users & Scenarios：**會員上傳、品質拒絕後重送、故障後重試；A/B 會員隔離。

**MVP Scope：**僅修上傳結果原子性與權限。**Out of Scope：**真品質服務、完整 UI、自動清理孤兒檔。

**User Stories：**會員故障後可在同一 run 重試；其他會員不能讀寫該 run。

**Acceptance Criteria：**X-QA 對 `15631e7`：M22 **29/29**、跨模組 **108/108**；故障後 run=`created`、path 空、Storage/event 0，重試成功；匿名／會員 RPC 拒絕。工程獨立空 DB **51/51** migration 重播、版本唯一、M19→C19→M21→M22、RPC ACL f/f/t 與 SQL 故障測試通過。證據：`docs/qa/full-system-acceptance-2026-10-11.md` M22、QA commit `87188e7`。正式站未驗；執行清單見 `qa-fs-m22-production-regression-plan-2026-10-11.md`。

**發布／回復：**先核正式專案與 migration drift、備份／回復演練及 B3 安全阻擋項；按核准計畫套四版 migration，再發布對應 app，最後由 QA 站端回歸。禁止盲目 `db push`。失敗先回前一已驗證 app；DB 不盲刪，依 Tech Lead 核准腳本修復。

**Risks / Open Questions：**工程唯讀 preflight：正式 history 49 版，與候選共 38 版；remote-only 11、candidate-only 13，四版 M19～M22 均未套；正式庫缺 M21 lease 欄與 M22 RPC。正式站 runtime ref 尚未核實，備份復原能力待證。Storage 補償失敗可留孤兒檔；建議人工比對 path、DB 引用、run 狀態與 lease 後逐檔處理。drift 等價性、安全緩衝、值班人、回復 SQL、整合順序及部署窗口待 Tech Lead 決定。未 push／部署／改正式庫；M22 critical 票仍開。

**Handoff Notes：**Backend：正式庫唯讀盤點／逐版方案／ACL；Frontend：錯誤提示／重試／狀態；Mobile：窄螢幕提示／重送／狀態；QA：權限／故障重試／並發與點數 Storage 回歸。

**Tech Lead 簽核：**審核人／日期 ___；[ ] drift 逐版對照與套用順序 [ ] 正式 runtime ref、備份與回復演練 [ ] B3 整合先後 [ ] Storage 孤兒檔人工處置 [ ] QA 零付費測試路徑。結論：核准／退回／附條件 ___；部署授權 ___；正式 QA 結果 ___。目前全項未簽，M22 不關票。
