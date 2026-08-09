// 會員相關通知信（目前：註冊成功歡迎信）。
// 走 Resend HTTP API，與 order-emails.ts 同一套寄件設定。
// 需 production 設 RESEND_API_KEY；未設則回 skipped、不阻斷註冊流程。
// 寄件者預設「巽風系統 <noreply@xunfeng.tw>」，需 Resend 驗證 xunfeng.tw 網域。

const DEFAULT_FROM = "巽風系統 <noreply@xunfeng.tw>";

interface RegistrationEmailInput {
  email: string;
  name?: string | null;
  trialCredits?: number;
  trialDays?: number;
  siteUrl?: string;
}

export async function sendRegistrationEmail(input: RegistrationEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  if (!apiKey) return { ok: false, skipped: true, reason: "missing_resend_api_key" };
  if (!input.email) return { ok: false, skipped: true, reason: "missing_recipient" };

  const siteUrl = (input.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://www.xunfeng.tw").replace(/\/$/, "");
  const greetName = input.name ? `${input.name} 您好，` : "您好，";
  const trialBlock =
    input.trialCredits && input.trialDays
      ? [
          "【註冊好禮】",
          `我們已為您預存 ${input.trialCredits} 點免費體驗點數（效期 ${input.trialDays} 天），可立即用於：`,
          "・四象問天機：每份 20 點，生成《巽風四象天機書》",
          "・AI 會員諮詢：與系統對話，依 AI 回覆字數計點（每 1000 字 1 點）",
          ""
        ]
      : [];

  const lines = [
    greetName,
    "",
    "感謝您註冊成為巽風系統會員，您的帳號已開通完成。",
    "",
    "【您的帳號】",
    input.email,
    "",
    ...trialBlock,
    "【立即開始】",
    `登入會員中心查看點數與服務：${siteUrl}/login`,
    "",
    "期待能為您的人生與事業決策，提供一份來自易學的清晰參照。",
    "",
    "巽風堪輿研究中心　風羿",
    siteUrl
  ];

  try {
    await sendResendEmail({
      apiKey,
      from,
      to: [input.email],
      subject: "歡迎加入巽風系統｜會員註冊成功",
      text: lines.join("\n")
    });
    return { ok: true, skipped: false };
  } catch (error) {
    console.warn("[member-emails] registration email failed", { email: input.email, error });
    return { ok: false, skipped: false, reason: "send_failed" };
  }
}

async function sendResendEmail(input: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend failed ${response.status}: ${body.slice(0, 300)}`);
  }
}
