# EZPay 電子發票串接計畫

> 起草：2026-05-26
> 範圍：把現有「ECPay 自家發票 V3」整套換成「EZPay 樂點電子發票」
> 觸發：2026-05-26 切金流 keys 上 prod 時，發現用戶申請的發票服務是 EZPay 不是 ECPay

## 1. 為什麼要重寫

`lib/payments/ecpay-invoice.ts` 是 2026-05-24 為「綠界 V3 電子發票 API」寫的，但用戶實際申請的是「EZPay 樂點電子發票」（樂點科技 / 智冠系統旗下）。兩家規格差異：

| 維度 | 綠界 V3 發票（現有 code） | EZPay 樂點發票（要改寫） |
|---|---|---|
| Prefix | `ECPAY_INVOICE_*` | `EZPAY_INVOICE_*` |
| MerchantID 長度 | 7 碼 | **9 碼**（用戶值 `337811304`） |
| HashKey 長度 | 16 字元 | **32 字元** |
| HashIV 長度 | 16 字元 | 16 字元 |
| 加密 | AES-128-CBC + PKCS7 | **AES-256-CBC + PKCS7** |
| Endpoint (stage) | `einvoice-stage.ecpay.com.tw` | `cinv.ezpay.com.tw`（沙箱）/ `cinv.pay2go.com`（早期） |
| Endpoint (prod) | `einvoice.ecpay.com.tw` | `cinv.ezpay.com.tw`（正式）❗ 待確認沙箱 vs 正式是否同 host |
| 開立 API path | `/B2CInvoice/Issue` | `/Api/invoice_issue` |
| 請求格式 | JSON in body | **form-urlencoded** (`MerchantID_=...&PostData_=<URL-encoded encrypted JSON>`) |
| 回應 | JSON | JSON (`{ Status, Message, Result: "<URL-encoded encrypted JSON>" }`) |

❗ 表示需用 EZPay 官方文件確認

## 2. 取得 EZPay 官方文件（執行前必做）

EZPay 文件不公開下載。下次開工前 Jason 需要：

1. 登入 https://inv.ezpay.com.tw 商家後台
2. 取得 **「ezPay 電子發票 API 串接技術文件」PDF**（通常在「下載專區」需登入）
3. 或直接打客服：02-2653-6000 / cs@ezpay.com.tw 索取
4. 對照本文件「3. EZPay API 規格（LLM 初版假設）」逐欄位確認

**不要在沒 PDF 的狀況下硬寫 production helper**：欄位名稱大小寫、必填規則、加密細節都要對到 byte 才能通過簽章驗證。

## 3. EZPay API 規格（LLM 初版假設，待 PDF 校對）

### 3.1 開立發票 (Issue Invoice)

**Endpoint**:
- Stage: `https://cinv.ezpay.com.tw/Api/invoice_issue`（❗ 確認 stage host 是否是 `inv-stage.ezpay.com.tw` 或別的）
- Production: `https://cinv.ezpay.com.tw/Api/invoice_issue`

**Method**: POST
**Content-Type**: `application/x-www-form-urlencoded`

**POST body**:
```
MerchantID_=337811304
&PostData_=<AES-256-CBC 加密後 URL-encoded 的 JSON 字串>
```

**PostData_ JSON 欄位**（依 EZPay 規格組合，加密前的 plain JSON）:

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `RespondType` | ✓ | string | 回應格式：固定 `JSON` |
| `Version` | ✓ | string | API 版本，目前 `1.5` ❗ 待 PDF 確認 |
| `TimeStamp` | ✓ | int | unix epoch 秒，與 EZPay 主機誤差需在 10 分鐘內 |
| `TransNum` | ✗ | string | 樂點交易序號，開立傳空 |
| `MerchantOrderNo` | ✓ | string | 我方訂單編號（對應我們的 `orders.order_no`） |
| `Status` | ✓ | string | `1`=立即開立、`0`=待開立、`3`=延遲開立 |
| `Category` | ✓ | string | `B2B`=公司 / `B2C`=個人 |
| `BuyerName` | ✓ | string | 買受人名稱（公司戶=公司全名、個人戶=姓名） |
| `BuyerUBN` | △ | string | 統一編號（B2B 必填、B2C 留空） |
| `BuyerAddress` | △ | string | B2B 必填 |
| `BuyerEmail` | ✓ | string | 收件 email |
| `CarrierType` | △ | string | 載具類型：空字串=無 / `0`=會員載具 / `1`=自然人憑證 / `2`=手機條碼 |
| `CarrierNum` | △ | string | 載具號碼（依 CarrierType 不同格式） |
| `LoveCode` | △ | string | 捐贈碼（3-7 碼數字）；填了 CarrierType 必空 |
| `PrintFlag` | ✓ | string | `Y`=要紙本 / `N`=不要 |
| `TaxType` | ✓ | string | `1`=應稅、`2`=零稅率、`3`=免稅、`9`=混合 |
| `TaxRate` | ✓ | number | 稅率（一般 5） |
| `Amt` | ✓ | int | 銷售額（未稅） |
| `TaxAmt` | ✓ | int | 稅額 |
| `TotalAmt` | ✓ | int | 總計（=Amt+TaxAmt） |
| `ItemName` | ✓ | string | 商品名稱，多項用 \| 分隔 |
| `ItemCount` | ✓ | string | 數量，多項用 \| 分隔 |
| `ItemUnit` | ✓ | string | 單位（如「個」、「次」），多項用 \| 分隔 |
| `ItemPrice` | ✓ | string | 單價，多項用 \| 分隔 |
| `ItemAmt` | ✓ | string | 小計，多項用 \| 分隔 |
| `Comment` | ✗ | string | 備註 |

