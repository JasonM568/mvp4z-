// 面相報告 PDF 產生器
//
// 為什麼是 pdfkit 而不是 pdf-lib：2026-09-08 實測三種組合，只有 pdfkit 是對的。
// pdf-lib 1.17.1 對 CJK 的 CFF 子集化會把 glyph ID 當成字元碼寫出去——
// 產出的 PDF 通篇是「! " # $ %」，但 API 不報錯、寬度量測也正確。
// 詳見 assets/fonts/README.md。**換套件或換字型前一定要把 PDF 轉圖看過。**
//
// 版面刻意樸素：這是會員會存下來、可能拿給別人看的文件，
// 讀得清楚比好看重要。字級與間距全部走同一組常數，不逐段微調。

import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
/** 報告的結構化內容。欄位由 report-schema.ts 定義，這裡只讀不驗，缺欄位就略過該段。 */
type StructuredFaceReport = Record<string, unknown>;

const FONT_PATH = path.join(process.cwd(), "assets", "fonts", "NotoSansTC-Regular.otf");

/** 字型只讀一次。5.4MB 檔案，每次請求重讀等於每次多花 I/O。 */
let fontCache: Buffer | null = null;
function loadFont(): Buffer {
  if (!fontCache) fontCache = readFileSync(FONT_PATH);
  return fontCache;
}

const PAGE_MARGIN = 56;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 寬扣掉左右邊界

const TYPE = {
  title: 21,
  section: 14,
  heading: 12,
  body: 10.5,
  small: 9.5
} as const;

const INK = "#1B1813";
const INK_SOFT = "#5F594C";
const INK_FAINT = "#8C8474";
const RULE = "#BDB4A0"; // 比 #D9D2C2 深一階：實測列印與螢幕上前者幾乎看不見

type Doc = InstanceType<typeof PDFDocument>;

export type FacePdfInput = {
  runId: string;
  mode: "self" | "other";
  completedAt: string | null;
  createdAt: string;
  memberName: string;
  report: StructuredFaceReport | null;
  /** structured 缺漏時的退路，至少讓會員拿得到當初看到的文字。 */
  reportText: string | null;
};

// ---------------------------------------------------------------- 版面小工具

/**
 * 標題前先確認這一頁還放得下標題加至少兩行內文。
 * 沒有這個檢查，標題會單獨落在頁尾、內容全在下一頁。
 */
function keepTogether(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function sectionTitle(doc: Doc, text: string) {
  keepTogether(doc, 64);
  doc.moveDown(0.9);
  const y = doc.y;
  doc.fontSize(TYPE.section).fillColor(INK).text(text, { width: CONTENT_WIDTH });
  doc
    .moveTo(PAGE_MARGIN, doc.y + 4)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 4)
    .lineWidth(0.75)
    .strokeColor(RULE)
    .stroke();
  doc.y = Math.max(doc.y + 12, y + 24);
}

function heading(doc: Doc, text: string) {
  keepTogether(doc, 48);
  doc.moveDown(0.5).fontSize(TYPE.heading).fillColor(INK).text(text, { width: CONTENT_WIDTH });
  doc.moveDown(0.2);
}

function paragraph(doc: Doc, text: string, color = INK_SOFT) {
  if (!text) return;
  doc.fontSize(TYPE.body).fillColor(color).text(text, { width: CONTENT_WIDTH, lineGap: 5, align: "justify" });
  doc.moveDown(0.35);
}

