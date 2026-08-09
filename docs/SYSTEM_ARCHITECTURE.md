# 巽風官方網站 V2｜系統與功能模組架構書

- 文件版本：1.0
- 盤點日期：2026-08-09
- 主系統：`xunfeng-official-v2`
- 相關舊原型：`xunfeng-yixue-system`

## 1. 文件目的

本文件整理巽風系統目前的技術架構、功能模組、資料模型、外部服務與系統邊界，作為後續開發、維護、測試、部署與交接依據。

本工作區包含兩套相關系統：

1. `xunfeng-official-v2`：目前正式發展中的主系統，涵蓋官網、會員、AI、課程、預約、金流、發票與管理後台。
2. `xunfeng-yixue-system`：早期獨立的易學 AI 決策原型，其核心能力已整合進主系統的會員決策功能。

## 2. 系統定位

巽風官方網站 V2 並非單純形象官網，而是一套整合下列能力的營運平台：

> 內容官網＋會員訂閱＋點數經濟＋AI 易學決策＋課程銷售＋顧問預約＋金流發票＋營運後台

## 3. 系統總覽

```text
巽風系統
├── A. 官方網站與內容展示
├── B. 會員與權限系統
├── C. 會員方案與點數經濟
├── D. AI 會員問答
├── E. 易學 AI 決策報告
├── F. 顧問預約管理
├── G. 課程與報名系統
├── H. 訂單與金流
├── I. 電子發票
├── J. 通知系統
├── K. 管理後台
├── L. 資料庫與安全
└── M. 部署、排程與維運
```

## 4. 技術架構

### 4.1 技術棧

| 層級 | 使用技術 |
| --- | --- |
| 前端 | Next.js 15、React 19、TypeScript、Tailwind CSS、既有 CSS/JavaScript |
| 後端 | Next.js App Router、Route Handlers |
| 身分驗證 | Supabase Auth |
| 資料庫 | Supabase PostgreSQL |
| 資料安全 | Row Level Security、伺服器端 Service Role、管理員權限檢查 |
| AI | OpenAI、Gemini、DeepSeek |
| 金流 | 綠界 ECPay |
| 電子發票 | ezPay 電子發票 |
| 部署 | Vercel |
| 驗證 | 環境檢查、E2E 測試、金流冪等測試、結構化輸出測試 |

### 4.2 邏輯分層

```text
使用者瀏覽器
     │
     ▼
Next.js + React
├── 公開網站
├── 會員中心
├── AI 問答／決策介面
└── 管理後台
     │
     ▼
Next.js API Routes
├── 身分驗證與權限
├── AI 模型協作
├── 會員與點數
├── 預約與課程
├── 訂單與付款
├── 電子發票
└── 管理 API
     │
     ├── Supabase Auth + PostgreSQL + RLS
     ├── OpenAI / Gemini / DeepSeek
     ├── 綠界 ECPay
     ├── ezPay 電子發票
     └── Email 通知服務
```

### 4.3 主要目錄

| 目錄 | 職責 |
| --- | --- |
| `app/(public)` | 公開網站、登入、會員中心與方案頁 |
| `app/member-ai` | 易學決策報告介面 |
| `app/member-admin` | 會員可查看的決策紀錄 |
| `app/admin` | 管理後台介面 |
| `app/api` | 前後台 API、AI、付款、發票與排程入口 |
| `components` | 共用網站元件 |
| `lib/auth` | 會員、管理員、方案與額度判定 |
| `lib/ai` | AI 問答、多模型 Council 與品質控制 |
| `lib/payments` | 訂單、綠界金流與電子發票服務 |
| `lib/notifications` | 會員、訂單與管理員通知 |
| `lib/supabase` | Supabase 瀏覽器端、伺服器端與管理端 client |
| `supabase/migrations` | 資料表、RLS、索引與 RPC migrations |
| `scripts` | 環境檢查及端到端測試 |
| `legacy-pages` | 舊站靜態頁面參考 |
| `public/content` | 前台可讀取的內容 JSON |