**Response JSON**:
```json
{
  "Status": "SUCCESS",   // or 錯誤碼
  "Message": "發票開立成功",
  "Result": "<URL-encoded encrypted JSON>"   // 解密後是真實 invoice payload
}
```

解密後 Result 結構：
```json
{
  "MerchantID": "337811304",
  "InvoiceTransNo": "...",          // EZPay 自己的交易序號
  "MerchantOrderNo": "...",         // 對應我方 orders.order_no
  "InvoiceNumber": "AB12345678",    // 發票號碼（10 碼）
  "RandomNum": "1234",              // 隨機碼
  "CreateTime": "2026-05-26 14:30:00",
  "CheckCode": "...",               // 驗證碼，用於發票查詢 URL
  "BarCode": "...",                 // 一維條碼字串
  "QRcodeL": "...",
  "QRcodeR": "...",
  "TotalAmt": 1000,
  "RandomNumStr": "1234"
}
```

### 3.2 加密細節（AES-256-CBC + PKCS7）

```typescript
import crypto from "node:crypto";

function encrypt(plainJson: string, hashKey: string, hashIv: string): string {
  // PKCS7 padding 是 Node 預設
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(hashKey), Buffer.from(hashIv));
  let encrypted = cipher.update(plainJson, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;   // 回 hex 字串，POST 前 URL-encode 一次
}

function decrypt(hexEncrypted: string, hashKey: string, hashIv: string): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(hashKey), Buffer.from(hashIv));
  let decrypted = decipher.update(hexEncrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

❗ 注意：EZPay 跟 NewebPay 系出同源，部分 NewebPay 文件可參考但**簽章規則 / endpoint / 欄位名都不同**，不可直接照搬。

## 4. Implementation 範圍

### 4.1 新增檔案

```
lib/payments/ezpay-invoice.ts            # 主 helper（加密、開立、作廢、查詢）
lib/payments/ezpay-config.ts             # env 集中讀取 + 驗證（仿 ecpay-config.ts）
scripts/check-ezpay-env.mjs              # 本地驗 env（仿 check-ecpay-env.mjs）
scripts/test-ezpay-invoice-e2e.mjs       # E2E 沙箱測試（仿 test-ecpay-idempotency.mjs）
docs/ezpay-env-config.md                 # SOP（仿 ecpay-env-config.md）
supabase/migrations/0012_ezpay_invoice_migration.sql  # 若 invoices 表欄位變動
```

### 4.2 修改檔案

| 檔案 | 改動 |
|---|---|
| `lib/payments/issue-invoice-from-order.ts` | helper 改 import `ezpay-invoice`，buyer payload 對齊 EZPay 欄位 |
| `app/api/admin/invoices/[orderId]/issue/route.ts` | 無，因為走上面 helper |
| `app/api/payments/ecpay/notify/route.ts` | 無，因為走 `issueInvoiceFromOrder` |
| `components/member-pricing` 的 invoice modal | 欄位對齊（Category B2B/B2C、Carrier 三選一、Donate 選項） |
| `package.json` | 加 `check:ezpay-env` / `test:ezpay-invoice-e2e` |

### 4.3 移除/sunset 檔案

- `lib/payments/ecpay-invoice.ts` → 保留但加註解標示 deprecated；確認沒地方 import 後刪
- `docs/ecpay-invoice-plan.md` → 留作歷史；新計畫看本文件
- `scripts/test-ezpay-invoice-*.mjs`（若有 ECPay 沙箱專屬 test）→ 砍

### 4.4 DB schema 變動評估

現有 `invoices` 表（migration 0008）欄位：
- `id, order_id, user_id, invoice_number, random_num, invoice_date, total_amount, tax_amount, status, raw_request, raw_response, error_code, error_msg, created_at`

評估：
- ✓ `invoice_number`, `random_num`, `invoice_date`, `total_amount`, `tax_amount` 都對應得上 EZPay 欄位
- ❗ EZPay 多出 `InvoiceTransNo`（樂點交易序號）、`CheckCode`（驗證碼）、`BarCode`、`QRcodeL/R` — 若 admin 介面要顯示 QRcode / 跳轉發票查詢，要加欄位
- ❗ EZPay `Status` 字串值跟 ECPay 不同（`SUCCESS` vs `1`），現有 `status` 欄位儲存格式需重新評估
- 結論：建議加 migration 0012 加 `provider_trans_no`, `check_code`, `barcode`, `qrcode_l`, `qrcode_r` 5 個欄位，並把 `status` 標準化（不論 provider 都用 `issued|failed|void`）

### 4.5 env vars 變動

**新增（Vercel production + preview）**:
- `EZPAY_INVOICE_ENV=stage`（先沙箱）/ `production`（拿到正式商店後切）
- `EZPAY_INVOICE_MERCHANT_ID`（用戶值：`337811304`）
- `EZPAY_INVOICE_HASH_KEY`（32 字元）
- `EZPAY_INVOICE_HASH_IV`（16 字元）

**移除（確認 cutover 完成後）**:
- `ECPAY_INVOICE_ENV`、`ECPAY_INVOICE_MERCHANT_ID`、`ECPAY_INVOICE_HASH_KEY`、`ECPAY_INVOICE_HASH_IV`

## 5. 開發 Workflow

1. **取得文件**：拿到 EZPay PDF 後對照本文件「3. EZPay API 規格」逐項校對，把 ❗ 都解掉
2. **取得沙箱 keys**：申請 EZPay 沙箱商店（或用 Jason 已有的正式商店降級測試）
3. **開 worktree**：`feature/ezpay-invoice`
4. **寫 helper + config**：
   - 先寫 `lib/payments/ezpay-config.ts` + `scripts/check-ezpay-env.mjs`
   - 跑 `npm run check:ezpay-env` 確認 keys 格式對
5. **寫 encrypt/decrypt**：用沙箱 keys 加密一個 sample payload、送 EZPay sandbox、看是否回 200
6. **寫 issue invoice**：覆蓋掉現有 `issueInvoiceFromOrder` 內的 helper call
7. **跑 `test-ezpay-invoice-e2e.mjs`**：對沙箱實際開一張發票，驗 invoices row 寫入
8. **改 member-pricing modal**：欄位對齊
9. **開 PR**，本地 build + test 通過後 merge
10. **production cutover**：設正式 keys → 切 `ENV=production` → 真實小額測試（買 basic 並開個人發票，到 EZPay 後台確認）

## 6. 風險與緩解

| 風險 | 緩解 |
|---|---|
| EZPay PDF 與 LLM 初版假設差距大 | 第 1 步先校對；不對就重寫第 3 節 |
| 沙箱 keys 拿不到 | 用正式 keys 開最小額測試（買 trial / basic），錯了再作廢 |
| 開錯發票（金額錯、買受人錯）很難收尾 | 沙箱跑 happy path + 失敗情境後再上 prod；上 prod 前先在 admin 手動開一張低風險訂單測試 |
| Migration 0012 改動 `status` 欄位語義 | 新欄位先 nullable、舊資料留著；下個版本再考慮 backfill |
| ECPay 發票 helper 還留著被誤用 | helper 改丟 `throw new Error("Deprecated, use ezpay-invoice")`，但保留 file 給歷史 import 看 |

## 7. 開放問題（請 Jason 在拿到 PDF 後補答）

1. EZPay 沙箱跟正式是同 host 用 MerchantID 區分，還是不同 host？
2. 發票作廢（invoice_invalid）流程是不是同 endpoint 換 path？
3. 載具（CarrierType）三選一規則細節（特別是手機條碼格式驗證）
4. 多項商品時 `\|` 是 ASCII pipe 還是其他字元？
5. 加密 padding 是 PKCS7 還是 zero-padding？（綠界用 PKCS7）
6. `Status` 回 success 時固定 `SUCCESS` 字串，還是有版本差異？

## 8. 上線後驗證 Checklist

- [ ] EZPay 商家後台「發票管理」看得到剛開的發票
- [ ] `invoices` 表 row 寫入正確（`invoice_number`、`provider_trans_no`、`check_code` 都有值）
- [ ] 發票 PDF / B2B 字軌正確（B2B 一定要含統編）
- [ ] 載具客戶看得到 email 含載具條碼資訊
- [ ] 發票失敗時 `sendAdminAlert` 有發信
- [ ] notify webhook 開票失敗不阻擋付款回 `1|OK`（現有設計，沿用）
- [ ] 月底對帳：EZPay 後台筆數 = `invoices.status=issued` 筆數
