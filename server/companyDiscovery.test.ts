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

describe("company qualification (D-174-worldwide-discovery review: never suggest a non-company)", () => {
  it("drops a village with an official domain and keeps the real company (the Zoho regression)", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q36881", label: "Zoho Corporation" }, { id: "Q999001", label: "Zohor" }] }),
      entities: {
        entities: {
          Q36881: {
            labels: { en: { value: "Zoho Corporation" } },
            descriptions: { en: { value: "Indian multinational technology company" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q4830453" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://www.zoho.com/" } } }],
            },
          },
          Q999001: {
            labels: { en: { value: "Zohor" } },
            descriptions: { en: { value: "municipality in Slovakia" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q6784672" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://www.obeczohor.sk/" } } }],
            },
          },
        },
      },
    });
    const results = await discoverCompanies(`zoho-qualify-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Zoho Corporation"]);
  });

  it("drops product and knowledge-graph noise even when it carries an official domain", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q95", label: "Google" }, { id: "Q999002", label: "Google Knowledge Graph" }, { id: "Q999003", label: "Google Play" }] }),
      entities: {
        entities: {
          Q95: {
            labels: { en: { value: "Google" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q891723" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://about.google/" } } }],
            },
          },
          Q999002: {
            labels: { en: { value: "Google Knowledge Graph" } },
            descriptions: { en: { value: "knowledge base used by Google" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q3305213" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://knowledgegraph.google.example/" } } }],
            },
          },
          Q999003: {
            labels: { en: { value: "Google Play" } },
            descriptions: { en: { value: "digital distribution service operated by Google" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q16889138" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://play.google.example/" } } }],
            },
          },
        },
      },
    });
    const results = await discoverCompanies(`google-qualify-${Date.now()}`, { fetchImpl });
    expect(results).toEqual([{ name: "Google", domain: "about.google", source: "wikidata" }]);
  });

  it("keeps a long-tail company qualified by its description when its instance-of is not a company class", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q999004", label: "Example Games" }] }),
      entities: {
        entities: {
          Q999004: {
            labels: { en: { value: "Example Games" } },
            descriptions: { en: { value: "American video game company" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q210167" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://example-games.example.com/" } } }],
            },
          },
        },
      },
    });
    const results = await discoverCompanies(`longtail-qualify-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Example Games"]);
  });

  it("keeps a sparse long-tail entry with an official domain and no type evidence, and drops one whose only evidence says otherwise", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q999005", label: "Sparse Co" }, { id: "Q999006", label: "Notaco Band" }] }),
      entities: {
        entities: {
          Q999005: {
            labels: { en: { value: "Sparse Co" } },
            claims: { P856: [{ mainsnak: { datavalue: { value: "https://sparse-co.example.com/" } } }] },
          },
          Q999006: {
            labels: { en: { value: "Notaco Band" } },
            descriptions: { en: { value: "Norwegian black metal band" } },
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: "Q215380" } } } }],
              P856: [{ mainsnak: { datavalue: { value: "https://notaco.example.com/" } } }],
            },
          },
        },
      },
    });
    const results = await discoverCompanies(`sparse-qualify-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Sparse Co"]);
  });
});

describe("review findings: failure honesty, boundary validation, traffic bounds, typed precedence", () => {
  it("a 429/5xx from the source is a failure: answers stale-or-[] and caches nothing", async () => {
    const key = `ratelimited-${Date.now()}`;
    const limited = fakeFetch({ search: () => ({ error: true }), entities: { entities: {} } });
    const failing: DiscoveryFetch = async () => ({ ok: false, json: async () => ({}) });
    expect(await discoverCompanies(key, { fetchImpl: failing })).toEqual([]);
    // The failed read was not cached: a recovered source answers for real.
    const recovered = await discoverCompanies(key, { fetchImpl: fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE }) });
    expect(recovered.map(candidate => candidate.domain)).toEqual(["google.com"]);
    expect(limited).not.toHaveBeenCalled();
  });

  it("a non-OK entity fetch is a failure too, not an empty answer to cache", async () => {
    const key = `entities-down-${Date.now()}`;
    const failing: DiscoveryFetch = async (url: string) =>
      new URL(url).searchParams.get("action") === "wbgetentities" ? { ok: false, json: async () => ({}) } : json(SEARCH_GOOGLE);
    expect(await discoverCompanies(key, { fetchImpl: failing })).toEqual([]);
    const recovered = await discoverCompanies(key, { fetchImpl: fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE }) });
    expect(recovered.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });

  it("drops candidates the response schema rejects (IP host, personal-mail domain, overlong fields) and keeps the valid one", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q1" }, { id: "Q2" }, { id: "Q3" }, { id: "Q4" }, { id: "Q5" }] }),
      entities: {
        entities: {
          Q1: { labels: { en: { value: "IP Host Co" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "http://192.168.10.4/" } } }] } },
          Q2: { labels: { en: { value: "Mail Domain Co" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://gmail.com/" } } }] } },
          Q3: { labels: { en: { value: `Long ${"x".repeat(200)}` } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://long-name.example.com/" } } }] } },
          Q4: { labels: { en: { value: "Logo Bomb Co" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://logobomb.example.com/" } } }], P154: [{ mainsnak: { datavalue: { value: `file-${"y".repeat(600)}.svg` } } }] } },
          Q5: { labels: { en: { value: "Valid Co" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://valid.example.com/" } } }] } },
        },
      },
    });
    const results = await discoverCompanies(`schema-guard-${Date.now()}`, { fetchImpl });
    expect(results).toEqual([{ name: "Valid Co", domain: "valid.example.com", source: "wikidata" }]);
  });

  it("never spends a source call on a single character", async () => {
    const fetchImpl = fakeFetch({});
    expect(await discoverCompanies("a", { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shares one in-flight upstream round across concurrent asks for the same name", async () => {
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    const fetchImpl: DiscoveryFetch & ReturnType<typeof vi.fn> = vi.fn(async (url: string) => {
      await gate;
      const action = new URL(url).searchParams.get("action");
      if (action === "wbsearchentities") return json(SEARCH_GOOGLE);
      if (action === "wbgetentities") return json(ENTITIES_GOOGLE);
      return json(["", []]);
    }) as DiscoveryFetch & ReturnType<typeof vi.fn>;
    const key = `inflight-${Date.now()}`;
    const first = discoverCompanies(key, { fetchImpl });
    const second = discoverCompanies(key, { fetchImpl });
    release(null);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(fetchImpl.mock.calls.filter(call => String(call[0]).includes("wbsearchentities"))).toHaveLength(1);
  });

  it("typed non-company precedence: product/suite/site wording in the description cannot rescue a typed non-company", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q11" }, { id: "Q12" }, { id: "Q13" }] }),
      entities: {
        entities: {
          Q11: {
            labels: { en: { value: "Zoho Office Suite" } },
            descriptions: { en: { value: "suite of business applications" } },
            claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q506240" } } } }], P856: [{ mainsnak: { datavalue: { value: "https://www.zoho-suite.example.com/" } } }] },
          },
          Q12: {
            labels: { en: { value: "Tata Production Site" } },
            descriptions: { en: { value: "production site of the company" } },
            claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q35127" } } } }], P856: [{ mainsnak: { datavalue: { value: "https://tata-site.example.com/" } } }] },
          },
          Q13: {
            labels: { en: { value: "Real Company" } },
            descriptions: { en: { value: "Indian manufacturing company" } },
            claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q783794" } } } }], P856: [{ mainsnak: { datavalue: { value: "https://realcompany.example.com/" } } }] },
          },
        },
      },
    });
    const results = await discoverCompanies(`typed-precedence-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Real Company"]);
  });

  it("dedupes subdomain variants of the same door", async () => {
    const fetchImpl = fakeFetch({
      search: () => ({ search: [{ id: "Q21" }, { id: "Q22" }] }),
      entities: {
        entities: {
          Q21: { labels: { en: { value: "Example Corp" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://example-corp.com/" } } }] } },
          Q22: { labels: { en: { value: "Example Corp Play" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://play.example-corp.com/" } } }] } },
        },
      },
    });
    const results = await discoverCompanies(`subdomain-dedupe-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Example Corp"]);
  });
});
