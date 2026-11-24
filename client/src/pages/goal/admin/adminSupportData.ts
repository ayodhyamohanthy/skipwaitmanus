// ADMIN-support-view (D-393): the support page's data contract. The server's payload is parsed at the edge
// with the shared schema, so a malformed row never renders as undefined; a failed read throws the server's
// own plain message. Bearer token when present, cookie always — the same call shape as the other admin pages.
import { supportSignalsSchema, supportViewSchema, type SupportRequest, type SupportSignals, type SupportView } from "@shared/adminSupport";
import { ADMIN_ACCESS_MESSAGE, ADMIN_NETWORK_ERROR, AdminAccessError, type TokenSource } from "@/components/admin/adminApi";
import { readApiJson } from "@/lib/apiResponse";
import type { GoalStatusValue } from "@/components/goal/GoalStatus";

export const SUPPORT_VIEW_FALLBACK = "We could not load this person's support view";
export const SUPPORT_SIGNALS_FALLBACK = "We could not load the trouble signals";

export const adminSupportPaths = {
  view: (userId: number) => `/api/admin/users/${userId}/support`,
  signals: "/api/admin/support/signals",
} as const;

async function read<T>(path: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, getToken: TokenSource, fallback: string): Promise<T> {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error(ADMIN_NETWORK_ERROR);
  }
  if (response.status === 401 || response.status === 403) throw new AdminAccessError(ADMIN_ACCESS_MESSAGE);
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(fallback);
  return parsed.data;
}

export const loadSupportView = (getToken: TokenSource, userId: number): Promise<SupportView> =>
  read(adminSupportPaths.view(userId), supportViewSchema, getToken, SUPPORT_VIEW_FALLBACK);

export const loadSupportSignals = (getToken: TokenSource): Promise<SupportSignals> =>
  read(adminSupportPaths.signals, supportSignalsSchema, getToken, SUPPORT_SIGNALS_FALLBACK);

/** The dot-and-text status for one request: the same tones the seeker's own pages use. */
export function supportStatusOf(request: SupportRequest): { status: GoalStatusValue; label: string } {
  if (request.waitingForCoverage) return { status: "waiting", label: request.state.label };
  switch (request.status) {
    case "pending": return { status: "under_review", label: request.state.label };
    case "approved": return { status: "accepted", label: request.state.label };
    case "intro_made":
    case "interview":
    case "offer": return { status: "referred", label: request.state.label };
    case "withdrawn": return { status: "withdrawn", label: request.state.label };
    case "declined":
    case "closed": return { status: "expired", label: request.state.label };
    default: return { status: "queue_new", label: request.state.label };
  }
}

/** One date-time format, locale pinned so a capture is reproducible. */
export const supportStamp = (value: string | Date) => new Date(value).toLocaleString("en-US");
/** The activity log filtered to this person, for the "why" links. */
export const activityHref = (person: string | number) => `/admin/activity?person=${encodeURIComponent(String(person))}`;
