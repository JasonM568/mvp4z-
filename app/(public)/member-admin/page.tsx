"use client";

import Script from "next/script";

declare global {
  interface Window {
    createCode?: () => void;
    loadMembers?: () => void;
  }
}

export default function MemberAdminPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">MEMBER ADMIN</div>
          <h1>
            AI 會員管理<span className="accent">產生啟用碼與查看會員</span>
          </h1>
          <p className="lead">
            此頁不放在前台選單。只有風羿老師本人使用。Admin Key 請設定在 Worker Secret，不要外流。
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid two">
          <article className="panel">
            <h2>管理者金鑰</h2>
            <label>
              Admin Key
              <input
                id="adminKey"
                type="password"
                placeholder="貼上 Worker 的 ADMIN_KEY"
              />
            </label>
          </article>
          <article className="panel">
            <h2>產生會員啟用碼</h2>
            <div className="form">
              <label>
                方案
                <select id="plan" defaultValue="basic">
                  <option value="basic">月費會員 basic</option>
                  <option value="pro">進階會員 pro</option>
                  <option value="vip">VIP 顧問 vip</option>
                </select>
              </label>
              <label>
                有效天數
                <input id="days" type="number" defaultValue={30} />
              </label>
              <label>
                問答次數
                <input id="credits" type="number" defaultValue={100} />
              </label>
              <label>
                備註
                <input id="note" placeholder="例如 LINE Pay 已收款" />
              </label>
              <button
                className="btn primary"
                type="button"
                onClick={() => window.createCode?.()}
              >
                產生啟用碼
              </button>
              <div id="codeResult" className="status"></div>
            </div>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="wrap panel">
          <h2>會員列表</h2>
          <button
            className="btn"
            type="button"
            onClick={() => window.loadMembers?.()}
          >
            讀取會員
          </button>
          <div id="members" style={{ marginTop: 18 }}></div>
        </div>
      </section>

      <Script src="/js/member-config.js" strategy="afterInteractive" />
      <Script src="/js/member-admin.js" strategy="afterInteractive" />
    </>
  );
}
