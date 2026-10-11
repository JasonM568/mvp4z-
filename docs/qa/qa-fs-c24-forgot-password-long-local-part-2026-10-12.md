# QA-FS-C24｜忘記密碼 API 接受超長 email local-part

**嚴重度：minor**　**狀態：route 替身已重現；待 X-PM 排序／工程修復與隔離 API 複驗。**

## 重現與證據

路由：`POST /api/auth/forgot-password`。重跑：

```sh
./node_modules/.bin/vitest run --config scripts/qa-forgot-password-boundaries.vitest.mts
```

QA route suite **6 passed、3 expected fail／9 tests**。使用合成地址，local-part 是 260 個 ASCII `a`，再接 `@example.test`。現行 `forgotSchema` 只有 `z.string().trim().email()`，無長度上限；實際 route 替身觀察為 HTTP 200 `{ok:true}`，並呼叫 `resetPasswordForEmail` 傳入整個超長地址。64-octet local-part case 走正常路徑；65 與 260 octets 在預期拒絕斷言為 expected fail。這是路由／Auth stub 證據，沒有呼叫真 Supabase Auth 或寄信。

SMTP RFC 5321 §4.5.3.1.1 規定 local-part 最長 64 octets；此 260-octet local-part 不符合該限制。見 [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html#section-4.5.3.1.1)。

## 影響與驗收標準

輸入本身不合法，仍會進入 Auth provider，並對用戶回報通用成功，可能造成無效重設請求及無用 provider 呼叫。修復後需拒絕超過系統支援長度的地址（ASCII local-part 64 octets 邊界內可走正常路徑，65+ octets 在 Auth client 呼叫前回 400），保持已知／未知地址與 provider error 的回應一致；含前後空白、大小寫正規化、非法字元、空 body、畸形 JSON、非字串與超長 payload 測試。隔離 HTTP/Auth 驗證 rejected input 不呼叫 provider；正式信件投遞另驗，不能以 stub 取代。

## 複驗與清理

使用專用隔離 Auth／stub 與合成地址；對正常地址只用 Mailpit 或 stub。核對 invalid case provider call=0、fixture 無寫入、郵件只寄往 QA inbox。移除 expected-fail，跑本 suite、auth route regression 與 typecheck。
