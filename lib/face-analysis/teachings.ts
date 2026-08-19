import {
  describeMorphology,
  featureValue,
  isReadable,
  FEATURE_LABELS,
  type FaceFeatureName,
  type RegionValue
} from "@/lib/face-analysis/face-features";
import type { FaceVisionResult } from "@/lib/face-analysis/vision";

/**
 * 沈全榮老師教材的形態條件規則表。
 *
 * 這張表是「報告不再攏統」的來源：規則層先用確定性條件比對本張照片的形態，
 * 命中哪幾條教材說法就把原文帶進報告，撰稿模型只能引用命中的條文，不能自由發揮。
 *
 * 收錄原則：
 * - 只收能用 Vision 的四個形態欄位（輪廓／寬窄／長短／對稱）表達的條文；
 *   氣色、紋路、神韻類條文本版不收，等 Vision 擴充後再開。
 * - 一律標教材出處。沒有出處的不收。
 * - 涉及疾病、臟腑、壽元、生育、心理診斷的 CRITICAL 條文不進本表。
 * - healthSensitive 的條目：會員報告只輸出 memberText（部位＋核對提醒），
 *   教材原文放 teacherText，僅供老師版與內部稽核。
 */

export type TeachingTheme = "感情" | "事業" | "健康" | "財運" | "家庭";

type Enum4 = Readonly<{
  contour?: readonly RegionValue["contour"][];
  relativeWidth?: readonly RegionValue["relativeWidth"][];
  relativeHeight?: readonly RegionValue["relativeHeight"][];
  symmetry?: readonly RegionValue["symmetry"][];
}>;

export type Teaching = Readonly<{
  id: string;
  feature: FaceFeatureName;
  when: Enum4;
  /** 教材說法，可直接進會員報告。 */
  memberText: string;
  /** 教材原文摘要；healthSensitive 為 true 時只給老師版。 */
  teacherText: string;
  healthSensitive: boolean;
  themes: readonly TeachingTheme[];
  palaces: readonly string[];
  source: string;
}>;

