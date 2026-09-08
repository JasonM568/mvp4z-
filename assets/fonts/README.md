# 內嵌字型

## NotoSansTC-Regular.otf

面相報告 PDF 的中文字型。**不是網頁字型**，不放 `public/`——
它只在伺服器端由 pdfkit 讀取嵌入 PDF，不該被瀏覽器下載。

- 來源：https://github.com/notofonts/noto-cjk `Sans/SubsetOTF/TC/NotoSansTC-Regular.otf`
- 授權：SIL Open Font License 1.1（可自由散布與嵌入）
- 大小：約 5.4 MB。pdfkit 會依報告實際用到的字做子集化，
  產出的 PDF 只有 30–60 KB，不是 5.4 MB。

## 為什麼是這一份

2026-09-08 實測過三種組合，只有 pdfkit + 這份 OTF 是對的：

| 方案 | 結果 |
|---|---|
| pdf-lib + OTF，`subset: true` | **全是亂碼**——中文字變成 `! " # $ %`，glyph ID 被當字元碼寫出 |
| pdf-lib + OTF，`subset: false` | 正確，但每份 PDF 4.9 MB |
| pdf-lib + 可變 TTF，`subset: true` | **缺字**——堪、輿、乙、丙、丑、寅與所有英數字消失，字重也錯 |
| **pdfkit + 這份 OTF** | **正確**，33 KB，60 ms |

pdf-lib 1.17.1（2021 年後未再維護）的 CFF 子集化對 CJK 是壞的。
換字型或換套件前，請務必把產出的 PDF 轉成圖片看過——
寬度量測會通過但畫面是亂碼，只驗 API 不會發現。
