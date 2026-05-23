/**
 * 全站共用 — 桌機右下角浮動 AI 按鈕 + 手機底部固定 dock。
 * 結構與 legacy *.html 完全對齊，樣式由 styles/site.css 提供。
 */
export function FloatingActions() {
  return (
    <>
      <a
        className="floating-ai"
        data-link="ai"
        href="/ai"
        target="_blank"
        rel="noreferrer"
        aria-label="立即使用風羿老師 AI 初步諮詢"
      >
        <span>AI</span>
        <span>立即使用風羿老師 AI 初步諮詢</span>
      </a>

      <div className="mobile-dock" aria-label="手機快速操作列">
        <a
          className="dock-ai"
          data-link="ai"
          href="/ai"
          target="_blank"
          rel="noreferrer"
        >
          AI 初步諮詢
        </a>
        <a
          className="dock-line"
          data-link="line"
          href="https://lin.ee/W88wwDB"
          target="_blank"
          rel="noreferrer"
        >
          LINE 預約
        </a>
        <a className="dock-booking" href="/booking">
          填表預約
        </a>
      </div>
    </>
  );
}
