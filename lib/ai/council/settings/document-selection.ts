import type { CouncilInput } from "../personas";

export type TeacherDocument = {
  id: string;
  title: string;
  term: string | null;
  extracted_text: string | null;
  char_count: number;
};

export type SelectedReference = {
  id: string;
  title: string;
  chunk: number;
  chars: number;
};

/** Each report has a bounded context even when the selected library grows. */
export const DOCUMENT_PROMPT_CHAR_BUDGET = 24_000;
const DOCUMENT_PROMPT_RAW_CHAR_LIMIT = 32_000;
const CHUNK_SIZE = 1_800;
const PREFIX = "風羿老師補充參考資料（僅作為判讀依據，不得直接照抄進報告）：\n\n";
const countedChars = (value: string) => value.replace(/\s+/g, "").length;

function splitDocument(text: string): string[] {
  const paragraphs = text.trim().split(/\n\s*\n/).filter(Boolean);
  const chunks: string[] = [];
  let pending = "";
  for (const paragraph of paragraphs) {
    // Long paragraphs are split too, so the end of a large Markdown file remains retrievable.
    for (let offset = 0; offset < paragraph.length; offset += CHUNK_SIZE) {
      const part = paragraph.slice(offset, offset + CHUNK_SIZE);
      if (pending && pending.length + part.length + 2 > CHUNK_SIZE) {
        chunks.push(pending);
        pending = "";
      }
      pending = pending ? `${pending}\n\n${part}` : part;
    }
  }
  if (pending) chunks.push(pending);
  return chunks;
}

function grams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const result = new Set<string>();
  for (let i = 0; i + 1 < normalized.length; i++) result.add(normalized.slice(i, i + 2));
  return result;
}

/**
 * Deterministic local selection: no extra model call and no invented rule priority.
 * For libraries that fit, preserve document order and include every chunk.
 */
export function selectTeacherDocuments(
  documents: TeacherDocument[],
  input: Pick<CouncilInput, "question" | "context" | "topic" | "yixue">,
  budget = DOCUMENT_PROMPT_CHAR_BUDGET
): { block: string; references: SelectedReference[]; availableChunks: number } {
  const modules = input.yixue?.modules;
  const enabled = new Set(
    (["bazi", "qimen", "liuyao", "meihua"] as const).filter((term) => modules?.[term])
  );
  const query = grams([input.question, input.context, input.topic].filter(Boolean).join(" "));
  const candidates = documents.flatMap((document, documentOrder) =>
    splitDocument(document.extracted_text || "").map((content, index) => {
      const heading = `【${document.title}｜第 ${index + 1} 段】\n`;
      const overlap = [...grams(content)].reduce((sum, gram) => sum + Number(query.has(gram)), 0);
      const termScore = document.term && enabled.has(document.term as "bazi" | "qimen" | "liuyao" | "meihua")
        ? 8
        : 0;
      return { document, documentOrder, index, content, heading, score: termScore + overlap };
    })
  );
  if (!candidates.length || budget <= countedChars(PREFIX)) {
    return { block: "", references: [], availableChunks: candidates.length };
  }

  const totalLength = countedChars(PREFIX) + candidates.reduce(
    (sum, candidate) => sum + countedChars(candidate.heading + candidate.content), 0
  );
  const totalRawLength = PREFIX.length + candidates.reduce(
    (sum, candidate) => sum + candidate.heading.length + candidate.content.length + 2, 0
  );
  if (totalLength > budget || totalRawLength > DOCUMENT_PROMPT_RAW_CHAR_LIMIT) {
    candidates.sort((a, b) =>
      b.score - a.score || a.documentOrder - b.documentOrder || a.index - b.index
    );
  }

  let used = countedChars(PREFIX);
  let usedRaw = PREFIX.length;
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    const length = countedChars(candidate.heading + candidate.content);
    const rawLength = candidate.heading.length + candidate.content.length + 2;
    if (used + length > budget || usedRaw + rawLength > DOCUMENT_PROMPT_RAW_CHAR_LIMIT) continue;
    chosen.push(candidate);
    used += length;
    usedRaw += rawLength;
  }
  if (!chosen.length) return { block: "", references: [], availableChunks: candidates.length };
  // Reading order follows the source documents, independent of ranking order.
  chosen.sort((a, b) => a.documentOrder - b.documentOrder || a.index - b.index);
  return {
    block: PREFIX + chosen.map((item) => `${item.heading}${item.content}`).join("\n\n"),
    references: chosen.map((item) => ({
      id: item.document.id,
      title: item.document.title,
      chunk: item.index + 1,
      chars: item.content.length
    })),
    availableChunks: candidates.length
  };
}
