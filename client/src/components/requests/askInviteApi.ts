import { z } from "zod";
import {
  ASK_INVITE_TOKEN_PATTERN,
  askInviteLandingResponseSchema,
  type AskInviteClaimOutcome,
  type AskInviteLanding,
} from "@shared/askInvites";
import { readApiJson } from "@/lib/apiResponse";

type TokenSource = () => Promise<string | null | undefined>;

type ApiPayload = Record<string, unknown>;

export class AskInviteApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super("The invite link could not be completed.");
    this.name = "AskInviteApiError";
  }
}

export type CreatedAskInvite = { url: string; expiresAt: string };

const createResponseSchema = z.object({
  token: z.string().regex(ASK_INVITE_TOKEN_PATTERN),
  url: z.string().url(),
  expiresAt: z.string(),
});
const revokeResponseSchema = z.object({ revoked: z.boolean() });
const claimResponseSchema = z.object({ outcome: z.enum(["delivered", "held", "reserved"]) });

async function apiRequest(url: string, getToken: TokenSource, init: RequestInit, fallback: string): Promise<ApiPayload> {
  let response: Response;
  try {
    const token = await getToken();
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new AskInviteApiError(0, "network_error");
  }

  let payload: ApiPayload;
  try {
    payload = await readApiJson<ApiPayload>(response, fallback);
  } catch {
    if (!response.ok) throw new AskInviteApiError(response.status, "unavailable");
    throw new AskInviteApiError(0, "invalid_response");
  }
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "unavailable";
    throw new AskInviteApiError(response.status, code);
  }
  return payload;
}

export async function createAskInvite(requestId: number, getToken: TokenSource): Promise<CreatedAskInvite> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new AskInviteApiError(400, "invalid_request");
  const payload = await apiRequest(
    `/api/company-referrals/${requestId}/invite-link`,
    getToken,
    { method: "POST", headers: { "Content-Type": "application/json" } },
    "We could not create that invite link.",
  );
  const parsed = createResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AskInviteApiError(0, "invalid_response");
  // The token is deliberately not returned separately or stored by the UI; it appears only in this URL.
  const link = new URL(parsed.data.url);
  if (link.pathname !== `/r/${parsed.data.token}` || link.search || link.hash) throw new AskInviteApiError(0, "invalid_response");
  return { url: parsed.data.url, expiresAt: parsed.data.expiresAt };
}

export async function revokeAskInvite(requestId: number, getToken: TokenSource): Promise<boolean> {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new AskInviteApiError(400, "invalid_request");
  const payload = await apiRequest(
    `/api/company-referrals/${requestId}/invite-link/revoke`,
    getToken,
    { method: "POST", headers: { "Content-Type": "application/json" } },
    "We could not revoke that invite link.",
  );
  const parsed = revokeResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AskInviteApiError(0, "invalid_response");
  return parsed.data.revoked;
}

export async function fetchAskInviteLanding(token: string, getToken: TokenSource): Promise<AskInviteLanding> {
  let encodedToken: string;
  try { encodedToken = encodeURIComponent(token); }
  catch { throw new AskInviteApiError(404, "not_available"); }
  const payload = await apiRequest(
    `/api/ask-invites/${encodedToken}`,
    getToken,
    { method: "GET" },
    "This link is not available.",
  );
  const parsed = askInviteLandingResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AskInviteApiError(404, "not_available");
  return parsed.data.invite;
}

export async function claimAskInvite(token: string, getToken: TokenSource): Promise<AskInviteClaimOutcome> {
  let encodedToken: string;
  try { encodedToken = encodeURIComponent(token); }
  catch { throw new AskInviteApiError(404, "not_available"); }
  const payload = await apiRequest(
    `/api/ask-invites/${encodedToken}/claim`,
    getToken,
    { method: "POST", headers: { "Content-Type": "application/json" } },
    "We could not claim that ask.",
  );
  const parsed = claimResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AskInviteApiError(0, "invalid_response");
  return parsed.data.outcome;
}
