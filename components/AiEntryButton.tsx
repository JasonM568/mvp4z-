"use client";

import { isActivePaidMember, useMemberSession } from "@/hooks/use-member-session";

type Variant = "header" | "floating" | "dock" | "footer";

const TEXT = {
  guest: "會員 AI 初步諮詢",
  pending: "啟用會員 AI",
  member: "進入 AI 初步諮詢"
};

const SHORT_TEXT = {
  guest: "AI 諮詢",
  pending: "會員 AI",
  member: "AI 諮詢"
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
export function AiEntryButton({
  variant,
  className,
  compact = false
}: {
  variant: Variant;
  className?: string;
  compact?: boolean;
}) {
  const { member } = useMemberSession();
  const isPaid = isActivePaidMember(member);
  const isRegistered = Boolean(member?.id);

  const labelSet = compact ? SHORT_TEXT : TEXT;
  const label = isPaid ? labelSet.member : isRegistered ? labelSet.pending : labelSet.guest;
  const href = isPaid
    ? "/member-ai"
    : isRegistered
      ? "/member-pricing"
      : "/login?tab=register&next=/member-ai";

  if (variant === "header") {
    return (
      <a
        className={className || (compact ? "nav-ai-link" : "btn btn-ghost")}
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
