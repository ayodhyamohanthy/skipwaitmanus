// Guarded job-board fetcher (D-174-job-catalog, packet section 5.5). Every
// request goes out through the DNS-pinned dispatcher from jobLinkPreview, to
// exactly one allowlisted host, following no redirects, with a 20 s timeout
// and a 25 MB cap. Above the cap the source becomes failing - a truncated
// job list is never returned, because a partial list would silently close
// real openings.

import { fetch as undiciFetch } from "undici";
import { pinnedDispatcher } from "../jobLinkPreview";

export const JOB_SOURCE_TIMEOUT_MS = 20_000;
export const JOB_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export type GuardedFetchFailure =
  | { ok: false; reason: "refused_host" | "redirect_refused" | "http_error" | "over_cap" | "invalid_json" | "network_error" | "unsafe_destination"; status?: number }
  | { ok: false; reason: "invalid_input" };
export type GuardedFetchResult = { ok: true; payload: unknown; bytes: number } | GuardedFetchFailure;

export async function fetchGuardedJson(
  url: string,
  opts: { allowedHost: string; fetchImpl?: typeof undiciFetch }
): Promise<GuardedFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_input" };
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== opts.allowedHost) {
    return { ok: false, reason: "refused_host" };
  }
  let response;
  let dispatcher;
  try {
    dispatcher = opts.fetchImpl ? undefined : await pinnedDispatcher(parsed.hostname);
  } catch {
    // The DNS pin refused the destination (unresolvable or private address):
    // a distinct failure reason from a network error - no request was made.
    return { ok: false, reason: "unsafe_destination" };
  }
  try {
    const doFetch = opts.fetchImpl ?? undiciFetch;
    response = await doFetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(JOB_SOURCE_TIMEOUT_MS),
      headers: { accept: "application/json", "user-agent": "skipwait.me job catalog" },
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "redirect_refused", status: response.status };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "http_error", status: response.status };
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > JOB_SOURCE_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "over_cap" };
  }
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: "network_error" };
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > JOB_SOURCE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "over_cap" };
    }
    chunks.push(value);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  return { ok: true, payload, bytes: total };
}
