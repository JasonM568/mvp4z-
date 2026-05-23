"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    initMemberPage?: () => void;
    logout?: () => void;
    toggleRedeem?: () => void;
    redeemCode?: () => void;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export default function MemberPage() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript("/js/member-config.js");
        await loadScript("/js/member-auth.js");
        if (cancelled) return;
        window.initMemberPage?.();
      } catch (err) {
        console.error("[member] script load failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">MEMBER CENTER</div>
          <h1>
            會員中心
            <span className="accent">管理你的 AI 服務權限</span>
          </h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap member-shell">
          <aside className="panel member-side">
            <h2 id="memberName">讀取中</h2>
            <div className="member-meta">
              <div>
                方案：<strong id="memberPlan"></strong>
              </div>
              <div>
                狀態：<strong id="memberStatus"></strong>
              </div>
              <div>
                剩餘次數：<strong id="memberCredits"></strong>
              </div>
              <div>
                到期日：<strong id="memberExpires"></strong>
              </div>
            </div>
            <a
              id="enterAi"
              className="btn primary block"
              href="/member-ai"
              style={{ display: "none" }}
            >
              進入 AI 會員版
            </a>
            <a
              id="buyPlanCta"
              className="btn primary block"
              href="/member-pricing"
              style={{ display: "none" }}
            >
              立即購買方案
            </a>
            <button
              className="btn block"
              type="button"
              onClick={() => window.logout?.()}
            >
              登出
            </button>
          </aside>
          <div className="panel">
            <div
              id="paymentBanner"
              className="status"
              style={{ display: "none", marginBottom: "1.5rem" }}
            ></div>
            <div id="activePanel" style={{ display: "none" }}>
              <h2>方案已啟用</h2>
              <p>你的會員方案已開通，可直接使用風羿老師 AI 會員版進行八字、風水、命理問答。</p>
              <p>
                需要升級方案或加購點數，請至
                <a href="/member-pricing">會員方案頁</a>。
              </p>
            </div>
            <div id="pendingPanel">
              <h2>啟用會員方案</h2>
              <p>
                選擇方案 → 綠界線上付款 → 系統自動寫入點數與到期日，立即開始使用 AI 會員版。
              </p>
              <p style={{ margin: "1rem 0" }}>
                <a className="btn primary" href="/member-pricing">
                  前往會員方案頁
                </a>
              </p>
              <hr style={{ margin: "2rem 0", opacity: 0.2 }} />
              <p
                style={{
                  fontSize: "0.9rem",
                  opacity: 0.75,
                  cursor: "pointer"
                }}
                onClick={() => window.toggleRedeem?.()}
              >
                ▸ 我有啟用碼（admin 或活動序號）
              </p>
              <div id="redeemPanel" style={{ display: "none" }}>
                <div className="form">
                  <label>
                    啟用碼
                    <input id="code" placeholder="例如 XF-ABCD-1234" />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => window.redeemCode?.()}
                  >
                    啟用會員
                  </button>
                  <div id="redeemStatus" className="status"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
