// 巽風 council｜設定內可用的變數
//
// 獨立成一檔而不放 schema.ts，是為了讓後台頁面能只 import 常數而不把 zod
// 一起拖進瀏覽器 bundle。schema.ts 會再 re-export，既有 import 路徑不受影響。

export const PROMPT_TOKENS = {
  ENABLED_TERMS: "{{啟用術數}}",
  TOPIC: "{{問題類型}}",
  TERM_NAME: "{{術數名稱}}",
  CLIENT_NAME: "{{案主}}",
  QUESTION: "{{問題}}",
  BIRTH: "{{出生資料}}",
  EVENT_TIME: "{{問事時間}}",
  QIMEN_MODE: "{{奇門起局方式}}",
  QIMEN_DIRECTION: "{{奇門方位}}",
  LIUYAO_MODE: "{{六爻起卦方式}}",
  LIUYAO_YAO: "{{六爻資料}}",
  MEIHUA_MODE: "{{梅花起卦方式}}",
  MEIHUA_UPPER: "{{梅花上卦}}",
  MEIHUA_LOWER: "{{梅花下卦}}",
  WEIGHTS: "{{權重排序}}"
} as const;

export const TOKEN_DESCRIPTIONS: Record<string, string> = {
  [PROMPT_TOKENS.ENABLED_TERMS]: "本次啟用的術數清單，例如「八字命理、奇門遁甲」",
  [PROMPT_TOKENS.TOPIC]: "會員選的問題類型，未選時顯示「本案」",
  [PROMPT_TOKENS.TERM_NAME]: "目前這一術的名稱，只能用在各術共用的段落設定裡",
  [PROMPT_TOKENS.CLIENT_NAME]: "案主姓名",
  [PROMPT_TOKENS.QUESTION]: "會員填的問題",
  [PROMPT_TOKENS.BIRTH]: "出生資料（曆法年月日時辰）",
  [PROMPT_TOKENS.EVENT_TIME]: "問事／起局時間",
  [PROMPT_TOKENS.QIMEN_MODE]: "奇門起局方式",
  [PROMPT_TOKENS.QIMEN_DIRECTION]: "奇門事件方位",
  [PROMPT_TOKENS.LIUYAO_MODE]: "六爻起卦方式",
  [PROMPT_TOKENS.LIUYAO_YAO]: "六爻六個爻的內容",
  [PROMPT_TOKENS.MEIHUA_MODE]: "梅花起卦方式",
  [PROMPT_TOKENS.MEIHUA_UPPER]: "梅花上卦",
  [PROMPT_TOKENS.MEIHUA_LOWER]: "梅花下卦",
  [PROMPT_TOKENS.WEIGHTS]: "四術權重排序文字，由下方權重欄位自動組成"
};
