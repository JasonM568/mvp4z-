# QA-FS-UI1：320px 公開頁面水平溢出

**嚴重度：minor**　**狀態：待 X-PM 定序／派工**　**環境：正式站唯讀瀏覽器檢查**

## 重現步驟

1. 使用 Ego Lite，將視窗設為 320 × 844 CSS px。
2. 開啟 `https://www.xunfeng.tw/courses`，等待頁面載入。
3. 檢查 `document.body.scrollWidth` 與 `document.body.clientWidth`，並檢視主標語及其他課程卡標題。
4. 重複開啟 `https://www.xunfeng.tw/member-pricing`，檢查主標題、說明文及水平溢出。

## 預期與實際

| 頁面 | 預期 | 實際 |
|---|---|---|
| `/courses` | 主要文字完整換行；body 不超過 320px | body scrollWidth **337px**／clientWidth 320px；`.cl-headline` scrollWidth 323px／clientWidth 292px；其他課程卡 H3 為 170px／152px。主標語與卡片標題超出內容欄。 |
| `/member-pricing` | 方案主標題與說明文完整顯示；body 不超過 320px | body scrollWidth **358px**／clientWidth 320px；H1 及 accent span 為 344px／292px，lead paragraph 為 304px／292px；截圖可見主標題右側文字被裁切。 |

## 範圍與證據

正式站 10 個公開頁面在 390px 均有 `main`／`h1`，body 無水平溢出；320px 下 8 頁通過、以上 2 頁失敗。手機主選單可展開，服務子選單顯示服務、企業顧問、預約及關於頁連結。本次沒有提交預約、登入、購買或其他寫入操作。

- [320px `/courses` 截圖](evidence/qa-fs-ui1-courses-320.png)
- [320px `/member-pricing` 截圖](evidence/qa-fs-ui1-pricing-320.png)

## 影響與驗收標準

320 CSS px 寬度的窄螢幕使用者可能看不到課程主標語末段、課程卡名稱或會員方案主標題完整內容。修復後於 320、360、390px 驗證 `/courses` 與 `/member-pricing`：標題與段落完整換行、可視內容不被裁切、`document.body.scrollWidth === document.body.clientWidth`；桌面版版面維持正常。重新驗證其他 8 個公開頁面 320px 無溢出，並確認手機導覽仍可展開及進入子選單。

## 證據限制

本次是 2026-10-11 正式站唯讀瀏覽器測試，只證明當時部署版本的視覺問題；沒有檢查修復候選、不同瀏覽器字型或正式站後續版本。沒有測預約與付款互動。
