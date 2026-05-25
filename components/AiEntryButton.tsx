"use client";

import { isActivePaidMember, useMemberSession } from "@/hooks/use-member-session";

type Variant = "header" | "floating" | "dock" | "footer";

const TEXT = {
  guest: "會員註冊使用 AI",
  pending: "啟用會員 AI",
  member: "進入 AI 初步諮詢"
};

/**
 * 全站共用 AI 入口按鈕：
 * - 未登入：導向會員註冊，完成後回會員流程
 * - 已註冊但未啟用：導向會員方案
 * - 已啟用付費會員 (basic/pro/vip + active)：進入 AI 初步諮詢
 *
 * variant 決定外觀 class（沿用既有 site.css 已定義的：.btn .btn-ghost / .floating-ai / .dock-ai
 * / .footer-list a）。children 模式給特殊文案使用（如 floating 有兩段 span）。
 */
export function AiEntryButton({ variant, className }: { variant: Variant; className?: string }) {
  const { member } = useMemberSession();
  const isPaid = isActivePaidMember(member);
  const isRegistered = Boolean(member?.id);

  const label = isPaid ? TEXT.member : isRegistered ? TEXT.pending : TEXT.guest;
  const href = isPaid
    ? "/member-ai"
    : isRegistered
      ? "/member-pricing"
      : "/login?tab=register&next=/member-ai";

  if (variant === "header") {
    return (
      <a
        className={className || "btn btn-ghost"}
        href={href}
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
    >
      {label}
    </a>
  );
}
