import { AiEntryButton } from "@/components/AiEntryButton";

/**
 * 全站共用 — 手機底部固定 dock。
 * 結構與 legacy *.html 完全對齊，樣式由 styles/site.css 提供。
 */
export function FloatingActions() {
  return (
    <div className="mobile-dock" aria-label="手機快速操作列">
      <AiEntryButton variant="dock" />
      <a className="dock-booking" href="/booking">
        填表預約
      </a>
    </div>
  );
}
