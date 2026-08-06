# SPEC-02｜面相拍照上傳與照片品質檢測

## 1. 文件資訊

| 欄位 | 內容 |
|---|---|
| 版本 | 1.0.0 |
| 日期 | 2026-08-06 |
| 狀態 | Ready after SPEC-01 |
| 路由 | `/member-ai/face` |

## 2. 概述

將原型的自拍／拍他人流程整合進正式官網，先做可驗證的照片品質檢測。品質未通過時不得呼叫 LLM、不得扣點、不得產生運程報告。

## 3. 範圍

### 包含

- 正式響應式頁面、登入與會員狀態提示。
- 相機即時拍照、原生拍照備援、相簿上傳。
- 自拍／他人適配模式、選填年齡、同意勾選。
- 本機預檢與後端權威品質檢測。
- 明確重拍原因與操作引導。

### 不包含

- 完整面相報告、點數扣除。
- 任務換點與四層付費方案。
- 健康、合作、感情結論。

## 4. 技術環境與約束

- 頁面放 `app/member-ai/face/`；不得自建 header，使用現有 `SiteHeader` 架構。
- 相機使用 `navigator.mediaDevices.getUserMedia`；未經使用者操作不得主動請求權限。
- 相機權限拒絕時仍須提供 `<input type=file accept="image/*" capture="user|environment">` 與相簿選擇。
- 前端壓縮只為傳輸效率，後端仍須重新驗證 MIME、尺寸與檔案內容。
- 不得把照片寫入 localStorage/sessionStorage/IndexedDB。
- 前端分析不得宣稱「可信度」或「面相分數」；僅顯示可量測的拍攝品質。

## 5. 相依與執行順序

1. 建立頁面與 step state：`landing → capture → quality → ready`。
2. 建立 `POST /api/face-analysis/runs`。
3. 建立 `POST /api/face-analysis/runs/[id]/upload`。
4. 建立影像解碼、品質檢測與回應 mapping。
5. 補桌機、iOS Safari、Android Chrome 響應式測試。

## 6. API 與狀態模型

### `POST /api/face-analysis/runs`

Bearer 驗證後建立 run。body：`mode`、`subjectAge`、`consentVersion`、`thirdPartyConsent`、`requestId`。回傳 `runId`、`status=created`，不回 user_id/storage_path。

### `POST /api/face-analysis/runs/{id}/upload`

接收 multipart 單檔 `image`。伺服器依序：驗證擁有者 → MIME magic bytes → 大小 → 解碼 → EXIF orientation 正規化 → 移除 EXIF → 品質分析 → 存私有縮圖／來源檔 → 更新 run。

成功回傳：

```json
{
  "ok": true,
  "runId": "uuid",
  "status": "uploaded",
  "quality": {
    "passed": true,
    "faceCount": 1,
    "sharpness": "good",
    "lighting": "acceptable",
    "pose": "front",
    "reasons": []
  }
}
```

拒絕 reason code：`NO_FACE`、`MULTIPLE_FACES`、`FACE_TOO_SMALL`、`TOO_BLURRY`、`TOO_DARK`、`TOO_BRIGHT`、`POSE_NOT_FRONT`、`FACE_OCCLUDED`、`UNSUPPORTED_IMAGE`、`FILE_TOO_LARGE`。

### 品質最低門檻

- faceCount 必須等於 1。
- 人臉 bounding box 面積／圖片面積 >= 0.18。
- abs(yaw) <= 15°、abs(pitch) <= 12°、abs(roll) <= 10°。
- 兩眼、鼻、嘴不得被主要遮擋。
- blur/brightness 的實際數值與門檻須由 server 回傳內部資料，但前端只顯示高／可用／需重拍。

## 7. 角色與權限

- 訪客可查看功能介紹，但按「開始分析」須導向 `/login?next=/member-ai/face`。
- 登入且有有效 trial/basic/pro/vip entitlement 才可建立 run。
- 免費品質檢測不扣點；點數不足仍可完成拍照品質檢測，進入報告前再提示購買。
- `mode=other` 未勾選已取得本人同意時，建立 run 必須回 400。

## 8. 任務清單與驗收標準

- [ ] 新頁面在 390px、768px、1440px 無水平溢出。
- [ ] 相機開啟後離開 capture step 必須停止所有 MediaStream tracks。
- [ ] 檔案預覽 URL 使用後 revoke。
- [ ] 產生按鈕在沒有照片或沒有同意時不可執行，並提供可理解原因。
- [ ] 非人臉、多人、模糊、暗、側臉圖片皆被拒絕且不扣點。
- [ ] 合格照片顯示「已可進行分析」，不先顯示運程分數。
- [ ] 重送相同 requestId 不建立重複 run。
- [ ] 拒絕偽造 Content-Type、超大圖、解碼炸彈與非圖片內容。
- [ ] 頁面包含民俗文化、非醫療／法律／投資建議與第三人同意提醒。

## 9. 非功能要求與 Agent 執行指示

- 上傳 API body limit、rate limit 與 timeout 必須明確設定。
- 品質檢測 P95 目標小於 4 秒，不含使用者上傳時間。
- 無障礙：相機按鈕、錯誤訊息、模式切換、checkbox 皆有 label；不可只靠顏色表達。
- 不得複製原型中 seed 評分程式；驗收需提供實際測試圖片矩陣與結果。
