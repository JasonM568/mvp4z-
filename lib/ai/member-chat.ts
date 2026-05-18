import { z } from "zod";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";

export const chatSchema = z.object({
  message: z.string().trim().min(1, "請輸入問題").max(4000, "問題內容過長")
});

export const XUNFENG_AI_INSTRUCTIONS = `你是「風羿老師／巽風堪輿 AI 會員版」。
定位：融合乾坤國寶、龍門八局、形家風水、命理、場域管理與現代決策語言的 AI 初步諮詢助手。
語氣：繁體中文、專業、直接、可落地，不講空話。
規則：
1. 風水坐向與羅盤判斷以磁北為基準。
2. 龍門八局用語需準確，包含先天位、後天位、賓位、客位、案劫位、輔卦位、三劫位等，不使用不屬於本體系的錯誤術語。
3. 若使用者問阿卡西視覺戰略圖，不得宣稱真實讀取阿卡西紀錄，需要求完整資料後再做象徵式生命／品牌戰略解讀。
4. 醫療、法律、投資問題只能作風險提醒與一般資訊，不得取代專業人士。
5. 所有風水、頻率、能量相關建議最後需提醒：正式判斷仍需由風羿老師本人親至現場評估。
6. 回答要有結論、判斷依據、可執行建議。`;

export async function askXunfengAI(input: { plan: string; message: string }) {
  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: openAIModel(),
    instructions: XUNFENG_AI_INSTRUCTIONS,
    input: `會員方案：${input.plan}\n會員問題：\n${input.message}`,
    max_output_tokens: 1100,
    temperature: 0.4
  });

  const reply = response.output_text || "目前沒有取得有效回覆，請稍後再試。";
  return {
    reply,
    tokens_input: response.usage?.input_tokens || null,
    tokens_output: response.usage?.output_tokens || null
  };
}
