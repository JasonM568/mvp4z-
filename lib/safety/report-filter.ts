// 會員報告輸出最後一關：名號與醫療用語過濾
//
// 兩條全域禁令（優先於一切內容）：
// 1. 會員看得到的內容不得出現「沈老師／沈師／沈全榮」，一律改成「巽風面相」。
// 2. 不涉醫療、不談療效：不得有疾病名稱、器官病變、診斷、治療、用藥，
//    也不得宣稱任何作法有療效或保證改善。
//
// 做法刻意保守：
// - 名號：就地替換，不刪句子，因為句子本身通常是合法的面相論述。
// - 醫療：命中就「剔除該句」並記錄，不自動改寫——自動改寫會把模型寫的病名換個說法繼續留著。
// - 否定句例外：免責聲明（「本報告不構成診斷或治療建議」）本身就該留下，
//   所以通用字眼（診斷、治療、疾病…）在有否定語氣時放行。具體病名與器官病變一律剔除，不看語氣。
//
// 這是詞表過濾，擋得住已知詞，擋不住換個說法的新病名。它是最後一道網，不是唯一一道：
// 匯入教材與 prompt 端仍要把來源處理乾淨。

export type FilterRule = "name" | "disease" | "organ" | "medical" | "claim";

export type FilterHit = {
  rule: FilterRule;
  term: string;
  action: "replaced" | "removed";
  /** 被處理的句子前 40 字，供後台稽核。只存片段，不存整份報告。 */
  excerpt: string;
};

export const SCHOOL_REPLACEMENT = "巽風面相";

// 長的放前面，避免「沈全榮老師」被「沈全榮」先吃掉留下一個「老師」。
const NAME_PATTERN = /沈全榮老師|沈全榮|沈老師|沈師父|沈師/g;

/** 具體病名與病變：一律剔除。 */
const DISEASE_TERMS = [
  "癌", "腫瘤", "結石", "糖尿病", "高血壓", "低血壓", "心臟病", "心肌", "心衰", "中風", "腦中風",
  "肝炎", "肝硬化", "肝病", "腎衰", "腎病", "腎炎", "胃潰瘍", "胃炎", "肺炎", "氣喘", "哮喘",
  "憂鬱症", "躁鬱", "精神病", "精神分裂", "失智", "癲癇", "子宮肌瘤", "子宮後屈", "不孕症",
  "婦科病", "乳腺", "甲狀腺", "貧血", "白血病", "痛風", "關節炎", "骨質疏鬆", "疝氣", "痔瘡",
  "心血管疾病", "血栓", "病變", "病灶", "絕症", "惡疾", "化療", "放療", "開刀", "手術"
];

/**
 * 器官＋狀態的組合（「心臟弱」「肝膽不好」「子宮後屈」）。器官單獨出現不算。
 * 單字「心」刻意不收：「內心不足」「做賊心虛」是日常用語，要指心臟請寫「心臟」。
 */
const ORGAN_CONDITION =
  /(心臟|肝臟|肝膽|膽囊|腎臟|肺部|胃部|腸胃|腸道|子宮|膀胱|胰臟|脾臟|腦部|前列腺|攝護腺|卵巢|乳房|肝|膽|腎|肺|胃|腸|脾)(功能)?(弱|衰|虛弱|不好|不佳|欠佳|有問題|出問題|有毛病|毛病|疾患|疾|炎|腫|結石|病變|後屈|下垂|不足)/;

/** 通用醫療字眼：有否定／免責語氣時放行。 */
const MEDICAL_TERMS = ["診斷", "診治", "治療", "療程", "用藥", "服藥", "吃藥", "藥方", "處方", "疾病", "病症", "病名", "病因"];

/** 療效宣稱：有否定語氣時放行（例如「不保證有療效」）。 */
const CLAIM_TERMS = ["療效", "治癒", "根治", "痊癒", "包治", "保證改善", "保證有效", "保證康復", "必定改善", "一定會好"];

