"use client";

import "./admin.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type AdminMember = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const NAV = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/members", label: "會員管理" },
  { href: "/admin/bookings", label: "預約名單" },
  { href: "/admin/orders", label: "訂單管理" },
  { href: "/admin/invoices", label: "發票管理" },
  { href: "/admin/council-runs", label: "易學決策紀錄" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<AdminMember | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) {
      router.replace("/admin-login");
      return;
    }
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.member || d.member.role !== "admin") {
          router.replace("/admin-login?error=not_admin");
          return;
        }
        setMe(d.member);
        setChecking(false);
      })
      .catch(() => router.replace("/admin-login?error=session"));
  }, [router]);

  function logout() {
    window.localStorage.removeItem("xunfeng_member_token");
    router.replace("/admin-login");
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>
        驗證身分中⋯
      </div>
    );
  }

  return (
    <div className="admin-root">
      <aside className="admin-side">
        <Link href="/admin" className="admin-brand">
          <div className="mark">巽</div>
          <div className="label">
            巽風後台
            <small>XUNFENG ADMIN</small>
          </div>
        </Link>

        <nav>
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-footer">
          <div className="me">{me?.name || me?.email}</div>
          <div>{me?.email}</div>
          <div>角色：{me?.role}</div>
          <button onClick={logout}>登出</button>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}

export function adminFetch(path: string, init: RequestInit = {}) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("xunfeng_member_token") || "" : "";
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
}
