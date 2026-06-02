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
  const trialLine =
    input.trialCredits && input.trialDays
      ? `我們已贈送您 ${input.trialCredits} 點免費體驗點數（效期 ${input.trialDays} 天），可用於易學決策報告與 AI 會員諮詢。`
      : "";

  const lines = [
    greetName,
    "",
    "歡迎加入巽風系統，您的會員帳號已註冊成功。",
    "",
    `帳號：${input.email}`,
    ...(trialLine ? ["", trialLine] : []),
    "",
    `您可以隨時登入會員中心：${siteUrl}/login`,
    "",
    "— 巽風堪輿研究中心"
  ];

  try {
    await sendResendEmail({
      apiKey,
      from,
      to: [input.email],
      subject: "[巽風系統] 會員註冊成功通知",
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
