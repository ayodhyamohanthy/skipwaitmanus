// D-094 item 2 (D-264 (2), packet §4.0–4.5): behind a code switch that ships
// false, the ask composer asks the existing public preview route which company
// and role a pasted job link is for. The line is text, never an input the
// seeker must accept, and the send body never carries a preview value
// (askSend.ts is untouched): the server stays the authority. Nothing here
// runs while JOB_LINK_PREFILL_ENABLED is false.
import { useEffect, useState } from "react";
import { z } from "zod";
import type { PublicCompany } from "@shared/companies";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "@shared/referralUrl";

export const JOB_LINK_PREFILL_ENABLED = false;

let testOverride: boolean | null = null;
/** The packet's test seam: production reads the constant above, the release row flips it. */
export function setJobLinkPrefillForTests(value: boolean | null): void { testOverride = value; }
export function jobLinkPrefillEnabled(): boolean { return testOverride ?? JOB_LINK_PREFILL_ENABLED; }

/** The route's payload, additive over the fields onboarding and goal start already read. */
export const jobLinkPreviewSchema = z.object({
  canonicalUrl: z.string(),
  status: z.enum(["fresh", "unreachable"]),
  employerConfidence: z.enum(["verified", "direct-domain", "ambiguous", "unreachable"]),
  companyDomain: z.string().optional(),
  companyName: z.string().optional(),
  roleTitle: z.string().optional(),
  fetched: z.boolean().optional(),
  reason: z.string().optional(),
  recoveryAction: z.string().optional(),
});
export type JobLinkPreview = z.infer<typeof jobLinkPreviewSchema>;

const SAFE_CONFIDENCE: ReadonlySet<string> = new Set(["verified", "direct-domain"]);
/** A preview that safely names one employer; only these can block a send (§4.4). */
export function isSafePreview(preview: JobLinkPreview | null): preview is JobLinkPreview & { companyDomain: string } {
  return preview !== null && SAFE_CONFIDENCE.has(preview.employerConfidence) && typeof preview.companyDomain === "string" && preview.companyDomain.trim().length > 0;
}
/** `fetched: false` means the body was never requested, so we must not narrate a reachability failure (§15 F2). */
function isUsablePreview(preview: JobLinkPreview): boolean { return preview.fetched !== false; }

const normalizedHost = (value: string) => value.trim().toLowerCase().replace(/^www\./, "");
export function domainBelongsToCompany(domain: string, companyDomains: readonly string[]): boolean {
  const host = normalizedHost(domain);
  if (!host) return false;
  return companyDomains.some(value => {
    const own = normalizedHost(value);
    return own.length > 0 && (host === own || host.endsWith(`.${own}`));
  });
}

export type JobLinkCompany = Pick<PublicCompany, "name" | "domains">;
const possessive = (name: string) => `${name}${name.toLowerCase().endsWith("s") ? "’" : "’s"}`;

/** The one mismatch sentence (§4.3/§4.4), or null when the preview names this door's company. */
export function jobLinkMismatch(preview: JobLinkPreview, company: JobLinkCompany, companies: readonly JobLinkCompany[] = []): string | null {
  if (!isUsablePreview(preview) || !isSafePreview(preview)) return null;
  if (domainBelongsToCompany(preview.companyDomain, company.domains)) return null;
  const other = companies.find(item => domainBelongsToCompany(preview.companyDomain, item.domains))?.name ?? preview.companyName?.trim() ?? preview.companyDomain;
  return `This posting looks like ${possessive(other)}, not ${possessive(company.name)}.`;
}

/**
 * What the seeker reads under "Job link" (packet §4.3). Pure: no request and
 * no state. A link that was never fetched shows nothing at all; a fetched
 * preview that cannot name one company keeps today's send and says so.
 */
export function jobLinkLine(input: { url: string; preview: JobLinkPreview | null; company: JobLinkCompany | null; companies?: readonly JobLinkCompany[] }): string | null {
  const { url, preview, company, companies = [] } = input;
  if (!isValidTargetRoleUrl(url)) return null;
  if (preview !== null && !isUsablePreview(preview)) return null;
  if (preview !== null && isSafePreview(preview)) {
    const belongsToTarget = company !== null && domainBelongsToCompany(preview.companyDomain, company.domains);
    if (company !== null && !belongsToTarget) return jobLinkMismatch(preview, company, companies);
    const owner = belongsToTarget ? company : companies.find(item => domainBelongsToCompany(preview.companyDomain, item.domains)) ?? null;
    const name = owner?.name ?? preview.companyName?.trim() ?? preview.companyDomain;
    return preview.roleTitle ? `From the posting: ${preview.roleTitle} at ${name}` : `From the posting: a role at ${name}`;
  }
  const reason = preview?.reason?.trim();
  const fallback = "You can still send it; we check the company when you send.";
  return reason ? `${reason} ${fallback}` : fallback;
}

const DEBOUNCE_MS = 450;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_LIMIT = 50;
/** The last answer per normalized URL, including "no preview", so one link is asked about once. */
const cache = new Map<string, JobLinkPreview | null>();
const inFlight = new Map<string, Promise<JobLinkPreview | null>>();

export function resetJobLinkPreviewForTests(): void { cache.clear(); inFlight.clear(); }

async function requestPreview(normalizedUrl: string): Promise<JobLinkPreview | null> {
  const cached = cache.get(normalizedUrl);
  if (cached !== undefined) return cached;
  const active = inFlight.get(normalizedUrl);
  if (active) return active;
  const request = (async () => {
    const settle = (value: JobLinkPreview | null) => {
      if (cache.size >= CACHE_LIMIT) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
      cache.set(normalizedUrl, value);
      return value;
    };
    try {
      const response = await fetch("/api/job-link/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return settle(null);
      const parsed = jobLinkPreviewSchema.safeParse(await response.json());
      if (!parsed.success || normalizeTargetRoleUrl(parsed.data.canonicalUrl) !== normalizedUrl) return settle(null);
      return settle(parsed.data);
    } catch {
      return settle(null);
    } finally {
      inFlight.delete(normalizedUrl);
    }
  })();
  inFlight.set(normalizedUrl, request);
  return request;
}

export type JobLinkPreviewState = { preview: JobLinkPreview | null; pending: boolean };

/**
 * Debounced one-request-per-link preview (§4.2). A 429, 400, network error or
 * timeout resolves to "no preview", never an error banner; a result is kept
 * for its normalized URL, and composer and drawer share one request.
 */
export function useJobLinkPreview(url: string, options?: { enabled?: boolean }): JobLinkPreviewState {
  const enabled = options?.enabled ?? jobLinkPrefillEnabled();
  const normalized = isValidTargetRoleUrl(url) ? normalizeTargetRoleUrl(url) : "";
  const [settled, setSettled] = useState<{ url: string; preview: JobLinkPreview | null }>({ url: "", preview: null });
  useEffect(() => {
    if (!enabled || !normalized) return;
    const cached = cache.get(normalized);
    if (cached !== undefined) { setSettled({ url: normalized, preview: cached }); return; }
    let live = true;
    const timer = setTimeout(() => {
      void requestPreview(normalized).then(preview => { if (live) setSettled({ url: normalized, preview }); });
    }, DEBOUNCE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [enabled, normalized]);
  if (!enabled || !normalized) return { preview: null, pending: false };
  const current = settled.url === normalized ? settled : null;
  return { preview: current?.preview ?? null, pending: current === null };
}
