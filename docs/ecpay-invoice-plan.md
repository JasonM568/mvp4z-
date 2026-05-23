# ECPay 電子發票串接設計計畫

> 起草：2026-05-24 by Claude（charge-on-success bug 收尾後接的下一塊）
> 狀態：**設計階段**，未寫 code。實作前請逐項對焦下方決策點。
> Worktree：`feature/ecpay-invoice` @ `e346663`（已 rebase 到 develop = main）。

## 1. 目標與範圍

付款流程「前半段」（綠界 AIO 金流）已上線，但「後半段」電子發票完全沒做。台灣稅法要求 B2C 付款成功後須開立統一發票（個人雲端 / 公司三聯）。**正式對外營運前必須補上**。

本計畫範圍：
- 串接綠界電子發票（Invoice V3 API）
- 自動開票（付款成功觸發）
- 手動補開 / 作廢（admin）
- 會員自己查發票（member）

不在範圍：
- 換成藍新 / ezPay
- 自建發票系統

## 2. 環境與測試凑證

| 項目 | 沙箱（先用） | 正式（之後申請） |
| --- | --- | --- |
| API base | `https://einvoice-stage.ecpay.com.tw` | `https://einvoice.ecpay.com.tw` |
| MerchantID | `2000132`（綠界公開測試） | 待申請 |
| HashKey | `ejCk326UnaZWKisg` | 待申請 |
| HashIV | `q9jcZX8Ib9LM8wYk` | 待申請 |

**注意：** 沙箱發票字軌與正式不同；開出來的「測試發票」不會送財政部，僅供 API 驗證。

新 env vars：
- `ECPAY_INVOICE_ENV`（`stage` / `production`）
- `ECPAY_INVOICE_MERCHANT_ID`
- `ECPAY_INVOICE_HASH_KEY`
- `ECPAY_INVOICE_HASH_IV`

## 3. 架構決策

### 3.1 發票觸發時機：sync inline + 失敗降級

| 方案 | 選 / 不選 | 理由 |
| --- | --- | --- |
| 在 notify webhook 同步開票 | ✅ v1 採用 | 最簡單、立即得到發票號、不需 cron / queue 基礎建設 |
| 先回 1\|OK，背景開票 + 重試 | ❌ v1 不做 | 需要 cron 或 queue 系統，v2 再加 |
| Webhook 完全不做、改 cron 撈 paid 但未開票訂單 | ❌ 不選 | 延遲使用者收到發票時間 |

**v1 流程：**
```
ECPay notify → verify CheckMac → 寫 payments row → orders.status=paid + 建 entitlement
              ↓
              讀 orders.invoice_request → call ECPay invoice issue
              ↓
              成功 → 寫 invoices row + 回 1|OK
              失敗 → 寫 invoices row (status=failed, error_msg) + 回 1|OK（不阻擋付款流程）
                    → 後續 admin 可手動 retry
```

**v2 升級：** 失敗自動進 queue / cron 重試。

### 3.2 加密與簽章

綠界電子發票 V3 API 跟金流 V5 完全不同：
- 不是 CheckMacValue
- payload 用 **AES-128-CBC** 加密 JSON（key=HashKey, iv=HashIV, PKCS7 padding）
- 整個 request body 結構：
  ```json
  {
    "MerchantID": "2000132",
    "RqHeader": { "Timestamp": 1716534000 },
    "Data": "<URL-encoded-AES-encrypted-JSON>"
  }
  ```
- 回傳 `Data` 也是 AES 加密、要解出來才看得到結果

新檔：`lib/payments/ecpay-invoice.ts`（仿照 `lib/payments/ecpay.ts` 結構）
- `encryptPayload(payload: object): string`
- `decryptResponse(encrypted: string): object`
- `invoiceActionUrl(action: 'Issue' | 'IssueRevoke' | 'GetIssue'): string`
- `issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>`
- `voidInvoice(input: VoidInput): Promise<VoidResult>`
- `queryInvoice(invoiceNumber: string): Promise<QueryResult>`

### 3.3 sync vs async 風險評估

ECPay notify timeout 通常 30 秒。我方加上一次 invoice issue（~1-3s）+ 寫 DB（~100ms）= 仍在預算內。若綠界發票 API 慢回應（>5s），可改用 `Promise.race` + 5s timeout 防護，timeout 後把 invoice 寫成 `status=pending` 留給 admin / 後續 cron 處理。

## 4. DB Schema（migration 0008）

### 4.1 `orders` 擴充

```sql
alter table public.orders
  add column invoice_request jsonb;  -- 結帳時收集的買受人資訊
```

`invoice_request` 範例：
```json
{
  "buyer_type": "personal",         -- personal | company
  "buyer_name": "陳孟弘",
  "buyer_id": null,                  -- 公司：統編 8 碼；個人：null
  "carrier_type": "cellphone",       -- none | cellphone | citizen_digital | ecpay_member
  "carrier_num": "/ABC1234",         -- 手機條碼 8 碼或自然人憑證 16 碼
  "donation_code": null,             -- 捐贈碼（4-7 碼），有值表示捐贈
  "buyer_email": "user@example.com"  -- 用於寄發票
}
```

