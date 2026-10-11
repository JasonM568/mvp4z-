# QA-FS-C23：provider 開票成功後 invoice row INSERT 失敗，重送再次呼叫 provider

**嚴重度：critical（外部重複開票風險，provider 去重語意待確認）**　**狀態：碰撞修補候選隔離複驗通過；provider 故障恢復及整合 release gate 未完成**

## 重現證據

範圍：`POST /api/admin/invoices/{orderId}/issue`、`POST /api/payments/ecpay/notify` 與真實 `issueInvoiceFromOrder` helper。QA 使用本機 EZPay provider stub、記憶體 Supabase client；沒有 EZPay 網路呼叫、真資料庫、正式訂單或發票。

可重複命令：

```sh
npx vitest run --config scripts/qa-invoice-provider-success-row-failure.vitest.mts
```

結果 **2/2 通過（缺陷重現）**；`npx tsc --noEmit` 通過。

1. 以隔離 paid order 送出開票請求。
2. provider stub 回傳成功及發票號碼。
3. 注入第一次 `invoices` INSERT 回 error。
4. API 回 500；發票列 0、audit 0；provider 呼叫 1 次。
5. 對同一 order 重送。因查不到 pending／issued invoice，helper 再呼叫 provider；第二次 stub 成功後才插入 1 筆 issued row，API 回 200、audit 1。

**預期：**第一次外部操作結果不確定時，不得在沒有冪等保護下再次開票；需可用 merchant order key 查回／對帳 provider 結果，並持久化可重試狀態。

**實際：**相同 `merchantOrderNo=QA_ORDER_20261011` 對 provider 發出兩次呼叫；第二次得到不同 stub 發票號碼並落一筆 row。證實 helper/route 會重複呼叫 provider；**EZPay 是否會拒絕或去重相同 merchantOrderNo、正式是否可能產生兩張發票未實測**。不得將 stub 結果描述為真實重複發票。

同一測試設定 provider barrier，令 N=10 個同單請求都先完成「查無 active invoice」並呼叫 provider，再同時回傳 provider success。結果為 provider calls **10**；DB unique index `idx_invoices_order_provider_active` 在 stub 中只允許一筆本地 active invoice row，其餘 9 次 INSERT 回 500。這證明唯一索引只能保護本地列，無法阻止外部 provider 被重複呼叫；10 次遠端呼叫是否會簽發多張仍取決於 EZPay 契約，尚未測。

另以 `npx vitest run --config scripts/qa-invoice-notify-provider-retry-after-row-failure.vitest.mts` 驗付款通知重送 **1/1 通過（缺陷重現）**：第一次 provider success 後 invoice INSERT error，notify 仍回 HTTP 200 `1|OK` 並送管理員告警；相同通知重送再次呼叫 provider，最後才有 1 invoice row。helper 會將 `merchantOrderNo` 截至 20 字，本例兩次呼叫皆收到同一截短值。此 stub 不證明 ECPay／EZPay 遠端通知時序或 provider 去重。

付款通知重現步驟：送有效簽章的隔離付款 callback（測試以 verifier stub 固定成功）；provider stub 回成功；第一次 invoice INSERT 故障。檢查 notify 仍 ACK `1|OK`、invoice row 0，接著重送相同 callback，檢查 provider call count 增至 2 且最終 invoice row 1。測試沒有真的簽署 ECPay payload。

## 影響與驗收標準

若 provider 對相同訂單號不保證冪等，網路／DB 故障後的人工重送可能重複開立稅務發票；即使 provider 去重，也會造成不確定的結果、500 與人工對帳成本。這與 QA-FS-C20 的 audit INSERT 遺失情境相關，但根因是 provider 成功與本地 invoice row 持久化之間的跨系統原子性缺口，故獨立追蹤。

修復候選須在本機 provider stub 驗證：provider 成功後首次 invoice row INSERT 故障，再以人工 retry 或 webhook redelivery 重試同 order，provider 不得再次盲目簽發；透過 provider idempotency/reference 查詢並恢復同一發票結果，invoice/outbox/audit 最終各恰一筆。N=10 同單併發時須只有受控的一次 issue request或一次 provider reference；另驗 provider 明確拒絕、超時結果不明、DB 故障持續。無法確認結果時須回傳可追蹤狀態，不可直接宣告成功或再盲目開票。正常付款單與補開流程需回歸；fixture、stub journal 清 0。

