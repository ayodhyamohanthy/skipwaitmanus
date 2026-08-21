export type VerifiedReengagementMessage = {
  companyDomain: string;
  subject: string;
  headline: string;
  body: string;
};

function safeCompanyDomain(companyDomain: string): string {
  return companyDomain.replace(/[^a-z0-9.-]/gi, "").slice(0, 255);
}

export function slotOpenedReengagementMessage(companyDomain: string): VerifiedReengagementMessage {
  const company = safeCompanyDomain(companyDomain);
  return {
    companyDomain: company,
    subject: `Private referral review available at ${company}`,
    headline: `A referral review is now available at ${company}`,
    body: "A verified employee opened review capacity for your private request. This does not guarantee an introduction, interview, or hiring outcome.",
  };
}

export function referrerReviewReengagementMessage(companyDomain: string): VerifiedReengagementMessage {
  const company = safeCompanyDomain(companyDomain);
  return {
    companyDomain: company,
    subject: `Private referral review at ${company}`,
    headline: `A private review is ready at ${company}`,
    body: "Reviewing is optional and always free. Sign in with your verified company email before any decision is recorded.",
  };
}
