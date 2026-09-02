"use client";

import { useEffect } from "react";

/**
 * 會員 session 保鮮：在 access token 過期前先換一張新的。
 *
 * 背景：Supabase 的 access token 只有 1 小時。前台各頁面都是直接從 localStorage 拿 token
 * 打 API，過期之後畫面看起來還是登入中，實際上每一支 API 都會回 401
 * 「登入已過期，請重新登入」——最痛的是結帳：使用者填完發票資料才失敗，訂單直接死掉。
 *
 * 與其去改十幾個 fetch 呼叫點，這裡在背景把 localStorage 裡的 token 維持在有效狀態，
 * 所有既有頁面就都不用動。真的換不到（refresh token 也過期）才清掉憑證，
 * 讓畫面誠實地回到未登入，而不是假裝還登著。
 */

const TOKEN_KEY = "xunfeng_member_token";
const REFRESH_KEY = "xunfeng_member_refresh";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RENEW_BEFORE_MS = 10 * 60 * 1000; // 剩不到 10 分鐘就先換，避免正好卡在送出的那一刻過期

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

/** 讀 JWT 的 exp（毫秒）。解不出來就回 0，交給呼叫端當成「該換了」處理。 */
function expiresAt(jwt: string) {
  const payload = jwt.split(".")[1];
  if (!payload) return 0;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function MemberSessionKeeper() {
  useEffect(() => {
    let stopped = false;
    let running = false;

    async function tick() {
      if (stopped || running) return;
      const token = readStorage(TOKEN_KEY);
      const refreshToken = readStorage(REFRESH_KEY);
      if (!token || !refreshToken) return; // 沒登入，或是舊版只存了 access token —— 只能等他重新登入
      if (expiresAt(token) - Date.now() > RENEW_BEFORE_MS) return;

      running = true;
      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.token) {
          window.localStorage.setItem(TOKEN_KEY, data.token);
          if (data.refresh_token) window.localStorage.setItem(REFRESH_KEY, data.refresh_token);
        } else if (response.status === 401) {
          window.localStorage.removeItem(TOKEN_KEY);
          window.localStorage.removeItem(REFRESH_KEY);
        }
      } catch {
        // 網路不通就下一輪再試，不要清掉憑證。
      } finally {
        running = false;
      }
    }

    void tick();
    const timer = window.setInterval(tick, CHECK_INTERVAL_MS);
    // 分頁被切走一小時再切回來時，setInterval 可能被節流，回到前景先補一次。
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
