"use client";

import { AiEntryButton } from "@/components/AiEntryButton";

/**
 * 全站共用 — 桌機右下角浮動 AI 按鈕 + 手機底部固定 dock。
 * 結構與 legacy *.html 完全對齊，樣式由 styles/site.css 提供。
 * AI 按鈕對已啟用付費會員切「進入 AI 會員版」（連 /member-ai/decision）。
 */
export function FloatingActions() {
  return (
    <>
      <AiEntryButton variant="floating" />

      <div className="mobile-dock" aria-label="手機快速操作列">
        <AiEntryButton variant="dock" />
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
