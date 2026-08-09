"use client";

import { useEffect } from "react";
import { Analytics, track } from "@vercel/analytics/react";

/**
 * 只追蹤不含個資的介面動作。問題、報告、姓名與照片資料不會送出。
 * 可追蹤元件需明確加上 data-xf-event，避免意外收集頁面文字。
 */
export function UxAnalytics() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-xf-event]")
        : null;
      const name = target?.dataset.xfEvent;
      if (!name) return;
      track(name, { path: window.location.pathname });
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return <Analytics />;
}
