"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Loader2, RefreshCw } from "lucide-react";
import {
  baziModes,
  buildInitialForm,
  buildInitialModules,
  calendarOptions,
  days,
  eventYears,
  genderOptions,
  hourBranches,
  hours,
  liuyaoModes,
  meihuaLowerTrigrams,
  meihuaModes,
  meihuaUpperTrigrams,
  minutes,
  months,
  qimenModes,
  reportTemplates,
  reviewModes,
  topics,
  trigramOptions,
  yaoOptions,
  years,
  yesNoUncertain,
  yesNoUncertain2,
  type CouncilForm,
  type CouncilModules
} from "./_form-config";
import { buildCouncilPayload, runCouncilReport, getMemberToken, type CouncilApiResult } from "./_actions";

function cx(...items: Array<string | false | undefined>) {
  return items.filter(Boolean).join(" ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#10203A]">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, children }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 w-full rounded-2xl border border-[#d9e3f0] bg-white px-4 text-[15px] text-[#10203A] outline-none transition focus:border-[#10203A] focus:ring-4 focus:ring-[#10203A]/10"
    >
      {children}
    </select>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-12 w-full rounded-2xl border border-[#d9e3f0] bg-white px-4 text-[15px] text-[#10203A] outline-none transition focus:border-[#10203A] focus:ring-4 focus:ring-[#10203A]/10"
    />
  );
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-28 w-full rounded-2xl border border-[#d9e3f0] bg-white px-4 py-3 text-[15px] leading-7 text-[#10203A] outline-none transition focus:border-[#10203A] focus:ring-4 focus:ring-[#10203A]/10"
    />
  );
}

function CardTitle({ n, title, desc }: { n: string; title: string; desc?: string }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#10203A] text-xl font-black text-white shadow-lg">{n}</div>
      <div>
        <h2 className="text-2xl font-black tracking-tight text-[#10203A]">{title}</h2>
        {desc && <p className="mt-1 text-sm leading-6 text-[#607089]">{desc}</p>}
      </div>
    </div>
  );
}

type MemberInfo = {
  plan: string;
  status: string;
  credits_remaining: number;
  tier?: { councilCost: number; monthlyFreeQuota: number; canUseCouncil: boolean };
};