## 證據限制

此為實際 route/helper＋provider stub＋記憶體 DB 證據，不是 EZPay contract test，也未連正式或隔離 Supabase。開票是否重複成功取決於 EZPay 對重複 `MerchantOrderNo` 的正式契約；需工程／PM確認 provider 查詢與重試策略，但不得用真付費／正式發票做故障注入。

## MerchantOrderNo 碰撞候選複驗（2026-10-11）

工程候選 `/private/tmp/xunfeng-c20-c23` 已提交為 clean HEAD `b58ea161c5d7b9e23ba9e0ef180afe2bfd8fa694`，基底 `origin/main` `1935618ebf3eb3bc61c7a1fc08698839d3531e6d`。候選新增 service-only external reference 表、跨訂單檢查與 `merchant_order_conflict` 回應；helper 收到該結果後回 409，並在 EZPay issue/search 前結束。

| 測試面 | QA 證據 | 結果與限制 |
|---|---|---|
| Helper＋管理員 HTTP fail-closed | QA 自有 `scripts/qa-c23-merchant-order-collision.test.ts`；`npx vitest run --config scripts/qa-c23-merchant-order-collision.vitest.mts` | **4/4**：helper 及 `POST /api/admin/invoices/[orderId]/issue` 各覆蓋相同／不同金額；兩個不同 order ID 共用 20 字 MerchantOrderNo，RPC stub 回 conflict 時 HTTP 409，provider issue/search 0 次。 |
| 候選單元與型別 | `npx vitest run lib/payments/issue-invoice-from-order.c23.test.ts`；`npx tsc --noEmit` | helper **7/7**、TypeScript 通過。 |
| 候選 SQL／ACL／transaction | QA 自有 Supabase 專案 `qa-c23-own-20261011`：候選 migration `5e2f158b…` 與 SQL test `cca7717f…`；候選 `invoice_issue_durable_outbox.sql` contract test 通過 | 匿名／authenticated 無 RPC/table 權限、service_role 權限符合 contract；相同及不同金額 collision 返回 conflict；audit INSERT 故障時 invoice/audit 完成交易回滾，原 outbox 可用同 encrypted payload reclaim 後完成。整段測試以 `ROLLBACK` 清理。 |
| PostgreSQL 16 併發 | QA 自有 `scripts/qa-c23-collision-postgres-local.sh` | 相同 external key 兩筆不同金額並發 call **2/2 conflict**，outbox/reference/invoice/audit 副作用 **0**；script 在 disposable PG16 套用候選 migration 與 SQL contract test。 |
| 全序 migration replay | QA 自有 Supabase DB-only + Storage-schema stack；`supabase migration list --local` 與 `supabase_migrations.schema_migrations` aggregate | 此候選 worktree **58/58** 唯一版本 replay，`0001` 到 `20261012070000`；候選 SQL contract test 在該 DB 再通過。Storage 容器 health 一直停在 `starting`，未驗 Storage/API 服務。QA fixture 已刪，volume 以 `--no-backup` 移除，臨時 project 與埠已清除。 |

**整合範圍限制：**該 58 migration worktree 基底 `1935618` 中沒有 M19/C19/M21/M22/M24 的 `20261012010000` 至 `20261012050000`。因此 58/58 是 C20/C23 分支自身乾淨 replay，不能當作包含上述五個 slice 的整合 replay；整合 SHA 的 migration 數量須從實際合併後 migration tree 重新計數並全序 replay（M23 尚未採納，不含 migration）。本次 SQL／ACL／併發與管理員 HTTP stub 通過可支持碰撞修補的隔離證據，但尚未在整合 release SHA 複驗，也未呼叫真 EZPay。原 C23 provider 重試／真實 EZPay 冪等契約風險仍是 critical gate；不得因碰撞案例通過而關閉 C23。
