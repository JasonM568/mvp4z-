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

// 排列邏輯：日常最常開的（營運、網站內容、顧問服務）在上，
// 四象與面相屬於系統維護模組，設定改動頻率低，收在最底下。
const NAV_GROUPS = [
  {
    label: "營運總覽",
    items: [
      { href: "/admin", label: "總覽" },
      { href: "/admin/members", label: "會員管理" },
      { href: "/admin/orders", label: "訂單管理" },
      { href: "/admin/invoices", label: "發票管理" },
      { href: "/admin/token-usage", label: "Token 用量" },
      { href: "/admin/referrals", label: "業務推廣分潤" }
    ]
  },
  {
    label: "網站內容",
    items: [
      { href: "/admin/site-services", label: "老師服務" },
      { href: "/admin/course-launch", label: "課程上架" },
      { href: "/admin/site-cases", label: "案例課程" }
    ]
  },
  {
    label: "顧問服務",
    items: [{ href: "/admin/bookings", label: "預約名單" }]
  },
  {
    label: "四象問天機",
    items: [
      { href: "/admin/council-runs", label: "天機書紀錄" },
      { href: "/admin/prompt-settings", label: "報告內容維護" },
      { href: "/admin/school-settings", label: "排盤流派設定" },
      { href: "/admin/documents", label: "老師文件" }
    ]
  },
  {
    label: "面相系統",
    items: [
      { href: "/admin/face-analysis", label: "面相分析紀錄" },
      { href: "/admin/face-rules", label: "面相規則設定" },
      { href: "/admin/face-teachings", label: "面相判讀規則" },
      { href: "/admin/face-knowledge", label: "面相知識庫" },
      { href: "/admin/gemini-provider", label: "Gemini 影像認證" },
      { href: "/admin/face-provider", label: "OpenAI 備援認證" }
    ]
  }
];

const NAV_OPEN_KEY = "xunfeng_admin_nav_open";

function isActive(pathname: string | null, href: string) {
  return pathname === href || (href !== "/admin" && Boolean(pathname?.startsWith(href)));
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<AdminMember | null>(null);
  const [checking, setChecking] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // 側邊欄預設收合，只展開「目前所在的那一區」，其餘依使用者上次的選擇。
  // 全部攤開會讓 20 幾個連結一次擠在畫面上，找東西反而更慢。
  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(NAV_OPEN_KEY) || "{}") || {};
    } catch {
      stored = {};
    }
    const next: Record<string, boolean> = {};
    for (const group of NAV_GROUPS) {
      const hasActive = group.items.some((item) => isActive(pathname, item.href));
      next[group.label] = hasActive || stored[group.label] === true;
    }
    setOpenGroups(next);
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      } catch {
        // 無痕模式等情況存不了就算了，只是少了記憶，不影響操作。
      }
      return next;
    });
  }

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
          {NAV_GROUPS.map((group) => {
            const open = openGroups[group.label] ?? false;
            const hasActive = group.items.some((item) => isActive(pathname, item.href));
            return (
              <section className={`admin-nav-group${open ? " open" : ""}`} key={group.label}>
                <button
                  type="button"
                  className="admin-nav-toggle"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="admin-nav-caret" aria-hidden="true" />
                  <span className="admin-nav-label">{group.label}</span>
                  {/* 收起來但目前正在這一區時給個標記，才不會找不到自己在哪 */}
                  {!open && hasActive && <span className="admin-nav-dot" aria-hidden="true" />}
                  <span className="admin-nav-count">{group.items.length}</span>
                </button>
                {open && (
                  <div className="admin-nav-items">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={isActive(pathname, item.href) ? "active" : ""}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
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
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { "Content-Type": "application/json" })
    }
  });
}
