// 巽風易學排盤引擎｜奇門遁甲（時家奇門．拆補法．轉盤）
//
// ⚠️ 這一術與梅花、六爻不同，必須經風羿老師以自己的排盤軟體逐盤校對後才可信賴。
//    梅花與六爻的每一步都能用古籍案例交叉驗證（納甲表、八宮卦序、六親口訣都有定本），
//    奇門的定局法卻是流派分歧最大的一項，同一時辰用拆補、置閏、茅山會排出完全不同的局。
//    本實作採**拆補法**，規則寫在 determineJu() 的註解裡，請老師先確認那組規則本身。
//    見 docs/specs/yixue-engine/SCHOOL-DECISIONS.md 決策 8 的校對盤例。
//
// 即便如此，程式排盤仍嚴格優於現況：現況是把「起局方式：現在起局」六個字丟給 LLM，
// 由它自己想像一個局出來，沒有任何人能檢查。這裡至少每一步都寫得出算式。
//
// 實作範圍：定局（陰陽遁＋局數）、地盤三奇六儀、值符值使、天盤九星與天盤干、
//          八門、八神。不做格局判定（伏吟反吟、擊刑、入墓、十干克應…）——
//          那是斷盤不是排盤，且各家取用不同。

import {
  CIRCLE,
  EIGHT_DOORS,
  EIGHT_GODS,
  JU_TABLE,
  NINE_STARS,
  PALACE_INFO,
  SUBSTITUTE_PALACE,
  XUNSHOU_YI,
  YI_ORDER,
  YUAN_NAMES,
  circleIndexOf,
  isYangDun,
  yuanOfFutou,
  type Palace
} from "./tables";
import { EARTH_BRANCHES, HEAVEN_STEMS, branchIndexOf, stemIndexOf } from "../gua/ganzhi";
import type { QimenChart, QimenPalaceCell } from "../types";
import type { SchoolConfig } from "../school/types";
import { currentTermAt, dayPillar, hourPillarOf, type EngineTime } from "../calendar/tyme";

