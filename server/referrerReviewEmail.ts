import { referrerReviewReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";
import { renderBrandedEmailHtml, renderSecondaryActions } from "./emailTemplate";

type ReferrerReviewEmailInput = {
  to: string;
  companyDomain: string;
  reviewUrl: string;
};

export type ReferrerReviewEmailDependencies = { fetchImpl?: typeof fetch };

export function createReferrerReviewEmailSender(dependencies: ReferrerReviewEmailDependencies = {}) {
  const sendTransactionalEmail = createTransactionalEmailSender(dependencies);
  return async ({ to, companyDomain, reviewUrl }: ReferrerReviewEmailInput) => {
    const message = referrerReviewReengagementMessage(companyDomain);
    const acceptUrl = `${reviewUrl}?decision=approved`;
    const notFitUrl = `${reviewUrl}?decision=declined&reason=role_not_a_fit`;
    const unavailableUrl = `${reviewUrl}?decision=declined&reason=cannot_support`;
    const timingUrl = `${reviewUrl}?decision=declined&reason=timing`;
    const text = [
      message.headline,
      message.body,
      "Open the private review only when you are ready.",
      "",
      `Accept & submit referral: ${acceptUrl}`,
      `Decline — role is not a fit: ${notFitUrl}`,
      `Decline — cannot support now: ${unavailableUrl}`,
      `Decline — timing: ${timingUrl}`,
    ].join("\n");
    const html = renderBrandedEmailHtml({
      eyebrow: "SKIPWAIT.ME · PRIVATE REFERRAL",
      headline: message.headline,
      body: message.body,
      primaryAction: { label: "Accept &amp; submit referral", url: acceptUrl },
      extra: renderSecondaryActions([
        { label: "Not a fit", url: notFitUrl },
        { label: "Can’t support", url: unavailableUrl },
        { label: "Not now", url: timingUrl },
      ]),
    });
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendReferrerReviewEmail = createReferrerReviewEmailSender();
