interface OrderPaidEmailInput {
  orderNo: string;
  orderType: "membership" | "course";
  itemName: string;
  amount: number;
  currency: string;
  paidAt: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  adminExtra?: string[];
}

export async function sendOrderPaidEmails(input: OrderPaidEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "Xunfeng System <alerts@xunfeng.app>";
  const admins = parseRecipients(process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_EMAILS || "");

  if (!apiKey) return { ok: false, skipped: true, reason: "missing_resend_api_key" };

  const typeLabel = input.orderType === "course" ? "課程報名" : "會員方案";
  const amount = `${input.currency || "TWD"} ${Number(input.amount).toLocaleString("zh-TW")}`;
  const paidAt = new Date(input.paidAt).toLocaleString("zh-TW");
  const customerLines = [
    "您好，您的付款已完成。",
    "",
    `訂單編號：${input.orderNo}`,
    `訂單類型：${typeLabel}`,
    `項目：${input.itemName}`,
    `金額：${amount}`,
    `付款時間：${paidAt}`,
    "",
    input.orderType === "course"
      ? "我們已收到您的課程報名與付款資料，後續將依報名資訊聯繫您。"
      : "您的會員方案已完成開通，您可以回到會員中心確認方案與點數。"
  ];

  const adminLines = [
    "後台有新的已付款訂單。",
    "",
    `訂單編號：${input.orderNo}`,
    `訂單類型：${typeLabel}`,
    `項目：${input.itemName}`,
    `金額：${amount}`,
    `付款時間：${paidAt}`,
    `姓名：${input.customerName || ""}`,
    `Email：${input.customerEmail || ""}`,
    `電話：${input.customerPhone || ""}`,
    ...(input.adminExtra || [])
  ];

  const jobs: Promise<unknown>[] = [];
  if (input.customerEmail) {
    jobs.push(sendResendEmail({
      apiKey,
      from,
      to: [input.customerEmail],
      subject: `[巽風] 付款完成通知：${input.orderNo}`,
      text: customerLines.join("\n")
    }));
  }
  if (admins.length > 0) {
    jobs.push(sendResendEmail({
      apiKey,
      from,
      to: admins,
      subject: `[巽風] 新付款訂單：${input.orderNo}`,
      text: adminLines.join("\n")
    }));
  }

  if (jobs.length === 0) return { ok: false, skipped: true, reason: "missing_recipients" };
  const results = await Promise.allSettled(jobs);
  const rejected = results.filter((r) => r.status === "rejected");
  return { ok: rejected.length === 0, skipped: false, failed: rejected.length };
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

function parseRecipients(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
