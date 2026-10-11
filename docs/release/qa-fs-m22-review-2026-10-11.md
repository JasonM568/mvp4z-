# QA-FS-M22 發布審查單｜待 Tech Lead 簽核

**Goal / Problem：**事件寫入故障時，run 可能指向已刪照片。候選 `15631e7`（基底 `b04b08e`）以同一 RPC 交易寫 run 與 event。

**Users & Scenarios：**會員上傳、品質拒絕後重送、故障後重試；A/B 會員隔離。

**MVP Scope：**僅修上傳結果原子性與權限。**Out of Scope：**真品質服務、完整 UI、自動清理孤兒檔。

**User Stories：**會員故障後可在同一 run 重試；其他會員不能讀寫該 run。

**Acceptance Criteria：**X-QA 對 `15631e7`：M22 **29/29**、跨模組 **108/108**；故障後 run=`created`、path 空、Storage/event 0，重試成功；匿名／會員 RPC 拒絕。工程獨立空 DB **51/51** migration 重播、版本唯一、M19→C19→M21→M22、RPC ACL f/f/t 與 SQL 故障測試通過。證據：`docs/qa/full-system-acceptance-2026-10-11.md` M22、QA commit `87188e7`。正式站未驗；執行清單見 `qa-fs-m22-production-regression-plan-2026-10-11.md`。

**發布／回復：**先核正式專案與 migration drift、備份／回復演練及 B3 安全阻擋項；按核准計畫套四版 migration，再發布對應 app，最後由 QA 站端回歸。禁止盲目 `db push`。唯讀 Vercel 快照：`www.xunfeng.tw` 指向 READY `dpl_FLG1koTbFyVZzg5z927tL2iBerby`／SHA `1935618`；發布前須重查。失敗先回核准的前一 app；DB 不盲刪，依 Tech Lead 核准腳本修復。

**Risks / Open Questions：**正式 history 49 版、候選 51 版，重疊 38；九組舊版 SQL 去註解後一致，但版本號及歷史效果未全證；兩版 CianRou 只在正式端。逐版與退款證據見 `m22-migration-drift-review-2026-10-11.md`、`m22-manual-refunds-drift-review-2026-10-11.md`。M19～M22 尚未套，正式庫缺 M21 lease 欄與 M22 RPC；runtime ref、復原能力待證。Storage 補償失敗可留孤兒檔；由固定 path＋`upsert:false` 推論，同 run 重試可能卡住並再耗 attempt，隔離故障注入待驗。建議人工比對 path、DB 引用、run 狀態與 lease 後逐檔處理。history 對映、退款 ACL/RLS、安全緩衝、值班人、回復 SQL、整合順序及部署窗口待 Tech Lead 決定。未 push／部署／改正式庫；M22 critical 票仍開。

**決策選項：**建議先審退款版號正規化、CianRou 歸屬、其餘 history 對映與回復演練，再受控逐版發布；優點是可追溯，代價是延後修復。維持現況可避免未審核資料庫變更，但 M22 缺陷持續存在。Tech Lead 應明確選擇並記錄剩餘風險。

**Handoff Notes：**Backend：正式庫唯讀盤點／逐版方案／ACL；Frontend：錯誤提示／重試／狀態；Mobile：窄螢幕提示／重送／狀態；QA：權限／故障重試／並發與點數 Storage 回歸。

**Tech Lead 簽核：**審核人／日期 ___；[ ] drift 逐版對照與套用順序 [ ] 正式 runtime ref、備份與回復演練 [ ] B3 整合先後 [ ] Storage 孤兒檔人工處置 [ ] QA 零付費測試路徑。結論：核准／退回／附條件 ___；部署授權 ___；正式 QA 結果 ___。目前全項未簽，M22 不關票。