export default function DecisionPage() {
  const [form, setForm] = useState<CouncilForm>(buildInitialForm);
  const [modules, setModules] = useState<CouncilModules>(buildInitialModules);
  const [tab, setTab] = useState<"report" | "json">("report");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [jsonPacket, setJsonPacket] = useState<any>(null);
  const [notice, setNotice] = useState("尚未生成報告。完成下方表單後按「生成綜合報告」。");
  const [member, setMember] = useState<MemberInfo | null>(null);

  useEffect(() => {
    const token = getMemberToken();
    if (!token) {
      setNotice("尚未登入，請先登入會員。");
      return;
    }
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.member) setMember(d.member as MemberInfo);
      })
      .catch(() => {});
  }, []);

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
  const costHint = useMemo(() => {
    if (!tier) return "";
    if (tier.monthlyFreeQuota > 0) {
      return `本方案月內前 ${tier.monthlyFreeQuota} 份免費，超過後每份 ${tier.councilCost} 點`;
    }
    return `本次將扣 ${tier.councilCost} 點`;
  }, [tier]);

  async function generate() {
    if (!form.question.trim()) {
      setNotice("請先輸入問題主軸。");
      return;
    }
    setLoading(true);
    setNotice("巽風多維校核中…（最長約 90 秒）");
    setReport("");
    setJsonPacket(null);

    const data: CouncilApiResult = await runCouncilReport(payload).catch((err) => ({
      error: err?.message || "送出失敗"
    }));

    if (data?.error) {
      setNotice(`系統提示：${data.error}`);
      setJsonPacket({ request: payload, error: data.error });
      setLoading(false);
      return;
    }

    const finalText = data?.final?.text || "未取得最終報告。";
    setReport(finalText);
    setJsonPacket({ request: payload, response: data });
    setNotice(
      data?.fallback_used
        ? "本次未通過交付門檻，已自動退回點數，回傳兜底交付稿。"
        : data?.free_quota_used
          ? "本次使用 VIP 月內免費額度，未扣點。"
          : `已扣 ${data?.credits_charged || 0} 點，剩餘 ${data?.member?.credits_remaining ?? "未知"} 點。`
    );
    if (data?.member) setMember(data.member as MemberInfo);
    setTab("report");
    setLoading(false);
  }

  function resetForm() {
    setReport("");
    setJsonPacket(null);
    setNotice("尚未生成報告。");
  }

  const currentContent = tab === "json" ? JSON.stringify(jsonPacket || payload, null, 2) : report || notice;

  async function copy() {
    await navigator.clipboard.writeText(currentContent);
  }

  function download() {
    const blob = new Blob([currentContent], { type: tab === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "json" ? "xunfeng-council-packet.json" : "xunfeng-council-report.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff,#f3f7fb_40%,#dfeaf5)] text-[#10203A]">
      <header className="sticky top-0 z-40 border-b border-[#dbe5f0] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#10203A] text-xl text-white shadow-lg">☯</div>
            <div>
              <h1 className="text-xl font-black tracking-tight">巽風易學決策系統</h1>
              <p className="text-xs text-[#66758d]">四術同步｜多維校核｜可交付商業報告</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {member && (
              <div className="rounded-2xl bg-[#10203A]/5 px-4 py-2 text-right text-xs leading-5 text-[#10203A]">
                <div className="font-black">{member.plan.toUpperCase()} 會員</div>
                <div className="text-[#607089]">剩 {member.credits_remaining} 點</div>
              </div>
            )}
            <a href="#workbench" className="rounded-2xl bg-[#10203A] px-5 py-3 text-sm font-black text-white shadow-lg">
              進入工作台
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[2.5rem] border border-white bg-white/90 p-8 shadow-2xl shadow-[#10203A]/10">
          <div className="mb-4 inline-flex rounded-full bg-[#efd9b8] px-4 py-2 text-sm font-black text-[#7d4f12]">
            Premium Consulting System
          </div>
          <h2 className="max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-5xl">把問事流程，升級成可交付的顧問報告。</h2>
          <p className="mt-5 text-lg leading-9 text-[#607089]">
            四術同步、十段結構、可下載 .md。結合八字、奇門、卜卦／六爻、梅花易數，由巽風多維校核系統整合輸出風羿老師綜合判讀。
          </p>
          {costHint && (
            <div className="mt-6 inline-flex rounded-2xl border border-[#10203A]/10 bg-white px-5 py-3 text-sm font-black text-[#10203A]">
              {costHint}
            </div>
          )}
          {!canUseCouncil && member && (
            <div className="mt-4 rounded-2xl border border-[#efd9b8] bg-[#fff8eb] px-5 py-3 text-sm font-black text-[#7d4f12]">
              目前 {member.plan.toUpperCase()} 方案不含易學決策報告，請升級至基礎會員以上。
            </div>
          )}
        </div>

        <div className="rounded-[2.5rem] bg-[#10203A] p-8 text-white shadow-2xl shadow-[#10203A]/20">
          <div className="mb-5 w-fit rounded-full bg-[#efd9b8] px-4 py-2 text-sm font-black text-[#7d4f12]">商業化重點</div>
          <div className="space-y-5 text-lg leading-8">
            <p>✓ 下拉式出生年月日時</p>
            <p>✓ 八字、奇門、六爻、梅花獨立介面</p>
            <p>✓ 巽風多維校核（內部攻防 + 終稿定稿）</p>
            <p>✓ 正式報告與 JSON 可複製下載</p>
          </div>
        </div>
      </section>

      <section id="workbench" className="mx-auto max-w-7xl px-5 pb-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-[#10203A]/10">
              <CardTitle n="1" title="共同資料" />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="案主姓名">
                  <TextInput value={form.clientName} onChange={(v) => update("clientName", v)} placeholder="例如：王先生" />
                </Field>
                <Field label="性別／身分">
                  <Select value={form.gender} onChange={(v) => update("gender", v)}>
                    {genderOptions.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="問題類型">
                  <Select value={form.topic} onChange={(v) => update("topic", v)}>
                    {topics.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="報告模板">
                  <Select value={form.reportTemplate} onChange={(v) => update("reportTemplate", v)}>
                    {reportTemplates.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="問題主軸">
                    <TextInput value={form.question} onChange={(v) => update("question", v)} placeholder="例如：我今年是否適合投資？" />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="背景補充">
                    <TextArea value={form.context} onChange={(v) => update("context", v)} placeholder="補充目前狀況、卡點、時間壓力、相關人物、資金條件。" />
                  </Field>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-[#10203A]/10">
              <CardTitle n="2" title="出生年月日時｜下拉式輸入" />
              <div className="grid gap-5 md:grid-cols-4">
                <Field label="曆法">
                  <Select value={form.calendarType} onChange={(v) => update("calendarType", v)}>
                    {calendarOptions.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="出生年">
                  <Select value={form.birthYear} onChange={(v) => update("birthYear", Number(v))}>
                    {years.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="出生月">
                  <Select value={form.birthMonth} onChange={(v) => update("birthMonth", Number(v))}>
                    {months.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="出生日">
                  <Select value={form.birthDay} onChange={(v) => update("birthDay", Number(v))}>
                    {days.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="出生時辰">
                  <Select value={form.birthHourBranch} onChange={(v) => update("birthHourBranch", v)}>
                    {hourBranches.map((x) => (
                      <option key={x[0]} value={x[0]}>{x[0]}｜{x[1]}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="是否閏月">
                  <Select value={form.isLeapMonth} onChange={(v) => update("isLeapMonth", v)}>
                    {yesNoUncertain.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="時辰是否確定">
                  <Select value={form.birthTimeKnown} onChange={(v) => update("birthTimeKnown", v)}>
                    {yesNoUncertain2.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="策略校核層">
                  <Select value={form.reviewMode} onChange={(v) => update("reviewMode", v)}>
                    {reviewModes.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-[#10203A]/10">
              <CardTitle n="3" title="四術專用介面" desc="保留原 v3 工作台體驗，由巽風多維校核系統協力。" />

              <div className="mb-6 grid gap-3 md:grid-cols-4">
                {(
                  [
                    ["bazi", "八字命理", "依出生資料自動初判"],
                    ["qimen", "奇門遁甲", "部署／時機／方位"],
                    ["liuyao", "卜卦／六爻", "成敗／卡點／應期"],
                    ["meihua", "梅花易數", "象意／變化／提示"]
                  ] as const
                ).map(([key, title, desc]) => (
                  <button
                    key={key}
                    onClick={() => toggleModule(key as keyof CouncilModules)}
                    className={cx(
                      "rounded-2xl border p-4 text-left transition",
                      modules[key as keyof CouncilModules] ? "border-[#10203A] bg-[#10203A] text-white" : "border-[#d9e3f0] bg-white text-[#10203A]"
                    )}
                  >
                    <div className="font-black">{title}</div>
                    <div className={cx("mt-1 text-xs", modules[key as keyof CouncilModules] ? "text-slate-300" : "text-[#607089]")}>{desc}</div>
                  </button>
                ))}
              </div>

              <div className="mb-6 grid gap-5 md:grid-cols-5">
                <Field label="事件年">
                  <Select value={form.eventYear} onChange={(v) => update("eventYear", Number(v))}>
                    {eventYears.map((x) => (<option key={x}>{x}</option>))}
                  </Select>
                </Field>
                <Field label="事件月">
                  <Select value={form.eventMonth} onChange={(v) => update("eventMonth", Number(v))}>
                    {months.map((x) => (<option key={x}>{x}</option>))}
                  </Select>
                </Field>
                <Field label="事件日">
                  <Select value={form.eventDay} onChange={(v) => update("eventDay", Number(v))}>
                    {days.map((x) => (<option key={x}>{x}</option>))}
                  </Select>
                </Field>
                <Field label="事件時">
                  <Select value={form.eventHour} onChange={(v) => update("eventHour", Number(v))}>
                    {hours.map((x) => (<option key={x}>{x}</option>))}
                  </Select>
                </Field>
                <Field label="事件分">
                  <Select value={form.eventMinute} onChange={(v) => update("eventMinute", Number(v))}>
                    {minutes.map((x) => (<option key={x}>{x}</option>))}
                  </Select>
                </Field>
              </div>

              {modules.bazi && (
                <div className="mb-5 rounded-3xl border border-[#d9e3f0] bg-[#f8fafc] p-5">
                  <Field label="八字命理">
                    <Select value={form.baziMode} onChange={(v) => update("baziMode", v)}>
                      {baziModes.map((x) => (<option key={x}>{x}</option>))}
                    </Select>
                  </Field>
                </div>
              )}

              {modules.qimen && (
                <div className="mb-5 grid gap-5 rounded-3xl border border-[#d9e3f0] bg-[#f8fafc] p-5 md:grid-cols-2">
                  <Field label="奇門遁甲｜起局方式">
                    <Select value={form.qimenTimeMode} onChange={(v) => update("qimenTimeMode", v)}>
                      {qimenModes.map((x) => (<option key={x}>{x}</option>))}
                    </Select>
                  </Field>
                  <Field label="奇門遁甲｜事件方位">
                    <Select value={form.direction} onChange={(v) => update("direction", v)}>
                      {trigramOptions.map((x) => (<option key={x}>{x}</option>))}
                    </Select>
                  </Field>
                </div>
              )}

              {modules.liuyao && (
                <div className="mb-5 rounded-3xl border border-[#d9e3f0] bg-[#f8fafc] p-5">
                  <div className="grid gap-5 md:grid-cols-3">
                    <Field label="六爻｜起卦方式">
                      <Select value={form.liuyaoMode} onChange={(v) => update("liuyaoMode", v)}>
                        {liuyaoModes.map((x) => (<option key={x}>{x}</option>))}
                      </Select>
                    </Field>
                    {(["yao1", "yao2", "yao3", "yao4", "yao5", "yao6"] as const).map((k, i) => (
                      <Field key={k} label={["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"][i]}>
                        <Select value={form[k]} onChange={(v) => update(k, v)}>
                          {yaoOptions.map((x) => (<option key={x}>{x}</option>))}
                        </Select>
                      </Field>
                    ))}
                  </div>
                </div>
              )}

              {modules.meihua && (
                <div className="rounded-3xl border border-[#d9e3f0] bg-[#f8fafc] p-5">
                  <div className="grid gap-5 md:grid-cols-3">
                    <Field label="梅花易數｜起卦方式">
                      <Select value={form.meihuaMode} onChange={(v) => update("meihuaMode", v)}>
                        {meihuaModes.map((x) => (<option key={x}>{x}</option>))}
                      </Select>
                    </Field>
                    <Field label="梅花易數｜上卦">
                      <Select value={form.upperTrigram} onChange={(v) => update("upperTrigram", v)}>
                        {meihuaUpperTrigrams.map((x) => (<option key={x}>{x}</option>))}
                      </Select>
                    </Field>
                    <Field label="梅花易數｜下卦">
                      <Select value={form.lowerTrigram} onChange={(v) => update("lowerTrigram", v)}>
                        {meihuaLowerTrigrams.map((x) => (<option key={x}>{x}</option>))}
                      </Select>
                    </Field>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={generate}
                  disabled={loading || !canUseCouncil}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#10203A] px-6 font-black text-white shadow-lg disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  生成綜合報告
                </button>
                <button onClick={resetForm} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#d9e3f0] bg-white px-6 font-black text-[#10203A]">
                  <RefreshCw className="h-4 w-4" /> 重設
                </button>
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-[#10203A]/10">
              <CardTitle n="4" title="輸出中心" />
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setTab("report")}
                  className={cx("rounded-full px-4 py-2 text-sm font-black", tab === "report" ? "bg-[#10203A] text-white" : "bg-[#eef3fa] text-[#607089]")}
                >
                  正式報告
                </button>
                <button
                  onClick={() => setTab("json")}
                  className={cx("rounded-full px-4 py-2 text-sm font-black", tab === "json" ? "bg-[#10203A] text-white" : "bg-[#eef3fa] text-[#607089]")}
                >
                  JSON 資料包
                </button>
              </div>
              <pre className="max-h-[720px] min-h-[520px] overflow-auto whitespace-pre-wrap rounded-3xl border border-[#d9e3f0] bg-[#f8fafc] p-5 text-sm leading-7 text-[#10203A]">
                {currentContent}
              </pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={copy} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#10203A] px-5 text-sm font-black text-white">
                  <Copy className="h-4 w-4" /> 複製
                </button>
                <button onClick={download} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#d9e3f0] bg-white px-5 text-sm font-black text-[#10203A]">
                  <Download className="h-4 w-4" /> 下載
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
