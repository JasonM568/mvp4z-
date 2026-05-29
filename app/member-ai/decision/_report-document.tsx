// 巽風易學決策報告｜把 council 產出的純文字報告解析成正式顧問書版面
// 報告格式由 lib/ai/council/quality.ts buildFinalFormatPrompt 約束：
// 中文序號段落標題（一、二、…）、編號清單（1. 2. …）、純文字表格（以｜分隔）。

export type ReportMeta = {
  clientName?: string;
  question?: string;
  topic?: string;
  date?: string;
};

type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "table"; rows: string[][] };

const SECTION_RE = /^[一二三四五六七八九十]+、/;
const OL_RE = /^\d+[.、]\s*/;
const DOC_TITLE = "巽風易學綜合決策報告";

export function parseReport(text: string): Block[] {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    // 主標題在抬頭另外呈現，內文略過
    if (line === DOC_TITLE) {
      i++;
      continue;
    }
    // 表格：連續含全形｜的行（首行表頭、其餘為列）
    if (line.includes("｜")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("｜")) {
        rows.push(lines[i].split("｜").map((c) => c.trim()));
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    // 段落標題
    if (SECTION_RE.test(line)) {
      blocks.push({ type: "h2", text: line });
      i++;
      continue;
    }
    // 編號清單：連續 1. 2. … 行
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(OL_RE, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    blocks.push({ type: "p", text: line });
    i++;
  }
  return blocks;
}

function ReportTable({ rows }: { rows: string[][] }) {
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return (
    <table>
      <thead>
        <tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportDocument({ text, meta }: { text: string; meta?: ReportMeta }) {
  const blocks = parseReport(text);
  return (
    <article className="report-doc" id="reportDoc">
      <header className="report-doc-head">
        <div className="report-doc-brand">巽風堪輿研究中心　XUNFENG</div>
        <h1>{DOC_TITLE}</h1>
        <div className="report-doc-meta">
          {meta?.clientName && <span>案主：{meta.clientName}</span>}
          {meta?.topic && <span>問題類型：{meta.topic}</span>}
          {meta?.date && <span>產製日期：{meta.date}</span>}
        </div>
        {meta?.question && <div className="report-doc-question">問題主軸：{meta.question}</div>}
      </header>

      <div className="report-doc-body">
        {blocks.map((b, idx) => {
          if (b.type === "h2") return <h2 key={idx}>{b.text}</h2>;
          if (b.type === "table") return <ReportTable key={idx} rows={b.rows} />;
          if (b.type === "ol")
            return (
              <ol key={idx}>
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </ol>
            );
          return <p key={idx}>{b.text}</p>;
        })}
      </div>

      <footer className="report-doc-foot">
        本報告由風羿老師多維校核系統產製，為易學決策輔助；涉及陽宅、陰宅、重大投資、法律、醫療或不可逆決策，仍需由風羿老師本人進一步確認或親至現場評估。
      </footer>
    </article>
  );
}
