import { z } from "zod";

/**
 * What a thrown WorkOS User Management error means for seeker password auth, read once. Classified by
 * shape (status, name, code, rawData) with Zod, never with instanceof, so mocked SDK modules classify the
 * same. Most codes are undocumented by WorkOS; anything not recognised is temporarily_unavailable (and the
 * caller reports it), so a new WorkOS answer never turns into a misleading "wrong password".
 * Messages are never read for meaning except the SDK's own errors[] summary on a 422, and never logged:
 * WorkOS puts the email address in some of them.
 */
export type WorkosPasswordOperation = "sign_in" | "sign_up" | "verify" | "resend" | "forgot" | "reset";
export type WorkosPasswordFailure =
  | { readonly kind: "verify_email"; readonly pendingAuthenticationToken?: string; readonly emailVerificationId?: string; readonly userId?: string }
  | { readonly kind: "invalid_credentials" }
  | { readonly kind: "invalid_code" }
  | { readonly kind: "weak_password" }
  | { readonly kind: "email_taken" }
  | { readonly kind: "expired" }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "use_another_method" }
  | { readonly kind: "password_sign_in_unavailable" }
  | { readonly kind: "temporarily_unavailable" };

const entrySchema = z.object({ code: z.string().optional() });
const rawDataSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  pending_authentication_token: z.string().optional(),
  email_verification_id: z.string().optional(),
  user: z.object({ id: z.string() }).optional().catch(undefined),
  errors: z.array(entrySchema).optional().catch(undefined),
});
const errorShapeSchema = z.object({
  name: z.string().optional().catch(undefined),
  status: z.number().int().optional().catch(undefined),
  code: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  requestID: z.string().optional().catch(undefined),
  retryAfter: z.number().nullable().optional().catch(undefined),
  message: z.string().optional().catch(undefined),
  pendingAuthenticationToken: z.string().optional().catch(undefined),
  errors: z.array(entrySchema).optional().catch(undefined),
  rawData: rawDataSchema.optional().catch(undefined),
});
type ErrorShape = z.infer<typeof errorShapeSchema>;

const USE_ANOTHER_METHOD = new Set(["mfa_challenge", "mfa_enrollment", "mfa_verification", "organization_selection_required", "radar_email_challenge", "radar_sms_challenge", "sso_required", "organization_authentication_methods_required"]);
const EMAIL_TAKEN = new Set(["email_not_available", "email_taken", "user_already_exists", "email_already_exists"]);
const WRONG_PASSWORD = new Set(["invalid_credentials", "invalid_grant", "invalid_password"]);
const WEAK_PASSWORD = new Set(["password_strength_error", "password_reset_error"]);
const CODE_PATTERN = /^[a-z0-9_]{1,64}$/;
const RETRY_AFTER_DEFAULT_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;

function shapeOf(error: unknown): ErrorShape | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const parsed = errorShapeSchema.safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

/** Every code the error carries: its own code/error, rawData's, errors[] entries, and the SDK's 422 summary lines. */
function codesOf(shape: ErrorShape): ReadonlySet<string> {
  const codes = [shape.code, shape.error, shape.rawData?.code, shape.rawData?.error, ...(shape.errors ?? []).map(entry => entry.code), ...(shape.rawData?.errors ?? []).map(entry => entry.code)];
  // UnprocessableEntityException keeps errors[] only as "The following requirements must be met:\n\t<code>\n".
  if (shape.name === "UnprocessableEntityException" && shape.message) codes.push(...Array.from(shape.message.matchAll(/^\t([a-z0-9_]+)$/gm), match => match[1]));
  return new Set(codes.filter((code): code is string => typeof code === "string" && CODE_PATTERN.test(code)));
}

function has(codes: ReadonlySet<string>, wanted: ReadonlySet<string>): boolean {
  return Array.from(codes).some(code => wanted.has(code));
}

function retryAfterOf(shape: ErrorShape): number {
  const value = typeof shape.retryAfter === "number" && Number.isFinite(shape.retryAfter) && shape.retryAfter > 0 ? Math.ceil(shape.retryAfter) : RETRY_AFTER_DEFAULT_SECONDS;
  return Math.min(value, RETRY_AFTER_MAX_SECONDS);
}

