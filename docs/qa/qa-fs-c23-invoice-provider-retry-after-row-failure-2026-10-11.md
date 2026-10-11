# QA-FS-C23：provider 開票成功後 invoice row INSERT 失敗，重送再次呼叫 provider

**嚴重度：critical（外部重複開票風險，provider 去重語意待確認）**　**狀態：待 X-PM 排序／派工程1**

## 重現證據

範圍：`POST /api/admin/invoices/{orderId}/issue` 與真實 `issueInvoiceFromOrder` helper。QA 使用本機 EZPay provider stub、記憶體 Supabase client；沒有 EZPay 網路呼叫、真資料庫、正式訂單或發票。

可重複命令：

```sh
npx vitest run --config scripts/qa-invoice-provider-success-row-failure.vitest.mts
```

結果 **1/1 通過（缺陷重現）**；`npx tsc --noEmit` 通過。

1. 以隔離 paid order 送出開票請求。
2. provider stub 回傳成功及發票號碼。
3. 注入第一次 `invoices` INSERT 回 error。
4. API 回 500；發票列 0、audit 0；provider 呼叫 1 次。
5. 對同一 order 重送。因查不到 pending／issued invoice，helper 再呼叫 provider；第二次 stub 成功後才插入 1 筆 issued row，API 回 200、audit 1。

**預期：**第一次外部操作結果不確定時，重試不得不帶冪等保護地再次開票；需可用 merchant order key 查回／對帳 provider 結果，並持久化可重試狀態。

**實際：**相同 `merchantOrderNo=QA_ORDER_20261011` 對 provider 發出兩次呼叫；第二次得到不同 stub 發票號碼並落一筆 row。證實 helper/route 會重複呼叫 provider；**EZPay 是否會拒絕或去重相同 merchantOrderNo、正式是否可能產生兩張發票未實測**。不得將 stub 結果描述為真實重複發票。

## 影響與驗收標準

若 provider 對相同訂單號不保證冪等，網路／DB 故障後的人工重送可能重複開立稅務發票；即使 provider 去重，也會造成不確定的結果、500 與人工對帳成本。這與 QA-FS-C20 的 audit INSERT 遺失情境相關，但根因是 provider 成功與本地 invoice row 持久化之間的跨系統原子性缺口，故獨立追蹤。

修復候選須在本機 provider stub 驗證：provider 成功後首次 invoice row INSERT 故障，再重送同 order，provider 發出請求總數不增加；透過 provider idempotency/reference 查詢並恢復同一發票結果，invoice/outbox/audit 最終各恰一筆。另驗 provider 明確拒絕、超時結果不明、DB 故障持續、併發重送 N=10；無法確認結果時須回傳可追蹤狀態，不可直接宣告成功或再盲目開票。正常付款單與補開流程需回歸；fixture、stub journal 清 0。

## 證據限制

此為實際 route/helper＋provider stub＋記憶體 DB 證據，不是 EZPay contract test，也未連正式或隔離 Supabase。開票是否重複成功取決於 EZPay 對重複 `MerchantOrderNo` 的正式契約；需工程／PM確認 provider 查詢與重試策略，但不得用真付費／正式發票做故障注入。
