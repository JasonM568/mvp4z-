"use client";

import { useEffect, useState } from "react";

export type MemberSession = {
  id?: string;
  email?: string;
  plan?: string;
  status?: "pending" | "active" | "expired";
  credits_remaining?: number;
};

/**
 * 全站共用：讀 localStorage 的 JWT token → /api/member/me 拿會員態。
 * 初始 server render 永遠是 null（避免 hydration mismatch），client mount 後才填值。
 * 同一頁多處呼叫會各自 fetch 一次；可接受（mvp 規模，沒大流量），日後要省再加快取。
 */
export function useMemberSession(): { member: MemberSession | null; loading: boolean } {
  const [member, setMember] = useState<MemberSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) {
      setLoading(false);
      return;
    }
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.member) setMember(d.member);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { member, loading };
}

/** 是否為已啟用會員（可進 AI 會員版）。trial 不算。 */
export function isActivePaidMember(member: MemberSession | null): boolean {
  if (!member) return false;
  if (member.status !== "active") return false;
  const plan = (member.plan || "").toLowerCase();
  if (!plan || plan === "trial") return false;
  return true;
}
