// Greenhouse board adapter (D-174-job-catalog, packet section 5.5). Reads the
// public board API with ?content=true, strips HTML for the snippet, and
// normalizes the deterministic location parser output. The provider payload
// is validated with Zod before any field is read.

import { z } from "zod";
import { fetchGuardedJson, type GuardedFetchFailure } from "./fetch";
import type { fetch as undiciFetch } from "undici";

export const GREENHOUSE_API_HOST = "boards-api.greenhouse.io";

const greenhouseBoardResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string().min(1),
      absolute_url: z.string().url(),
      location: z.object({ name: z.string() }).nullable().optional(),
      content: z.string().optional(),
      updated_at: z.string().optional(),
      departments: z.array(z.object({ name: z.string() })).optional(),
      offices: z.array(z.object({ name: z.string() })).optional(),
    })
  ),
});

export type NormalizedCatalogJob = {
  externalId: string;
  title: string;
  rawLocation: string | null;
  locations: string[];
  workMode: "onsite" | "hybrid" | "remote" | "unknown";
  department: string | null;
  applyUrl: string;
  snippet: string;
  publishedAt: string | null;
};

export type FetchJobBoardResult =
  | { ok: true; jobs: NormalizedCatalogJob[]; bytes: number }
  | (GuardedFetchFailure | { ok: false; reason: "invalid_payload" });

export async function fetchJobBoard(
  source: { provider: string; boardToken: string },
  opts: { fetchImpl?: typeof undiciFetch } = {}
): Promise<FetchJobBoardResult> {
  if (source.provider !== "greenhouse") return { ok: false, reason: "invalid_input" };
  // The token is a board slug, never a URL: reject anything with URL anatomy
  // before a request is made.
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(source.boardToken)) return { ok: false, reason: "invalid_input" };
  const url = `https://${GREENHOUSE_API_HOST}/v1/boards/${encodeURIComponent(source.boardToken)}/jobs?content=true`;
  const res = await fetchGuardedJson(url, { allowedHost: GREENHOUSE_API_HOST, fetchImpl: opts.fetchImpl });
  if (!res.ok) return res;
  const parsed = greenhouseBoardResponseSchema.safeParse(res.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };
  return { ok: true, jobs: parseGreenhouseJobs(parsed.data), bytes: res.bytes };
}

const LOCATION_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  nyc: "New York",
  "new york city": "New York",
  sf: "San Francisco",
};

export function parseGreenhouseLocation(raw: string | null | undefined): {
  locations: string[];
  workMode: "onsite" | "hybrid" | "remote" | "unknown";
} {
  if (!raw || !raw.trim()) return { locations: [], workMode: "unknown" };
  let text = raw.trim();
  let workMode: "onsite" | "hybrid" | "remote" = "onsite";
  if (/\bhybrid\b/i.test(text)) {
    workMode = "hybrid";
    text = text.replace(/[(,]?\s*\bhybrid\b\s*[)]?/gi, " ").trim();
  }
  if (/\bremote\b/i.test(text)) {
    const rest = text.replace(/[(,]?\s*\bremote\b\s*[)]?/gi, " ").replace(/^\s*[-–/]\s*/, "").trim();
    if (!rest) {
      return { locations: ["Remote"], workMode: workMode === "hybrid" ? "hybrid" : "remote" };
    }
    if (workMode !== "hybrid") workMode = "remote";
    text = rest.replace(/^from\s+/i, "").replace(/^the\s+(?=(?:US|USA|United States)\b)/i, "");
  }
  // Real boards join multi-city labels with commas ("Seattle, San Francisco,
  // New York City"). Split only on 2+ commas so "London, UK" stays one label.
  const parts = text
    .split(text.split(",").length >= 3 ? /\s*,\s*/ : /\s*;\s*|\s+\/\s+|\s+or\s+/i)
    .map((p) => p.trim().replace(/^[–-]\s*/, "").replace(/\s*[–-]$/, ""))
    .filter(Boolean)
    .map((p) => LOCATION_ALIASES[p.toLowerCase()] ?? p);
  return { locations: parts, workMode };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGreenhouseJobs(payload: unknown): NormalizedCatalogJob[] {
  const parsed = greenhouseBoardResponseSchema.parse(payload);
  return parsed.jobs.map((job) => {
    const rawLocation = job.location?.name ?? null;
    const parsed = parseGreenhouseLocation(rawLocation);
    // Boards that label the location with only a work-mode word ("Hybrid")
    // carry the real cities in the offices list (Cloudflare: 346/454 jobs).
    const locations = parsed.locations.length === 0 && job.offices?.length ? job.offices.map((o) => o.name) : parsed.locations;
    const workMode = parsed.workMode;
    const updatedAt = job.updated_at ? new Date(job.updated_at) : null;
    return {
      externalId: String(job.id),
      title: job.title,
      rawLocation,
      locations,
      workMode,
      department: job.departments?.[0]?.name ?? null,
      applyUrl: job.absolute_url,
      snippet: stripHtml(job.content ?? "").slice(0, 400),
      publishedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : null,
    };
  });
}
