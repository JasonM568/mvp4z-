"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Phase = "checking" | "ready" | "saving" | "done" | "error";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          // PKCE flow：Supabase reset 信內 link 帶 ?code=xxx
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // hash flow（#access_token=...&type=recovery）由 createBrowserClient 內部
        // detectSessionInUrl 自動處理，這邊只需確認 session 已建好
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          throw new Error("找不到重設 session，請重新申請密碼重設信。");
        }

        setPhase("ready");
      } catch (e) {
        setPhase("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function submit() {
    if (password.length < 8) {
      setMessage("密碼至少 8 碼");
      return;
    }
    if (password !== confirm) {
      setMessage("兩次輸入的密碼不一致");
      return;
    }
    setPhase("saving");
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPhase("done");
      setMessage("密碼已更新，3 秒後跳回登入頁⋯");
      setTimeout(() => {
        window.location.href = "/login?reset=1";
      }, 3000);
    } catch (e) {
      setPhase("ready");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="kicker">RESET PASSWORD</div>
          <h1>
            重設密碼
            <span className="accent">輸入新密碼以恢復登入</span>
          </h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <article className="panel" style={{ maxWidth: 480 }}>
            {phase === "checking" && (
              <p className="muted">驗證重設連結中⋯</p>
            )}

            {phase === "error" && (
              <>
                <h2>重設連結無效</h2>
                <div className="status error" style={{ display: "block", marginTop: 12 }}>
                  {message}
                </div>
                <p style={{ marginTop: 16 }}>
                  <a className="btn" href="/login">回登入頁重新申請</a>
                </p>
              </>
            )}

            {(phase === "ready" || phase === "saving") && (
              <>
                <h2>設定新密碼</h2>
                <div className="form">
                  <label>
                    新密碼（至少 8 碼）
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={phase === "saving"}
                    />
                  </label>
                  <label>
                    再次輸入新密碼
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={phase === "saving"}
                    />
                  </label>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={submit}
                    disabled={phase === "saving"}
                  >
                    {phase === "saving" ? "更新中⋯" : "更新密碼"}
                  </button>
                  {message && (
                    <div className="status error" style={{ display: "block" }}>
                      {message}
                    </div>
                  )}
                </div>
              </>
            )}

            {phase === "done" && (
              <>
                <h2>密碼已更新</h2>
                <div className="status ok" style={{ display: "block" }}>
                  {message}
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </>
  );
}
