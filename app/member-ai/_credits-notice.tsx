"use client";

// 點數不足時的共用提示。
//
// 2026-09-21 之前，三個功能各自把錯誤當成一般文字顯示，而且沒有任何出口：
// 天機書的錯誤畫面只給一顆「返回修改」——但點數不足不是改表單能解決的事，
// 那等於把剛用完免費點數的會員推進死路。
//
// 這個元件把「差多少」與「去哪裡補」講清楚，三個介面共用同一套說法。

import "./_credits-notice.css";
import { CREDITS_PURCHASE_PATH, type InsufficientCreditsDetails } from "@/lib/auth/credits";

export function CreditsNotice({
  details,
  message,
  onBack,
  backLabel = "返回修改"
}: {
  /** 後端回傳的 details；舊版或非預期回應可能沒有，屆時只顯示訊息與出口。 */
  details?: Partial<InsufficientCreditsDetails> | null;
  message?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const required = numberOrNull(details?.required);
  const remaining = numberOrNull(details?.remaining);
  const shortfall = numberOrNull(details?.shortfall);
  const feature = details?.feature;

  return (
    <article className="xf-credits-notice">
      <span className="xf-credits-eyebrow">點數不足</span>
      <h2>{feature ? `${feature}的點數不夠了` : "點數不夠了"}</h2>

      {required !== null && remaining !== null ? (
        <div className="xf-credits-figures">
          <div>
            <span>本次需要</span>
            <strong>{required} 點</strong>
          </div>
          <div>
            <span>目前剩餘</span>
            <strong>{remaining} 點</strong>
          </div>
          {shortfall !== null && shortfall > 0 && (
            <div className="short">
              <span>還差</span>
              <strong>{shortfall} 點</strong>
            </div>
          )}
        </div>
      ) : (
        message && <p className="xf-credits-message">{message}</p>
      )}

      <p className="xf-credits-message">
        加購點數或升級方案後即可繼續。<strong>本次未扣點。</strong>
      </p>

      <div className="xf-credits-actions">
        <a className="xf-credits-btn primary" href={CREDITS_PURCHASE_PATH} data-xf-event="credits_upgrade_from_error">
          前往加購點數
        </a>
        <a className="xf-credits-btn ghost" href="/member">
          查看我的點數
        </a>
        {onBack && (
          <button type="button" className="xf-credits-btn ghost" onClick={onBack}>
            {backLabel}
          </button>
        )}
      </div>
    </article>
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
