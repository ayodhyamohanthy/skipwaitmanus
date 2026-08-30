export type TransactionalEmailInput = { to: string; subject: string; html?: string; text: string };

export type TransactionalEmailResult = { sent: boolean; reason: "sent" | "not_configured" | "delivery_failed" };

export type EmailDeliveryDependencies = { fetchImpl?: typeof fetch };

const EMAIL_TIMEOUT_MS = 10_000;

/**
 * ZeptoMail transactional delivery (Zoho). Uses the v1.1 email endpoint with
 * the Zoho-enczapikey authorization scheme. Activated by ZEPTOMAIL_API_KEY.
 */
export function createZeptoMailSender(dependencies: EmailDeliveryDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, subject, html, text }: TransactionalEmailInput): Promise<TransactionalEmailResult> => {
    const apiKey = process.env.ZEPTOMAIL_API_KEY;
    const from = process.env.ZEPTOMAIL_FROM_EMAIL || process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !from) return { sent: false, reason: "not_configured" };
    try {
      const response = await fetchImpl("https://api.zeptomail.com/v1.1/email", {
        method: "POST",
        headers: { Authorization: `Zoho-enczapikey ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: { address: from },
          to: [{ email_address: { address: to } }],
          subject,
          ...(html ? { htmlbody: html } : {}),
          textbody: text,
        }),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true, reason: "sent" };
    } catch { return { sent: false, reason: "delivery_failed" }; }
  };
}

/**
 * Legacy Resend delivery. Kept as an automatic fallback so an existing
 * deployment keeps delivering while ZeptoMail keys are being rotated in.
 */
export function createResendSender(dependencies: EmailDeliveryDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, subject, html, text }: TransactionalEmailInput): Promise<TransactionalEmailResult> => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !from) return { sent: false, reason: "not_configured" };
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, ...(html ? { html } : {}), text }),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true, reason: "sent" };
    } catch { return { sent: false, reason: "delivery_failed" }; }
  };
}

/**
 * Transactional sender used by every skipwait.me email path: ZeptoMail first
 * when configured, otherwise the legacy Resend path, otherwise not configured.
 * Delivery failures are returned, never thrown, so email stays failure-isolated.
 */
export function createTransactionalEmailSender(dependencies: EmailDeliveryDependencies = {}) {
  const zepto = createZeptoMailSender(dependencies);
  const resend = createResendSender(dependencies);
  return async (input: TransactionalEmailInput): Promise<TransactionalEmailResult> => {
    const primary = await zepto(input);
    if (primary.sent) return primary;
    if (primary.reason === "not_configured") return resend(input);
    return primary;
  };
}

export const sendTransactionalEmail = createTransactionalEmailSender();
