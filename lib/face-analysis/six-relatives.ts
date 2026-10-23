// 六親外襲（自己外襲六親）：從本人的五官部位，對照老師說的祖父母、父母、手足、配偶、子女、孫子。
//
// 對應老師「外襲法」的第四節「自己外襲六親」：
//   祖父母看自己額頭；父母看額頭與眼睛；手足看眉毛與顴骨；配偶看印堂、眼睛、鼻子、下巴（與聲相）；
//   子女看中停（年少）與下停（中年）；孫子看下停。
//
// 這一段由規則層確定性產生，不經過模型：部位與階段是老師的對照表，觀察是 Vision 的結果，
// 兩者都不容模型改寫。措辭刻意停在「對照哪一位親人、哪一個階段、這張照片看得清不清楚」，
// 不推定親人的身心狀況或命運，也不把任何形態寫成好壞結論——
// 他們是第三人，照片只有本人，這一段只能是「建議核對的關係觀察」。
// 「六親外襲自己」（從親人面相看自己）需要親人的照片，本系統沒有，不輸出。
//
// 聲相（說話的音質、音量、語速）在照片裡看不到，一律標明無法由照片判讀。

import { describeMorphology, featureValue, isReadable, FEATURE_LABELS, type FaceFeatureName } from "@/lib/face-analysis/face-features";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

export type SixRelativeStatus = "readable" | "partial" | "unreadable";

export type SixRelativeItem = Readonly<{
  /** 親人，例如「父母」。 */
  relative: string;
  /** 老師對照的階段，例如「中年」。 */
  phase: string;
  /** 看自己的哪些部位（繁體中文標籤）。 */
  parts: readonly string[];
  /** 本次照片這些部位看得清楚到什麼程度。 */
  status: SixRelativeStatus;
  /** 逐部位的可見形態，或「照片不足以判讀」。 */
  observation: string;
  /** 老師的對照說法（只講對照關係，不下好壞結論）。 */
  teacherNote: string;
  /** 建議自己核對的一件關係觀察。 */
  verify: string;
}>;

export type SixRelativesSection = Readonly<{
  title: string;
  intro: string;
  items: readonly SixRelativeItem[];
  note: string;
}>;

type Spec = Readonly<{
  relative: string;
  phase: string;
  features: readonly FaceFeatureName[];
  /** 額外要在文字裡說明的、照片無法判讀的部位。 */
  unobservable?: string;
  teacherNote: string;
  verify: string;
}>;

const MIDDLE_THIRD: readonly FaceFeatureName[] = ["eyebrows", "eyes", "nose"];
const LOWER_THIRD: readonly FaceFeatureName[] = ["mouth", "chin", "jaw"];