function verifyStep(shape: ErrorShape): WorkosPasswordFailure {
  const pendingAuthenticationToken = shape.pendingAuthenticationToken ?? shape.rawData?.pending_authentication_token;
  const emailVerificationId = shape.rawData?.email_verification_id;
  const userId = shape.rawData?.user?.id;
  return { kind: "verify_email", ...(pendingAuthenticationToken ? { pendingAuthenticationToken } : {}), ...(emailVerificationId ? { emailVerificationId } : {}), ...(userId ? { userId } : {}) };
}

const TEMPORARILY_UNAVAILABLE: WorkosPasswordFailure = { kind: "temporarily_unavailable" };

export function classifyWorkosPasswordError(error: unknown, operation: WorkosPasswordOperation): WorkosPasswordFailure {
  const shape = shapeOf(error);
  // Network failures (TypeError, the SDK's "Unexpected error" wrapper) carry no status.
  if (!shape || shape.name === "TypeError" || shape.name === "AbortError") return TEMPORARILY_UNAVAILABLE;
  const status = shape.status;
  // The SDK reports its own timeout as a 408 OauthException: never read that as a wrong password.
  if (status === undefined || status === 408 || status >= 500) return TEMPORARILY_UNAVAILABLE;
  if (status === 429 || shape.name === "RateLimitExceededException") return { kind: "rate_limited", retryAfterSeconds: retryAfterOf(shape) };
  const codes = codesOf(shape);
  if (codes.has("email_verification_required")) return verifyStep(shape);
  if (has(codes, USE_ANOTHER_METHOD)) return { kind: "use_another_method" };
  if (codes.has("authentication_method_not_allowed")) return { kind: "password_sign_in_unavailable" };
  switch (operation) {
    case "sign_in":
      if (has(codes, WRONG_PASSWORD) || shape.name === "OauthException" || status === 401 || status === 404) return { kind: "invalid_credentials" };
      return TEMPORARILY_UNAVAILABLE;
    case "sign_up":
      if (has(codes, EMAIL_TAKEN) || status === 409) return { kind: "email_taken" };
      if (isPasswordRefusal(codes) || status === 422) return { kind: "weak_password" };
      return TEMPORARILY_UNAVAILABLE;
    case "reset":
      if (status === 404 || Array.from(codes).some(code => code.includes("token"))) return { kind: "expired" };
      if (isPasswordRefusal(codes) || status === 422) return { kind: "weak_password" };
      if (status === 400 || status === 403) return { kind: "expired" };
      return TEMPORARILY_UNAVAILABLE;
    case "verify":
      if (status === 404) return { kind: "expired" };
      if (status === 400 || status === 422) return { kind: "invalid_code" };
      return TEMPORARILY_UNAVAILABLE;
    case "resend":
    case "forgot":
      return TEMPORARILY_UNAVAILABLE;
  }
}

/** A refused password: WorkOS's policy codes, or a per-requirement `password_*` code in errors[] (never a token code). */
function isPasswordRefusal(codes: ReadonlySet<string>): boolean {
  const list = Array.from(codes);
  if (list.some(code => code.includes("token"))) return false;
  return has(codes, WEAK_PASSWORD) || list.some(code => code.startsWith("password_"));
}

export type SafeWorkosErrorDescription = { readonly name: string; readonly status?: number; readonly code?: string; readonly requestID?: string };

/** What may be logged or sent to Sentry about a WorkOS failure: never the message, rawData, email, password or tokens. */
export function describeWorkosError(error: unknown): SafeWorkosErrorDescription {
  const shape = shapeOf(error);
  if (!shape) return { name: "unknown" };
  const name = shape.name && /^[A-Za-z]{1,64}$/.test(shape.name) ? shape.name : "unknown";
  const code = [shape.code, shape.error, shape.rawData?.code].find((value): value is string => typeof value === "string" && CODE_PATTERN.test(value));
  const requestID = shape.requestID && /^[A-Za-z0-9_-]{1,128}$/.test(shape.requestID) ? shape.requestID : undefined;
  return { name, ...(shape.status !== undefined ? { status: shape.status } : {}), ...(code ? { code } : {}), ...(requestID ? { requestID } : {}) };
}
