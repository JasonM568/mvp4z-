"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    loginMember?: () => void;
    registerMember?: () => void;
    forgotPasswordMember?: () => void;
  }
}

type Tab = "login" | "register" | "forgot";

const TABS: { key: Tab; label: string }[] = [
  { key: "login", label: "登入會員" },
  { key: "register", label: "建立新會員" },
  { key: "forgot", label: "忘記密碼" }
];

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [resetBanner, setResetBanner] = useState(false);
  const [referrer, setReferrer] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") setResetBanner(true);
    const requestedTab = params.get("tab");
    if (requestedTab === "register" || requestedTab === "forgot" || requestedTab === "login") {
      setTab(requestedTab);
    }

    // 從推廣連結被導過來時，把推廣人名字秀出來，讓訪客知道自己會綁在誰底下。
    // 查不到就安靜略過，不影響註冊。
    const ref = params.get("ref");
    if (!ref) return;
    fetch(`/api/referral/lookup?code=${encodeURIComponent(ref)}`)
      .then((response) => response.json())
      .then((data) => { if (data?.partner?.name) setReferrer(String(data.partner.name)); })
      .catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">MEMBER LOGIN</div>
          <h1>
            會員登入
            <span className="accent">進入我的巽風</span>
          </h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          {resetBanner && (
            <div
              className="status ok"
              style={{ display: "block", marginBottom: 16 }}
            >
              ✅ 密碼已更新，請用新密碼登入。
            </div>
          )}

          <div
            role="tablist"
            aria-label="會員登入頁切換"
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
              borderBottom: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  padding: "10px 18px",
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                  color: tab === t.key ? "var(--text)" : "var(--muted)",
                  cursor: "pointer",
                  fontWeight: tab === t.key ? 600 : 400,
                  fontSize: 15
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "login" && (
            <article className="panel" style={{ maxWidth: 480 }}>
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
                <p style={{ marginTop: 12, fontSize: 13 }}>
                  <button
                    type="button"
                    onClick={() => setTab("forgot")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    忘記密碼？
                  </button>
                </p>
              </div>
            </article>
          )}

          {tab === "register" && (
            <article className="panel" style={{ maxWidth: 480 }}>
              <h2>建立新會員</h2>
              {referrer && (
                <div className="status ok" style={{ display: "block", marginBottom: 14 }}>
                  您是由 <strong>{referrer}</strong> 推薦加入，完成註冊後即綁定這位推廣夥伴。
                </div>
              )}
              <p className="lead" style={{ marginTop: 0 }}>
                註冊即送 <strong>30 點</strong> 免費體驗，30 天內可用於四象問天機、面相與 AI 問答。
              </p>
              <div className="form">
                <label>
                  手機號碼
                  <input id="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="0912345678" />
                </label>
                <label>
                  Email
                  <input id="email" type="email" autoComplete="email" />
                </label>
                <label>
                  密碼（至少 8 碼）
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
          )}

          {tab === "forgot" && (
            <article className="panel" style={{ maxWidth: 480 }}>
              <h2>忘記密碼</h2>
              <p className="muted" style={{ marginBottom: 16 }}>
                請填入註冊時使用的 Email，我們會寄送密碼重設連結給你。
              </p>
              <div className="form">
                <label>
                  Email
                  <input id="forgotEmail" type="email" autoComplete="email" />
                </label>
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => window.forgotPasswordMember?.()}
                >
                  寄送重設信
                </button>
                <div id="forgotStatus" className="status"></div>
                <p style={{ marginTop: 12, fontSize: 13 }}>
                  <button
                    type="button"
                    onClick={() => setTab("login")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    ← 回登入
                  </button>
                </p>
              </div>
            </article>
          )}
        </div>
      </section>

      <Script src="/js/member-config.js" strategy="afterInteractive" />
      <Script src="/js/member-session.js" strategy="afterInteractive" />
      <Script src="/js/member-auth.js" strategy="afterInteractive" />
    </>
  );
}