## 5. 功能模組架構

### 5.1 官方網站與內容展示

```text
官方網站
├── 首頁
├── 關於巽風／風羿老師
├── 服務項目
├── 企業年度顧問
├── 實績案例
├── 課程講座
├── 顧問預約
├── 會員方案
├── 隱私權政策
└── 付款完成頁
```

主要公開路由：

| 路由 | 功能 |
| --- | --- |
| `/` | 官網首頁與主要服務入口 |
| `/about` | 品牌、中心與老師介紹 |
| `/services` | 堪輿及顧問服務項目 |
| `/enterprise` | 企業年度顧問服務 |
| `/cases` | 案例與實績展示 |
| `/courses` | 課程介紹與線上報名 |
| `/booking` | 顧問預約表單 |
| `/member-pricing` | 會員方案與付款入口 |
| `/privacy` | 隱私權政策 |
| `/thanks` | 表單或付款完成頁 |

目前內容來源包含 React 頁面、公開 JSON 與舊版靜態頁面，後續應逐步統一內容管理來源。

### 5.2 會員與權限系統

```text
會員系統
├── 註冊
│   ├── 建立 Supabase Auth 使用者
│   ├── 建立會員 Profile
│   ├── 發放免費體驗方案
│   └── 寄送會員與管理員通知
├── 登入／登出
├── 忘記密碼／重設密碼
├── 取得目前會員資料
├── 會員中心
├── 啟用碼兌換
└── 權限分級
    ├── 一般會員
    ├── 方案會員
    └── 管理員
```

主要 API：

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/forgot-password`
- `/api/member/me`
- `/api/member/redeem`
- `/api/member/usage`

系統亦保留 `/api/register`、`/api/login`、`/api/logout`、`/api/me`、`/api/redeem` 等舊前端相容路徑。

### 5.3 會員方案與點數經濟

```text
方案與點數
├── 方案列表
│   ├── 免費體驗 trial：0 元／30 點／30 天
│   ├── 基礎會員 basic：NT$980／106 點／30 天
│   ├── 進階會員 pro：NT$1,980／218 點／30 天
│   └── VIP 會員 vip：NT$4,980／534 點／30 天
├── 會員權益
│   ├── 生效日期
│   ├── 到期日期
│   ├── 剩餘點數
│   └── 可使用功能
├── 點數取得
│   ├── 購買會員方案
│   ├── 啟用碼兌換
│   └── 管理員調整
└── 點數消耗
    ├── AI 問答
    └── 易學決策報告
