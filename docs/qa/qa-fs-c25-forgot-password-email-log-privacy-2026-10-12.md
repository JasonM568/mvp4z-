# QA-FS-C25｜忘記密碼 provider error 日誌包含原始 email

**嚴重度：minor（隱私資料最小化）**　**狀態：候選隱私斷言獨立複驗通過；記錄關聯性要求待 X-PM 確認；真日誌管線與正式站未驗。**

## 重現與證據

路由：`POST /api/auth/forgot-password`。重跑：

```sh
./node_modules/.bin/vitest run --config scripts/qa-forgot-password-boundaries.vitest.mts
```

初始缺陷以 Auth stub 和合成地址 `synthetic-privacy@example.test` 重現：舊 route 的 `console.warn` 含完整 email 與 provider error message。候選 C25 commit `bed10dc7a068eef91737888385282529791af455` 上，QA 專用 known/unknown response 與日誌隱私案例 **2/2** 通過。再於 C24 SHA `e856c3f0fb6797d3c5aae4c4f48216bd4d107197` 執行全 suite **7/7**。測試注入的 provider message 含合成 email、token、action link；候選 log 不含這些字串或原始錯誤內容。這只驗 route／console stub，未讀取正式服務日誌或證明其存取權限與保存期限。

## 影響與驗收標準

重設密碼路由的 provider error 曾把會員 email 寫入應用程式日誌。候選 log 現只包含固定事件、錯誤類型與安全錯誤碼，通過敏感字串斷言；但沒有 request/correlation ID 或安全計數指標。此診斷關聯性是否為必要驗收條件交 X-PM 確認，不把未覆蓋的欄位算作通過。已知／未知地址的公開回應一致。

## 複驗與清理

只用合成地址與 Auth stub；QA suite 已移除缺陷預期並通過固定候選。真 Auth、郵件與正式日誌管線仍待後續驗收。沒有真帳號、郵件或正式日誌資料需要清理。
