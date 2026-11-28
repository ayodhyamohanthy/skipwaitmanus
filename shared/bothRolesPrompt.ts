// MOBILE-both-prompt (D-414 (2), packet docs/plans/MOBILE-app-flow.md): "be both". Once per person, right after
// their first referral request is sent, a bottom sheet asks where they work now, so a seeker can also refer good
// people at their own company. The verification is the existing in-portal work-email code (D-057): the signed-in
// account verifies a work email with a code; no second account, no standalone referrer code login.
//
// Once per person, with no new stored state: the server shows the sheet only when the request just sent is the
// person's first request ever and no account of the person holds a verified work email. Both facts are already on
// the account (referralRequests, profiles.workEmailVerifiedAt), so a later request, a dismissal ("Not now") or a
// verification can never bring it back. PRIVACY-own-employer-guard keeps the sheet's promise true: a person's
// requests never reach their own employer.
import { z } from "zod";

/** The switch. Off until the release row compares the flows (D-414 (5)); while off the route answers 404 and no UI renders. */
export const BOTH_ROLES_PROMPT = false;

export const BOTH_ROLES_PROMPT_PATH = "/api/account/both-roles-prompt";

/** The packet's words, verbatim. */
export const BOTH_ROLES_COPY = {
  title: "Where do you work now?",
  body: "Verify your work email and you can refer good people at your company too.",
  privacy: "Your colleagues never see that you're looking. Requests never go to your own employer.",
  emailLabel: "Work email",
  verify: "Verify my work email",
  notNow: "Not now",
} as const;

/** The steps after "Verify my work email": the code, then the verified state. */
export const BOTH_ROLES_CODE_COPY = {
  title: "Enter the code",
  label: "6-digit code",
  confirm: "Confirm code",
  resend: "Send a new code",
  changeEmail: "Use a different email",
  sentTo: (email: string) => `We sent a code to ${email}. It works for 10 minutes.`,
} as const;

export const BOTH_ROLES_DONE_COPY = {
  title: (domain: string) => `You can refer at ${domain} now.`,
  body: "Requests from people who want to join appear in Queue. Your own requests never go there.",
  done: "Done",
} as const;

/** Client pre-checks; the server stays the authority for each of them. */
export const BOTH_ROLES_ERRORS = {
  email: "Enter your full work email, like you@company.com.",
  personal: "Personal inboxes can't show where you work. Use your work email.",
  code: "Enter the 6 digits from the email.",
  locked: "Too many tries. Wait 15 minutes, then send a new code.",
} as const;

/** Consent-respecting Clarity events (no-ops until analytics consent). */
export const BOTH_ROLES_EVENTS = {
  shown: "both_roles_prompt_shown",
  dismissed: "both_roles_prompt_dismissed",
  verifyStarted: "both_roles_prompt_verify_started",
  verified: "both_roles_prompt_verified",
} as const;

/** GET query: the request the seeker just sent. */
export const bothRolesPromptQuerySchema = z.object({
  requestId: z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().int().positive().max(2_147_483_647)),
}).strict();
export type BothRolesPromptQuery = z.infer<typeof bothRolesPromptQuerySchema>;

/** GET response: show the sheet now, or not. */
export const bothRolesPromptResponseSchema = z.object({ show: z.boolean() }).strict();
export type BothRolesPromptResponse = z.infer<typeof bothRolesPromptResponseSchema>;

/** The facts the decision reads, all from the account. */
export type BothRolesPromptFacts = {
  /** The request the seeker just sent. */
  readonly requestId: number;
  /** The person's first two requests ever (every account of the canonical person), oldest first. */
  readonly firstRequestIds: readonly number[];
  /** True when any account of the person holds a verified work email (profiles.workEmailVerifiedAt set). */
  readonly hasVerifiedWorkEmail: boolean;
};

/** Show only right after the person's first request, and only while they have no verified work email. */
export function shouldShowBothRolesPrompt(facts: BothRolesPromptFacts): boolean {
  if (facts.hasVerifiedWorkEmail) return false;
  return facts.firstRequestIds.length === 1 && facts.firstRequestIds[0] === facts.requestId;
}
