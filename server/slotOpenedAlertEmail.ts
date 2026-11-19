export type SlotOpenedAlertEmailInput = { to: string; companyDomain: string; requestsUrl: string };
import { slotOpenedReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";

export type SlotOpenedAlertEmailDependencies = { fetchImpl?: typeof fetch };

export function createSlotOpenedAlertEmailSender(dependencies: SlotOpenedAlertEmailDependencies = {}) {
  const sendTransactionalEmail = createTransactionalEmailSender(dependencies);
  return async ({ to, companyDomain, requestsUrl }: SlotOpenedAlertEmailInput) => {
    const message = slotOpenedReengagementMessage(companyDomain);
    const text = [message.headline, message.body, "", `View your private request: ${requestsUrl}`].join("\n");
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,'Helvetica Neue',sans-serif;color:#131311"><section style="border:1px solid #f0b4a8;border-radius:3px;padding:24px"><p style="margin:0;color:#c2351f;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE UPDATE</p><h1 style="margin:14px 0 0;font-size:24px">${message.headline}</h1><p style="margin:14px 0 0;color:#5f5f58;line-height:1.5">${message.body}</p><a href="${requestsUrl}" style="display:block;margin-top:22px;border-radius:2px;background:#131311;padding:14px;color:#f4f4f1;text-align:center;font-weight:700;text-decoration:none">View private request</a></section></main>`;
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendSlotOpenedAlertEmail = createSlotOpenedAlertEmailSender();
