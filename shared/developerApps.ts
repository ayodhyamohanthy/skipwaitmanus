import { z } from "zod";

/**
 * The developer-app contract, shared by the console, the API and the tests.
 *
 * Source of truth for what an app may ask for. The kit's screen lists seven
 * permissions; the ones marked `requiresReview` are the dangerous half -- the
 * ones that send something on a person's behalf or spend their money -- and they
 * are separated here rather than in the UI so the API can enforce the same line.
 */

export const DEVELOPER_APP_KINDS = ["app", "agent", "server"] as const;
export type DeveloperAppKind = (typeof DEVELOPER_APP_KINDS)[number];

export const DEVELOPER_APP_STATUSES = ["draft", "in_review", "approved", "rejected", "suspended"] as const;
export type DeveloperAppStatus = (typeof DEVELOPER_APP_STATUSES)[number];

export const DEVELOPER_SCOPES = [
  { scope: "companies:read", label: "Search companies open to referrals", requiresReview: false },
  { scope: "requests:read", label: "Read the user's requests and replies", requiresReview: false },
  { scope: "asks:draft", label: "Create draft asks", requiresReview: false },
  { scope: "webhooks", label: "Accepted / passed / message events", requiresReview: false },
  { scope: "asks:send", label: "Send asks — the user approves each one in SkipWait", requiresReview: true },
  { scope: "profile:read", label: "Basic profile and resume, with user consent", requiresReview: true },
  { scope: "credits:spend", label: "Run paid tools — the user approves the cost each time", requiresReview: true },
] as const;

export type DeveloperScope = (typeof DEVELOPER_SCOPES)[number]["scope"];
export const DEVELOPER_SCOPE_NAMES = DEVELOPER_SCOPES.map(entry => entry.scope) as DeveloperScope[];

/**
 * A redirect URL must be absolute https, or http on localhost for development.
 *
 * This is the check that matters most on this table. An unvalidated redirect URL
 * is how an OAuth authorization code gets delivered to someone who is not the
 * app -- so it is validated on write, and it will be validated again at
 * authorize time when that flow exists, because a value written once is not a
 * value trusted forever.
 */
export const redirectUrlSchema = z.string().trim().max(512).refine(value => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}, "Redirect URLs must be absolute https:// URLs (http://localhost is allowed for development)");

export const createDeveloperAppSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(DEVELOPER_APP_KINDS),
  websiteUrl: z.string().trim().max(512).url().optional().or(z.literal("")),
  redirectUrls: z.array(redirectUrlSchema).min(1).max(10),
  description: z.string().trim().min(20).max(1000),
  scopes: z.array(z.enum(DEVELOPER_SCOPE_NAMES as [DeveloperScope, ...DeveloperScope[]])).min(1).max(DEVELOPER_SCOPE_NAMES.length),
  agreedToTerms: z.literal(true),
});

export type CreateDeveloperAppInput = z.infer<typeof createDeveloperAppSchema>;

/** True when any requested scope needs a human to approve it. */
export function needsReview(scopes: readonly string[]): boolean {
  return scopes.some(scope => DEVELOPER_SCOPES.some(entry => entry.scope === scope && entry.requiresReview));
}
