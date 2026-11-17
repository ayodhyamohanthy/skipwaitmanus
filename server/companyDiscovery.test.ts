import { describe, expect, it, vi } from "vitest";
import { COMPANY_DISCOVERY_CACHE_TTL_MS, discoverCompanies, domainFromOfficialUrl, type DiscoveryFetch } from "./companyDiscovery";

const SEARCH_GOOGLE = { search: [{ id: "Q95", label: "Google" }, { id: "Q8093", label: "Google Analytics" }] };
const ENTITIES_GOOGLE = {
  entities: {
    Q95: {
      labels: { en: { value: "Google" } },
      claims: {
        P856: [{ mainsnak: { datavalue: { value: "https://www.google.com/" } } }],
        P154: [{ mainsnak: { datavalue: { value: "Google_2015_logo.svg" } } }],
      },
    },
    Q8093: { labels: { en: { value: "Google Analytics" } }, claims: {} },
  },
};
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });

/** Routes calls by URL: entity search, entity fetch, Wikipedia opensearch. */
function fakeFetch(handlers: { search?: (term: string) => unknown; entities?: unknown; opensearch?: unknown }): DiscoveryFetch & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const parsed = new URL(url);
    const action = parsed.searchParams.get("action");
    if (action === "wbsearchentities") return json(handlers.search ? handlers.search(parsed.searchParams.get("search") ?? "") : { search: [] });
    if (action === "wbgetentities") return json(handlers.entities ?? { entities: {} });
    if (action === "opensearch") return json(handlers.opensearch ?? ["", []]);
    throw new Error(`unexpected url ${url}`);
  }) as DiscoveryFetch & ReturnType<typeof vi.fn>;
}

describe("domainFromOfficialUrl", () => {
  it("takes the host, lowercase, without www", () => {
    expect(domainFromOfficialUrl("https://www.google.com/")).toBe("google.com");
    expect(domainFromOfficialUrl("http://Careers.Tata.com/jobs")).toBe("careers.tata.com");
  });
  it("rejects non-URLs and bare hosts", () => {
    expect(domainFromOfficialUrl("not a url")).toBeUndefined();
    expect(domainFromOfficialUrl("https://localhost")).toBeUndefined();
  });
});

describe("discoverCompanies", () => {
  it("maps Wikidata entities to name + official domain + logo, drops entities without an official website", async () => {
    const fetchImpl = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    const results = await discoverCompanies("google", { fetchImpl });
    expect(results).toEqual([{ name: "Google", domain: "google.com", logoUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Google_2015_logo.svg?width=64", source: "wikidata" }]);
  });

  it("dedupes candidates by domain and keeps source rank order", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q1" }, { id: "Q2" }, { id: "Q3" }] }),
      entities: {
        entities: {
          Q1: { labels: { en: { value: "First" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://a.example.com" } } }] } },
          Q2: { labels: { en: { value: "Second" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://www.a.example.com" } } }] } },
          Q3: { labels: { en: { value: "Third" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://b.example.com" } } }] } },
        },
      },
    });
    const results = await discoverCompanies(`dedupe-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["First", "Third"]);
  });

  it("repairs the spelling through Wikipedia OpenSearch and asks Wikidata once more", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch({
      search: term => { calls.push(term); return term === "Google" ? SEARCH_GOOGLE : { search: [] }; },
      entities: ENTITIES_GOOGLE,
      opensearch: ["googel", ["Google"]],
    });
    const results = await discoverCompanies("googel", { fetchImpl });
    expect(calls).toEqual(["googel", "Google"]);
    expect(results.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });

  it("answers [] when every source misses, without inventing a company", async () => {
    const fetchImpl = fakeFetch({ search: () => ({ search: [] }), opensearch: ["zzqx-never", []] });
    expect(await discoverCompanies("zzqx-never-a-company", { fetchImpl })).toEqual([]);
  });

  it("caches within the TTL and refetches after it", async () => {
    const fetchImpl = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    const key = `cache-${Date.now()}`;
    const t0 = 1_000_000;
    await discoverCompanies(key, { fetchImpl, nowMs: t0 });
    await discoverCompanies(key, { fetchImpl, nowMs: t0 + 1_000 });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    await discoverCompanies(key, { fetchImpl, nowMs: t0 + COMPANY_DISCOVERY_CACHE_TTL_MS + 1 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(2);
  });

  it("a provider failure answers the stale cache when present, else [], and never throws", async () => {
    const key = `stale-${Date.now()}`;
    const t0 = 5_000_000;
    const good = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    await discoverCompanies(key, { fetchImpl: good, nowMs: t0 });
    const boom: DiscoveryFetch = async () => { throw new Error("wikidata down"); };
    const stale = await discoverCompanies(key, { fetchImpl: boom, nowMs: t0 + COMPANY_DISCOVERY_CACHE_TTL_MS + 1 });
    expect(stale.map(candidate => candidate.domain)).toEqual(["google.com"]);
    expect(await discoverCompanies(`fresh-${Date.now()}`, { fetchImpl: boom })).toEqual([]);
  });

  it("treats malformed provider payloads as a miss, not a crash", async () => {
    const fetchImpl: DiscoveryFetch = async () => json({ unexpected: true });
    expect(await discoverCompanies(`weird-${Date.now()}`, { fetchImpl })).toEqual([]);
  });

  it("answers [] for a blank query without any call", async () => {
    const fetchImpl = fakeFetch({});
    expect(await discoverCompanies("   ", { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