const SPECS: readonly Spec[] = [
  {
    relative: "祖父母",
    phase: "上一輩的德行與家風",
    features: ["forehead"],
    teacherNote: "老師以自己的額頭對照祖父母一輩的德行與家風；額頭是三停的上停，也是少年階段的根基。",
    verify: "回想家中長輩留下的做事態度與家風，哪一些你自己想延續、哪一些想調整。"
  },
  {
    relative: "父母",
    phase: "中年",
    features: ["forehead", "eyes"],
    teacherNote: "老師以自己的額頭與眼睛，對照父母中年階段的狀態與相處。",
    verify: "近一年與父母的聯繫頻率與話題，是否有一件值得主動關心或溝通的事。"
  },
  {
    relative: "手足",
    phase: "中年",
    features: ["eyebrows", "cheeks"],
    teacherNote: "老師以自己的眉毛與顴骨對照手足中年階段；眉屬兄弟宮，顴骨為輔。",
    verify: "與兄弟姊妹之間，是否有一件拖著沒有說開的事，可以這個月主動聊一次。"
  },
  {
    relative: "配偶（伴侶）",
    phase: "中晚年",
    features: ["glabella", "eyes", "nose", "chin"],
    unobservable: "聲相（說話的音質與語速）",
    teacherNote: "老師以自己的印堂、眼睛、鼻子、下巴與聲相，對照配偶中晚年階段；其中聲相無法由照片判讀。",
    verify: "與伴侶之間，最近一次認真談長期安排是什麼時候，有沒有需要補上的一次對話。"
  },
  {
    relative: "子女（年少階段）",
    phase: "年少",
    features: MIDDLE_THIRD,
    teacherNote: "老師以自己的中停（眉到鼻底，本報告取眉、眼、鼻）對照子女年少階段。",
    verify: "與孩子年少時期的陪伴與溝通方式，有沒有一件想補強的事。"
  },
  {
    relative: "子女（中年階段）",
    phase: "中年",
    features: LOWER_THIRD,
    unobservable: "聲相（說話的音質與語速）",
    teacherNote: "老師以自己的下停（口、下巴、地閣）與聲相對照子女中年階段；聲相無法由照片判讀。",
    verify: "與成年子女的相處，是否保留了彼此說話的空間，有沒有需要先放下的堅持。"
  },
  {
    relative: "孫子",
    phase: "少年",
    features: LOWER_THIRD,
    teacherNote: "老師以自己的下停與德行對照孫輩少年階段；德行無法由照片判讀。",
    verify: "若有孫輩，想留給他們的是什麼樣的家風與相處記憶。"
  }
];

function statusOf(vision: FaceVisionResult, features: readonly FaceFeatureName[]): SixRelativeStatus {
  const readable = features.filter((feature) => isReadable(featureValue(vision, feature))).length;
  if (readable === 0) return "unreadable";
  return readable === features.length ? "readable" : "partial";
}

function observationOf(vision: FaceVisionResult, features: readonly FaceFeatureName[], unobservable?: string): string {
  const parts = features.map((feature) => {
    const value = featureValue(vision, feature);
    return isReadable(value)
      ? `${FEATURE_LABELS[feature]}：${describeMorphology(value)}`
      : `${FEATURE_LABELS[feature]}：照片不足以判讀`;
  });
  if (unobservable) parts.push(`${unobservable}：無法由照片判讀`);
  return parts.join("；");
}

export function buildSixRelatives(vision: FaceVisionResult): SixRelativesSection {
  const items = SPECS.map((spec): SixRelativeItem => {
    const status = statusOf(vision, spec.features);
    return {
      relative: spec.relative,
      phase: spec.phase,
      parts: spec.features.map((feature) => FEATURE_LABELS[feature]),
      status,
      observation: observationOf(vision, spec.features, spec.unobservable),
      teacherNote: spec.teacherNote,
      verify: spec.verify
    };
  });
  return {
    title: "六親外襲（自己外襲六親）",
    intro:
      "外襲法是老師的傳統論法：從自己的五官部位，對照家中不同輩分與階段的親人。以下只列出每一位親人對照到你的哪些部位、這張照片看得清不清楚，以及建議你自己核對的一件關係觀察。",
    items,
    note:
      "這是民俗對照，不是對家人的判定：照片只有本人，無法也不應推定其他人的處境。部位看不清楚的項目會直接標明「照片不足以判讀」，不硬寫。"
  };
}

export function renderSixRelativesText(section: SixRelativesSection): string {
  const statusLabel: Record<SixRelativeStatus, string> = { readable: "部位清楚", partial: "部分部位清楚", unreadable: "照片不足以判讀" };
  const lines = section.items.map(
    (item) =>
      `### ${item.relative}（對照${item.phase}）\n` +
      `看你的：${item.parts.join("、")}（${statusLabel[item.status]}）\n\n` +
      `本張照片：${item.observation}\n\n` +
      `老師的對照：${item.teacherNote}\n\n` +
      `建議核對：${item.verify}`
  );
  return `## ${section.title}\n${section.intro}\n\n${lines.join("\n\n")}\n\n${section.note}`;
}
