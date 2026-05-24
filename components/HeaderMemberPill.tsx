"use client";

import { useMemberSession } from "@/hooks/use-member-session";

// SiteHeader 右側的會員態 pill：未登入顯示「登入」，已登入讀 localStorage token + /api/member/me 切到「會員中心 | PLAN | 剩 N 點」。
// 為避免 hydration mismatch，初始 render 永遠是「登入」，client mount 後才換成會員樣式。
export function HeaderMemberPill() {
  const { member } = useMemberSession();

  if (!member) {
    return (
      <a className="btn btn-ghost" href="/login">
        登入
      </a>
    );
  }

  const plan = (member.plan || "").toUpperCase();
  const credits = member.credits_remaining ?? 0;
  return (
    <a className="btn btn-ghost" href="/member" title={member.email || ""}>
      會員中心{plan ? `｜${plan}` : ""}｜剩 {credits} 點
    </a>
  );
}