```

方案定義於 migration `0013_point_economy_2026.sql`（純 update，可重複執行）；trial 的 30 點以程式常數 `TRIAL_CREDITS` 為準。點數不分桶，報告與聊天共用同一個 `credits_remaining`。

扣點費率（權威來源為程式碼，非本文件）：

| 項目 | 費率 | 來源 |
| --- | --- | --- |
| 易學決策報告 | 固定 20 點 / 份，各等級一律相同，無月免額度 | `lib/auth/tier.ts` |
| AI 會員問答 | 回覆中文字每 1,000 字 1 點，最少 1 點 | `lib/ai/member-chat.ts` |

點數異動記錄於 `credit_transactions`。AI 問答與決策報告透過 PostgreSQL RPC 原子化扣點，避免同時請求造成重複扣點或餘額競爭問題。

### 5.4 AI 會員問答

```text
AI 會員問答
├── 會員資格檢查
├── 歷史對話輸入
├── 巽風專屬系統提示
├── OpenAI 回覆
├── 回覆品質處理
├── 使用量紀錄
└── 點數扣除
```

主要規則：

- 每 1,000 個 AI 回覆中文字扣 1 點。
- AI 成功產生回覆後才扣點。
- AI 呼叫失敗不扣點。
- 扣點遇到餘額競爭衝突時，仍交付已經生成的回覆並留下紀錄。

主要路由為 `/member-ai`，主要 API 為 `/api/ai/chat`。

### 5.5 易學 AI 決策報告

命名說明：功能正式名稱是「易學決策報告」，全站導覽、後台、通知信與報告檔名皆使用此名。
「天機四象 · 順轉人生」是 2026-08-06 改版（commit `51c6a2f`）為 `/member-ai/decision` 登陸頁加上的**體驗主標語**，
只出現在該頁 Landing 畫面，不是功能改名，其他地方不應替換。

```text
易學決策報告
├── 顧客基本資料
│   ├── 姓名
│   ├── 性別／身分
│   ├── 出生年月日時
│   └── 國曆／農曆
├── 決策問題
│   ├── 主題
│   ├── 問題描述
│   ├── 背景資料
│   └── 報告格式
├── 易學術數模組
│   ├── 八字
│   ├── 奇門遁甲
│   ├── 六爻
│   └── 梅花易數
├── 多模型 AI Council
│   ├── OpenAI：主判讀
│   ├── Gemini：策略推演
│   ├── DeepSeek：攻防反證
│   ├── 第二輪交叉校核
│   └── OpenAI：風羿老師終稿
├── 品質控制
│   ├── 報告完整度檢查
│   ├── 結構化 JSON 擷取
│   ├── 安全備援報告
│   └── 備援報告不扣點
├── 報告輸出
│   ├── 商業決策顧問報告
│   ├── 標準個人諮詢報告
│   ├── 企業主管簡報版
│   ├── 教學展示版
│   └── 分享卡
└── 紀錄管理
    ├── 會員歷史報告
    ├── 管理員查詢
    ├── Token 用量
    ├── 實際扣點
    └── 免費額度使用狀態
```

AI Council 處理流程：

```text
會員驗證
→ 方案權限與本月免費額度檢查
→ 點數餘額預檢
→ OpenAI、Gemini、DeepSeek 平行初判
→ 三模型第二輪攻防修正
→ OpenAI 產生風羿老師最終定稿
→ 完整度與結構化資料檢查
→ 必要時產生安全備援報告
→ 寫入使用量與 Council 紀錄
→ 原子扣點
→ 回傳正式報告
```

主要路由與 API：

- `/member-ai/decision`
- `/member-admin/council-runs`
- `/api/ai/council`
- `/api/admin/council-runs`

### 5.6 顧問預約管理

```text
預約系統
├── 前台預約表單
├── 聯絡資料
├── 服務需求
├── 預約時間
├── 狀態管理
├── 管理員備註
├── 指派處理人
└── 更新／刪除預約
```

主要路由與 API：

- `/booking`
- `/admin/bookings`
- `/admin/bookings/[id]`
- `/api/bookings`
- `/api/admin/bookings`
- `/api/admin/bookings/[id]`

### 5.7 課程與報名系統

```text
課程系統
├── 課程內容展示
├── 海報／影片輪播
├── 新生／舊生價格
├── 報名者資料
├── 學習背景
├── 興趣項目
├── 報名動機
├── 發票資料
├── 建立課程訂單
└── 綠界付款
```

主要資料實體：

- `course_products`：課程商品及價格。
- `course_registrations`：學員資料及報名內容。
- `orders`：課程或會員方案付款訂單。

主要入口為 `/courses` 與 `/api/courses/checkout`。

### 5.8 訂單與金流

```text
訂單與付款
├── 會員方案訂單
├── 課程報名訂單
├── 建立 Pending 訂單
├── 綠界付款表單
├── 信用卡付款
├── ATM 虛擬帳號
├── CheckMacValue 驗證
├── 付款成功處理
├── 重複通知防護
├── 逾期待付款訂單清理
└── 付款後發放會員權益
```

主要 API：

- `/api/orders/create`
- `/api/courses/checkout`
- `/api/payments/ecpay/notify`
- `/api/payments/ecpay/return`
- `/api/cron/cleanup-pending-orders`

### 5.9 電子發票

```text
電子發票
├── 個人發票
├── 公司三聯式發票
├── 統一編號／發票抬頭
├── Email 通知
├── 手機條碼載具
├── 捐贈碼
├── 付款後開立
├── 管理員手動補開
└── 發票狀態查詢
```

目前程式架構採用綠界 ECPay 處理金流、ezPay 處理電子發票。系統已有發票資料表、發票服務與管理介面。

主要路由與 API：

- `/admin/invoices`
- `/api/admin/invoices`
- `/api/admin/invoices/[orderId]/issue`

### 5.10 通知系統

```text
Email 通知
├── 新會員歡迎信
├── 新會員管理員通知
├── 訂單通知
├── 付款完成通知
├── 發票通知
└── 系統異常／管理員警示
```

通知服務集中於 `lib/notifications/`，依會員、訂單與管理員事件分檔管理。

### 5.11 管理後台

```text
管理後台
├── 總覽儀表板
├── 會員管理
│   ├── 會員查詢
│   ├── 方案狀態
│   ├── 點數調整
│   └── 產生啟用碼
├── 預約管理
├── 訂單管理
│   ├── 會員方案訂單
│   └── 課程報名訂單
├── 發票管理
├── 易學決策紀錄
│   ├── 查看完整報告
│   ├── 查看各輪模型輸出
│   └── 刪除紀錄
└── Token 用量分析
    ├── OpenAI
    ├── Gemini
    ├── DeepSeek
    └── 圖表統計