export const BUILT_IN_TEACHINGS: readonly Teaching[] = [
  // ── 額頭（官祿宮／父母宮／遷移宮／天倉）────────────────────────────
  {
    id: "T_FOREHEAD_WIDE_HIGH",
    feature: "forehead",
    when: { relativeWidth: ["wide"], relativeHeight: ["long"] },
    memberText:
      "教材以額頭高、寬、髮際平整為好額的條件，對應年少階段的資源與思考的施展空間，也代表較知道長輩要什麼、與長上相處的方式較順。",
    teacherText: "教材：額頭高者會照顧長上，知道父母需要什麼（好額）。額頭高寬凸、髮際平整、沒有破相為佳。",
    healthSensitive: false,
    themes: ["事業", "家庭"],
    palaces: ["官祿宮", "父母宮"],
    source: "283 頁筆記 p.103–108"
  },
  {
    id: "T_FOREHEAD_WIDE",
    feature: "forehead",
    when: { relativeWidth: ["wide"] },
    memberText:
      "教材說額頭寬廣對應年輕階段的發展空間，臨機應變與多變的處理能力較能施展；遷移宮的山林驛馬也在這一帶，與外出、變動的空間有關。",
    teacherText: "教材：法令淺、額頭寬凸者，多變能力、臨機應變能力好。遷移宮位置山林驛馬，額頭寬廣度不足反射年輕發展性比較窄。",
    healthSensitive: false,
    themes: ["事業"],
    palaces: ["官祿宮", "遷移宮"],
    source: "283 頁筆記 p.97–144"
  },
  {
    id: "T_FOREHEAD_NARROW",
    feature: "forehead",
    when: { relativeWidth: ["narrow"] },
    memberText:
      "教材以額頭低窄為面積不足，對應年少階段較奔波、可運用的資源較有限；遷移宮這一段窄，也對應年輕時發展空間較受限、較容易有志難伸的處境。教材同時指出若骨相好仍可翻身。",
    teacherText: "教材：額頭低窄，面積不足。額頭窄，父母不旺，年輕奔波。額頭很寬廣但有髮尖，有好的骨相可以翻身；額頭低窄沒有奇骨，不能翻身。",
    healthSensitive: false,
    themes: ["事業", "家庭"],
    palaces: ["官祿宮", "父母宮", "遷移宮"],
    source: "283 頁筆記 p.10–11、p.111"
  },
  {
    id: "T_FOREHEAD_SHORT",
    feature: "forehead",
    when: { relativeHeight: ["short"] },
    memberText:
      "教材說額頭偏低這一段，對應的是規劃與判斷要更靠實作累積，賺錢的路徑通常不是靠一次想清楚，而是靠反覆試。建議把重大判斷拆小、留紀錄再回看。",
    teacherText: "教材：額頭低的人，思維能力比較弱，所以賺錢能力比較弱。",
    healthSensitive: false,
    themes: ["事業", "財運"],
    palaces: ["官祿宮", "財帛宮（天倉）"],
    source: "283 頁筆記 p.97–144"
  },
  {
    id: "T_FOREHEAD_ASYMMETRIC",
    feature: "forehead",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說額頭一高一低，對應年輕階段的起伏會比較明顯，好一年、不好一年交替。父母宮的日月角也在這一帶，左右差異在教材裡對應與雙親兩邊的緣分深淺不同。",
    teacherText: "教材：額頭一高一低，年輕不發，因為流年一年好一年不好。額頭高低不平。日月角看父母。",
    healthSensitive: false,
    themes: ["事業", "家庭"],
    palaces: ["官祿宮", "父母宮"],
    source: "283 頁筆記 p.10–11"
  },

  // ── 印堂（命宮）────────────────────────────────────────────────
  {
    id: "T_GLABELLA_WIDE",
    feature: "glabella",
    when: { relativeWidth: ["wide"] },
    memberText:
      "教材以印堂開闊平整、可容兩指幅為標準相理，對應心胸與包容的空間較大，遇事的迴旋餘地較足。印堂是命宮，也是當陽十三部位的正中央。",
    teacherText: "教材：印堂開闊，肺活量大，心胸開闊，包容力大。印堂兩指幅，退印。印堂開闊平整，沒有惡痣惡紋等。",
    healthSensitive: false,
    themes: ["事業", "感情"],
    palaces: ["命宮"],
    source: "283 頁筆記 p.97–144 印堂段"
  },
  {
    id: "T_GLABELLA_NARROW",
    feature: "glabella",
    when: { relativeWidth: ["narrow"] },
    memberText:
      "教材說印堂不開、兩眉逼近這一段，對應遇事容易鑽牛角尖、迴旋空間較小。建議在做重大決定前刻意多留一段緩衝時間，並找一個固定的人對話。",
    teacherText: "教材：眉頭不開。印堂窄，心胸迴旋餘地小。眉毛印堂雜紋多是貧困象。",
    healthSensitive: false,
    themes: ["事業", "感情"],
    palaces: ["命宮"],
    source: "283 頁筆記 p.97–144 印堂段"
  },

  // ── 眉（兄弟宮／福德宮）─────────────────────────────────────────
  {
    id: "T_EYEBROWS_TIDY",
    feature: "eyebrows",
    when: { contour: ["straight", "rounded"], symmetry: ["balanced"] },
    memberText:
      "教材以眉形秀麗、眉頭不亂、眉尾聚而不散為好眉的條件，對應手足與同輩之間的相處較順，情緒的穩定度也較夠。眉屬兄弟宮。",
    teacherText: "教材：眉毛秀氣，兄弟姐妹有出息，和樂家庭。眉形秀麗。眉頭沒有雜毛。",
    healthSensitive: false,
    themes: ["家庭", "感情"],
    palaces: ["兄弟宮"],
    source: "283 頁筆記 p.49–96 眉毛段"
  },
  {
    id: "T_EYEBROWS_ASYMMETRIC",
    feature: "eyebrows",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說眉毛一高一低，對應手足或同輩之間的親疏不均，也常反映在情緒起伏上。眉這一段對應流年 31 至 34 歲，可回看那幾年的人際變化。",
    teacherText: "教材：眉毛一高一低。眉毛散，情緒不穩定，沒有創造能力。眉尾散不聚。",
    healthSensitive: false,
    themes: ["家庭", "感情"],
    palaces: ["兄弟宮"],
    source: "283 頁筆記 p.49–96 眉毛段"
  },
  {
    id: "T_EYEBROWS_SPARSE",
    feature: "eyebrows",
    when: { relativeHeight: ["short"] },
    memberText:
      "教材說眉薄眉疏這一段，對應與人建立深交的速度較慢，也提到眉無形則不聚財、眉尾散對應存不住錢。建議把儲蓄改成自動化，不靠當下決定。",
    teacherText: "教材：眉毛稀疏，不好相處。眉無形，不聚財。眉尾散，不聚財，情緒不穩定。沒有眉毛，沒有朋友，錢財不聚。",
    healthSensitive: false,
    themes: ["財運", "家庭"],
    palaces: ["兄弟宮", "福德宮"],
    source: "283 頁筆記 p.49–96 眉毛段"
  },

  // ── 眼（田宅宮／夫妻宮輔）───────────────────────────────────────
  {
    id: "T_EYES_LONG",
    feature: "eyes",
    when: { relativeWidth: ["wide"], relativeHeight: ["medium", "long"] },
    memberText:
      "教材以眼形細長、眼神收斂為佳，對應看事情的耐性與收放較穩，不容易被當下情緒帶走。眼瞼屬田宅宮，也是夫妻宮的輔看部位。",
    teacherText: "教材：眼神好。眼瞼、印堂開、額頭開、鼻樑高、天倉開闊可容兩指幅為佳。",
    healthSensitive: false,
    themes: ["感情", "事業"],
    palaces: ["田宅宮", "夫妻宮"],
    source: "283 頁筆記 p.49–96 眼部段"
  },
  {
    id: "T_EYES_SHORT_ROUND",
    feature: "eyes",
    when: { relativeHeight: ["short"], contour: ["rounded"] },
    memberText:
      "教材說眼睛短圓這一段，對應情緒的反應比較快、也比較外顯。建議在會被情緒牽動的場合（談錢、談合約、談關係）刻意延後一天再回覆。眼部對應流年 35 至 40 歲。",
    teacherText: "教材：眼睛短圓，情緒化；眼神睜露；眼氣色偏暗。",
    healthSensitive: false,
    themes: ["感情", "事業"],
    palaces: ["田宅宮"],
    source: "283 頁筆記 p.49–96 眼部段"
  },
  {
    id: "T_EYES_ASYMMETRIC",
    feature: "eyes",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說眼睛一大一小這一段，對應對人的判斷容易兩極、親疏落差大。眼部流年 37、38 歲在教材裡常用來對照感情與財務上的變動，可以拿那兩年的實際紀錄回看。",
    teacherText: "教材：眼睛一大一小，帶邪氣。眼球出問題，37、38 至少會應證婚姻、意外、財務（變動）。",
    healthSensitive: false,
    themes: ["感情", "財運"],
    palaces: ["田宅宮", "夫妻宮"],
    source: "283 頁筆記 p.11、p.49–96"
  },

  // ── 山根（疾厄宮）──────────────────────────────────────────────
  {
    id: "T_NASALROOT_HIGH_WIDE",
    feature: "nasalRoot",
    when: { relativeWidth: ["wide"], relativeHeight: ["long"] },
    memberText:
      "山根是疾厄宮的主看部位，教材以高、寬、厚、清楚為標準相理。這一段同時是四隘中的 41 歲關卡，建議把它當成定期健檢與作息紀錄的提醒點，不作任何身體狀況的判斷。",
    teacherText: "教材：疾厄宮以山根、年壽為主，交叉鼻與眼的形神氣，以高、寬、厚、清楚為條件。山根高、寬。山根要高寬（暗管），是血液循環的交換所在。",
    healthSensitive: true,
    themes: ["健康", "事業"],
    palaces: ["疾厄宮"],
    source: "283 頁筆記 p.78–84"
  },
  {
    id: "T_NASALROOT_LOW",
    feature: "nasalRoot",
    when: { relativeHeight: ["short"] },
    memberText:
      "教材說山根低陷這一段，對應自信心在關鍵時刻比較容易動搖，物質層面的累積也較費力。山根對應流年 41 歲，是教材四隘之一，建議在該年前後把健檢與工作安排都排進行事曆。",
    teacherText: "教材：山根低陷，沒有自信心。山根橫斷，物質層面不好。四隘 41 山根主健康事業。",
    healthSensitive: true,
    themes: ["事業", "健康", "財運"],
    palaces: ["疾厄宮"],
    source: "283 頁筆記 p.12–13、p.49–96"
  },

  // ── 鼻（財帛宮人倉）────────────────────────────────────────────
  {
    id: "T_NOSE_LARGE",
    feature: "nose",
    when: { relativeWidth: ["wide"], relativeHeight: ["medium", "long"] },
    memberText:
      "鼻是財帛宮的人倉，對應 31 至 50 歲自賺之財。教材以鼻樑要挺、鼻要大、兩翼蘭台廷尉對稱為標準相理，這一段對應自我主張與掌握資源的力道。",
    teacherText: "教材：鼻樑要挺要大。鼻子表示的是自己，鼻：自界。鼻正心正，鼻斜心歪。鼻子兩翼左蘭台右廷尉。",
    healthSensitive: false,
    themes: ["財運", "事業"],
    palaces: ["財帛宮（人倉）"],
    source: "283 頁筆記 p.49–96 鼻部段"
  },
  {
    id: "T_NOSE_LOW",
    feature: "nose",
    when: { relativeHeight: ["short"] },
    memberText:
      "教材說鼻偏低這一段，對應自己作主的力道要靠制度補，不容易只憑個人堅持推動事情。鼻部對應流年 41 至 50 歲，建議在這段年紀把重要合作寫成書面條件。",
    teacherText: "教材：鼻子比較低。鼻子相理不好，留在家鄉發展受到限制。鼻子屬於 41~50 歲流年運。",
    healthSensitive: false,
    themes: ["財運", "事業"],
    palaces: ["財帛宮（人倉）"],
    source: "283 頁筆記 p.49–96 鼻部段"
  },
  {
    id: "T_NOSE_ANGULAR",
    feature: "nose",
    when: { contour: ["angular"] },
    memberText:
      "教材說鼻樑骨偏尖削、骨多於肉這一段，對應人際上的迴旋較少，事情容易自己扛。建議刻意保留一到兩個可以講真話的對象，並在 41 歲前後檢視伴侶與合作關係的實際狀態。",
    teacherText: "教材：鼻梁骨特別尖削（只有骨頭沒有肉），41 歲了沒有配偶，長上不好，朋友不好，不發是肇因於自己。",
    healthSensitive: false,
    themes: ["感情", "事業"],
    palaces: ["財帛宮（人倉）", "疾厄宮"],
    source: "283 頁筆記 p.49–96 鼻部段"
  },
  {
    id: "T_NOSE_ASYMMETRIC",
    feature: "nose",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說鼻兩翼不對稱這一段，對應好勝心與冒險傾向較強。建議把賭性會被放大的場合先設上限（金額、時間、次數），對應流年在 44 至 50 歲。",
    teacherText: "教材：鼻子兩翼左蘭台右廷尉，不對稱：好勝心強，賭性強。",
    healthSensitive: false,
    themes: ["財運"],
    palaces: ["財帛宮（人倉）"],
    source: "283 頁筆記 p.49–96 鼻部段"
  },

  // ── 顴（兄弟宮輔／權柄）─────────────────────────────────────────
  {
    id: "T_CHEEKS_ROUNDED",
    feature: "cheeks",
    when: { contour: ["rounded"] },
    memberText:
      "教材以顴骨隱圓為最好的相理，像雞蛋藏著，笑的時候會有兩塊，對應企圖心、外交手腕與決斷力三者較均衡。顴對應流年 46、47 歲。",
    teacherText: "教材：顴骨最好的是隱圓，像是雞蛋藏著，有笑的時候會有兩塊者吉。企圖心、外交手腕、決斷力。顴骨標準相理：隱圓、對稱、沒有違章建築、氣色光亮。",
    healthSensitive: false,
    themes: ["事業"],
    palaces: ["兄弟宮", "奴僕宮"],
    source: "283 頁筆記 p.49–96 顴骨段"
  },
  {
    id: "T_CHEEKS_WIDE",
    feature: "cheeks",
    when: { relativeWidth: ["wide"] },
    memberText:
      "教材說顴骨橫張對應企圖心旺、朋友群多、外交手腕佳，但關係也會比較複雜，各種層次的人都可能成為朋友。建議把合作對象分層管理，不要一視同仁。",
    teacherText: "教材：顴骨橫張，企圖心旺、朋友群多。外交手腕佳，會成群結黨。關係複雜，每一個層次的人都可以當他的朋友。顴骨橫張的固執。",
    healthSensitive: false,
    themes: ["事業", "家庭"],
    palaces: ["兄弟宮", "奴僕宮"],
    source: "283 頁筆記 p.49–96 顴骨段"
  },
  {
    id: "T_CHEEKS_NARROW",
    feature: "cheeks",
    when: { relativeWidth: ["narrow"] },
    memberText:
      "教材說顴骨塌陷對應交友圈較窄、比較顧自己，協調與靈活度要刻意補。顴是輔佐的部位，教材強調主要仍看鼻。建議在需要授權的場合明確寫下分工。",
    teacherText: "教材：顴骨塌陷，不是領導者。顴骨塌陷者比較自我，顯得鼻子挺，欠缺活力、協調力、靈活，會比較顧自己不會顧他人。顴骨塌的人交友圈狹隘。",
    healthSensitive: false,
    themes: ["事業"],
    palaces: ["兄弟宮", "奴僕宮"],
    source: "283 頁筆記 p.49–96 顴骨段"
  },
  {
    id: "T_CHEEKS_ASYMMETRIC",
    feature: "cheeks",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說顴骨不對稱這一段，對應 44 至 50 歲之間的起伏會比較大，大好大壞交替。教材也提到 46、47 歲這兩年在合夥投資上要特別謹慎。",
    teacherText: "教材：顴骨若是不對稱，41 進入 44、45、46、47、48、49、50 歲，會有大好大壞，起伏很大，金木相剋。權骨有痣，權柄喪失，46、47 不適合合夥投資。",
    healthSensitive: false,
    themes: ["財運", "事業"],
    palaces: ["兄弟宮"],
    source: "283 頁筆記 p.49–96 顴骨段"
  },

  // ── 人中（子女宮輔）────────────────────────────────────────────
  {
    id: "T_PHILTRUM_DEEP_LONG",
    feature: "philtrum",
    when: { relativeWidth: ["wide"], relativeHeight: ["long"], symmetry: ["balanced"] },
    memberText:
      "教材以人中寬、深、長、正為標準相理，對應包容力大、能付出與照顧的時間比較長。人中對應流年 51 歲，是教材四隘之一。健康面只建議以實際健檢核對。",
    teacherText: "教材：人中相理寬深長正，血液循環好，包容力大，不容易腰痠背痛，健康好、工作能力時間長久，比較有福氣，子女好，可以付出照顧的時間比較多。（p.88 另有一條疑似誤植，待老師確認。）",
    healthSensitive: true,
    themes: ["家庭", "健康"],
    palaces: ["子女宮"],
    source: "283 頁筆記 p.49–96 人中段"
  },
  {
    id: "T_PHILTRUM_SHALLOW",
    feature: "philtrum",
    when: { relativeHeight: ["short"] },
    memberText:
      "教材說人中偏淺、偏短這一段，對應在合夥與投資上要更保守，也提醒把與晚輩的溝通方式放慢。人中對應流年 51 歲，教材建議用這一年前後的實際紀錄回看。",
    teacherText: "教材：人中淺、橫紋，事業挫敗，健康滑落。看流年知道適不適合合夥投資。人中相理不符，表示下半輩子不好。",
    healthSensitive: true,
    themes: ["財運", "家庭", "健康"],
    palaces: ["子女宮"],
    source: "283 頁筆記 p.49–96 人中段"
  },

  // ── 口（水星）─────────────────────────────────────────────────
  {
    id: "T_MOUTH_WIDE",
    feature: "mouth",
    when: { relativeWidth: ["wide"] },
    memberText:
      "教材把嘴視為出納官與水星，看表達、飲食、賺錢能力與意志力。口大這一段對應表達與爭取的力道較強，對應流年 56 至 64 歲的嘴局。",
    teacherText: "教材：嘴巴，出納管（表達、飲食）、水星；看賺錢能力、意志力、健康、婚姻情感問題。嘴局流年 56~64。",
    healthSensitive: false,
    themes: ["事業", "財運"],
    palaces: ["奴僕宮"],
    source: "283 頁筆記 p.49–96 嘴部段"
  },
  {
    id: "T_MOUTH_NARROW",
    feature: "mouth",
    when: { relativeWidth: ["narrow"] },
    memberText:
      "教材說嘴偏小、偏鬆這一段，若同時下巴偏尖，對應在託付與授權上要更小心，把交辦的事寫清楚驗收條件。對應流年在 56 至 64 歲。",
    teacherText: "教材：嘴巴偏小、嘴巴外斜、嘴巴鬆弛短小，而且地閣偏尖，部署背叛，子女不孝、沒有出息。",
    healthSensitive: false,
    themes: ["家庭", "事業"],
    palaces: ["奴僕宮"],
    source: "283 頁筆記 p.49–96 嘴部段"
  },

  // ── 地閣／下顎（財帛宮地倉／奴僕宮）──────────────────────────────
  {
    id: "T_CHIN_WIDE",
    feature: "chin",
    when: { relativeWidth: ["wide"] },
    memberText:
      "教材以地閣開闊飽滿、骨要多於肉、地閣微朝為標準相理，對應包容力大、晚年的資源與居所較穩，與子女晚輩的關係也較開。地閣是財帛宮的地倉，對應流年 71 歲。",
    teacherText: "教材：地閣相理開闊、飽滿、骨朝。地閣開闊飽滿，子女有出息。地閣骨開闊、地閣微朝，晚年財運好（地倉），子女、晚輩。下巴飽滿地閣有朝，財產至少兩棟以上。地閣飽滿，包容力大。",
    healthSensitive: false,
    themes: ["財運", "家庭"],
    palaces: ["財帛宮（地倉）", "子女宮"],
    source: "283 頁筆記 p.193–240 地閣段"
  },
  {
    id: "T_CHIN_NARROW",
    feature: "chin",
    when: { relativeWidth: ["narrow"] },
    memberText:
      "教材說地閣骨內縮、下巴尖削狹窄這一段，對應晚年要更早自己安排，與子女晚輩容易有距離或代溝，個性上也偏固執。教材同時說地閣骨內收但微朝者，財務的支配力仍在。",
    teacherText: "教材：地閣骨內縮，孤獨相；子女遠離他鄉；孝順度不夠；子女社會競爭力弱；地閣骨窄晚年好很難，自求多福。下巴尖削狹窄，固執。地閣骨內收但是骨微朝，財務支配力不錯。",
    healthSensitive: false,
    themes: ["財運", "家庭"],
    palaces: ["財帛宮（地倉）", "子女宮"],
    source: "283 頁筆記 p.193–240 地閣段"
  },
  {
    id: "T_CHIN_ANGULAR",
    feature: "chin",
    when: { contour: ["angular"] },
    memberText:
      "教材說下巴尖削這一段，對應與周邊鄰里、同住者的摩擦要多留意，處理方式建議走書面與明確界線。對應流年 61 歲承漿與 71 歲地閣兩個關卡。",
    teacherText: "教材：下巴受傷尖削，本身是他人的惡鄰居、也會碰到惡鄰居。下巴尖削狹窄，固執。",
    healthSensitive: false,
    themes: ["家庭"],
    palaces: ["財帛宮（地倉）"],
    source: "283 頁筆記 p.193–240 地閣段"
  },
  {
    id: "T_JAW_WIDE",
    feature: "jaw",
    when: { relativeWidth: ["wide"] },
    memberText:
      "下顎腮骨是奴僕宮的主看部位，教材以骨相開闊為部屬與晚輩的承載條件。這一段對應流年 58 歲之後的下停區段，與團隊、託付安排有關。",
    teacherText: "教材：奴僕宮看下停鼻准以下、下顎腮骨，輔看法令、地閣、口。虎耳 58、59；奴僕 72、73；腮 74、75。",
    healthSensitive: false,
    themes: ["事業", "家庭"],
    palaces: ["奴僕宮"],
    source: "283 頁筆記 p.90–91"
  },
  {
    id: "T_JAW_ASYMMETRIC",
    feature: "jaw",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說地閣骨左右不齊（違章建築）這一段，對應與子女、部屬容易有意見不合與代溝。建議把長期的交辦與家庭安排改成定期對齊，不靠臨時溝通。",
    teacherText: "教材：地閣骨違章建築，會跟小孩意見不合，親情代溝；跟部署不合。",
    healthSensitive: false,
    themes: ["家庭", "事業"],
    palaces: ["奴僕宮", "子女宮"],
    source: "283 頁筆記 p.193–240 地閣段"
  },

  // ── 耳（幼年段）────────────────────────────────────────────────
  {
    id: "T_EARS_BALANCED",
    feature: "ears",
    when: { symmetry: ["balanced"] },
    memberText:
      "教材以耳正（子午垂直）、耳貼、城廓分明為標準相理，對應聽得進意見、思維較正向。耳對應流年 1 至 14 歲的幼年段，通常回看成長環境，不作為當前結論。",
    teacherText: "教材：耳朵相理，耳正、耳貼、耳厚、耳長、耳大、耳城廓分明、氣色白迎面。耳正（子午垂直），聽聞、個性緩和正面、思維正向。大老闆耳正貼者多。",
    healthSensitive: false,
    themes: ["家庭"],
    palaces: ["父母宮"],
    source: "283 頁筆記 p.13"
  },
  {
    id: "T_EARS_ASYMMETRIC",
    feature: "ears",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說耳形左右差異明顯這一段，對應幼年階段兩邊家庭資源的落差。教材也提到反耳骨對應較不受教、容易產生盲點，建議在重大決定前刻意找反對意見。",
    teacherText: "教材：耳朵反耳骨，不正，個性叛逆，不受教，容易產生盲點。（耳骿與臟腑對應整段列 CRITICAL。）",
    healthSensitive: false,
    themes: ["家庭"],
    palaces: ["父母宮"],
    source: "283 頁筆記 p.13"
  },

  // ── 奸門（夫妻宮）／淚堂（子女宮）────────────────────────────────
  {
    id: "T_OUTEREYE_FULL",
    feature: "outerEyeCorners",
    when: { contour: ["rounded", "straight"], symmetry: ["balanced"] },
    memberText:
      "奸門是夫妻宮的主看部位，教材以豐盈平整為傳統正向條件，但強調不能單看奸門，必須同時交叉眉、眼、鼻、印堂這個十字帶，也不能由一張照片斷定婚姻結果。",
    teacherText: "教材：夫妻宮以眼尾奸門為主，不能單看奸門；須同時交叉眉、眼、鼻、印堂十字帶。奸門豐盈平整為傳統正向條件。",
    healthSensitive: false,
    themes: ["感情"],
    palaces: ["夫妻宮"],
    source: "十二宮講義 p.10–13"
  },
  {
    id: "T_OUTEREYE_ASYMMETRIC",
    feature: "outerEyeCorners",
    when: { symmetry: ["asymmetric"] },
    memberText:
      "教材說奸門左右不齊這一段，作為「感情上的相處節奏兩邊不一致」的提醒，建議用實際的溝通紀錄核對，不能由此判定關係好壞。夫妻宮必須交叉眉、眼、鼻、印堂十字帶一起看。",
    teacherText: "教材：夫妻宮奸門為主，交叉十字帶。奸門有紋痕主感情波折（定論條目列 CRITICAL，不入會員報告）。",
    healthSensitive: false,
    themes: ["感情"],
    palaces: ["夫妻宮"],
    source: "十二宮講義 p.10–13"
  },
  {
    id: "T_TEARTROUGH_FULL",
    feature: "tearTroughs",
    when: { contour: ["rounded"], symmetry: ["balanced"] },
    memberText:
      "淚堂是子女宮的主看部位，教材把這一區視為與子女、晚輩相處的觀察點，飽滿平整對應能付出的心力較足。教材要求交叉人中與地閣一起看，不由單一部位推定子女的命運。",
    teacherText: "教材：子女宮看淚堂，交叉人中、地閣。（生育相關條目列 CRITICAL，不入會員報告。）",
    healthSensitive: false,
    themes: ["家庭"],
    palaces: ["子女宮"],
    source: "283 頁筆記 p.86–90"
  }
];

