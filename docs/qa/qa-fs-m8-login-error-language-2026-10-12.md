# QA-FS-M8｜登入錯誤訊息仍顯示英文

**嚴重度：minor**　**狀態：既有 Ego UI 缺陷＋新增 API route 替身複現；待 X-PM 排序、工程修復與候選複驗。**

## 範圍與重現

Route：`POST /api/auth/login`。在 `scripts/qa-login-boundaries.vitest.mts` 使用 Supabase Password Auth stub：

1. POST `{ "email": "member@example.test", "password": "bad-password" }`。
2. Auth stub 對已知與未知 email 都回 `{ status: 400, message: "Invalid login credentials" }`。
3. 檢查 HTTP status、response body 及 profile 建立呼叫數。

預期為 4xx、同樣的中文通用登入錯誤，且不洩漏帳號存在狀態；實際為 HTTP 400，但 body 的 `error` 是英文 `Invalid login credentials`。Known／unknown 回應相同、沒有 profile side effect。額外測試顯示空／畸形 JSON、SQLi 形狀 email、非字串欄位、空密碼均在呼叫 Auth 前回 400；成功登入回傳 session/member；不完整 Auth session 不建立 profile。

重跑：

```sh
./node_modules/.bin/vitest run --config scripts/qa-login-boundaries.vitest.mts
```

結果：**4 passed、1 expected fail／5**。只有「顯示中文通用訊息」預期失敗。證據是實際 login route 加 Auth/profile 替身，並非真 Supabase Auth 或瀏覽器互動；未建立帳號、未寫 DB。

## 影響與驗收標準

錯誤訊息與繁體中文介面不一致，降低錯密碼後續操作的清晰度。修復後錯密碼及未知帳號均回 4xx、同一中文通用訊息，不暴露帳號是否存在；非法輸入在 Auth 前拒絕；有效登入仍回傳 session/member，不完整 session 不建立 profile。Ego Lite UI 應顯示同一中文提示。

## 清理與複驗

僅使用合成 email／密碼與 stub；沒有 Auth、DB、Profile 或 mail fixture 需要清理。候選修復後重跑此 suite、login route regression、typecheck，再以隔離 QA 帳號做 Ego Lite 輸入／錯密碼／成功登入回歸。
