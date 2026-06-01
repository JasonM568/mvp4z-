import { z } from "zod";
import { createOpenAIClient, openAIModel } from "@/lib/ai/openai";
import { XUNFENG_PERSONA_CHAT } from "@/lib/ai/brand";

// 帶上下文的對話最多回溯這麼多則（約 6 輪），控制 token 與成本
const MAX_HISTORY_MESSAGES = 12;

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000)
});

export const chatSchema = z.object({
  message: z.string().trim().min(1, "請輸入問題").max(4000, "問題內容過長"),
  // 前端帶上來的對話歷史（不含本則）。允許多帶一點，後端再裁切。
  history: z.array(historyMessageSchema).max(40).optional()
});

export const XUNFENG_AI_INSTRUCTIONS = XUNFENG_PERSONA_CHAT;

// 計費：以 AI 回覆的「中文字數」每 1000 字扣 1 點，至少 1 點（1～1000 字＝1 點）。
export function countChineseChars(text: string): number {
  // CJK 統一表意文字（U+4E00–U+9FFF）+ 擴充 A（U+3400–U+4DBF）
  const matches = String(text || "").match(/[一-鿿㐀-䶿]/g);
  return matches ? matches.length : 0;
}

export function chatCreditCost(replyText: string): number {
  return Math.max(1, Math.ceil(countChineseChars(replyText) / 1000));
}

type HistoryMessage = z.infer<typeof historyMessageSchema>;

export async function askXunfengAI(input: {
  plan: string;
  message: string;
  history?: HistoryMessage[];
}) {
  const client = createOpenAIClient();

  // 只保留最近 MAX_HISTORY_MESSAGES 則，再接上本則使用者問題
  const history = (input.history || []).slice(-MAX_HISTORY_MESSAGES);
  const conversation = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.message }
  ];

  const response = await client.responses.create({
    model: openAIModel(),
    instructions: `${XUNFENG_AI_INSTRUCTIONS}\n\n會員方案：${input.plan}`,
    input: conversation,
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
