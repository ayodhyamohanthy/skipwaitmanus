export type SlotOpenedAlertEmailInput = { to: string; companyDomain: string; requestsUrl: string };
export type SlotOpenedAlertEmailDependencies = { fetchImpl?: typeof fetch };

export function createSlotOpenedAlertEmailSender(dependencies: SlotOpenedAlertEmailDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, companyDomain, requestsUrl }: SlotOpenedAlertEmailInput) => {
    const apiKey = process.env.RESEND_API_KEY; const sender = process.env.ERROR_ALERT_FROM_EMAIL;
    if (!apiKey || !sender) return { sent: false as const, reason: "not_configured" as const };
    const safeCompanyDomain = companyDomain.replace(/[^a-z0-9.-]/gi, "").slice(0, 255);
    const subject = `A private referral review opened at ${safeCompanyDomain}`;
    const text = [`A verified employee at ${safeCompanyDomain} can now review your private referral request.`, "This does not guarantee an introduction, interview, or hiring outcome.", "", `View your private request: ${requestsUrl}`].join("\n");
    const html = `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><section style="border:1px solid #dbeafe;border-radius:18px;padding:24px"><p style="margin:0;color:#0B57D0;font-size:12px;font-weight:700;letter-spacing:.12em">SKIPWAIT.ME · PRIVATE UPDATE</p><h1 style="margin:14px 0 0;font-size:24px">A referral review opened at ${safeCompanyDomain}</h1><p style="margin:14px 0 0;color:#475569;line-height:1.5">A verified employee can now review your private request. This does not guarantee an introduction, interview, or hiring outcome.</p><a href="${requestsUrl}" style="display:block;margin-top:22px;border-radius:9px;background:#0B57D0;padding:14px;color:#fff;text-align:center;font-weight:700;text-decoration:none">View private request</a></section></main>`;
    try {
      const response = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: sender, to: [to], subject, text, html }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true as const, reason: "sent" as const };
    } catch { return { sent: false as const, reason: "delivery_failed" as const }; }
  };
}

export const sendSlotOpenedAlertEmail = createSlotOpenedAlertEmailSender();
