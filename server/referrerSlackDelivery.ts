import { referrerReviewReengagementMessage } from "./reengagementMessaging";

export type ReferrerSlackDeliveryInput = { to: string; companyDomain: string; reviewUrl: string };

export type ReferrerSlackDeliveryDependencies = { fetchImpl?: typeof fetch };

const MAX_WEBHOOK_URL_LENGTH = 512;

export function isValidSlackIncomingWebhookUrl(value: string): boolean {
  if (value.length === 0 || value.length > MAX_WEBHOOK_URL_LENGTH) return false;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(["hooks.slack.com", "hooks.slack.com.", "hooks.slack-trusted.com"]);
  return allowedHosts.has(host);
}

export function maskSlackWebhookUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}/…`;
  } catch { return "https://…/…"; }
}

export function createReferrerSlackDeliverySender(dependencies: ReferrerSlackDeliveryDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  return async ({ to, companyDomain, reviewUrl }: ReferrerSlackDeliveryInput) => {
    if (!isValidSlackIncomingWebhookUrl(to)) return { sent: false as const, reason: "not_configured" as const };
    const message = referrerReviewReengagementMessage(companyDomain);
    const payload = {
      text: [message.headline, message.body, "", `Open the private review only when you are ready: ${reviewUrl}`].join("\n"),
      blocks: [
        { type: "header", text: { type: "plain_text", text: message.headline, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: message.body } },
        { type: "section", text: { type: "mrkdwn", text: `*<${reviewUrl}|Open your private review>* — sign in with your verified company email before any decision is recorded.` } },
        { type: "context", elements: [{ type: "mrkdwn", text: "skipwait.me · Private referral · No candidate details are shared here." }] },
      ],
    };
    try {
      const response = await fetchImpl(to, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("delivery failed");
      return { sent: true as const, reason: "sent" as const };
    } catch { return { sent: false as const, reason: "delivery_failed" as const }; }
  };
}

export const sendReferrerSlackDelivery = createReferrerSlackDeliverySender();
