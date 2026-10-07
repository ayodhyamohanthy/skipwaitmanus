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
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,'Helvetica Neue',sans-serif;color:#131311"><section style="border:1px solid #f0b4a8;border-radius:3px;padding:24px"><p style="margin:0;color:#c2351f;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 style="margin:14px 0 0;font-size:24px">${message.headline}</h1><p style="margin:14px 0 0;color:#5f5f58;line-height:1.5">${message.body}</p><p style="margin:14px 0 0;color:#5f5f58;line-height:1.5">Opening this link never records a decision. Review and confirm on Skipwait.</p><a href="${reviewUrl}" style="display:block;margin-top:22px;border-radius:2px;background:#131311;padding:14px;color:#f4f4f1;text-align:center;font-weight:700;text-decoration:none">Open private review</a></section></main>`;
    return sendTransactionalEmail({ to, subject: message.subject, text, html });
  };
}

export const sendReferrerReviewEmail = createReferrerReviewEmailSender();
