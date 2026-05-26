# 未付款訂單自動清理 cron

> 起草：2026-05-25（`feature/orders-cleanup-cron`）

## 1. 目的

`orders.status='pending'` 是「使用者點了「立即購買」、order row 建好、跳了綠界，但綠界沒回 webhook（使用者關掉分頁 / 模擬付款不會觸發 webhook / 信用卡驗證失敗 ⋯）」。

這些 row 永遠不會自動進 paid，會逐漸累積。後台 `/admin/orders` 的「待付款」filter 也會被它們塞爆。

定一條規則：**pending 超過 24 小時 → 視為廢棄，自動標記 cancelled**。

## 2. 規則

| 項目 | 值 |
| --- | --- |
| 條件 | `orders.status='pending'` AND `orders.created_at < now - 24h` |
| 動作 | `UPDATE orders SET status='cancelled', updated_at=now()` |
| 頻率 | 每小時整點 (`0 * * * *`) |
| 單次上限 | 500 筆（避免一次性大量更新打爆） |
| 競態保護 | `UPDATE ... WHERE status='pending'`（若別處剛改 paid 不動） |
| Audit | 每次寫 `admin_audit_logs` (`action=orders_auto_cancel`)，metadata 含 cleaned_count + 抽樣 5 筆 |

## 3. 設定 CRON_SECRET

Vercel cron 會自動傳 `Authorization: Bearer $CRON_SECRET` header，route 端驗這個 secret。

```bash
# Vercel project env 設好（production + preview 各一份；可同值或分開）
vercel env add CRON_SECRET production
# 隨意 32 byte 隨機字串：
# openssl rand -base64 32
```

未設 secret 時 route 回 500 `CRON_SECRET not configured`（避免 silent failure）。

## 4. 手動觸發

```bash
# dry-run（只回筆數與抽樣，不更新）
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.xunfeng.tw/api/cron/cleanup-pending-orders?dry_run=1

# 實跑（建議先 dry-run）
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.xunfeng.tw/api/cron/cleanup-pending-orders
```

回應：

```json
{
  "ok": true,
  "dry_run": false,
  "cutoff": "2026-05-24T15:00:00.000Z",
  "stale_hours": 24,
  "candidate_count": 3,
  "cleaned_count": 3,
  "sampled": [
    { "order_no": "XF2026052311523402AB", "created_at": "...", "amount": 199 },
    ...
  ]
}
```

## 5. Observability

- Vercel Dashboard → Project → Functions → `/api/cron/cleanup-pending-orders` → Logs
- Cron 跑的歷史在 Vercel Dashboard → Settings → Cron Jobs
- 每次跑都寫 `admin_audit_logs`：

```sql
select created_at, metadata->>'cleaned_count' as cleaned, metadata->'sampled' as sampled
from admin_audit_logs
where action = 'orders_auto_cancel'
order by created_at desc
limit 20;
```

## 6. 不會處理的邊界情況

- **超過 500 筆積壓**：單次最多清 500，下一個整點再清剩下的（極少發生）
- **時區**：cron schedule 是 UTC，整點觸發跨時區影響不大
- **使用者中途付款成功**：競態保護的 `WHERE status='pending'` 會跳過已成 paid 的 row
- **訂單已建發票**：發票走 `invoices` 表，order cancelled 不影響已開立的發票（admin 要自己作廢）— 但理論上 pending order 不該有 invoice，這條 cron 不會碰到

## 7. 上線檢查

- [ ] `CRON_SECRET` 在 Vercel production env 已設
- [ ] dry-run curl 跑得起來、看得到 candidate count
- [ ] Vercel Dashboard → Cron Jobs 看到 `/api/cron/cleanup-pending-orders` `0 * * * *`
- [ ] 整點過後 30 分內看 Logs 應該有一次 invocation
