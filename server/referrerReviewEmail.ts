import { referrerReviewReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";
import { escapeHtml, safeEmailHref } from "./htmlEscape";

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
    // Every href is escaped and scheme-restricted before it reaches the HTML below.
    const acceptHref = safeEmailHref(acceptUrl);
    const notFitHref = safeEmailHref(notFitUrl);
    const unavailableHref = safeEmailHref(unavailableUrl);
    const timingHref = safeEmailHref(timingUrl);
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
    // Brand colours are inlined because email clients do not load external CSS.
    // Web fonts are unreliable in email, so the display face falls back to a
    // serif stack that echoes Fraunces rather than claiming to be it.
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1a1611;background:#faf7f2"><section style="border:1px solid #e9dfd2;border-radius:18px;padding:24px;background:#ffffff"><p style="margin:0;color:#457a3f;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#1a1611">${escapeHtml(message.headline)}</h1><p style="margin:14px 0 0;color:#4a3f35;line-height:1.5">${escapeHtml(message.body)}</p><a href="${acceptHref}" style="display:block;margin-top:22px;border-radius:9px;background:#457a3f;padding:14px;color:#ffffff;text-align:center;font-weight:700;text-decoration:none">Accept &amp; submit referral</a><p style="margin:20px 0 8px;color:#4a3f35;font-size:13px;font-weight:700">Or decline with one reason</p><div><a href="${notFitHref}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #e9dfd2;border-radius:8px;padding:10px 12px;color:#4a3f35;font-size:13px;font-weight:700;text-decoration:none">Not a fit</a><a href="${unavailableHref}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #e9dfd2;border-radius:8px;padding:10px 12px;color:#4a3f35;font-size:13px;font-weight:700;text-decoration:none">Can’t support</a><a href="${timingHref}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #e9dfd2;border-radius:8px;padding:10px 12px;color:#4a3f35;font-size:13px;font-weight:700;text-decoration:none">Not now</a></div></section></main>`;
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendReferrerReviewEmail = createReferrerReviewEmailSender();
