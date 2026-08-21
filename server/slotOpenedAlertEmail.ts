export type SlotOpenedAlertEmailInput = { to: string; companyDomain: string; requestsUrl: string };
import { slotOpenedReengagementMessage } from "./reengagementMessaging";

export type SlotOpenedAlertEmailDependencies = { fetchImpl?: typeof fetch };

export function createSlotOpenedAlertEmailSender(dependencies: SlotOpenedAlertEmailDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, companyDomain, requestsUrl }: SlotOpenedAlertEmailInput) => {
    const apiKey = process.env.RESEND_API_KEY; const sender = process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !sender) return { sent: false as const, reason: "not_configured" as const };
    const message = slotOpenedReengagementMessage(companyDomain);
    const text = [message.headline, message.body, "", `View your private request: ${requestsUrl}`].join("\n");
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><section style="border:1px solid #dbeafe;border-radius:18px;padding:24px"><p style="margin:0;color:#0B57D0;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE UPDATE</p><h1 style="margin:14px 0 0;font-size:24px">${message.headline}</h1><p style="margin:14px 0 0;color:#475569;line-height:1.5">${message.body}</p><a href="${requestsUrl}" style="display:block;margin-top:22px;border-radius:9px;background:#0B57D0;padding:14px;color:#fff;text-align:center;font-weight:700;text-decoration:none">View private request</a></section></main>`;
    try {
      const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: sender, to: [to], subject: message.subject, text, html }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true as const, reason: "sent" as const };
    } catch { return { sent: false as const, reason: "delivery_failed" as const }; }
  };
}

export const sendSlotOpenedAlertEmail = createSlotOpenedAlertEmailSender();
