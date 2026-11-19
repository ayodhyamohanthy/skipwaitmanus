// Worldwide company discovery (D-174-worldwide-discovery; frozen spec
// docs/plans/DECISION-SYNC-discovery-oct25.md): automatic company candidates
// from free, keyless sources while the seeker types. Wikidata is primary
// (entity search, official website P856, logo P154); Wikipedia OpenSearch
// repairs the spelling for one second Wikidata pass. Identity is the
// official domain: entities without one are not shown as companies.
// Honest failure: any provider error answers with whatever a fresh or stale
// cache holds, never an invented result and never a "no such company" claim.
import { z } from "zod";
import { discoveredCompanySchema, type DiscoveredCompany } from "../shared/companies";

export const COMPANY_DISCOVERY_ENABLED = true;
export const COMPANY_DISCOVERY_LIMIT = 5;
export const COMPANY_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const COMPANY_DISCOVERY_CACHE_MAX_KEYS = 500;
export const COMPANY_DISCOVERY_TIMEOUT_MS = 4_000;
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIPEDIA_OPENSEARCH = "https://en.wikipedia.org/w/api.php";
const COMMONS_FILE_PATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const USER_AGENT = "SkipWait/1.0 (https://skipwait.me; company discovery)";

type FetchResponse = { ok: boolean; status?: number; json(): Promise<unknown> };
export type DiscoveryFetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<FetchResponse>;
export type DiscoveryDeps = { fetchImpl?: DiscoveryFetch; nowMs?: number; clientKey?: string };

const searchSchema = z.object({
  search: z.array(z.object({ id: z.string().regex(/^Q\d+$/), label: z.string().optional() })).catch([]),
});
const entitiesSchema = z.object({
  entities: z.record(z.string(), z.object({
    labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
    descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(),
    claims: z.object({
      P31: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.object({ id: z.string() }).passthrough().optional() }) }) })).optional(),
      P856: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string() }).optional() }) })).optional(),
      P154: z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.string() }).optional() }) })).optional(),
    }).optional(),
  })),
});
// The real OpenSearch answer is a 4-element array [term, titles, descriptions, urls];
// an exact-length tuple would throw on it, and the throw surfaced every true no-match
// query as degraded/unavailable instead of a clean empty answer. Extra items are
// allowed and only the titles element is read.
const openSearchSchema = z.tuple([z.string(), z.array(z.string()).catch([])]).rest(z.unknown());

const cache = new Map<string, { at: number; results: DiscoveredCompany[] }>();

/** Wikidata instance-of (P31) classes that make an entity a company/business in its own right. */
const COMPANY_TYPE_QIDS = new Set([
  "Q783794", // company
  "Q4830453", // business
  "Q6881511", // enterprise
  "Q43229", // organization
  "Q891723", // public company
  "Q1589009", // privately held company
  "Q658255", // subsidiary
  "Q169196", // holding company
  "Q161726", // multinational corporation
  "Q163740", // nonprofit organization
]);
const NON_COMPANY_TYPE_QIDS = new Set([
  "Q532", // village
  "Q15284", // municipality
  "Q6784672", // municipality of Slovakia
  "Q3305213", // knowledge graph
  "Q7397", // software
  "Q506240", // office suite
  "Q620615", // mobile application
  "Q35127", // website
  "Q2424752", // product
  "Q215380", // musical group
  "Q11424", // film
  "Q7889", // video game
  "Q5398426", // television series
]);
const COMPANY_DESCRIPTION = /\b(compan(?:y|ies)|corporat\w*|business|enterprise|firm|startup|conglomerate|manufactur\w*|retailer|airline|bank)\b/i;

type EntityTypeEvidence = {
  descriptions?: Record<string, { value: string }>;
  claims?: { P31?: { mainsnak: { datavalue?: { value?: { id?: string } } } }[] };
};

/**
 * A candidate is suggested only with source-backed company evidence: a company/business
 * instance-of class, or a description that says it is one (covers subclasses like
 * "video game developer"), or - for sparse long-tail entries - no type evidence at
 * all. An entity typed as something else (village, knowledge graph, product) is never
 * suggested as a company, however official its domain is.
 */
export function isCompanyCandidate(entity: EntityTypeEvidence): boolean {
  const types = (entity.claims?.P31 ?? []).map(claim => claim.mainsnak.datavalue?.value?.id).filter((id): id is string => Boolean(id));
  if (types.some(id => COMPANY_TYPE_QIDS.has(id))) return true;
  if (types.some(id => NON_COMPANY_TYPE_QIDS.has(id))) return false;
  const description = entity.descriptions?.en?.value ?? "";
  if (COMPANY_DESCRIPTION.test(description)) return true;
  return types.length === 0 && !description;
}

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
  // 429/5xx is a provider failure, not an empty answer: throw so nothing caches it.
  if (!response.ok) throw httpFailure("wikidata search", response.status);
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