function bullets(doc: Doc, items: string[]) {
  for (const item of items) {
    if (!item) continue;
    keepTogether(doc, 34);
    doc
      .fontSize(TYPE.body)
      .fillColor(INK_SOFT)
      .text(`・${item}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 5, indent: 0 });
    doc.moveDown(0.28);
  }
}

/** 「標籤：內容」一行。標籤用深色、內容用次深色，掃讀時抓得到欄位。 */
function labelled(doc: Doc, label: string, value?: string | null) {
  if (!value) return;
  keepTogether(doc, 34);
  doc.fontSize(TYPE.body).fillColor(INK).text(`${label}　`, { continued: true });
  doc.fillColor(INK_SOFT).text(value, { width: CONTENT_WIDTH, lineGap: 5 });
  doc.moveDown(0.25);
}

// ---------------------------------------------------------------- 中文對照

const MODE_LABEL: Record<string, string> = { self: "自我分析", other: "他人分析" };

const AREA_LABEL: Record<string, string> = {
  relationship: "感情",
  career: "事業",
  health: "健康",
  finance: "財運",
  family: "家庭"
};

const ALIGNMENT_LABEL: Record<string, string> = {
  high: "相符度高",
  medium: "相符度中等",
  low: "相符度偏低",
  insufficient: "資料不足"
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "判讀把握高",
  medium: "判讀把握中等",
  low: "判讀把握偏低"
};

const VERDICT_LABEL: Record<string, string> = {
  recommended: "建議合作",
  conditional: "有條件合作",
  not_recommended: "不建議合作"
};

function formatDate(value: string | null, fallback: string): string {
  const raw = value || fallback;
  // 不用 toLocaleString：Node 與瀏覽器的地區資料不一定一致，
  // 而報告上的日期不該因為跑在哪裡而長得不一樣。
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return raw;
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日 ${m[4]}:${m[5]}`;
}

// ---------------------------------------------------------------- 主體

export async function renderFaceReportPdf(input: FacePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN + 18, left: PAGE_MARGIN, right: PAGE_MARGIN },
    info: {
      Title: `巽風民俗文化觀察報告 ${formatDate(input.completedAt, input.createdAt)}`,
      Author: "巽風堪輿研究中心",
      Creator: "巽風會員系統"
    },
    autoFirstPage: true,
    // 頁碼要等全部畫完才知道總頁數，必須先緩衝頁面才能回頭補。
    bufferPages: true
  });

  doc.registerFont("tc", loadFont());
  doc.font("tc");

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawCover(doc, input);
  const report = input.report;

  if (report) {
    drawBody(doc, report);
  } else if (input.reportText) {
    // structured 解析失敗的舊報告仍要拿得到 PDF，不能因為格式問題就不給。
    sectionTitle(doc, "報告內容");
    paragraph(doc, input.reportText);
  } else {
    sectionTitle(doc, "報告內容");
    paragraph(doc, "此筆記錄沒有可輸出的報告內容。");
  }

  drawDisclaimer(doc, input);
  addPageNumbers(doc);
  doc.end();
  return done;
}

