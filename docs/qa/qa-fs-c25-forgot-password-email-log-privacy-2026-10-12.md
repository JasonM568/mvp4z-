# QA-FS-C25｜忘記密碼 provider error 日誌包含原始 email

**嚴重度：minor（隱私資料最小化）**　**狀態：route 替身已重現；待 X-PM 排序／工程修復與隔離複驗。**

## 重現與證據

路由：`POST /api/auth/forgot-password`。重跑：

```sh
./node_modules/.bin/vitest run --config scripts/qa-forgot-password-boundaries.vitest.mts
```

測試令 Auth stub 回 `provider unavailable`，並用合成地址 `synthetic-privacy@example.test` 呼叫 route。專用 suite 結果 **6 passed、3 expected fail／9 tests**；實際 `console.warn` 內容包含完整 email，亦輸出 provider error message；隱私斷言為 expected fail。這是 route／console 替身證據，沒有讀取任何正式服務日誌，也未證明日誌的存取權限或保存期限。

## 影響與驗收標準

重設密碼路由的 provider error 會把會員 email 寫入應用程式日誌。即使日誌受管理員權限保護，仍擴大敏感識別資料的保留面。修復後錯誤紀錄不得包含原始 email、token、action link 或 provider 原始個資；只記錄 request/correlation ID、錯誤類型與安全的計數指標。route test 注入 provider error 並檢查 console/logger arguments 不含合成 email；確認 API 仍維持已知／未知帳號不可枚舉的相同公開回應。

## 複驗與清理

只用合成地址與 Auth stub；修復後移除 expected-fail，執行本 suite、auth route regression、typecheck。沒有真帳號、郵件或正式日誌資料需要清理。
