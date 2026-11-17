// Worldwide company discovery (D-174-worldwide-discovery; frozen spec
// docs/plans/DECISION-SYNC-discovery-oct25.md): automatic company candidates
// from free, keyless sources while the seeker types. Wikidata is primary
// (entity search, official website P856, logo P154); Wikipedia OpenSearch
// repairs the spelling for one second Wikidata pass. Identity is the
// official domain: entities without one are not shown as companies.
// Honest failure: any provider error answers with whatever a fresh or stale
// cache holds, never an invented result and never a "no such company" claim.
import { z } from "zod";
import type { DiscoveredCompany } from "../shared/companies";

export const COMPANY_DISCOVERY_ENABLED = true;
export const COMPANY_DISCOVERY_LIMIT = 5;
export const COMPANY_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const COMPANY_DISCOVERY_CACHE_MAX_KEYS = 500;
export const COMPANY_DISCOVERY_TIMEOUT_MS = 4_000;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_OPENSEARCH = "https://en.wikipedia.org/w/api.php";
const COMMONS_FILE_PATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const USER_AGENT = "SkipWait/1.0 (https://skipwait.me; company discovery)";

type FetchResponse = { ok: boolean; json(): Promise<unknown> };
export type DiscoveryFetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponse>;
export type DiscoveryDeps = { fetchImpl?: DiscoveryFetch; nowMs?: number };

const searchSchema = z.object({
  search: z.array(z.object({ id: z.string().regex(/^Q\d+$/), label: z.string().optional() })).catch([]),
});
const entitiesSchema = z.object({
  entities: z.record(z.string(), z.object({
    labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
    claims: z.object({
      P856: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string() }).optional() }) })).optional(),
      P154: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string() }).optional() }) })).optional(),
    }).optional(),
  })),
});
const openSearchSchema = z.tuple([z.string(), z.array(z.string()).catch([])]);

const cache = new Map<string, { at: number; results: DiscoveredCompany[] }>();

/** Host of an official-website URL, lowercase, no leading www.; undefined when the value is not a usable URL. */
export function domainFromOfficialUrl(value: string): string | undefined {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : undefined;
  } catch {
    return undefined;
  }
}

async function wikidataSearchIds(fetchImpl: DiscoveryFetch, term: string): Promise<{ id: string; label?: string }[]> {
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&format=json&limit=8&type=item`;
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(COMPANY_DISCOVERY_TIMEOUT_MS) });
  if (!response.ok) return [];
  return searchSchema.parse(await response.json()).search;
}

/** One Wikipedia OpenSearch suggestion when it differs from the typed term (spelling repair), else undefined. */
async function wikipediaSuggestion(fetchImpl: DiscoveryFetch, term: string): Promise<string | undefined> {
  const url = `${WIKIPEDIA_OPENSEARCH}?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json`;
  const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(COMPANY_DISCOVERY_TIMEOUT_MS) });
  if (!response.ok) return undefined;
  const suggestion = openSearchSchema.parse(await response.json())[1][0]?.trim();
  return suggestion && suggestion.toLowerCase() !== term.trim().toLowerCase() ? suggestion : undefined;
}

/** Resolve the typed name to worldwide candidates: name + official domain + optional logo, in source rank order. */
export async function discoverCompanies(query: string, deps: DiscoveryDeps = {}): Promise<DiscoveredCompany[]> {
  const q = query.trim();
  if (!q) return [];
  const now = deps.nowMs ?? Date.now();
  const fetchImpl = deps.fetchImpl ?? (fetch as unknown as DiscoveryFetch);
  const key = q.toLowerCase();
  const fresh = cache.get(key);
  if (fresh && now - fresh.at < COMPANY_DISCOVERY_CACHE_TTL_MS) return fresh.results;
  try {
    let hits = await wikidataSearchIds(fetchImpl, q);
    if (hits.length === 0) {
      const repaired = await wikipediaSuggestion(fetchImpl, q);
      if (repaired) hits = await wikidataSearchIds(fetchImpl, repaired);
    }
    let results: DiscoveredCompany[] = [];
    if (hits.length > 0) {
      const url = `${WIKIDATA_API}?action=wbgetentities&ids=${hits.map(hit => hit.id).join("|")}&props=claims|labels&languages=en&format=json`;
      const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(COMPANY_DISCOVERY_TIMEOUT_MS) });
      if (response.ok) {
        const { entities } = entitiesSchema.parse(await response.json());
        const seen = new Set<string>();
        results = hits.flatMap((hit, index) => {
          const entity = entities[hit.id];
          if (!entity) return [];
          const name = entity.labels?.en?.value ?? hit.label ?? "";
          const domain = entity.claims?.P856?.map(claim => claim.mainsnak.datavalue?.value).find(value => value && domainFromOfficialUrl(value));
          const host = domain ? domainFromOfficialUrl(domain) : undefined;
          if (!name || !host || seen.has(host)) return [];
          seen.add(host);
          const logo = entity.claims?.P154?.[0]?.mainsnak.datavalue?.value;
          return [{ name, domain: host, ...(logo ? { logoUrl: `${COMMONS_FILE_PATH}${encodeURIComponent(logo)}?width=64` } : {}), source: "wikidata" as const, _rank: index }];
        }).map(({ _rank, ...company }) => company).slice(0, COMPANY_DISCOVERY_LIMIT);
      }
    }
    remember(key, now, results);
    return results;
  } catch {
    // Provider failure answers the stale cache when we have one, else nothing; the directory results stand on their own.
    return fresh?.results ?? [];
  }
}

function remember(key: string, at: number, results: DiscoveredCompany[]): void {
  cache.delete(key);
  cache.set(key, { at, results });
  while (cache.size > COMPANY_DISCOVERY_CACHE_MAX_KEYS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
