export type ReferrerReviewEmailInput = {
  to: string;
  companyDomain: string;
  reviewUrl: string;
};

export type ReferrerReviewEmailDependencies = { fetchImpl?: typeof fetch };

export function createReferrerReviewEmailSender(dependencies: ReferrerReviewEmailDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, companyDomain, reviewUrl }: ReferrerReviewEmailInput) => {
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !sender) return { sent: false as const, reason: "not_configured" as const };
    const safeCompanyDomain = companyDomain.replace(/[^a-z0-9.-]/gi, "").slice(0, 255);
    const acceptUrl = `${reviewUrl}?decision=approved`;
    const notFitUrl = `${reviewUrl}?decision=declined&reason=role_not_a_fit`;
    const unavailableUrl = `${reviewUrl}?decision=declined&reason=cannot_support`;
    const timingUrl = `${reviewUrl}?decision=declined&reason=timing`;
    const subject = `Private referral review at ${safeCompanyDomain}`;
    const text = [
      `A private referral request is ready at ${safeCompanyDomain}.`,
      "Reviewing is optional and always free. Sign in with your verified company email before any decision is recorded.",
      "Open the private review only when you are ready.",
      "",
      `Accept & submit referral: ${acceptUrl}`,
      `Decline — role is not a fit: ${notFitUrl}`,
      `Decline — cannot support now: ${unavailableUrl}`,
      `Decline — timing: ${timingUrl}`,
    ].join("\n");
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><section style="border:1px solid #dbeafe;border-radius:18px;padding:24px"><p style="margin:0;color:#0B57D0;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE REFERRAL</p><h1 style="margin:14px 0 0;font-size:24px">A private review is ready at ${safeCompanyDomain}</h1><p style="margin:14px 0 0;color:#475569;line-height:1.5">Reviewing is optional and always free. Sign in with your verified company email before any decision is recorded.</p><a href="${acceptUrl}" style="display:block;margin-top:22px;border-radius:9px;background:#0B57D0;padding:14px;color:#fff;text-align:center;font-weight:700;text-decoration:none">Accept &amp; submit referral</a><p style="margin:20px 0 8px;color:#475569;font-size:13px;font-weight:700">Or decline with one reason</p><div><a href="${notFitUrl}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;color:#334155;font-size:13px;font-weight:700;text-decoration:none">Not a fit</a><a href="${unavailableUrl}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;color:#334155;font-size:13px;font-weight:700;text-decoration:none">Can’t support</a><a href="${timingUrl}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;color:#334155;font-size:13px;font-weight:700;text-decoration:none">Not now</a></div></section></main>`;
    try {
      const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: sender, to: [to], subject, text, html }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true as const, reason: "sent" as const };
    } catch { return { sent: false as const, reason: "delivery_failed" as const }; }
  };
}

export const sendReferrerReviewEmail = createReferrerReviewEmailSender();
