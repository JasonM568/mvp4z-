# 記憶

## 專案定位

巽風官方網站 V2 是新版正式商用系統，目標是從舊版靜態官網升級成可收費、可管理會員、可提供 AI 會員問答服務的完整網站。

新架構：

```text
Next.js + Supabase + 綠界金流 + OpenAI + Vercel
```

舊架構：

```text
Cloudflare Pages + Cloudflare Worker + Cloudflare D1 + Formspree + Decap CMS
```

## 使用者決策

- 不沿用原 GitHub repo 帳號底下的 repo。
- 選擇「做法 1」：先在本機做好新版專案，之後再提供新的 GitHub repo URL。
- 舊 repo 只當素材來源，不作為新版正式 repo。
- 前端頁面的風格、頁面內容與現有視覺先保持不變。
- 新版技術架構採 Next.js + Supabase。
- 金流系統採綠界金流。
- 部署目標採 Vercel。
- 要考慮正式收費系統的資安條件。

## 架構原則

- 前端只能顯示狀態，不決定付款、開通、權限或扣點。
- 付款成功必須由綠界後端通知 webhook 驗證後決定。
- 金額、方案、幣別、訂單狀態必須由後端與 DB 比對。
- webhook 必須驗證 `CheckMacValue`。
- webhook 必須 idempotent，同一筆付款通知不可重複開通。
- Supabase `service_role` 只能 server-side 使用，不可進前端。
- Supabase 要啟用 RLS。
- 管理員功能不可只靠前端隱藏，必須 server-side 檢查角色。
- AI 問答會產生成本，必須 server-side 檢查權益與扣點。
- 扣點、usage log、credit transaction 要盡量維持一致性。
- 所有敏感 key 放環境變數，不寫進 Git。

## 目標資料模型

核心表：

- `profiles`
- `plans`
- `orders`
- `payments`
- `member_entitlements`
- `credit_transactions`
- `activation_codes`
- `usage_logs`
- `admin_audit_logs`

## 預定功能模組

1. 前台官網
2. 會員註冊登入
3. 會員方案
4. 綠界付款
5. 付款 webhook 開通
6. 會員中心
7. AI 會員問答
8. 問答扣點
9. 管理員後台
10. 訂單與付款紀錄
11. 啟用碼與手動補點
12. audit log

## Git 策略

目前 v2 是新的本機 Git repo。

目前沒有 remote。

等使用者提供新的 GitHub repo URL 後，再：

```bash
git remote add origin <new-repo-url>
git branch -M main
git push -u origin main
```

## 工作習慣

每次重新開始本專案，先讀：

```text
handoff.md
memory.md
```

如果使用者說「今天先這樣」或「收工」，要更新 `handoff.md`，讓下次可以直接續工。

`memory.md` 用來保存長期決策，不要把每一次流水帳都塞進來；只有架構決策、使用者偏好、不可忘記的約束才更新這裡。
