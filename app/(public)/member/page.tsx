"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  name: string | null;
  email: string;
  plan: string;
  status: string;
  credits_remaining: number;
  expires_at: string | null;
  tier?: { councilCost?: number };
};

type CouncilRun = {
  id: string;
  request?: { question?: string; topic?: string } | null;
  final_label?: string | null;
  final_text?: string | null;
  final_ok: boolean;
  fallback_used: boolean;
  credits_charged: number;
  generated_at?: string | null;
  created_at: string;
};

type FaceRun = {
  id: string;
  status: string;
  report_structured?: { summary?: string } | null;
  report_text?: string | null;
  credits_charged: number;
  completed_at?: string | null;
  created_at: string;
};

export default function MemberPage() {
  const [member, setMember] = useState<Member | null>(null);
  const [council, setCouncil] = useState<CouncilRun[]>([]);
  const [faces, setFaces] = useState<FaceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [pendingCouncil, setPendingCouncil] = useState(false);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) {
      window.location.href = "/login?next=/member";
      return;
    }
    try {
      const headers = { Authorization: "Bearer " + token };
      const [memberResponse, councilResponse, faceResponse] = await Promise.all([
        fetch("/api/member/me", { headers }),
        fetch("/api/member/council-runs?limit=6", { headers }),
        fetch("/api/face-analysis/runs?limit=6", { headers })
      ]);
      const memberData = await memberResponse.json().catch(() => ({}));
      if (!memberResponse.ok) throw new Error(memberData.error || "登入狀態已失效");
      setMember(memberData.member);
      const councilData = await councilResponse.json().catch(() => ({}));
      const faceData = await faceResponse.json().catch(() => ({}));
      if (councilResponse.ok) setCouncil(Array.isArray(councilData.items) ? councilData.items : []);
      if (faceResponse.ok) setFaces(Array.isArray(faceData.items) ? faceData.items : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法載入會員資料");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("xunfeng_four_aspects_pending");
      if (!raw) return;
      const pending = JSON.parse(raw);
      setPendingCouncil(Date.now() - Date.parse(pending.startedAt) < 6 * 60 * 1000);
    } catch {}
  }, []);

  function logout() {
    window.localStorage.removeItem("xunfeng_member_token");
    window.location.href = "/";
  }

  if (loading) return <main className="my-xunfeng-loading">正在開啟我的巽風…</main>;

  return (
    <main className="my-xunfeng">
      <section className="my-xunfeng-hero">
        <div className="wrap">
          <div className="tag">MY XUNFENG</div>
          <div className="my-xunfeng-head">
            <div><h1>我的巽風</h1><p>{member?.name || member?.email}，從這裡開始問事、看報告與管理點數。</p></div>
            <button type="button" onClick={logout}>登出</button>
          </div>
          {notice && <p className="status">{notice}</p>}
          <div className="my-xunfeng-stats">
            <div><span>目前方案</span><strong>{String(member?.plan || "free").toUpperCase()}</strong></div>
            <div><span>剩餘點數</span><strong>{member?.credits_remaining ?? 0}</strong></div>
            <div><span>會員狀態</span><strong>{statusLabel(member?.status)}</strong></div>
            <div><span>有效期限</span><strong>{member?.expires_at ? new Date(member.expires_at).toLocaleDateString("zh-TW") : "尚未啟用"}</strong></div>
          </div>
        </div>
      </section>

      <section className="my-xunfeng-section">
        <div className="wrap">
          {pendingCouncil && (
            <a className="my-continue-card" href="/member-ai/decision">
              <span>進行中</span><div><strong>四象正在合參</strong><p>可回到原流程等待，完成後會自動展開天機書。</p></div><b>繼續查看 →</b>
            </a>
          )}
          <div className="my-xunfeng-section-head"><div><span>QUICK START</span><h2>今天想從哪裡開始？</h2></div><a href="/member-pricing">方案與點數</a></div>
          <div className="my-xunfeng-actions">
            <a className="primary" href="/member-ai/decision"><i>象</i><strong>開始問天機</strong><span>命、局、卦、象，四術合參</span><b>生成天機書 →</b></a>
            <a href="/member-ai/face"><i>相</i><strong>開始面相觀察</strong><span>先做免費照片品質檢查</span><b>進入面相系統 →</b></a>
            <a href="/member-ai"><i>問</i><strong>AI 即時問答</strong><span>八字、風水與命理初步提問</span><b>開始提問 →</b></a>
          </div>
        </div>
      </section>

      <section className="my-xunfeng-section my-reports-section">
        <div className="wrap">
          <div className="my-xunfeng-section-head"><div><span>MY REPORTS</span><h2>我的報告</h2></div></div>
          <div className="my-report-columns">
            <ReportColumn
              title="巽風四象天機書"
              empty="還沒有天機書，從一件具體事情開始問。"
              action={{ href: "/member-ai/decision", label: "開始問天機" }}
              items={council.map((run) => ({
                id: run.id,
                title: run.request?.question || run.request?.topic || "四象問事",
                summary: run.final_label || run.final_text?.slice(0, 72) || (run.fallback_used ? "本次需補充資料" : "天機書已完成"),
                date: run.generated_at || run.created_at,
                meta: run.credits_charged + " 點",
                href: "/member/reports/" + run.id
              }))}
            />
            <ReportColumn
              title="面相文化觀察報告"
              empty="還沒有面相報告，品質檢查免費。"
              action={{ href: "/member-ai/face/history", label: faces.length ? "查看全部" : "開始面相觀察" }}
              items={faces.map((run) => ({
                id: run.id,
                title: run.status === "completed" ? "面相觀察完成" : "本次分析未完成",
                summary: run.report_structured?.summary || run.report_text?.slice(0, 72) || "報告資料",
                date: run.completed_at || run.created_at,
                meta: run.credits_charged + " 點",
                href: "/member-ai/face/history"
              }))}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ReportColumn({
  title,
  empty,
  action,
  items
}: {
  title: string;
  empty: string;
  action: { href: string; label: string };
  items: { id: string; title: string; summary: string; date: string; meta: string; href?: string }[];
}) {
  return (
    <article className="my-report-column">
      <header><h3>{title}</h3><a href={action.href}>{action.label}</a></header>
      {items.length === 0 ? <p className="my-report-empty">{empty}</p> : (
        <div className="my-report-list">
          {items.map((item) => (
            <a href={item.href || "#"} key={item.id} onClick={item.href ? undefined : (event) => event.preventDefault()}>
              <div><strong>{item.title}</strong><p>{item.summary}</p></div>
              <small>{new Date(item.date).toLocaleDateString("zh-TW")}・{item.meta}</small>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function statusLabel(status?: string) {
  return status === "active" ? "使用中" : status === "expired" ? "已到期" : "待啟用";
}
