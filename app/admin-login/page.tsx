"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginWrapper() {
  return (
    <Suspense fallback={null}>
      <AdminLoginPage />
    </Suspense>
  );
}

function AdminLoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const e = search?.get("error");
    if (e === "not_admin") setError("此帳號不是後台管理員。請改用 admin email 登入。");
    if (e === "session") setError("登入逾時，請重新登入。");
  }, [search]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok || !data?.token) throw new Error(data?.error || "登入失敗");

      // 檢查 role
      const me = data?.member;
      if (me?.role !== "admin") {
        throw new Error("此帳號不是後台管理員。");
      }

      window.localStorage.setItem("xunfeng_member_token", data.token);
      router.replace("/admin");
    } catch (e: any) {
      setError(e?.message || "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="wrap nav">
          <a className="brand" href="/">
            <div className="mark">巽</div>
            <div>
              <strong>巽風堪輿</strong>
              <small>XUNFENG FIELD STRATEGY</small>
            </div>
          </a>
          <nav className="nav-actions">
            <a className="btn" href="/login">會員登入</a>
            <a className="btn" href="/">回首頁</a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap" style={{ maxWidth: 480 }}>
          <div className="kicker">XUNFENG ADMIN</div>
          <h1>後台登入<span className="accent">巽風管理者專用</span></h1>
          <p className="lead">僅有 ADMIN_EMAILS 名單上的帳號可進入。一般會員請走 <a href="/login" style={{ color: "var(--green)" }}>會員登入</a>。</p>
        </div>
      </section>

      <section className="section">
        <div className="wrap" style={{ maxWidth: 480 }}>
          <article className="panel">
            <h2>登入</h2>
            <form className="form" onSubmit={submit}>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label>
                密碼
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? "登入中⋯" : "登入後台"}
              </button>
              {error && <div className="status" style={{ color: "#ffb7b7", marginTop: 6 }}>{error}</div>}
            </form>
            <div className="status" style={{ marginTop: 14 }}>
              <strong style={{ color: "var(--text)" }}>還沒有帳號？</strong>
              <br />
              請先到 <a href="/login" style={{ color: "var(--green)" }}>會員註冊頁</a> 建立帳號，並由系統管理員把你的 email 加入 ADMIN_EMAILS 環境變數，下次登入時自動升為 admin。
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
