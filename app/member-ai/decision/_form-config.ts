// 巽風易學決策報告｜表單常數（從 v3 巽風 yixue system 搬入）
// 抽到獨立檔案，方便 SSR / 後台共用、減少 page.tsx 行數

export const years = Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - i);
export const eventYears = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - 5 + i);
export const months = Array.from({ length: 12 }, (_, i) => i + 1);
export const days = Array.from({ length: 31 }, (_, i) => i + 1);
export const hours = Array.from({ length: 24 }, (_, i) => i);
export const minutes = Array.from({ length: 60 }, (_, i) => i);

export const hourBranches: Array<[string, string]> = [
  ["子", "23:00-00:59"],
  ["丑", "01:00-02:59"],
  ["寅", "03:00-04:59"],
  ["卯", "05:00-06:59"],
  ["辰", "07:00-08:59"],
  ["巳", "09:00-10:59"],
  ["午", "11:00-12:59"],
  ["未", "13:00-14:59"],
  ["申", "15:00-16:59"],
  ["酉", "17:00-18:59"],
  ["戌", "19:00-20:59"],
  ["亥", "21:00-22:59"],
  ["不確定", "不知道"]
];

export const trigramOptions = ["不確定", "乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
export const yaoOptions = ["不會判斷，請用時間起卦", "少陽", "少陰", "老陽", "老陰"];
export const reportTemplates = ["商業決策顧問報告", "標準個人諮詢報告", "企業主管簡報版", "教學展示版"];
export const topics = ["事業／工作", "財運／投資", "考試／升學", "感情／人際", "房產／陽宅", "健康／身心"];
export const reviewModes = ["啟用策略校核層", "啟用深度反證層", "不啟用"];
export const genderOptions = ["男", "女", "其他／不指定", "企業主", "考生"];
export const calendarOptions = ["國曆", "農曆"];
export const yesNoUncertain = ["否", "是", "不確定"];
export const yesNoUncertain2 = ["是", "否", "不確定"];

export const baziModes = ["依出生資料自動初判", "補充四柱資料", "只看流年趨勢"];
export const qimenModes = ["現在起局", "指定時間", "不確定，由系統抓目前時間"];
export const liuyaoModes = ["時間起卦", "三枚銅錢"];
export const meihuaModes = ["時間起卦", "數字起卦", "上下卦起卦"];
export const meihuaUpperTrigrams = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
export const meihuaLowerTrigrams = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];
export const meihuaMovingLines = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];

export type CouncilForm = {
  clientName: string;
  gender: string;
  topic: string;
  reportTemplate: string;
  question: string;
  context: string;
  calendarType: string;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHourBranch: string;
  isLeapMonth: string;
  birthTimeKnown: string;
  reviewMode: string;
  eventYear: number;
  eventMonth: number;
  eventDay: number;
  eventHour: number;
  eventMinute: number;
  baziMode: string;
  qimenTimeMode: string;
  direction: string;
  liuyaoMode: string;
  yao1: string;
  yao2: string;
  yao3: string;
  yao4: string;
  yao5: string;
  yao6: string;
  meihuaMode: string;
  upperTrigram: string;
  lowerTrigram: string;
  meihuaNum1: string;
  meihuaNum2: string;
  meihuaNum3: string;
  meihuaMovingLine: string;
};

export type CouncilModules = {
  bazi: boolean;
  qimen: boolean;
  liuyao: boolean;
  meihua: boolean;
};

export function buildInitialForm(): CouncilForm {
  const now = new Date();
  return {
    clientName: "",
    gender: "男",
    topic: "事業／工作",
    reportTemplate: "商業決策顧問報告",
    question: "",
    context: "",
    calendarType: "國曆",
    birthYear: 1990,
    birthMonth: 1,
    birthDay: 1,
    birthHourBranch: "寅",
    isLeapMonth: "否",
    birthTimeKnown: "是",
    reviewMode: "啟用策略校核層",
    eventYear: now.getFullYear(),
    eventMonth: now.getMonth() + 1,
    eventDay: now.getDate(),
    eventHour: now.getHours(),
    eventMinute: now.getMinutes(),
    baziMode: "依出生資料自動初判",
    qimenTimeMode: "現在起局",
    direction: "不確定",
    liuyaoMode: "時間起卦",
    yao1: "不會判斷，請用時間起卦",
    yao2: "不會判斷，請用時間起卦",
    yao3: "不會判斷，請用時間起卦",
    yao4: "不會判斷，請用時間起卦",
    yao5: "不會判斷，請用時間起卦",
    yao6: "不會判斷，請用時間起卦",
    meihuaMode: "時間起卦",
    upperTrigram: "乾",
    lowerTrigram: "坤",
    meihuaNum1: "",
    meihuaNum2: "",
    meihuaNum3: "",
    meihuaMovingLine: "初爻"
  };
}

export function buildInitialModules(): CouncilModules {
  return { bazi: true, qimen: true, liuyao: true, meihua: true };
}
