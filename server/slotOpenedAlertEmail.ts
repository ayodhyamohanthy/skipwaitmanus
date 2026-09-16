export type SlotOpenedAlertEmailInput = { to: string; companyDomain: string; requestsUrl: string };
import { slotOpenedReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";
import { escapeHtml, safeEmailHref } from "./htmlEscape";

export type SlotOpenedAlertEmailDependencies = { fetchImpl?: typeof fetch };

export function createSlotOpenedAlertEmailSender(dependencies: SlotOpenedAlertEmailDependencies = {}) {
  const sendTransactionalEmail = createTransactionalEmailSender(dependencies);
  return async ({ to, companyDomain, requestsUrl }: SlotOpenedAlertEmailInput) => {
    const message = slotOpenedReengagementMessage(companyDomain);
    const text = [message.headline, message.body, "", `View your private request: ${requestsUrl}`].join("\n");
    // Escaped and scheme-restricted; see htmlEscape.ts. Brand colours are inlined
    // because email clients do not load external CSS.
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1a1611;background:#faf7f2"><section style="border:1px solid #e9dfd2;border-radius:18px;padding:24px;background:#ffffff"><p style="margin:0;color:#457a3f;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE UPDATE</p><h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1a1611">${escapeHtml(message.headline)}</h1><p style="margin:14px 0 0;color:#4a3f35;line-height:1.5">${escapeHtml(message.body)}</p><a href="${safeEmailHref(requestsUrl)}" style="display:block;margin-top:22px;border-radius:9px;background:#457a3f;padding:14px;color:#ffffff;text-align:center;font-weight:700;text-decoration:none">View private request</a></section></main>`;
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendSlotOpenedAlertEmail = createSlotOpenedAlertEmailSender();