```

主要後台路由：

- `/admin`
- `/admin/members`
- `/admin/bookings`
- `/admin/orders`
- `/admin/invoices`
- `/admin/council-runs`
- `/admin/token-usage`

管理員操作會寫入 `admin_audit_logs`，提供後續稽核依據。

## 6. 資料架構

### 6.1 核心資料表

| 分類 | 資料表 | 用途 |
| --- | --- | --- |
| 身分 | `profiles` | 會員基本資料、角色與聯絡資訊 |
| 方案 | `plans` | 方案名稱、價格、點數與期限 |
| 權益 | `member_entitlements` | 會員目前有效方案、到期日與剩餘點數 |
| 點數 | `credit_transactions` | 點數增加、扣除及來源紀錄 |
| AI 用量 | `usage_logs` | AI 提問、回覆與 Token 使用量 |
| 決策報告 | `council_runs` | Council 各輪結果、終稿、扣點與結構化資料 |
| 訂單 | `orders` | 會員方案與課程訂單 |
| 金流 | `payments` | 金流交易、交易編號與驗證結果 |
| 發票 | `invoices` | 發票號碼、買受人、載具與開立狀態 |
| 預約 | `consultation_bookings` | 顧問預約與處理狀態 |
| 課程 | `course_products` | 課程商品、場次與價格 |
| 報名 | `course_registrations` | 學員報名資料與需求 |
| 啟用碼 | `activation_codes` | 會員方案啟用碼 |
| 稽核 | `admin_audit_logs` | 管理員操作紀錄 |

### 6.2 主要資料關係

```text
profiles
├── member_entitlements
│   ├── credit_transactions
│   ├── usage_logs
│   └── council_runs
├── orders
│   ├── payments
│   ├── invoices
│   └── course_registrations
└── consultation_bookings

plans
└── member_entitlements / orders

