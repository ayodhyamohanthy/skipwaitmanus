export type SlotOpenedAlertEmailInput = { to: string; companyDomain: string; requestsUrl: string };
import { slotOpenedReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";
import { renderBrandedEmailHtml } from "./emailTemplate";

export type SlotOpenedAlertEmailDependencies = { fetchImpl?: typeof fetch };

export function createSlotOpenedAlertEmailSender(dependencies: SlotOpenedAlertEmailDependencies = {}) {
  const sendTransactionalEmail = createTransactionalEmailSender(dependencies);
  return async ({ to, companyDomain, requestsUrl }: SlotOpenedAlertEmailInput) => {
    const message = slotOpenedReengagementMessage(companyDomain);
    const text = [message.headline, message.body, "", `View your private request: ${requestsUrl}`].join("\n");
    const html = renderBrandedEmailHtml({
      eyebrow: "SKIPWAIT.ME · PRIVATE UPDATE",
      headline: message.headline,
      body: message.body,
      primaryAction: { label: "View private request", url: requestsUrl },
    });
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendSlotOpenedAlertEmail = createSlotOpenedAlertEmailSender();
