"use client";

// 訪客進入四象問天機時的彈跳視窗：引導前往註冊（或登入）。
// 四象是會員專屬功能，訪客什麼都送不出去；原本只有頁面下方一張說明卡，
// 沒有人會捲到那裡，所以進頁面時直接把出口放在畫面中央。

import { useEffect, useRef } from "react";

const NEXT = "/member-ai/decision";

export function GuestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const primaryRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="xf-guest-backdrop" onClick={onClose}>
      <div
        className="xf-guest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xf-guest-title"
        aria-describedby="xf-guest-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="xf-guest-close" aria-label="關閉視窗" onClick={onClose}>
          ×
        </button>
        <span className="badge">會員專屬服務</span>
        <h2 id="xf-guest-title">註冊會員，開始問天機</h2>
        <p id="xf-guest-desc">
          四象問天機會以命、局、卦、象四術合參，需要登入會員才能啟動。
          新會員可使用體驗點數，約 2 分鐘就能完成第一份天機書。
        </p>
        <div className="xf-guest-actions">
          <a ref={primaryRef} className="btn primary" href={`/login?tab=register&next=${NEXT}`}>
            免費註冊
          </a>
          <a className="btn" href={`/login?next=${NEXT}`}>
            我已有帳號，登入
          </a>
        </div>
        <button type="button" className="xf-guest-later" onClick={onClose}>
          先看看介紹
        </button>
      </div>
    </div>
  );
}
