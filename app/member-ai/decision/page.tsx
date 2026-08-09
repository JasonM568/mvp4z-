"use client";

// 天機四象 · 順轉人生｜易學決策報告（四階段體驗 orchestrator）
// Landing → Input（極簡＋進階摺疊）→ Scanning（擬真掃描動畫）→ Report（四象儀表板＋顧問書）
// 單一 route + step state：token 在 localStorage、掃描期間同步 fetch 不可因換頁 unmount。
// 會員驗證是 client-side 顯示層，真正守門在 /api/ai/council。

import "./decision.css";
import { useEffect, useMemo, useState } from "react";
import { buildInitialForm, buildInitialModules, type CouncilForm, type CouncilModules } from "./_form-config";
import { buildCouncilPayload, runCouncilReport, getMemberToken, type CouncilApiResult } from "./_actions";
import { ReportDocument, type ReportMeta } from "./_report-document";
import type { CouncilStructured } from "@/lib/ai/council/structured";
import { enabledAspects } from "./_aspects";
import { LandingStep } from "./_steps/landing-step";
import { InputStep } from "./_steps/input-step";
import { ScanningStep } from "./_steps/scanning-step";
import { ReportStep } from "./_steps/report-step";
import { SiteHeader } from "@/components/SiteHeader";
import { track } from "@vercel/analytics/react";

type MemberInfo = {
  plan: string;
  status: string;
  credits_remaining: number;
  tier?: { councilCost: number; monthlyFreeQuota: number; canUseCouncil: boolean };
};

type Step = "landing" | "input" | "scanning" | "report";
const DRAFT_KEY = "xunfeng_four_aspects_draft";
const PENDING_KEY = "xunfeng_four_aspects_pending";

