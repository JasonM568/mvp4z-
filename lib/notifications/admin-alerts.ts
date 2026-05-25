interface AdminAlertInput {
  subject: string;
  text: string;
}

export async function sendAdminAlert(input: AdminAlertInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = parseRecipients(process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_EMAILS || "");

  if (!apiKey || recipients.length === 0) {
    return { ok: false, skipped: true, reason: "missing_resend_config" };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Xunfeng System <alerts@xunfeng.app>";

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
      return { ok: false, skipped: false, reason: "resend_failed" };
    }

    return { ok: true, skipped: false };
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
