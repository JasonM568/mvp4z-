#!/usr/bin/env node
// Council 結構化輸出（四象儀表板）E2E 驗證腳本
//
// 驗證：
//   1. POST /api/ai/council 正常回報告
//   2. final.text 不含機讀定界符 <<<XF_STRUCT>>> / <<<END_XF_STRUCT>>>
//   3. structured 欄位形狀正確（headline / resonance 0-100 / aspects 只含啟用術數 / steps 1-3）
//      或為 null（fallback 稿 / LLM 未輸出合法 JSON —— 合法降級，記 WARN 不記 FAIL）
//   4. council_runs 最新一筆的 structured 與 API 回傳一致
//
// ⚠️ 會真的跑一次 council（60~290 秒、扣 20 點），請用測試帳號。
//
// 用法：
//   node scripts/test-council-structured.mjs --token=<member_bearer_token>
//   node scripts/test-council-structured.mjs --token=<token> --base-url=https://www.xunfeng.tw
//
// 取得 token：登入 /login 後 localStorage.getItem('xunfeng_member_token')

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

const args = parseArgs(process.argv.slice(2));
loadEnv(args.envFile || path.join(rootDir, ".env.local"));

const baseUrl = (args.baseUrl || "http://localhost:3000").replace(/\/$/, "");
const token = required(args.token, "--token (member Bearer token)");

const STRUCT_OPEN = "<<<XF_STRUCT>>>";
const STRUCT_CLOSE = "<<<END_XF_STRUCT>>>";
const ASPECT_KEYS = ["bazi", "qimen", "liuyao", "meihua"];

const supabase = createClient(
  required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

// 只啟用八字＋六爻：順便驗 aspects 過濾（不得出現 qimen/meihua）
const modules = { bazi: true, qimen: false, liuyao: true, meihua: false };
const payload = {
  question: "我今年下半年是否適合換工作？",
  context: "E2E 契約測試（test-council-structured）",
  topic: "事業／工作",
  deliverableMode: "商業決策顧問報告",
  clientProfile: "測試案主｜男",
  yixue: {
    clientName: "測試案主",
    gender: "男",
    birth: { calendar: "國曆", year: 1990, month: 1, day: 1, hourBranch: "寅", timeKnown: "是" },
    eventTime: { year: 2026, month: 8, day: 6, hour: 14, minute: 30 },
    modules,
    liuyao: { mode: "時間起卦", yao: [] }
  }
};

console.log(`▶ baseUrl: ${baseUrl}`);
console.log(`▶ 啟用術數: bazi + liuyao（驗 aspects 過濾）`);
console.log("▶ 送出 council 請求（60~290 秒，請耐心等待）…");

const started = Date.now();
const res = await fetch(`${baseUrl}/api/ai/council`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload)
});
const data = await res.json();
console.log(`▶ 回應 ${res.status}，耗時 ${Math.round((Date.now() - started) / 1000)}s`);

let pass = 0;
let warn = 0;
const fail = [];
const check = (name, ok, warnOnly = false) => {
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else if (warnOnly) {
    warn++;
    console.log(`⚠️  ${name}`);
  } else {
    fail.push(name);
    console.log(`❌ ${name}`);
  }
};

check("HTTP 200 且 ok:true", res.status === 200 && data.ok === true);
if (data.error) {
  console.error(`   error: ${data.error}`);
  process.exit(1);
}

const text = data.final?.text || "";
check("final.text 非空", text.length > 100);
check("final.text 不含 STRUCT 定界符", !text.includes(STRUCT_OPEN) && !text.includes(STRUCT_CLOSE));
check(`fallback_used=${data.fallback_used}（兜底稿不扣點）`, !data.fallback_used, true);

const s = data.structured;
if (s == null) {
  check("structured=null（合法降級：前端隱藏儀表板）", true, true);
} else {
  check("structured.headline 為非空字串", typeof s.headline === "string" && s.headline.length >= 4);
  check("structured.resonance 為 0-100 整數", Number.isInteger(s.resonance) && s.resonance >= 0 && s.resonance <= 100);
  check(
    "structured.aspects 只含啟用術數（bazi/liuyao）",
    Array.isArray(s.aspects) &&
      s.aspects.length >= 1 &&
      s.aspects.every((a) => ["bazi", "liuyao"].includes(a.key))
  );
  check(
    "aspects 各項 summary/confidence 合法",
    s.aspects.every(
      (a) =>
        ASPECT_KEYS.includes(a.key) &&
        typeof a.summary === "string" &&
        a.summary.length >= 2 &&
        Number.isInteger(a.confidence) &&
        a.confidence >= 0 &&
        a.confidence <= 100
    )
  );
  check("structured.steps 為 1-3 條字串", Array.isArray(s.steps) && s.steps.length >= 1 && s.steps.length <= 3);
  check(
    "structured 不含技術字眼",
    !JSON.stringify(s).match(/OpenAI|Gemini|DeepSeek/i)
  );
}

// council_runs 落地檢查
const { data: run, error: runErr } = await supabase
  .from("council_runs")
  .select("id, structured, fallback_used, credits_charged, created_at")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (runErr) {
  check(`council_runs 查詢失敗：${runErr.message}`, false);
} else {
  check("council_runs 有最新紀錄", !!run);
  check(
    "council_runs.structured 與 API 回傳一致",
    JSON.stringify(run?.structured ?? null) === JSON.stringify(s ?? null)
  );
  console.log(`   credits_charged=${run?.credits_charged}, fallback=${run?.fallback_used}`);
}

console.log(`\n結果：${pass} PASS / ${warn} WARN / ${fail.length} FAIL`);
if (fail.length) {
  console.error(`FAIL 項目：\n- ${fail.join("\n- ")}`);
  process.exit(1);
}

// ---------- helpers ----------
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = m[2];
  }
  return out;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function required(value, name) {
  if (!value) {
    console.error(`缺少 ${name}`);
    process.exit(1);
  }
  return value;
}
