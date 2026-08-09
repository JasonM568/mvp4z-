"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    loadPlans?: () => void;
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

export default function MemberPricingPage() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript("/js/member-config.js");
        await loadScript("/js/member-pricing.js");
        if (cancelled) return;
        window.loadPlans?.();
      } catch (err) {
        console.error("[member-pricing] script load failed:", err);
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
          <div className="kicker">XUNFENG AI MEMBERSHIP</div>
          <h1>
            巽風會員方案
            <span className="accent">一次開通四象問天機、面相與即時問答</span>
          </h1>
          <p className="lead">
            挑選方案 → 綠界安全付款 → 系統自動寫入會員資格與點數，立即進入「我的巽風」。點數可用於即時問答（每 1000 中文字 1 點）、四象問天機與面相文化觀察報告（每份 20 點）。
          </p>
          <p className="lead" style={{ marginTop: 18 }}>
            還沒決定？<strong>註冊即送 30 點</strong>，付費前先免費體驗。
            <a className="btn primary" href="/member-ai" style={{ marginLeft: 12 }}>
              進入我的巽風
            </a>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div id="planList" className="grid three">
            <div className="status">讀取方案…</div>
          </div>
          <div
            id="pricingStatus"
            className="status"
            style={{ marginTop: "1.5rem" }}
          ></div>
          <p
            className="lead"
            style={{ marginTop: "2rem", fontSize: "0.95rem", opacity: 0.8 }}
          >
            付款流程由綠界 ECPay 處理，巽風不接觸您的卡片資料。需要客製化方案或企業合作，請透過
            <a href="https://lin.ee/W88wwDB">LINE 官方帳號</a>洽詢。
          </p>
        </div>
      </section>
    </>
  );
}