### 4.2 `invoices` table（新建）

```sql
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  user_id uuid not null references public.profiles(id),

  -- 綠界發票識別
  provider text not null default 'ecpay',
  invoice_number text,                 -- 發票號碼（YY12345678 格式），失敗時 null
  random_code text,                    -- 隨機碼 4 碼
  invoice_date timestamptz,            -- 開立時間（由綠界回傳）

  -- 買受人資訊（從 orders.invoice_request 複製過來鎖定當時資料）
  buyer_type text not null check (buyer_type in ('personal', 'company')),
  buyer_name text not null,
  buyer_id text,                       -- 統編 / null
  buyer_email text,
  carrier_type text not null default 'none' check (carrier_type in ('none','cellphone','citizen_digital','ecpay_member')),
  carrier_num text,
  donation_code text,

  -- 金額
  total_amount integer not null,       -- 含稅總額
  tax_type text not null default '1' check (tax_type in ('1','2','3','9')),  -- 1=應稅 2=零稅 3=免稅 9=混合

  -- 狀態
  status text not null default 'pending' check (status in ('pending','issued','failed','voided')),
  error_code text,                     -- 失敗時的綠界回傳 RtnCode
  error_msg text,                      -- 失敗訊息
  retry_count integer not null default 0,
  last_attempted_at timestamptz,

  -- 作廢資訊
  voided_at timestamptz,
  void_reason text,

  -- 原始 payload（debug / audit）
  raw_request jsonb,
  raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_invoices_invoice_number on public.invoices(invoice_number) where invoice_number is not null;
create index idx_invoices_order_id on public.invoices(order_id);
create index idx_invoices_user_id on public.invoices(user_id);
create index idx_invoices_status on public.invoices(status);
```

**RLS（migration 0009）：** member 只能看自己的，admin 看全部、可改狀態（沿用現有 admin pattern）。

## 5. 後端 API 設計

| Method & Path | 權限 | 用途 |
| --- | --- | --- |
| `POST /api/payments/ecpay/notify` | public（綠界） | 既有 webhook，**內部加開票流程**（不新建 route） |
| `POST /api/invoices/:id/retry` | admin | 手動重試開票（status=failed → issued） |
| `POST /api/invoices/:id/void` | admin | 作廢（30 天內可作廢） |
| `GET /api/invoices` | member | 自己的發票列表 |
| `GET /api/invoices/:id` | member（自己）/ admin（全部） | 單張發票詳情 |
| `GET /api/admin/invoices` | admin | 全部發票列表 + filter（status / 期間 / 買受人） |
| `POST /api/admin/invoices/:order_id/issue` | admin | 對 order 手動開票（沒自動開的情況） |

### 5.1 `notify` 內部新增邏輯（在現有 entitlement 建完之後）

```typescript
// pseudocode
if (order.invoice_request && !await hasInvoiceForOrder(order.id)) {
  const result = await issueInvoiceFromOrder(order);
  await db.invoices.insert({
    ...result,  // 成功：invoice_number, random_code, invoice_date, status=issued
                // 失敗：status=failed, error_code, error_msg
    order_id: order.id,
    user_id: order.user_id,
    ...buyerFieldsFromOrder
  });
}
return ecpayText("1|OK");  // 無論發票成敗都回 OK，不阻擋付款流程
```

### 5.2 idempotency

- `invoices` 用 `order_id` + `provider` 加 unique constraint（避免重複開票）
- 或在 `notify` 一開始就 check `invoices.where(order_id=order.id).exists`

## 6. 前端 UX

### 6.1 `member-pricing` 結帳頁

目前流程：點方案 → 直接送出建立 order + 跳轉綠界。

新流程：點方案 → **跳出發票資訊 modal** → 填完 → 送出建 order（含 invoice_request）→ 跳轉綠界。

Modal 欄位：
- **買受人類型**（radio）：個人 / 公司
- **抬頭**（text）：預設帶會員姓名
- **統一編號**（text，僅公司）：8 碼
- **載具類型**（radio）：
  - 雲端發票（無載具）— 預設
  - 手機條碼 — `/` 開頭 8 碼
  - 自然人憑證 — 大寫英文 2 碼 + 數字 14 碼
- **載具號碼**（text，根據上方類型動態顯示）
- **捐贈**（checkbox，互斥載具）：捐贈碼 4-7 碼
- **電子信箱**（text，預設會員 email）

簡化版（MVP）：只給個人雲端發票 + 公司統編兩個選項，載具暫不做（v2 加）。

### 6.2 `member.html` / `/member` 加「我的發票」分頁

- 列表：發票號碼、日期、金額、狀態（已開立 / 已作廢）
- 點進去看詳情 / PDF / QR code（綠界提供 invoice view URL）

### 6.3 `/admin/invoices`（新建）

