// Edge contracts and fetchers for /settings. Every route already exists:
//   GET    /api/company-referrals/access   -> { verifiedCompanyAccess, workEmailDomain }
//   GET    /api/privacy/requests           -> { requests: PrivacyRequest[] }
//   GET    /api/privacy/export             -> JSON file download
//   POST   /api/privacy/requests/erasure   -> { request: { alreadyRequested? } }
//   GET|PUT|DELETE /api/referrer/slack-webhook -> { connected, active }
//   GET    /api/blocks/mine                -> { blocks: BlockRow[] }
//   DELETE /api/blocks/:id
// The server owns validation; the client parses what comes back so a malformed
// payload reads as an error instead of a wrong state.
import { z } from "zod";
import { readApiJson } from "@/lib/apiResponse";

export type TokenSource = () => Promise<string | null | undefined>;

export const ACCESS_ERROR = "We could not check your work-email access";
export const PRIVACY_REQUESTS_ERROR = "We could not load privacy requests";
export const EXPORT_ERROR = "We could not prepare your data export";
export const ERASURE_ERROR = "We could not create your request";
export const BLOCKS_ERROR = "We could not load your blocked list";
export const UNBLOCK_ERROR = "We could not remove this block";
export const SLACK_STATUS_ERROR = "We could not load your Slack triage status";
export const SLACK_CONNECT_ERROR = "We could not connect your Slack triage channel";
export const SLACK_DISCONNECT_ERROR = "We could not disconnect your Slack triage channel";

const companyAccessSchema = z.object({ verifiedCompanyAccess: z.boolean(), workEmailDomain: z.string().nullish() });
export type CompanyAccess = { verifiedCompanyAccess: boolean; workEmailDomain: string | null };

const privacyRequestSchema = z.object({
  id: z.number(),
  kind: z.literal("erasure"),
  status: z.enum(["requested", "in_review", "completed", "declined"]),
  resolution: z.string().nullish(),
  createdAt: z.string().nullish(),
});
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;
const privacyRequestsSchema = z.object({ requests: z.array(privacyRequestSchema).default([]) });
const erasureSchema = z.object({ request: z.object({ alreadyRequested: z.boolean().optional() }).optional() });

const slackStatusSchema = z.object({ connected: z.boolean().optional(), active: z.boolean().optional() });
export type SlackStatus = { connected: boolean; active: boolean };

const blockRowSchema = z.object({ id: z.number(), blockedUserId: z.number(), reason: z.string().nullish(), createdAt: z.string().nullish() });
export type BlockRow = z.infer<typeof blockRowSchema>;
const blocksSchema = z.object({ blocks: z.array(blockRowSchema).default([]) });

export const settingsKeys = {
  access: ["settings", "company-access"] as const,
  privacyRequests: ["settings", "privacy-requests"] as const,
  slack: ["settings", "slack-webhook"] as const,
  blocks: ["settings", "blocks"] as const,
};

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function call(url: string, getToken: TokenSource, method: Method = "GET", body?: Record<string, string>): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (body || method === "POST") headers["Content-Type"] = "application/json";
  return fetch(url, { ...(method === "GET" ? {} : { method }), credentials: "include", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}

/** Reads a JSON reply, surfacing the server's own error message on a non-2xx. */
async function readReply<S extends z.ZodType>(response: Response, schema: S, fallback: string): Promise<z.infer<S>> {
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export async function fetchCompanyAccess(getToken: TokenSource): Promise<CompanyAccess> {
  const reply = await readReply(await call("/api/company-referrals/access", getToken), companyAccessSchema, ACCESS_ERROR);
  return { verifiedCompanyAccess: reply.verifiedCompanyAccess, workEmailDomain: reply.workEmailDomain ?? null };
}

export const hasVerifiedWorkEmail = (access: CompanyAccess | undefined): boolean => Boolean(access?.verifiedCompanyAccess && access.workEmailDomain);

export async function fetchPrivacyRequests(getToken: TokenSource): Promise<PrivacyRequest[]> {
  return (await readReply(await call("/api/privacy/requests", getToken), privacyRequestsSchema, PRIVACY_REQUESTS_ERROR)).requests;
}

export async function requestErasure(getToken: TokenSource): Promise<{ alreadyRequested: boolean }> {
  const reply = await readReply(await call("/api/privacy/requests/erasure", getToken, "POST"), erasureSchema, ERASURE_ERROR);
  return { alreadyRequested: Boolean(reply.request?.alreadyRequested) };
}

/** Downloads the account export as a JSON file through a temporary object URL. */
export async function downloadPersonalData(getToken: TokenSource): Promise<void> {
  const response = await call("/api/privacy/export", getToken);
  if (!response.ok) {
    const payload = await readApiJson<Record<string, unknown>>(response, EXPORT_ERROR);
    throw new Error(typeof payload.error === "string" && payload.error ? payload.error : EXPORT_ERROR);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "skipwait-personal-data.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchSlackStatus(getToken: TokenSource): Promise<SlackStatus> {
  const reply = await readReply(await call("/api/referrer/slack-webhook", getToken), slackStatusSchema, SLACK_STATUS_ERROR);
  return { connected: Boolean(reply.connected), active: Boolean(reply.active) };
}

export async function connectSlack(webhookUrl: string, getToken: TokenSource): Promise<void> {
  await readReply(await call("/api/referrer/slack-webhook", getToken, "PUT", { webhookUrl }), slackStatusSchema, SLACK_CONNECT_ERROR);
}

export async function disconnectSlack(getToken: TokenSource): Promise<void> {
  await readReply(await call("/api/referrer/slack-webhook", getToken, "DELETE"), slackStatusSchema, SLACK_DISCONNECT_ERROR);
}

export const isSlackWebhookUrl = (value: string) => /^https:\/\/hooks\.slack(-trusted)?\.com\/.*$/i.test(value);

export async function fetchBlocks(getToken: TokenSource): Promise<BlockRow[]> {
  return (await readReply(await call("/api/blocks/mine", getToken), blocksSchema, BLOCKS_ERROR)).blocks;
}

export async function unblock(id: number, getToken: TokenSource): Promise<void> {
  const response = await call(`/api/blocks/${id}`, getToken, "DELETE");
  if (!response.ok) throw new Error(UNBLOCK_ERROR);
}
