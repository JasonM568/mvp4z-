# ECPay 主金流環境設定 SOP

> 起草：2026-05-24 (PR `feature/ecpay-merchant-config`)
> 範圍：綠界 AIO V5 主金流（不含 V3 電子發票，發票走另一組 ECPAY_INVOICE_*）

## 1. 為什麼有這份文件

ECPay 設定散在 6+ 個 env vars：

| 變數 | 用途 | sandbox 範例 | production |
| --- | --- | --- | --- |
| `ECPAY_ENV` | URL 切換 | `stage` 或不設 | `production` |
| `ECPAY_MERCHANT_ID` | 商店代號 | `3002607` (綠界公開測試) | 申請後拿到的 7 碼 |
| `ECPAY_HASH_KEY` | 簽章金鑰 | `pwFHCqoQZGmho4w6` | 申請後拿到 |
| `ECPAY_HASH_IV` | 簽章 IV | `EkRm7iFT261dpevs` | 申請後拿到 |
| `ECPAY_NOTIFY_URL` | server webhook | `https://mvp4z.vercel.app/api/payments/ecpay/notify` | 同左（domain 一致即可） |
| `ECPAY_RETURN_URL` | 付款完導回 | `https://mvp4z.vercel.app/api/payments/ecpay/return` | 同左 |
| `ECPAY_CLIENT_BACK_URL` | 「返回商店」 | `https://mvp4z.vercel.app/member` | 同左 |

換正式商店要一次改 4 個（MerchantID + HashKey + HashIV + ECPAY_ENV），三個 URL 不變。漏改 = 簽章對不上 = 結帳全炸。

## 2. 集中設定 helper

`lib/payments/ecpay-config.ts` 提供：

- `getEcpayConfig()`：純讀，回 typed `EcpayConfig`
- `validateEcpayConfig(config)`：純驗證，回 `ValidationIssue[]`
- `getValidatedEcpayConfig()`：上面兩個合一，第一次呼叫驗一次，error 直接 throw、warn `console.warn`，之後 cache。**所有 ecpay code 應該透過這個拿 config**，不要再直接 `process.env.ECPAY_*`
- `inspectEcpayConfig()`：給 check script 用，不 throw

驗證規則：

1. `ECPAY_ENV=production` 但 MerchantID 是 `3002607` / `2000132`（綠界公開測試）→ error
2. 任一 URL 含 `localhost` → production = error，stage = warn
3. production 的 URL 不是 https → error
4. 三個 URL 的 origin 不一致 → warn（會跨站 redirect）
5. URL 無法 parse → error
6. MerchantID 不是純數字 → error
7. HashKey / HashIV 長度 < 8 → error

## 3. 上 prod 換正式金鑰 SOP

1. 拿到綠界正式商店資料（MerchantID / HashKey / HashIV）
2. 本地先驗：

   ```bash
   vercel env pull .env.production.local  # 拉 production env 到本地
   ECPAY_ENV=production \
   ECPAY_MERCHANT_ID=新MID \
   ECPAY_HASH_KEY=新KEY \
   ECPAY_HASH_IV=新IV \
   npm run check:ecpay-env -- --env-file=.env.production.local
   ```

3. 看到 `✅ 全部設定正常` 才往下：

   ```bash
   # 改 Vercel production env (UI 或 CLI)
   vercel env rm ECPAY_ENV production -y
   vercel env add ECPAY_ENV production       # 輸入 production
   vercel env rm ECPAY_MERCHANT_ID production -y
   vercel env add ECPAY_MERCHANT_ID production
   # ... HASH_KEY / HASH_IV 同樣方法
   ```

4. 觸發一次 production deploy（push 或 `vercel deploy --prod --yes`）
5. **deploy log 看 runtime warn** — 第一次呼叫 ecpay 時 `getValidatedEcpayConfig()` 會跑驗證，有 warn 會在 server log 看到
6. 真實小額測試（NT$ 1 或方案最低價）→ 確認綠界後台顯示交易、webhook 進入、entitlement 建立

## 4. 切回 sandbox（debug 時）

只改 production env 是危險的（會影響真實用戶）。建議：
- 在 preview deployment 上跑 sandbox：Vercel env 設 preview scope 為 sandbox key
- 本地 dev：`.env.local` 永遠保留 sandbox 一套

```bash
vercel env pull .env.local              # 預設拉 development scope
ECPAY_ENV=stage npm run check:ecpay-env  # 強制當 stage 驗
```

## 5. CI / 自動驗證

加入 GitHub Actions 範例（未實作）：

```yaml
- name: Check ECPay env (production)
  run: |
    vercel env pull --environment production --token $VERCEL_TOKEN .env.prod
    npm run check:ecpay-env -- --env-file=.env.prod
```

## 6. 既知地雷（不要再踩）

- **「模擬付款」按鈕** 只在 sandbox 才有，點下去 webhook 不會發。測試付款一律走信用卡分頁。
- **worktree deploy** 沒繼承 `.vercel/project.json`：先 `cp 主worktree/.vercel/project.json .vercel/project.json` 再跑 `vercel deploy`。
- **三個 URL origin 不一致** 會被 browser 當跨站 redirect、cookies 跟著遺失，目前 check script 給 warn 不擋。