export type MatchedTeaching = Readonly<{
  id: string;
  feature: FaceFeatureName;
  featureLabel: string;
  /** 命中的形態描述，供報告寫「因為看到什麼才這樣說」。 */
  observedMorphology: string;
  text: string;
  themes: readonly TeachingTheme[];
  palaces: readonly string[];
  source: string;
  confidence: number;
}>;

function matchesCondition(value: RegionValue, when: Enum4): boolean {
  if (when.contour && !when.contour.includes(value.contour)) return false;
  if (when.relativeWidth && !when.relativeWidth.includes(value.relativeWidth)) return false;
  if (when.relativeHeight && !when.relativeHeight.includes(value.relativeHeight)) return false;
  if (when.symmetry && !when.symmetry.includes(value.symmetry)) return false;
  return true;
}

/**
 * 比對本張照片命中哪些教材條文。
 * 只比對「可判讀」的部位；看不清楚的部位不套教材，避免用光線或模糊推論。
 *
 * @param audience "member" 會剝除 healthSensitive 條目的教材原文，只給部位與核對提醒；
 *                 "teacher" 保留原文，僅供老師版與內部稽核。
 */
export function matchTeachings(
  vision: FaceVisionResult,
  audience: "member" | "teacher" = "member",
  rules: readonly Teaching[] = BUILT_IN_TEACHINGS
): MatchedTeaching[] {
  const matched: MatchedTeaching[] = [];
  for (const teaching of rules) {
    const value = featureValue(vision, teaching.feature);
    if (!isReadable(value)) continue;
    if (!matchesCondition(value, teaching.when)) continue;
    matched.push({
      id: teaching.id,
      feature: teaching.feature,
      featureLabel: FEATURE_LABELS[teaching.feature],
      observedMorphology: describeMorphology(value),
      text: audience === "teacher" ? teaching.teacherText : teaching.memberText,
      themes: teaching.themes,
      palaces: teaching.palaces,
      source: teaching.source,
      confidence: value.confidence
    });
  }
  return matched;
}

/** 依五大面向分組命中的教材條文，供 lifeAreas 撰稿引用。 */
export function groupTeachingsByTheme(matched: readonly MatchedTeaching[]) {
  const themes: TeachingTheme[] = ["感情", "事業", "健康", "財運", "家庭"];
  return Object.fromEntries(
    themes.map((theme) => [theme, matched.filter((item) => item.themes.includes(theme))])
  ) as Record<TeachingTheme, MatchedTeaching[]>;
}

export const TEACHING_COUNT = BUILT_IN_TEACHINGS.length;