const inflight = new Map<string, Promise<DiscoveryOutcome>>();

/** Minimum query length: single characters never reach the sources. */
export const COMPANY_DISCOVERY_MIN_QUERY = 2;
/** At most this many upstream rounds run at once; the rest degrade to cache-or-nothing. */
export const DISCOVERY_MAX_CONCURRENT_UPSTREAM = 4;
/** After a source 429, all discovery upstream calls pause for this long. Directory answers are unaffected. */
export const DISCOVERY_RATE_LIMIT_COOLDOWN_MS = 60_000;
/** After this many consecutive upstream failures (5xx, timeout, network), a short breaker pauses all discovery upstream calls. */
export const DISCOVERY_BREAKER_FAILURES = 3;
export const DISCOVERY_BREAKER_OPEN_MS = 30_000;
/** Per-client upstream budget: distinct name chains per window. A chain is one bounded typing run: a free
 * transition must extend or shorten the MOST RECENT name this client asked, within a typing gap, and only a
 * few times - so ordinary typing never exhausts the budget, but many distinct names sharing a short prefix
 * ("goaa", "goab", ...) are distinct chains and do. */
export const DISCOVERY_CLIENT_BUDGET = 20;
export const DISCOVERY_CLIENT_WINDOW_MS = 10 * 60 * 1000;
export const DISCOVERY_CHAIN_GAP_MS = 30_000;
export const DISCOVERY_CHAIN_MAX_FREE = 8;
const DISCOVERY_CLIENT_BUDGET_MAX_KEYS = 1_000;

export type DiscoveryDegradedReason = "rate_limited" | "budget" | "saturated" | "upstream";
/** The discovery answer plus its health: degraded means the candidates are incomplete (limits or an upstream
 * failure) and the route must say so and never let the answer be publicly cached. */
export type DiscoveryOutcome = { companies: DiscoveredCompany[]; degraded: boolean; reason?: DiscoveryDegradedReason };

let rateLimitedUntil = 0;
let breakerUntil = 0;
let consecutiveFailures = 0;
let activeUpstream = 0;
const clientBudget = new Map<string, { start: number; used: number; lastName: string; lastAt: number; freeUsed: number }>();

const httpFailure = (what: string, status?: number) => Object.assign(new Error(`${what} HTTP failure`), { status: status ?? 0 });

/** One client's budget for new upstream rounds. A free transition is bounded real typing: it extends or
 * shortens the client's most recent name, within DISCOVERY_CHAIN_GAP_MS, at most DISCOVERY_CHAIN_MAX_FREE
 * times in a row. Anything else is a new chain and spends. true when this round may proceed. */
function spendClientBudget(clientKey: string, name: string, now: number): boolean {
  let entry = clientBudget.get(clientKey);
  if (!entry || now - entry.start >= DISCOVERY_CLIENT_WINDOW_MS) {
    entry = { start: now, used: 0, lastName: "", lastAt: 0, freeUsed: 0 };
    clientBudget.delete(clientKey);
    clientBudget.set(clientKey, entry);
    while (clientBudget.size > DISCOVERY_CLIENT_BUDGET_MAX_KEYS) {
      const oldest = clientBudget.keys().next().value;
      if (oldest === undefined) break;
      clientBudget.delete(oldest);
    }
  }
  const continues = entry.lastName.length > 0
    && (name.startsWith(entry.lastName) || entry.lastName.startsWith(name))
    && now - entry.lastAt <= DISCOVERY_CHAIN_GAP_MS
    && entry.freeUsed < DISCOVERY_CHAIN_MAX_FREE;
  if (continues) {
    entry.lastName = name;
    entry.lastAt = now;
    entry.freeUsed += 1;
    return true;
  }
  if (entry.used >= DISCOVERY_CLIENT_BUDGET) return false;
  entry.used += 1;
  entry.lastName = name;
  entry.lastAt = now;
  entry.freeUsed = 0;
  return true;
}

