"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    initMemberAi?: () => void;
    XUNFENG_MEMBER_CONFIG?: { API_BASE?: string };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 已存在就直接 resolve
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false; // 保留順序
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export default function MemberAiPage() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript("/js/member-config.js");
        await loadScript("/js/member-session.js");
        await loadScript("/js/member-ai.js");
        if (cancelled) return;
        // member-ai.js 載入時若 DOM 已 ready 會自動呼叫一次，
        // 但 Next.js client navigation 後可能需要再次觸發
        window.initMemberAi?.();
      } catch (err) {
        console.error("[member-ai] script load failed:", err);
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
          <div className="kicker">XUNFENG MEMBER CONSULTATION</div>
          <h1>
            巽風即時問答<span className="accent">會員專屬初步諮詢</span>
          </h1>
          <p id="memberLine" className="lead">
            讀取會員資料中…
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <article className="panel chatbox">
            <div id="messages" className="messages">
              <div className="msg bot">
                你好，這裡是巽風會員即時問答。我以乾坤國寶、龍門八局、形家風水、命理與場域管理為底，協助你做初步判讀與決策整理。
                {"\n\n"}風水初判請提供：坐向、度數、建造年份、來水、去水、大門方位；命理請提供四柱或出生年月日時與出生地。
                {"\n"}可直接點下方常見問題開始，或輸入你自己的狀況。正式個案仍需由風羿老師本人親至現場評估。
              </div>
            </div>
            <div id="starters" className="starters">
              <button
                className="starter"
                type="button"
                data-q="我家大門朝西，最近運勢卡卡，想先做陽宅初判。需要我提供哪些資料？"
              >
                陽宅風水初判
              </button>
              <button
                className="starter"
                type="button"
                data-q="想了解我今年的八字流年運勢，我提供出生年月日時與出生地，幫我做初步分析。"
              >
                八字流年運勢
              </button>
              <button
                className="starter"
                type="button"
                data-q="公司想調整辦公室座位與動線，從場域策略角度有哪些風險與機會要注意？"
              >
                企業場域策略
              </button>
              <button
                className="starter"
                type="button"
                data-q="想幫新品牌或孩子命名，從五術與現代決策語言可以怎麼切入？需要準備哪些資料？"
              >
                命名與擇日方向
              </button>
            </div>
            <div id="chatConsent" className="consent-box">
              <p className="consent-rule">
                扣點規則：對話會依 <strong>AI 回覆的中文字數</strong> 計費，<strong>每 1000 中文字扣 1 點</strong>（1～1000 字＝1 點）。送出問題前請先閱讀並同意。
              </p>
              <label className="consent-check">
                <input type="checkbox" id="chatAgree" /> 已閱讀並同意扣點規則
              </label>
            </div>
            <div className="chat-input">
              <textarea
                id="message"
                placeholder="輸入問題。Ctrl + Enter 可送出。"
              ></textarea>
              <button id="sendBtn" className="btn primary" type="button">
                送出
              </button>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
