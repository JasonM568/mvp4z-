"use client";

import { useMemberSession } from "@/hooks/use-member-session";

/**
 * 導覽列「AI 會員版」入口 — 只在已登入時顯示（訪客看不到，維持前台無對外 AI 諮詢）。
 * 連到 /member-ai 會員 chat；非 active 會員點進去會被導回 /member（由 member-ai.js 處理）。
 */
export function HeaderMemberAiLink() {
  const { member } = useMemberSession();
  if (!member) return null;
  return <a href="/member-ai">AI 會員版</a>;
}
