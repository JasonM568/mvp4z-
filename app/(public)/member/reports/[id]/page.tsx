"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Run = {
  id: string;
  request?: { question?: string; topic?: string } | null;
  final_label?: string | null;
  final_text?: string | null;
  credits_charged: number;
  generated_at?: string | null;
  created_at: string;
};

export default function MemberCouncilReportPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem("xunfeng_member_token") || "";
    if (!token) {
      window.location.href = "/login?next=/member/reports/" + params.id;
      return;
    }
    fetch("/api/member/council-runs/" + params.id, { headers: { Authorization: "Bearer " + token } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "無法載入天機書");
        setRun(data.run);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "無法載入天機書"));
  }, [params.id]);

  function download() {
    if (!run?.final_text) return;
    const blob = new Blob([run.final_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "巽風四象天機書.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="member-report-page">
      <div className="wrap">
        <a className="member-report-back" href="/member">← 回到我的巽風</a>
        {error ? <p className="status">{error}</p> : !run ? <p className="member-report-loading">正在展開天機書…</p> : (
          <>
            <header className="member-report-head">
              <div className="tag">XUNFENG FOUR ASPECTS</div>
              <h1>巽風四象天機書</h1>
              <p>{run.request?.question || run.request?.topic || "四象問事"}</p>
              <div><span>{new Date(run.generated_at || run.created_at).toLocaleString("zh-TW")}</span><span>本次 {run.credits_charged} 點</span></div>
            </header>
            <article className="member-report-paper"><pre>{run.final_text || "這份天機書沒有可顯示的內容。"}</pre></article>
            <div className="member-report-actions">
              <button className="btn btn-gold" onClick={() => window.print()}>下載 PDF</button>
              <button className="btn btn-ghost" onClick={download}>下載文字</button>
              <a className="btn btn-ghost" href="/booking">預約老師覆核</a>
              <a className="btn btn-ghost" href="/member-ai/decision">再問一件事</a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
