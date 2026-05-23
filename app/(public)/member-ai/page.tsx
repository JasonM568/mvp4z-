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
          <div className="kicker">FENGYI AI MEMBER</div>
          <h1>
            風羿老師 AI<span className="accent">會員專屬諮詢</span>
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
                請輸入你的問題。若是風水初判，請提供坐向、度數、建造年份、來水、去水、大門方位；若是命理，請提供四柱或出生年月日時地。正式個案仍需由風羿老師本人現場評估。
              </div>
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