- 列表 + filter（狀態、期間、會員 email、發票號碼）
- 單張詳情 + 重試 / 作廢按鈕
- 對 `paid` 但無 invoice 的 order 顯示「補開」按鈕

## 7. 階段切割

| Phase | 內容 | PR 規模 |
| --- | --- | --- |
| **1** | DB migration 0008/0009 + `lib/payments/ecpay-invoice.ts` helper + admin manual issue API（`/api/admin/invoices/:order_id/issue`）+ 最簡 admin UI 列表 | 中 |
| **2** | notify 自動開票 + `orders.invoice_request` 寫入 + member-pricing modal（個人雲端 + 公司統編 only） | 大 |
| **3** | 載具 / 捐贈完整支援 + member 自查發票 UI + admin retry/void UI + 失敗重試機制 | 中 |
| **4** | 換上正式商店（申請完字軌後）+ 歷史測試資料清理 + 上線監控 | 小 |

## 8. 待決策點（實作前要先有答案）

1. **MVP 範圍**：v1 上線時要不要做載具？個人沒載具 → 預設「捐贈」或「雲端發票寄 email」？
2. **公司統編檢核**：要不要打財政部營業稅籍 API 驗統編真實性？還是先信任使用者輸入、開錯由 admin 作廢重開？
3. **發票 email 寄送**：綠界會自動寄還是我們自己寄？（綠界有 `InvoiceRemark`、設定後會代寄）
4. **歷史測試訂單**：目前 `XF2026051913034555C9` 是測試 order，不開票。production 上線前要把 `paid` 但 `invoice_request IS NULL` 的訂單視為「不開票歷史資料」標記清楚。
5. **錯誤通知**：開票失敗除了寫 `invoices.status=failed`，要不要發 admin email / Slack alert？
6. **正式商店申請**：誰負責申請綠界正式發票字軌？申請通過後 env vars 切換時機？

## 9. Test plan（每 phase 各跑一次）

### Phase 1 sanity
- `npm run build` 通過
- 手動 SQL 跑 migration 0008/0009（同 atomicity bug pattern）
- 對沙箱 `2000132` 用 `lib/payments/ecpay-invoice.ts` 開一張測試發票（用既有 `XF2026051913034555C9` order 或新建 dummy order），驗證：
  - HTTP 200
  - 解密 response 看到 `RtnCode=1`
  - `invoices` row 寫入正確
  - `invoice_number` 格式正確

### Phase 2 E2E
- 完整流程：選方案 → 填 invoice modal → 跳綠界 → 模擬付款（**走信用卡分頁，不點模擬付款按鈕** ← 之前的雷）→ 回站 → 確認 `orders.status=paid` + `member_entitlements` 建好 + `invoices.status=issued`
- 失敗路徑：故意填錯統編 → 確認 `invoices.status=failed`、付款仍 paid、entitlement 仍建好

### Phase 3+
- admin retry：拿 Phase 2 故意失敗的 invoice → admin 改正資料 → retry → 成功
- admin void：開出去的發票 → 作廢 → 確認綠界後台同步

## 10. 風險與雷區

- **沙箱 vs 正式 env 切換**：搬正式商店時 env 一定要全套換（MerchantID / HashKey / IV 都要）。建議跟 ECPAY_ENV 一樣有 `ECPAY_INVOICE_ENV` 控制 URL 切換，避免漏改。
- **AES 加密的 padding**：綠界文件講 PKCS7，Node.js `crypto` 預設 PKCS、要確認 IV 是 byte string 不是 hex。
- **發票字軌用罄**：沙箱不會發生，正式上線要監控發票剩餘號碼（綠界後台可查）。
- **重複開票**：notify 可能被 retry，invoices 的 `(order_id, provider)` unique constraint 是最後防線。
- **作廢時限**：綠界規定發票開立後 24 小時內可作廢退回字軌，超過要走「折讓單」。MVP 不做折讓單，admin 用就會知道規則。
- **個資**：`invoices.buyer_email / buyer_id` 是 PII，RLS 一定要鎖死。

## 11. 不要再踩的舊雷

- **Sandbox 「模擬付款」按鈕** ：測試付款一定走信用卡分頁，不要點那顆按鈕（webhook 不會發 → 完整 e2e 跑不起來，已踩過一次）
- **worktree 部署**：feature worktree 沒繼承 `.vercel/project.json`，部署前先 cp 過去或回主 worktree 操作（atomicity bug 修上 prod 時踩過，誤建一個 `xunfeng-v2-council-atomic` Vercel project，已清除）
- **Squash merge 後 Vercel webhook 不一定觸發**：PR #23 等了 5 分鐘沒動靜，最後手動 `vercel deploy --prod`。PR #24 倒是有觸發。看心情。

## 12. 下一步動作

1. 確認上方「8. 待決策點」共 6 條（特別是 1-3 影響 v1 範圍）
2. Phase 1 開工：開新 commit 寫 migration 0008/0009 + helper lib + admin manual issue
3. 在 develop（或新分支）上線 Phase 1，sandbox 驗 helper 可以開出測試發票
4. Phase 2 接前端 + notify 自動化
