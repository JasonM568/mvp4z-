"use client";

import Script from "next/script";

declare global {
  interface Window {
    loginMember?: () => void;
    registerMember?: () => void;
  }
}

export default function LoginPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">MEMBER LOGIN</div>
          <h1>
            會員登入
            <span className="accent">進入風羿老師 AI 會員版</span>
          </h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid two">
          <article className="panel">
            <h2>登入會員</h2>
            <div className="form">
              <label>
                Email
                <input id="loginEmail" type="email" autoComplete="email" />
              </label>
              <label>
                密碼
                <input
                  id="loginPassword"
                  type="password"
                  autoComplete="current-password"
                />
              </label>
              <button
                className="btn primary"
                type="button"
                onClick={() => window.loginMember?.()}
              >
                登入
              </button>
              <div id="loginStatus" className="status"></div>
            </div>
          </article>

          <article className="panel">
            <h2>建立新會員</h2>
            <div className="form">
              <label>
                姓名
                <input id="name" autoComplete="name" />
              </label>
              <label>
                Email
                <input id="email" type="email" autoComplete="email" />
              </label>
              <label>
                手機 / LINE
                <input id="phone" />
              </label>
              <label>
                密碼
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <button
                className="btn"
                type="button"
                onClick={() => window.registerMember?.()}
              >
                建立帳號
              </button>
              <div id="status" className="status"></div>
            </div>
          </article>
        </div>
      </section>

      <Script src="/js/member-config.js" strategy="afterInteractive" />
      <Script src="/js/member-auth.js" strategy="afterInteractive" />
    </>
  );
}