export default function DecisionPage() {
  const [step, setStep] = useState<Step>("landing");
  const [form, setForm] = useState<CouncilForm>(buildInitialForm);
  const [modules, setModules] = useState<CouncilModules>(buildInitialModules);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [structured, setStructured] = useState<CouncilStructured | null>(null);
  const [jsonPacket, setJsonPacket] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [memberStatus, setMemberStatus] = useState<"loading" | "guest" | "member">("loading");
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [reportFileBase, setReportFileBase] = useState("巽風四象天機書");

  useEffect(() => {
    const token = getMemberToken();
    if (!token) {
      setMemberStatus("guest");
      return;
    }
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.member) {
          setMember(d.member as MemberInfo);
          setMemberStatus("member");
        } else {
          setMemberStatus("guest");
        }
      })
      .catch(() => setMemberStatus("guest"));
  }, []);

  useEffect(() => {
    const token = getMemberToken();
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!token || !raw) return;
    let pending: { startedAt: string; question: string } | null = null;
    try {
      pending = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(PENDING_KEY);
      return;
    }
    if (!pending?.startedAt) return;
    const cutoff = Date.now() - 6 * 60 * 1000;
    if (Date.parse(pending.startedAt) < cutoff) {
      window.localStorage.removeItem(PENDING_KEY);
      return;
    }
    setStep("scanning");
    setLoading(true);
    setNotice("正在找回先前進行中的四象合參…");
    let stopped = false;
    let attempts = 0;
    const recover = async () => {
      attempts += 1;
      try {
        const response = await fetch("/api/member/council-runs?limit=3", {
          headers: { Authorization: "Bearer " + token }
        });
        const data = await response.json().catch(() => ({}));
        const match = (Array.isArray(data.items) ? data.items : []).find((item: any) =>
          Date.parse(item.created_at) >= Date.parse(pending!.startedAt) - 5000
        );
        if (match && !stopped) {
          const generatedAt = new Date(match.generated_at || match.created_at);
          setReport(match.final_text || "");
          setStructured(match.structured || null);
          setReportMeta({
            question: match.request?.question || pending!.question,
            topic: match.request?.topic,
            clientName: match.request?.clientName,
            date: generatedAt.toLocaleString("zh-TW", {
              year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
            })
          });
          setReportFileBase(buildReportFileBase(match.request?.clientName, generatedAt));
          setNotice("已找回完成的天機書，本次扣除 " + Number(match.credits_charged || 0) + " 點。");
          setLoading(false);
          setStep("report");
          window.localStorage.removeItem(PENDING_KEY);
          return;
        }
      } catch {}
      if (!stopped && attempts < 60) window.setTimeout(recover, 5000);
      else if (!stopped) {
        setLoading(false);
        setScanError("目前仍找不到完成的天機書，請到「我的巽風」查看最新報告；系統不會重複送出或扣點。");
      }
    };
    void recover();
    return () => { stopped = true; };
  }, []);

  useEffect(() => {
    try {
      const draft = window.localStorage.getItem(DRAFT_KEY);
      if (!draft) return;
      const parsed = JSON.parse(draft) as { form?: Partial<CouncilForm>; modules?: Partial<CouncilModules> };
      if (parsed.form) setForm((current) => ({ ...current, ...parsed.form }));
      if (parsed.modules) setModules((current) => ({ ...current, ...parsed.modules }));
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, modules }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, modules]);

  // 掃描中關頁攔截：後端 LLM 跑完照樣扣點，中途關頁＝付了點數沒拿到報告
  useEffect(() => {
    if (!loading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loading]);

  function update<K extends keyof CouncilForm>(key: K, value: CouncilForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function toggleModule(key: keyof CouncilModules) {
    const next = { ...modules, [key]: !modules[key] };
    if (!Object.values(next).some(Boolean)) return;
    setModules(next);
  }

  const payload = useMemo(() => buildCouncilPayload(form, modules), [form, modules]);
  const tier = member?.tier;
  const canUseCouncil = tier?.canUseCouncil ?? false;
  const isGuest = memberStatus === "guest";
  const showMemberGate = memberStatus !== "loading" && !canUseCouncil;

  // 啟動鈕回饋：未登入／方案不符時不要默默停用，而是變成明確可點的引導
  const generateLabel = loading
    ? "掃描中…"
    : memberStatus === "loading"
      ? "生成天機書 →"
      : isGuest
        ? "登入會員後啟動掃描"
        : !canUseCouncil
          ? "升級方案後啟動掃描"
          : "生成天機書 →";

  const costHint = useMemo(() => {
    if (!tier) return "";
    if (tier.monthlyFreeQuota > 0) {
      return `本方案月內前 ${tier.monthlyFreeQuota} 份免費，超過後每份 ${tier.councilCost} 點`;
    }
    return `本次將扣 ${tier.councilCost} 點`;
  }, [tier]);

  function handleGenerateClick() {
    if (loading || memberStatus === "loading") return;
    if (isGuest) {
      window.location.href = "/login?next=/member-ai/decision";
      return;
    }
    if (!canUseCouncil) {
      window.location.href = "/member-pricing";
      return;
    }
    if (!agreed) {
      setNotice("請先勾選「已閱讀並同意扣點規則」再啟動掃描。");
      return;
    }
    if (!form.question.trim()) {
      setNotice("請先輸入你的問題，再啟動四象掃描。");
      const el = document.getElementById("councilQuestion");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLTextAreaElement | null)?.focus();
      return;
    }
    setNotice("");
    setScanError(null);
    setStep("scanning");
    generate();
  }

  async function generate() {
    setLoading(true);
    setReport("");
    setStructured(null);
    setJsonPacket(null);
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({
      startedAt: new Date().toISOString(),
      question: form.question.trim()
    }));

    const data: CouncilApiResult = await runCouncilReport(payload).catch((err) => ({
      error: err?.message || "送出失敗"
    }));

    if (data?.error) {
      track("four_aspects_failed", { stage: "generation" });
      setScanError(data.error);
      setJsonPacket({ request: payload, error: data.error });
      setLoading(false);
      return;
    }

    const finalText = data?.final?.text || "未取得最終報告。";
    const generatedAt = new Date();
    setReport(finalText);
    setStructured(data?.structured ?? null);
    setReportMeta({
      clientName: form.clientName?.trim() || undefined,
      question: form.question?.trim() || undefined,
      topic: form.topic,
      date: generatedAt.toLocaleString("zh-TW", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    });
    setReportFileBase(buildReportFileBase(form.clientName, generatedAt));
    setJsonPacket({ request: payload, response: data });
    setNotice(
      data?.fallback_used
        ? "本次未通過交付門檻，已自動退回點數，回傳兜底交付稿。"
        : data?.free_quota_used
          ? "本次使用 VIP 月內免費額度，未扣點。"
          : `已扣 ${data?.credits_charged || 0} 點，剩餘 ${data?.member?.credits_remaining ?? "未知"} 點。`
    );
    track("four_aspects_completed", {
      result: data?.fallback_used ? "fallback" : "completed",
      charged: Number(data?.credits_charged || 0)
    });
    window.localStorage.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(PENDING_KEY);
    if (data?.member) setMember(data.member as MemberInfo);
    setLoading(false);
  }

  // 換個問題再測一次：保留出生資料與進階設定，只清問題與結果（回訪成本最低）
  function handleRetry() {
    update("question", "");
    setReport("");
    setStructured(null);
    setJsonPacket(null);
    setReportMeta(null);
    setNotice("");
    setStep("input");
  }

  async function copy() {
    await navigator.clipboard.writeText(report || notice);
  }

  function downloadBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMd() {
    downloadBlob(report, "text/markdown", `${reportFileBase}.md`);
  }

  function downloadJson() {
    downloadBlob(JSON.stringify(jsonPacket || payload, null, 2), "application/json", `${reportFileBase}.json`);
  }

  function downloadPdf() {
    if (!report) return;
    track("four_aspects_download_pdf");
    // 列印「儲存為 PDF」的預設檔名取自 document.title，故先暫改成報告檔名（含案主+生成時間），
    // 列印結束（afterprint）再還原。
    setTimeout(() => {
      const originalTitle = document.title;
      document.title = reportFileBase;
      const restore = () => {
        document.title = originalTitle;
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      window.print();
    }, 150);
  }

  return (
    <>
      <div className="council-screen">
        <SiteHeader showMobileDock={false} />

        {step === "landing" && (
          <LandingStep
            gate={{
              showMemberGate,
              isGuest,
              planLabel: member?.plan?.toUpperCase() || "免費"
            }}
            costHint={canUseCouncil ? costHint : ""}
            onStart={() => setStep("input")}
          />
        )}

        {step === "input" && (
          <InputStep
            form={form}
            modules={modules}
            update={update}
            toggleModule={toggleModule}
            showMemberGate={showMemberGate}
            canUseCouncil={canUseCouncil}
            councilCost={tier?.councilCost ?? 20}
            agreed={agreed}
            setAgreed={setAgreed}
            generateLabel={generateLabel}
            generateDisabled={loading || memberStatus === "loading" || (canUseCouncil && !agreed)}
            onGenerate={handleGenerateClick}
            notice={notice}
          />
        )}

        {step === "scanning" && (
          <ScanningStep
            aspects={enabledAspects(modules)}
            done={!loading && !!report}
            errorMsg={scanError}
            onComplete={() => setStep("report")}
            onBack={() => {
              setScanError(null);
              setStep("input");
            }}
          />
        )}

        {step === "report" && (
          <ReportStep
            question={reportMeta?.question || form.question}
            structured={structured}
            report={report}
            reportMeta={reportMeta}
            notice={notice}
            fileBase={reportFileBase}
            onRetry={handleRetry}
            onCopy={copy}
            onDownloadMd={downloadMd}
            onDownloadJson={downloadJson}
            onDownloadPdf={downloadPdf}
          />
        )}
      </div>

      {/* 列印專用副本：掛在 .council-screen 外，列印時只輸出這份白紙顧問書 */}
      {report && (
        <div className="council-print">
          <ReportDocument text={report} meta={reportMeta ?? undefined} idPrefix="print-report" />
        </div>
      )}
    </>
  );
}

// 報告檔名基底：巽風四象天機書_{案主姓名}_{YYYYMMDD-HHmm}
// 檔名清掉不合法字元；無案主則用「未填案主」。
function buildReportFileBase(clientName: string | undefined, at: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const name = (clientName || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "").slice(0, 40) || "未填案主";
  return `巽風四象天機書_${name}_${stamp}`;
}
