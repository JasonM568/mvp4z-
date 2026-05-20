import { z } from "zod";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";
import { XUNFENG_PERSONA_CHAT } from "@/lib/ai/brand";

export const chatSchema = z.object({
  message: z.string().trim().min(1, "請輸入問題").max(4000, "問題內容過長")
});

export const XUNFENG_AI_INSTRUCTIONS = XUNFENG_PERSONA_CHAT;

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