/** Resolve the typed name to worldwide candidates: name + official domain + optional logo, in source rank order. */
export function discoverCompanies(query: string, deps: DiscoveryDeps = {}): Promise<DiscoveryOutcome> {
  const q = query.trim();
  if (q.length < COMPANY_DISCOVERY_MIN_QUERY) return Promise.resolve({ companies: [], degraded: false });
  const now = deps.nowMs ?? Date.now();
  const key = q.toLowerCase();
  const fresh = cache.get(key);
  if (fresh && now - fresh.at < COMPANY_DISCOVERY_CACHE_TTL_MS) return Promise.resolve({ companies: fresh.results, degraded: false });
  const stale = () => ({ companies: fresh?.results ?? [] });
  // Aggregate bounds, checked before any budget is spent: a source rate-limit or an open failure breaker pauses
  // all upstream calls; the directory answer never depends on any of this. Every degraded answer is marked so
  // the route can say so and keep it out of shared caches.
  if (now < rateLimitedUntil) return Promise.resolve({ ...stale(), degraded: true, reason: "rate_limited" });
  if (now < breakerUntil) return Promise.resolve({ ...stale(), degraded: true, reason: "upstream" });
  // One upstream round per typed name: concurrent asks share the in-flight promise and never double-spend.
  const pending = inflight.get(key);
  if (pending) return pending;
  if (activeUpstream >= DISCOVERY_MAX_CONCURRENT_UPSTREAM) return Promise.resolve({ ...stale(), degraded: true, reason: "saturated" });
  if (deps.clientKey && !spendClientBudget(deps.clientKey, key, now)) return Promise.resolve({ ...stale(), degraded: true, reason: "budget" });
  activeUpstream += 1;
  const run = discoverUncached(q, key, now, deps.fetchImpl ?? (fetch as unknown as DiscoveryFetch))
    .finally(() => { activeUpstream -= 1; inflight.delete(key); });
  inflight.set(key, run);
  return run;
}

async function discoverUncached(q: string, key: string, now: number, fetchImpl: DiscoveryFetch): Promise<DiscoveryOutcome> {
  const fresh = cache.get(key);
  try {
    let hits = await wikidataSearchIds(fetchImpl, q);
    if (hits.length === 0) {
      const repaired = await wikipediaSuggestion(fetchImpl, q);
      if (repaired) hits = await wikidataSearchIds(fetchImpl, repaired);
    }
    let results: DiscoveredCompany[] = [];
    if (hits.length > 0) {
      const url = `${WIKIDATA_API}?action=wbgetentities&ids=${hits.map(hit => hit.id).join("|")}&props=claims|labels|descriptions&languages=en&format=json`;
      const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(COMPANY_DISCOVERY_TIMEOUT_MS) });
      if (!response.ok) throw httpFailure("wikidata entities", response.status);
      const { entities } = entitiesSchema.parse(await response.json());
      const seen: string[] = [];
      results = hits.flatMap((hit, index) => {
        const entity = entities[hit.id];
        if (!entity || !isCompanyCandidate(entity)) return [];
        const name = entity.labels?.en?.value ?? hit.label ?? "";
        const domain = entity.claims?.P856?.map(claim => claim.mainsnak.datavalue?.value).find(value => value && domainFromOfficialUrl(value));
        const host = domain ? domainFromOfficialUrl(domain) : undefined;
        // Domain identity, subdomain-aware: play.example.com after example.com is the same door.
        if (!name || !host || seen.some(held => held === host || host.endsWith(`.${held}`) || held.endsWith(`.${host}`))) return [];
        const logo = entity.claims?.P154?.[0]?.mainsnak.datavalue?.value;
        const candidate = { name, domain: host, ...(logo ? { logoUrl: `${COMMONS_FILE_PATH}${encodeURIComponent(logo)}?width=64` } : {}), source: "wikidata" as const };
        // Nothing malformed crosses the boundary: an entry the response schema rejects is dropped,
        // never allowed to fail the whole search response.
        const parsed = discoveredCompanySchema.safeParse(candidate);
        if (!parsed.success) return [];
        seen.push(host);
        return [{ ...parsed.data, _rank: index }];
      }).map(({ _rank, ...company }) => company).slice(0, COMPANY_DISCOVERY_LIMIT);
    }
    // Only real answers are cached; failures and empty reads are never remembered (no 6h poison).
    if (results.length > 0) remember(key, now, results);
    consecutiveFailures = 0;
    return { companies: results, degraded: false };
  } catch (error) {
    // A source 429 pauses every discovery upstream call for the cooldown; other failures (5xx, timeout,
    // network) count toward a short breaker. Directory answers stand either way.
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      rateLimitedUntil = now + DISCOVERY_RATE_LIMIT_COOLDOWN_MS;
    } else {
      consecutiveFailures += 1;
      if (consecutiveFailures >= DISCOVERY_BREAKER_FAILURES) {
        breakerUntil = now + DISCOVERY_BREAKER_OPEN_MS;
        consecutiveFailures = 0;
      }
    }
    // Provider failure answers the stale cache when we have one, else nothing - and says so: degraded,
    // never publicly cached, never indistinguishable from "no such company".
    return { companies: fresh?.results ?? [], degraded: true, reason: status === 429 ? "rate_limited" : "upstream" };
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
