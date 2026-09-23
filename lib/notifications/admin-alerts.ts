interface AdminAlertInput {
  subject: string;
  text: string;
  /**
   * 收件人覆寫。不傳就寄給全體管理員（ADMIN_ALERT_EMAILS ?? ADMIN_EMAILS）。
   *
   * 存在的理由是「測試告警」：拿測試信去吵每一位管理員很沒禮貌，
   * 按下去的人收到就夠了。真正的告警仍然寄給全體。
   */
  to?: string[];
}

export async function sendAdminAlert(input: AdminAlertInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = input.to?.length
    ? input.to
    : parseRecipients(process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_EMAILS || "");

  if (!apiKey || recipients.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_resend_config",
      // 講清楚缺的是哪一個，否則設好了 key 卻沒收到信時只能瞎猜。
      detail: !apiKey ? "RESEND_API_KEY 未設定" : "沒有任何收件人（ADMIN_EMAILS 未設定）"
    };
  }

  const from = process.env.RESEND_FROM_EMAIL || "巽風系統 <noreply@xunfeng.tw>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: input.subject,
        text: input.text
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("[admin-alert] resend failed", {
        status: response.status,
        body: body.slice(0, 500)
      });
      // 把上游的實際回應帶出去。最常見的失敗是寄件網域還沒在 Resend 驗證，
      // 只回一句 "resend_failed" 會讓人以為是 key 錯，然後往錯的方向查。
      return {
        ok: false,
        skipped: false,
        reason: "resend_failed",
        status: response.status,
        detail: body.slice(0, 300),
        from
      };
    }

    return { ok: true, skipped: false, recipients: recipients.length, from };
  } catch (error) {
    console.warn("[admin-alert] resend threw", {
      error: error instanceof Error ? error.message : String(error)
    });
    return { ok: false, skipped: false, reason: "resend_threw" };
  }
}

function parseRecipients(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