/** 否定／免責語氣。命中時，通用醫療字眼與療效宣稱視為在「否認」而不是在「宣稱」。 */
const NEGATION =
  /不(構成|涉及|涉|談|作為|提供|做|給|屬|是|能|等於|代表|得|可|會|予|宜|保證|論斷|下)|並非|非(醫|屬)|無法(替代|取代|作為)|僅供|切勿|避免|不做任何|沒有(任何)?(診斷|療效|醫療)/;

function includesAny(text: string, terms: string[]): string | null {
  for (const t of terms) if (text.includes(t)) return t;
  return null;
}

function excerptOf(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

/**
 * 判斷一個句子是否需要剔除。回傳命中的規則與詞，不需要剔除回 null。
 * 名號不在這裡處理（替換即可，不刪句子）。
 */
function medicalVerdict(sentence: string): { rule: FilterRule; term: string } | null {
  const disease = includesAny(sentence, DISEASE_TERMS);
  if (disease) return { rule: "disease", term: disease };

  const organ = ORGAN_CONDITION.exec(sentence);
  if (organ) return { rule: "organ", term: organ[0] };

  const negated = NEGATION.test(sentence);
  const claim = includesAny(sentence, CLAIM_TERMS);
  if (claim && !negated) return { rule: "claim", term: claim };
  const medical = includesAny(sentence, MEDICAL_TERMS);
  if (medical && !negated) return { rule: "medical", term: medical };
  return null;
}

/** 句子切分：保留結尾標點，換行獨立成段。 */
function splitSentences(line: string): string[] {
  return line.match(/[^。！？!?；;]+[。！？!?；;]?|[。！？!?；;]+/g) ?? [line];
}

/** 一行只剩項目符號或空白時，整行去掉，不留下孤立的「- 」。 */
function isEmptyShell(line: string): boolean {
  return /^[\s\-*•·●○■□▪▫、，,：:\d.)）(（]*$/.test(line);
}

export function filterReportText(input: string): { text: string; hits: FilterHit[] } {
  if (!input) return { text: input, hits: [] };
  const hits: FilterHit[] = [];

  const lines = input.split("\n").map((rawLine) => {
    let line = rawLine;

    if (NAME_PATTERN.test(line)) {
      NAME_PATTERN.lastIndex = 0;
      const found = line.match(NAME_PATTERN) ?? [];
      for (const term of new Set(found)) {
        hits.push({ rule: "name", term, action: "replaced", excerpt: excerptOf(rawLine) });
      }
      line = line.replace(NAME_PATTERN, SCHOOL_REPLACEMENT);
    }
    NAME_PATTERN.lastIndex = 0;

    const kept = splitSentences(line).filter((sentence) => {
      const verdict = medicalVerdict(sentence);
      if (!verdict) return true;
      hits.push({ ...verdict, action: "removed", excerpt: excerptOf(sentence) });
      return false;
    });
    const joined = kept.join("");
    return isEmptyShell(joined) && joined !== line ? null : joined;
  });

  return { text: lines.filter((l): l is string => l !== null).join("\n"), hits };
}

/** 對巢狀 JSON 內所有字串值套用同一套過濾（structured 報告用）。物件鍵不動。 */
export function filterDeep<T>(value: T): { value: T; hits: FilterHit[] } {
  const hits: FilterHit[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = filterReportText(v);
      hits.push(...r.hits);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return { value: walk(value) as T, hits };
}

/** 稽核摘要：同規則同詞合併計次，避免一份報告寫出幾十列。 */
export function summarizeHits(hits: FilterHit[]): Array<{ rule: FilterRule; term: string; action: string; count: number; excerpt: string }> {
  const map = new Map<string, { rule: FilterRule; term: string; action: string; count: number; excerpt: string }>();
  for (const h of hits) {
    const key = `${h.rule}:${h.term}:${h.action}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { rule: h.rule, term: h.term, action: h.action, count: 1, excerpt: h.excerpt });
  }
  return [...map.values()];
}
