"use client";

import { isActivePaidMember, useMemberSession } from "@/hooks/use-member-session";

type Variant = "header" | "floating" | "dock" | "footer";

const TEXT = {
  guest: "AI 初步諮詢",
  member: "進入 AI 會員版"
};

/**
 * 全站共用 AI 入口按鈕：
 * - 未登入 / trial：「AI 初步諮詢」→ /ai（新分頁）
 * - 已啟用付費會員 (basic/pro/vip + active)：「進入 AI 會員版」→ /member-ai（同分頁）
 *
 * variant 決定外觀 class（沿用既有 site.css 已定義的：.btn .btn-ghost / .floating-ai / .dock-ai
 * / .footer-list a）。children 模式給特殊文案使用（如 floating 有兩段 span）。
 */
export function AiEntryButton({ variant, className }: { variant: Variant; className?: string }) {
  const { member } = useMemberSession();
  const isPaid = isActivePaidMember(member);

  const label = isPaid ? TEXT.member : TEXT.guest;
  const href = isPaid ? "/member-ai" : "/ai";
  const newTab = !isPaid;

  if (variant === "header") {
    return (
      <a
        className={className || "btn btn-ghost"}
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noreferrer" : undefined}
      >
        {label}
      </a>
    );
  }

  if (variant === "floating") {
    return (
      <a
        className={className || "floating-ai"}
        data-link="ai"
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noreferrer" : undefined}
        aria-label={`立即使用風羿老師 ${label}`}
      >
        <span>AI</span>
        <span>立即使用風羿老師 {label}</span>
      </a>
    );
  }

  if (variant === "dock") {
    return (
      <a
        className={className || "dock-ai"}
        data-link="ai"
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noreferrer" : undefined}
      >
        {label}
      </a>
    );
  }

  // footer
  return (
    <a
      className={className}
      data-link="ai"
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
    >
      {isPaid ? label : `${label}入口`}
    </a>
  );
}