function drawCover(doc: Doc, input: FacePdfInput) {
  doc.fontSize(TYPE.small).fillColor(INK_FAINT).text("巽風堪輿研究中心", { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.fontSize(TYPE.title).fillColor(INK).text("民俗文化觀察報告", { width: CONTENT_WIDTH });
  doc.moveDown(0.7);

  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .lineWidth(1.2)
    .strokeColor(INK)
    .stroke();
  doc.moveDown(0.9);

  doc.fontSize(TYPE.small).fillColor(INK_SOFT);
  doc.text(`會員　${input.memberName}`, { width: CONTENT_WIDTH });
  doc.text(`分析方式　${MODE_LABEL[input.mode] || input.mode}`, { width: CONTENT_WIDTH });
  doc.text(`完成時間　${formatDate(input.completedAt, input.createdAt)}`, { width: CONTENT_WIDTH });
  doc.text(`報告編號　${input.runId}`, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
}

function drawBody(doc: Doc, report: StructuredFaceReport) {
  const r = report as unknown as Record<string, any>;

  if (r.summary || r.currentTrend) {
    sectionTitle(doc, "本次報告重點");
    if (r.summary) {
      heading(doc, "一句話總結");
      paragraph(doc, String(r.summary), INK);
    }
    if (r.currentTrend) {
      heading(doc, "目前最需要注意");
      paragraph(doc, String(r.currentTrend));
    }
  }

  if (Array.isArray(r.coreHighlights) && r.coreHighlights.length) {
    heading(doc, "三個核心重點");
    bullets(doc, r.coreHighlights.map(String));
  }

  if (Array.isArray(r.photoFingerprint) && r.photoFingerprint.length) {
    sectionTitle(doc, "這張照片實際辨識到的特徵");
    paragraph(
      doc,
      "以下每一項都對應照片上看得到的部位，並附上所依據的面相學理條文。",
      INK_FAINT
    );
    for (const item of r.photoFingerprint) {
      keepTogether(doc, 90);
      heading(doc, String(item?.partName || item?.observation || "觀察"));
      labelled(doc, "所見", item?.observation);
      labelled(doc, "對應宮位", Array.isArray(item?.palaces) ? item.palaces.join("、") : undefined);
      labelled(doc, "學理依據", item?.teaching);
      labelled(doc, "判讀", item?.interpretation);
      labelled(doc, "流年提示", item?.flowYearNote);
    }
  }

  if (r.lifeAreas && typeof r.lifeAreas === "object") {
    const order = ["relationship", "career", "health", "finance", "family"];
    const entries = order.map((k) => [k, r.lifeAreas[k]] as const).filter(([, v]) => v);
    if (entries.length) {
      sectionTitle(doc, "五大面向");
      for (const [key, area] of entries) {
        keepTogether(doc, 100);
        heading(doc, AREA_LABEL[key] || key);
        labelled(doc, "結論", area?.conclusion);
        labelled(doc, "看得到的依據", area?.visibleBasis);
        labelled(doc, "老師判讀", area?.teacherInterpretation);
        labelled(doc, "要留意", area?.watchout);
        labelled(doc, "可以做的事", area?.action);
        const marks = [
          area?.alignment ? ALIGNMENT_LABEL[area.alignment] : null,
          area?.confidence ? CONFIDENCE_LABEL[area.confidence] : null
        ].filter(Boolean);
        if (marks.length) {
          doc.fontSize(TYPE.small).fillColor(INK_FAINT).text(marks.join("　·　"), { width: CONTENT_WIDTH });
          doc.moveDown(0.3);
        }
      }
    }
  }

  if (Array.isArray(r.priorityAdvice) && r.priorityAdvice.length) {
    sectionTitle(doc, "優先處理的三件事");
    r.priorityAdvice.forEach((item: any, i: number) => {
      keepTogether(doc, 80);
      heading(doc, `${i + 1}．${item?.problem || "建議"}`);
      labelled(doc, "為什麼", item?.reason);
      labelled(doc, "怎麼做", item?.advice);
    });
  }

  if (r.surfaceAnalysis && typeof r.surfaceAnalysis === "object") {
    const s = r.surfaceAnalysis;
    if (s.summary || s.complexionObservation || (Array.isArray(s.detectedFeatures) && s.detectedFeatures.length)) {
      sectionTitle(doc, "氣色與表面特徵");
      paragraph(doc, s.summary ? String(s.summary) : "");
      labelled(doc, "氣色觀察", s.complexionObservation);
      if (s.filterWarning) labelled(doc, "照片提醒", s.filterWarning);
      for (const f of s.detectedFeatures || []) {
        keepTogether(doc, 70);
        labelled(doc, "位置", f?.location);
        labelled(doc, "所見", f?.observation);
        labelled(doc, "傳統說法", f?.traditionalReference);
      }
    }
  }

  if (r.flowYear && typeof r.flowYear === "object") {
    sectionTitle(doc, "流年");
    labelled(doc, "對應年歲", r.flowYear.age ? `${r.flowYear.age} 歲` : undefined);
    for (const p of r.flowYear.positions || []) {
      labelled(doc, String(p?.position || "部位"), p?.observation);
    }
    labelled(doc, "交叉比對", r.flowYear.crossCheck);
    labelled(doc, "本期重點", r.flowYear.focus);
    if (Array.isArray(r.flowYear.gates) && r.flowYear.gates.length) {
      heading(doc, "需要留意的關口");
      bullets(doc, r.flowYear.gates.map(String));
    }
    labelled(doc, "可以想一想", r.flowYear.reflection);
  }

  if (r.collaborationFramework && typeof r.collaborationFramework === "object") {
    const c = r.collaborationFramework;
    sectionTitle(doc, "合作對象評估");
    labelled(doc, "結論", c.verdict ? VERDICT_LABEL[c.verdict] || c.verdict : undefined);
    labelled(doc, "理由", c.verdictReason);
    labelled(doc, "適合角色", c.suitableRole);
    labelled(doc, "相處模式", c.interactionStyle);
    if (Array.isArray(c.riskSignals) && c.riskSignals.length) {
      heading(doc, "風險訊號");
      bullets(doc, c.riskSignals.map(String));
    }
    if (Array.isArray(c.questionsToVerify) && c.questionsToVerify.length) {
      heading(doc, "建議先問清楚的事");
      bullets(doc, c.questionsToVerify.map(String));
    }
    labelled(doc, "界線建議", c.boundaries);
  }
}

function drawDisclaimer(doc: Doc, input: FacePdfInput) {
  sectionTitle(doc, "專業聲明");
  paragraph(
    doc,
    "本報告屬傳統民俗文化與自我觀察參考，不代表對個性、命運或未來的事實認定，" +
      "也不構成醫療、法律、投資或人事決策的依據。健康相關內容僅指出面部部位的觀察，不作任何疾病判斷；" +
      "身體不適請就醫。",
    INK_SOFT
  );
  paragraph(
    doc,
    `本報告由巽風會員系統於 ${formatDate(input.completedAt, input.createdAt)} 產生，` +
      "原始照片依隱私政策最長保存 24 小時後刪除。報告內容保存在您的帳號下，可隨時登入查看或刪除。",
    INK_FAINT
  );
}

/**
 * 頁碼。要在所有內容畫完之後才補，因為那時才知道總頁數。
 * pdfkit 的 bufferPages 沒開，改用 switchToPage 逐頁回填。
 */
function addPageNumbers(doc: Doc) {
  const range = doc.bufferedPageRange();
  if (!range.count) return;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - PAGE_MARGIN + 4;
    doc
      .fontSize(TYPE.small)
      .fillColor(INK_FAINT)
      .text(`巽風堪輿研究中心　·　第 ${i + 1} / ${range.count} 頁`, PAGE_MARGIN, y, {
        width: CONTENT_WIDTH,
        align: "center",
        lineBreak: false
      });
  }
}
