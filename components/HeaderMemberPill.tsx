"use client";

import { useEffect, useState } from "react";

type Member = {
  plan?: string;
  credits_remaining?: number;
  email?: string;
};

// SiteHeader 右側的會員態 pill：未登入顯示「登入」，已登入讀 localStorage token + /api/member/me 切到「會員中心 | PLAN | 剩 N 點」。
// 為避免 hydration mismatch，初始 render 永遠是「登入」，client mount 後才換成會員樣式。
export function HeaderMemberPill() {
  const [member, setMember] = useState<Member | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) return;
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.member) setMember(d.member);
      })
      .catch(() => {});
  }, []);

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
