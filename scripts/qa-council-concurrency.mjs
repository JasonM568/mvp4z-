#!/usr/bin/env node
// QA｜易學決策報告：並行送出是否「一份點數換多份報告」
// ⚠️ 會真的呼叫 LLM、真的扣點。只能用測試帳號、且先把該帳號點數調成剛好 20。
// 用法：node scripts/qa-council-concurrency.mjs --token=<bearer> --base-url=<staging 或正式> --n=5
// 期望（修好後）：成功交付且 credits_charged=20 的恰好 1 份；其餘為 409/429 或被擋，且總扣點 = 20。
// 現況推測（待本腳本驗證）：N 份都交付、只有 1 份 credits_charged=20，其餘 credits_charged=0 + credit_warning=CR002。
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const token = arg("token"), base = arg("base-url", "http://localhost:3000").replace(/\/$/, ""), n = Number(arg("n", 5));
if (!token) { console.error("需要 --token"); process.exit(2); }

const body = { question: "QA 並行測試：我該不該在下季調整團隊編制？", topic: "事業／工作",
  yixue: { clientName: "QA", gender: "男", modules: { bazi: true },
    birth: { calendar: "國曆", isLeapMonth: "否", year: 1985, month: 7, day: 12, hourBranch: "午", timeKnown: "是" } } };
const call = async (i) => {
  const t0 = Date.now();
  const r = await fetch(`${base}/api/ai/council`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { i, status: r.status, ms: Date.now() - t0, charged: j.credits_charged, warn: j.credit_warning, fallback: j.fallback_used, run: j.run_id };
};
const res = await Promise.all(Array.from({ length: n }, (_, i) => call(i)));
console.table(res);
const delivered = res.filter((r) => r.status === 200 && !r.fallback);
const charged = delivered.reduce((s, r) => s + (r.charged || 0), 0);
console.log(`交付 ${delivered.length} 份，總扣點 ${charged}，免費送出 ${delivered.filter((r) => r.charged === 0).length} 份`);
process.exit(delivered.length > 1 && charged < delivered.length * 20 ? 1 : 0);