const PALACES: Palace[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 干支在六十甲子中的序號 0–59。用算術找，不查表。 */
function sexagenaryIndex(stem: string, branch: string): number {
  const g = stemIndexOf(stem);
  const z = branchIndexOf(branch);
  for (let n = 0; n < 60; n++) {
    if (n % 10 === g && n % 12 === z) return n;
  }
  throw new Error(`不存在的干支組合：${stem}${branch}`);
}

/**
 * 符頭：日干為甲或己之日，六十甲子中每五日一個。
 *
 * 從當日往回找最近的符頭。用六十甲子序號做算術而不是逐日翻曆——
 * 日柱本來就是每天進一位的循環，往回 d 天就是序號減 d，不需要曆法運算，
 * 也就不會因為跨月跨年出錯。最多回推 5 天必定找到。
 */
function findFutou(dayStem: string, dayBranch: string): { branch: string; daysBack: number; label: string } {
  const n = sexagenaryIndex(dayStem, dayBranch);
  for (let d = 0; d < 10; d++) {
    const idx = (((n - d) % 60) + 60) % 60;
    const stem = HEAVEN_STEMS[idx % 10];
    if (stem === "甲" || stem === "己") {
      const branch = EARTH_BRANCHES[idx % 12];
      return { branch, daysBack: d, label: `${stem}${branch}` };
    }
  }
  throw new Error("找不到符頭，六十甲子表有誤");
}

/**
 * 定局（拆補法）。
 *
 * 規則：
 * 1. 節氣取起局時刻當下生效的那一個，二十四節氣全取（含中氣），不是八字的十二節。
 * 2. 陰陽遁由節氣決定：冬至到芒種為陽遁，夏至到大雪為陰遁。
 * 3. 三元由「符頭」的地支決定，不是由距節天數硬切三段：
 *      符頭地支為子午卯酉 → 上元；寅申巳亥 → 中元；辰戌丑未 → 下元
 * 4. 局數查二十四節氣三元局數表。
 *
 * 這一組規則就是「拆補法」與「置閏法」的分水嶺：置閏法遇到超神接氣要另置閏局，
 * 拆補法不置閏、直接以符頭補足。老師若採置閏，工程要另建，見決策 8。
 */
export function determineJu(t: EngineTime, school: SchoolConfig) {
  const term = currentTermAt(t);
  const day = dayPillar(t, school.calendar.lateZiDayPillar);
  const futou = findFutou(day.stem, day.branch);
  const yuan = yuanOfFutou(futou.branch);
  const yang = isYangDun(term.index);
  const ju = JU_TABLE[term.index][yuan];

  return {
    termIndex: term.index,
    termName: term.name,
    termAt: term.at,
    dun: yang ? ("陽遁" as const) : ("陰遁" as const),
    yuan: YUAN_NAMES[yuan],
    ju,
    futou: futou.label,
    futouDaysBack: futou.daysBack,
    dayGanzhi: day.label
  };
}

/**
 * 地盤三奇六儀。
 * 陽遁自局數宮起順飛九宮（宮數 1→9 循環），陰遁逆飛，依序布戊己庚辛壬癸丁丙乙。
 */
function buildEarthPlate(ju: number, yang: boolean): Record<Palace, string> {
  const plate = {} as Record<Palace, string>;
  for (let i = 0; i < YI_ORDER.length; i++) {
    const offset = yang ? i : -i;
    const palace = (((ju - 1 + offset) % 9) + 9) % 9 + 1;
    plate[palace as Palace] = YI_ORDER[i];
  }
  return plate;
}

function palaceOfStem(plate: Record<Palace, string>, stem: string): Palace {
  const found = PALACES.find((p) => plate[p] === stem);
  if (!found) throw new Error(`地盤找不到天干：${stem}`);
  return found;
}

export function buildQimenChart(school: SchoolConfig, t: EngineTime): QimenChart {
  const ju = determineJu(t, school);
  const yang = ju.dun === "陽遁";
  const earth = buildEarthPlate(ju.ju, yang);

  const hour = hourPillarOf(t, school.calendar);
  // 時柱所屬旬的旬首地支：時支序減時干序，即該旬第一位（甲某）的地支。
  const xunshouBranch = EARTH_BRANCHES[(((branchIndexOf(hour.branch) - stemIndexOf(hour.stem)) % 12) + 12) % 12];
  const xunshouYi = XUNSHOU_YI[xunshouBranch];
  if (!xunshouYi) throw new Error(`旬首地支不合法：${xunshouBranch}`);

  // 值符星與值使門取旬首之儀所落宮的本宮星／門。落中五宮時寄坤二。
  const xunshouPalace = palaceOfStem(earth, xunshouYi);
  const zhiFuStar = NINE_STARS[xunshouPalace];
  const doorHomePalace: Palace = xunshouPalace === 5 ? SUBSTITUTE_PALACE : xunshouPalace;
  const zhiShiDoor = EIGHT_DOORS[doorHomePalace];
  if (!zhiShiDoor) throw new Error(`取不到值使門，宮位 ${doorHomePalace}`);

  // 時干在地盤的宮位。時干為甲時，甲遁於旬首之儀，取該儀的宮位。
  const hourStemForPlate = hour.stem === "甲" ? xunshouYi : hour.stem;
  const hourStemPalace = palaceOfStem(earth, hourStemForPlate);
  // 時干落中五宮時值符寄坤二——中宮不在八宮圓周上，沒有星門神的位置。
  // 不處理這一格會讓每個月都有幾個時辰排不出盤（實測 2026 年有多例）。
  const zhiFuPalace: Palace = hourStemPalace === 5 ? SUBSTITUTE_PALACE : hourStemPalace;

  // ---- 天盤九星：值符星移到時干宮，其餘八星沿八宮圓周保持相對位置一起轉。
  const starShift = circleIndexOf(zhiFuPalace) - circleIndexOf(xunshouPalace);
  const skyStar = {} as Record<Palace, string>;
  const skyStem = {} as Record<Palace, string>;
  for (let i = 0; i < CIRCLE.length; i++) {
    const target = CIRCLE[i];
    const originIndex = (((i - starShift) % 8) + 8) % 8;
    const originPalace = CIRCLE[originIndex];
    // 天芮所在處同時帶著寄中的天禽，天盤干也一併帶過來。
    const carriesQin = originPalace === SUBSTITUTE_PALACE;
    // 分隔符用「兼」而不是斜線：輸出裡「天盤X／地盤Y」已經用了斜線，
    // 再用一次會變成「天盤己／丙／地盤辛」，讀不出哪個斜線是哪一層。
    skyStar[target] = carriesQin ? `${NINE_STARS[originPalace]}兼${NINE_STARS[5]}` : NINE_STARS[originPalace];
    skyStem[target] = carriesQin ? `${earth[originPalace]}兼${earth[5]}` : earth[originPalace];
  }

  // ---- 八門：值使門自旬首宮起，依時辰在該旬中的序數移動，陽遁順、陰遁逆。
  const stepsInXun = (((branchIndexOf(hour.branch) - branchIndexOf(xunshouBranch)) % 12) + 12) % 12;
  const doorShift = yang ? stepsInXun : -stepsInXun;
  const zhiShiIndex = (((circleIndexOf(doorHomePalace) + doorShift) % 8) + 8) % 8;
  const zhiShiPalace = CIRCLE[zhiShiIndex];
  const doorRotation = zhiShiIndex - circleIndexOf(doorHomePalace);
  const doors = {} as Record<Palace, string>;
  for (let i = 0; i < CIRCLE.length; i++) {
    const origin = CIRCLE[(((i - doorRotation) % 8) + 8) % 8];
    doors[CIRCLE[i]] = EIGHT_DOORS[origin] as string;
  }

  // ---- 八神：值符神落值符星所在宮，陽遁順布、陰遁逆布。
  const gods = {} as Record<Palace, string>;
  const godStart = circleIndexOf(zhiFuPalace);
  for (let i = 0; i < EIGHT_GODS.length; i++) {
    const offset = yang ? i : -i;
    gods[CIRCLE[(((godStart + offset) % 8) + 8) % 8]] = EIGHT_GODS[i];
  }

  const cells: QimenPalaceCell[] = CIRCLE.map((p) => ({
    palace: p,
    gua: PALACE_INFO[p].gua,
    direction: PALACE_INFO[p].direction,
    element: PALACE_INFO[p].element,
    earthStem: earth[p],
    skyStem: skyStem[p],
    star: skyStar[p],
    door: doors[p],
    god: gods[p]
  })).sort((a, b) => a.palace - b.palace);

  return {
    dun: ju.dun,
    ju: ju.ju,
    yuan: ju.yuan,
    termName: ju.termName,
    termAt: ju.termAt,
    futou: ju.futou,
    dayGanzhi: ju.dayGanzhi,
    hourGanzhi: hour.label,
    xunshou: `甲${xunshouBranch}`,
    xunshouYi,
    zhiFuStar,
    zhiFuPalace,
    zhiFuInCenter: hourStemPalace === 5,
    zhiShiDoor,
    zhiShiPalace,
    centerStem: earth[5],
    cells
  };
}