course_products
└── orders / course_registrations
```

## 7. 權限與安全架構

```text
安全控制
├── Supabase Auth 驗證
├── Bearer Token 會員識別
├── Profile 角色判定
├── 方案與功能權限判定
├── PostgreSQL Row Level Security
├── Service Role 僅限伺服器端
├── 管理操作稽核紀錄
├── 金流 CheckMacValue 驗證
├── 訂單與付款防重複索引
└── AI 點數原子化扣除
```

會員原則上只能讀取自己的資料；管理員可依角色及後台權限存取營運資料。高權限 Supabase client 應只在伺服器端使用，不得傳送到瀏覽器。

## 8. 外部服務整合

| 外部服務 | 用途 | 主要接點 |
| --- | --- | --- |
| Supabase Auth | 註冊、登入與使用者身分 | `lib/supabase`、`lib/auth` |
| Supabase PostgreSQL | 業務資料、RLS、RPC | `supabase/migrations` |
| OpenAI | AI 會員問答、Council 主判讀與終稿 | `lib/ai` |
| Gemini | Council 策略推演 | `lib/ai/council/providers.ts` |
| DeepSeek | Council 攻防反證 | `lib/ai/council/providers.ts` |
| 綠界 ECPay | 會員方案與課程付款 | `lib/payments/ecpay.ts` |
| ezPay | 電子發票開立 | `lib/payments/ezpay-invoice.ts` |
| Vercel | 網站、API 與排程部署 | `vercel.json`、Next.js 專案 |

## 9. 核心業務流程

### 9.1 會員註冊與體驗

```text
填寫註冊資料
→ 建立 Supabase Auth 使用者
→ 建立 Profile
→ 嘗試發放免費體驗 Entitlement
→ 寄送歡迎信與管理員通知
→ 登入會員中心
```

### 9.2 購買會員方案

```text
會員選擇方案
→ 建立 Pending 訂單
→ 前往綠界付款
→ 綠界 Notify 回傳
→ 驗證 CheckMacValue
→ 更新訂單與付款狀態
→ 建立會員權益
→ 發放點數
→ 建立電子發票
→ 寄送通知
```

### 9.3 課程報名

```text
選擇課程與身分價格
→ 填寫學員及發票資料
→ 建立課程報名與訂單
→ 綠界付款
→ 更新訂單／報名狀態
→ 開立發票
→ 後台查詢報名資料
```

### 9.4 AI 問答

```text
會員登入
→ 檢查有效方案與至少 1 點
→ 呼叫 OpenAI
→ 記錄 Usage Log
→ 依回覆中文字數計算點數
→ 原子扣點
→ 回傳 AI 回覆與最新餘額
```

### 9.5 易學決策報告

```text
輸入個案資料與決策問題
→ 檢查方案權限、免費額度與點數
→ 三模型第一輪平行分析
→ 三模型第二輪攻防校核
→ 風羿老師 AI 統整終稿
→ 品質檢查與結構化擷取
→ 儲存使用量與 Council 紀錄
→ 原子扣點
→ 顯示正式報告與分享內容
```

## 10. 部署、排程與測試

```text
維運能力
├── Vercel 正式／預覽部署
├── Supabase migrations
├── 待付款訂單清理排程
├── ECPay 環境檢查
├── ezPay 環境檢查
├── 金流防重複測試
├── ATM 配號測試
├── 電子發票 E2E 測試
├── AI Chat E2E 測試
└── Council 結構化輸出測試
```

主要測試與檢查指令定義於 `package.json`：

- `npm run build`
- `npm run test:ecpay-idempotency`
- `npm run test:ecpay-atm-allocation`
- `npm run check:ecpay-env`
- `npm run check:ezpay-env`
- `npm run test:ezpay-invoice-e2e`
- `npm run test:ai-chat-e2e`

## 11. 舊版易學 AI 原型

`xunfeng-yixue-system` 是早期的 Next.js 14 單頁 AI Council 原型，包含：

```text
舊版易學 AI 原型
├── 單頁決策介面
├── 八字
├── 奇門遁甲
├── 六爻
├── 梅花易數
├── OpenAI
├── Gemini
├── DeepSeek
├── AI Council
└── 報告／JSON 輸出
```

上述核心能力已經搬入主系統 `/member-ai/decision`。建議將舊專案明確標示為歷史原型或唯讀參考，避免後續維護到錯誤專案。

## 12. 已知架構整理事項

以下四項為 2026-08-09 盤點時發現，同日已處理，本節保留原因與處置方式供追溯。

### 12.1 文件狀態不同步（已處理）

原問題：README 停留在專案骨架期，描述多數 API 為 `501` 佔位，且完全未提及發票、Council、課程與預約；`handoff.md` 的「尚未完成」與「電子發票串接 TODO」章節仍寫發票「完全沒實作」，但實際已有 migration `0008`／`0009`／`0012`、`lib/payments/ezpay-invoice.ts`、notify 自動開票、`/admin/invoices` 與 admin API。

處置：

- README 全文重寫，以現行程式為準，並補上文件導覽、點數規則、內容來源與正式營運前未完成項目。
- `handoff.md` 檔頭加導引，指明未標日期的章節屬 2026-05-19 骨架期內容；「尚未完成」與「電子發票串接 TODO」就地加 ⚠️ 更正框，列出實際實作位置與**仍未完成**的部分（ezPay 仍在 stage、會員端發票查詢與作廢 API 未做）。
- 本架構書補上 VIP 方案、四檔方案價格與扣點費率表、決策報告命名說明。

### 12.2 內容來源分散（已處理）

原問題：`content/` 與 `public/content/` 是同內容的兩份副本，但只有 `public/content/` 會被瀏覽器讀到（`public/js/cms-render.js` 以相對路徑 `content/*.json` 取用）。兩者的 `services.json` 已經漂移——commit `f2c636d` 想在首頁服務目錄露出「易學決策報告」與「AI 即時問答」，只改了不會被服務的 `content/`，**該異動從未在線上生效**；且其中價格寫「10 點 / 份（VIP 月免 3 份）」，與現行 20 點、無月免額度不符。

處置：

- 兩筆數位服務以正確費率補進 `public/content/services.json`，六個 JSON 檔已完全一致。
- `cms-render.js` 的 `renderServices` 加 `serviceCta()`：有 `href` 的數位服務導向站內功能頁，其餘維持預約表單。原本 CTA 寫死 `/booking`，是 `f2c636d` 無法直接上線的技術原因。
- `legacy-pages/` 經確認已無任何程式讀取，純參考素材。

仍待決定：根目錄 `content/` 是否直接刪除。它沒有任何程式或 build 步驟讀取，留著就得手動同步，是這次漂移的根因；但屬破壞性變更，留待確認。

### 12.3 新舊系統功能重疊（已處理）

處置：`xunfeng-yixue-system` README 抬頭加封存聲明，指向主系統路徑、repo、對應功能與架構文件，並打上 git tag `archived-2026-08-09`（本地，尚未 push）。專案本身保留，不刪除。

### 12.4 舊 API 相容層（已處理）

原判斷需修正：這六條路徑並非「等舊前端退場」，而是**現役前端仍在呼叫**——`public/js/member-auth.js` 與 `member-ai.js` 一直打 `/api/register`、`/api/login`、`/api/me`、`/api/redeem`、`/api/chat`。若照原建議直接移除相容層，會當場打壞註冊、登入、會員資料、啟用碼兌換與 AI 問答。

處置：前端六處呼叫全數改為正規路徑（`/api/auth/*`、`/api/member/*`、`/api/ai/chat`），`npm run build` 通過。相容層**暫時保留**並在每個檔案加註退場條件，僅為使用者瀏覽器可能快取的舊版 JS 兜底。`/api/logout` 則確認自始無呼叫者（前端 `logout()` 只清 token）。

下一步：觀察正式站這六條路徑的流量，確認歸零後整組移除。

## 13. 後續建議

第 12 節四項已於 2026-08-09 處理完畢，剩餘建議如下：

1. 將本文件列為主系統架構基準，功能異動時同步更新。
2. 決定根目錄 `content/` 去留（見 12.2），避免同樣的漂移再次發生。
3. 觀察舊 Worker 相容路徑流量，歸零後整組移除（見 12.4）。
4. 補齊金流、發票、AI Council 與點數競爭情境的自動化測試。
5. 補充正式環境的備份、監控、錯誤告警及事故處理流程。
6. 完成正式營運 gate：ezPay 切正式字軌、信用卡真實刷卡 E2E、Gemini / DeepSeek 正式 key、Resend 網域驗證。

