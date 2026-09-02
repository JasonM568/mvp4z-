"use client";

import { useEffect } from "react";

const COOKIE = "xf_ref";
const CODE_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * 業務推廣連結歸因：任何頁面帶 ?ref=CODE 進站就把代碼存成 90 天 cookie，
 * 之後在站內任何時間點成立的訂單，後端都會從這個 cookie 歸戶。
 * last-touch：後來的連結會覆蓋前一組代碼。
 */
export function ReferralCapture() {
  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (!code || !CODE_PATTERN.test(code)) return;
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${secure}`;
    } catch {
      // cookie 被瀏覽器擋掉時直接放棄歸因，不影響頁面其他功能。
    }
  }, []);

  return null;
}
