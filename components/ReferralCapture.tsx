"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const COOKIE = "xf_ref";
const CODE_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const TOKEN_KEY = "xunfeng_member_token";

/** 這些路徑不攔：本來就是登入／註冊流程，或是後台與付款回導頁。 */
const NO_REDIRECT_PREFIXES = ["/login", "/reset-password", "/admin", "/admin-login", "/thanks"];

/**
 * 業務推廣連結歸因。
 *
 * 兩件事：
 * 1. 把 ?ref=CODE 存成 90 天 cookie（last-touch），之後成立的訂單後端會據此歸戶。
 * 2. 未登入的訪客帶 ?ref= 進站時，直接導到註冊頁。
 *    理由：真正的綁定發生在「註冊」那一刻（寫進 profiles.referral_code，終身歸戶）；
 *    只靠 cookie 的話，換裝置、清 cookie、或中途點到別人的連結，業務就白帶了。
 *
 * 已登入的人不攔 —— 他早就綁定過了，再導去註冊只會擋路。
 */
export function ReferralCapture() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let code = "";
    try {
      code = new URLSearchParams(window.location.search).get("ref") || "";
      if (!code || !CODE_PATTERN.test(code)) return;
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      document.cookie = `${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${secure}`;
    } catch {
      // cookie 被瀏覽器擋掉時仍然可以往下走：ref 會跟著網址帶到註冊頁。
    }
    if (!code || !CODE_PATTERN.test(code)) return;

    const path = pathname || window.location.pathname;
    if (NO_REDIRECT_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

    let signedIn = false;
    try {
      signedIn = Boolean(window.localStorage.getItem(TOKEN_KEY));
    } catch {
      signedIn = false;
    }
    if (signedIn) return;

    // ref 一併帶進註冊頁：cookie 萬一被擋掉，註冊頁仍拿得到推廣碼，
    // 而且註冊表單可以顯示「您是由 OOO 推薦加入」。
    const params = new URLSearchParams({ tab: "register", ref: code, next: path });
    router.replace(`/login?${params.toString()}`);
  }, [pathname, router]);

  return null;
}
