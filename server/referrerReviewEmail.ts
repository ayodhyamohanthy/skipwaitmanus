import { referrerReviewReengagementMessage } from "./reengagementMessaging";
import { createTransactionalEmailSender } from "./emailDelivery";

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
    const text = [message.headline,message.body,"Open the private review page to inspect and confirm a decision. Opening this link never records a decision.","",`Review privately: ${reviewUrl}`].join("\n");
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><section style="border:1px solid #dbeafe;border-radius:18px;padding:24px"><p style="margin:0;color:#0B57D0;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 style="margin:14px 0 0;font-size:24px">${message.headline}</h1><p style="margin:14px 0 0;color:#475569;line-height:1.5">${message.body}</p><p style="margin:14px 0 0;color:#475569;line-height:1.5">Opening this link never records a decision. Review and confirm on Skipwait.</p><a href="${reviewUrl}" style="display:block;margin-top:22px;border-radius:9px;background:#0B57D0;padding:14px;color:#fff;text-align:center;font-weight:700;text-decoration:none">Open private review</a></section></main>`;
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendReferrerReviewEmail = createReferrerReviewEmailSender();
