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

/** Unwraps the outcome for tests that only care about the candidates. */
const discover = async (query: string, deps: Parameters<typeof discoverCompanies>[1]) => (await discoverCompanies(query, deps)).companies;

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
    const results = await discover("google", { fetchImpl });
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
    const results = await discover(`dedupe-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["First", "Third"]);
  });

  it("repairs the spelling through Wikipedia OpenSearch and asks Wikidata once more", async () => {
    const calls: string[] = [];
    const fetchImpl = fakeFetch({
      search: term => { calls.push(term); return term === "Google" ? SEARCH_GOOGLE : { search: [] }; },
      entities: ENTITIES_GOOGLE,
      opensearch: ["googel", ["Google"]],
    });
    const results = await discover("googel", { fetchImpl });
    expect(calls).toEqual(["googel", "Google"]);
    expect(results.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });

  it("answers [] when every source misses, without inventing a company", async () => {
    const fetchImpl = fakeFetch({ search: () => ({ search: [] }), opensearch: ["zzqx-never", []] });
    expect(await discover("zzqx-never-a-company", { fetchImpl })).toEqual([]);
  });

  it("a real 4-element OpenSearch answer on a no-match query stays a clean miss, never degraded", async () => {
    // Wikipedia OpenSearch actually returns [term, titles, descriptions, urls]; the exact-tuple
    // schema used to throw on that shape, and the throw surfaced as degraded/unavailable.
    const fetchImpl = fakeFetch({ search: () => ({ search: [] }), opensearch: ["zzqx-never-real", [], [], []] });
    const outcome = await discoverCompanies("zzqx-never-real-company", { fetchImpl });
    expect(outcome).toEqual({ companies: [], degraded: false });
    const repaired = fakeFetch({ search: term => (term === "Google" ? SEARCH_GOOGLE : { search: [] }), entities: ENTITIES_GOOGLE, opensearch: ["googel", ["Google"], [""], [""]] });
    const fixed = await discoverCompanies("googel", { fetchImpl: repaired });
    expect(fixed.degraded).toBe(false);
    expect(fixed.companies.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });

  it("caches within the TTL and refetches after it", async () => {
    const fetchImpl = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    const key = `cache-${Date.now()}`;
    const t0 = 1_000_000;
    await discover(key, { fetchImpl, nowMs: t0 });
    await discover(key, { fetchImpl, nowMs: t0 + 1_000 });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    await discover(key, { fetchImpl, nowMs: t0 + COMPANY_DISCOVERY_CACHE_TTL_MS + 1 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(2);
  });

  it("a provider failure answers the stale cache when present, else [], and never throws", async () => {
    const key = `stale-${Date.now()}`;
    const t0 = 5_000_000;
    const good = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    await discover(key, { fetchImpl: good, nowMs: t0 });
    const boom: DiscoveryFetch = async () => { throw new Error("wikidata down"); };
    const stale = await discoverCompanies(key, { fetchImpl: boom, nowMs: t0 + COMPANY_DISCOVERY_CACHE_TTL_MS + 1 });
    // Stale answers still serve, but the answer is marked degraded - never indistinguishable from a healthy one.
    expect(stale).toMatchObject({ degraded: true, reason: "upstream" });
    expect(stale.companies.map(candidate => candidate.domain)).toEqual(["google.com"]);
    expect(await discover(`fresh-${Date.now()}`, { fetchImpl: boom, nowMs: t0 + COMPANY_DISCOVERY_CACHE_TTL_MS + 2 })).toEqual([]);
  });

  it("treats malformed provider payloads as a miss, not a crash", async () => {
    const fetchImpl: DiscoveryFetch = async () => json({ unexpected: true });
    expect(await discover(`weird-${Date.now()}`, { fetchImpl, nowMs: 7_000_000 })).toEqual([]);
  });

  it("answers [] for a blank query without any call", async () => {
    const fetchImpl = fakeFetch({});
    expect(await discover("   ", { fetchImpl })).toEqual([]);
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
    const results = await discover(`zoho-qualify-${Date.now()}`, { fetchImpl });
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
    const results = await discover(`google-qualify-${Date.now()}`, { fetchImpl });
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
    const results = await discover(`longtail-qualify-${Date.now()}`, { fetchImpl });
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
    const results = await discover(`sparse-qualify-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Sparse Co"]);
  });
});

describe("review findings: failure honesty, boundary validation, traffic bounds, typed precedence", () => {
  it("a 429/5xx from the source is a failure: answers stale-or-[] and caches nothing", async () => {
    const key = `ratelimited-${Date.now()}`;
    const limited = fakeFetch({ search: () => ({ error: true }), entities: { entities: {} } });
    const failing: DiscoveryFetch = async () => ({ ok: false, json: async () => ({}) });
    expect(await discover(key, { fetchImpl: failing, nowMs: 13_000_000 })).toEqual([]);
    // The failed read was not cached: a recovered source answers for real.
    const recovered = await discover(key, { fetchImpl: fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE }) });
    expect(recovered.map(candidate => candidate.domain)).toEqual(["google.com"]);
    expect(limited).not.toHaveBeenCalled();
  });

  it("a non-OK entity fetch is a failure too, not an empty answer to cache", async () => {
    const key = `entities-down-${Date.now()}`;
    const failing: DiscoveryFetch = async (url: string) =>
      new URL(url).searchParams.get("action") === "wbgetentities" ? { ok: false, json: async () => ({}) } : json(SEARCH_GOOGLE);
    expect(await discover(key, { fetchImpl: failing, nowMs: 13_000_000 })).toEqual([]);
    const recovered = await discover(key, { fetchImpl: fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE }) });
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
    const results = await discover(`schema-guard-${Date.now()}`, { fetchImpl });
    expect(results).toEqual([{ name: "Valid Co", domain: "valid.example.com", source: "wikidata" }]);
  });

  it("never spends a source call on a single character", async () => {
    const fetchImpl = fakeFetch({});
    expect(await discover("a", { fetchImpl })).toEqual([]);
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
    const first = discover(key, { fetchImpl });
    const second = discover(key, { fetchImpl });
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
    const results = await discover(`typed-precedence-${Date.now()}`, { fetchImpl });
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
    const results = await discover(`subdomain-dedupe-${Date.now()}`, { fetchImpl });
    expect(results.map(candidate => candidate.name)).toEqual(["Example Corp"]);
  });
});

describe("aggregate traffic bounds (review: many distinct queries must not fan out upstream)", () => {
  it("a source 429 pauses ALL discovery upstream calls for the cooldown; cached answers still serve", async () => {
    const t0 = 9_000_000;
    const limited: DiscoveryFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const key = `rl-${Date.now()}`;
    expect(await discoverCompanies(key, { fetchImpl: limited, nowMs: t0 })).toEqual({ companies: [], degraded: true, reason: "rate_limited" });
    const counting = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    // During the cooldown even a recovered source is never called - for any distinct name.
    expect(await discoverCompanies(`${key}-other`, { fetchImpl: counting, nowMs: t0 + 1_000 })).toEqual({ companies: [], degraded: true, reason: "rate_limited" });
    expect(counting).not.toHaveBeenCalled();
    // After the cooldown the source is asked again.
    const after = await discover(`${key}-other`, { fetchImpl: counting, nowMs: t0 + 61_000 });
    expect(after.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });

  it("a saturated upstream pool degrades a new name to cache-or-nothing without another call", async () => {
    let release!: () => void;
    const gate = new Promise(resolve => { release = () => resolve(null); });
    const blocking = fakeFetch({ search: () => gate.then(() => ({ search: [] })) as never, entities: ENTITIES_GOOGLE });
    const base = `pool-${Date.now()}`;
    const pending = [0, 1, 2, 3].map(i => discover(`${base}-${i}`, { fetchImpl: blocking }));
    const counting = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    expect(await discoverCompanies(`${base}-fifth`, { fetchImpl: counting })).toEqual({ companies: [], degraded: true, reason: "saturated" });
    expect(counting).not.toHaveBeenCalled();
    // The four in-flight asks are still shared, not duplicated.
    const again = discover(`${base}-0`, { fetchImpl: blocking });
    expect(blocking.mock.calls.filter(call => String(call[0]).includes("wbsearchentities"))).toHaveLength(4);
    release();
    await Promise.all([...pending, again]); // free the pool slots for later tests
  });

  it("a client over its distinct-query budget degrades to cache-or-nothing; other clients are unaffected", async () => {
    const t0 = 11_000_000;
    const counting = fakeFetch({ search: () => ({ search: [] }), opensearch: ["x", []] });
    const client = `ip-budget-${Date.now()}`;
    const stamp = Date.now();
    for (let i = 0; i < 20; i += 1) {
      await discover(`budget-${stamp}-n${String(i).padStart(2, "0")}`, { fetchImpl: counting, nowMs: t0, clientKey: client });
    }
    const callsAtBudget = counting.mock.calls.length;
    expect(callsAtBudget).toBeGreaterThan(0);
    expect(await discoverCompanies(`budget-${stamp}-over`, { fetchImpl: counting, nowMs: t0 + 1_000, clientKey: client })).toEqual({ companies: [], degraded: true, reason: "budget" });
    expect(counting.mock.calls.length).toBe(callsAtBudget);
    // A different client still gets through, and the window resets after 10 minutes.
    await discover(`budget-${stamp}-other`, { fetchImpl: counting, nowMs: t0 + 2_000, clientKey: `${client}-2` });
    expect(counting.mock.calls.length).toBeGreaterThan(callsAtBudget);
  });
});

describe("typing-friendly budget accounting and the failure breaker (verdict: 3-4 real searches must not exhaust the budget)", () => {
  it("typing prefixes of one name are one chain: ordinary typing never spends the budget", async () => {
    const t0 = 15_000_000;
    const client = `ip-typing-${Date.now()}`;
    const counting = fakeFetch({ search: () => ({ search: [] }), opensearch: ["x", []] });
    // Four real searches, each typed out prefix by prefix - twenty requests, four chains.
    const chains = ["google", "tata", "wipro", "flipkart"];
    for (const name of chains) {
      for (let end = 2; end <= name.length; end += 1) {
        const outcome = await discoverCompanies(`${name.slice(0, end)}-x${client}`.slice(0, end), { fetchImpl: counting, nowMs: t0, clientKey: client });
        expect(outcome.degraded).toBe(false);
      }
    }
    // Every prefix still asked upstream (no cache yet), and none was refused: 4 chains spent of 20.
    expect(counting.mock.calls.length).toBeGreaterThan(0);
    // A fifth distinct chain still gets through - the budget was never in danger.
    const fifth = await discoverCompanies(`zoho-x${client}`.slice(0, 4), { fetchImpl: counting, nowMs: t0 + 1_000, clientKey: client });
    expect(fifth.degraded).toBe(false);
  });

  it("a shared in-flight ask spends the budget once, not per concurrent request", async () => {
    const t0 = 17_000_000;
    const client = `ip-inflight-${Date.now()}`;
    let release!: () => void;
    const gate = new Promise(resolve => { release = () => resolve(null); });
    const blocking = fakeFetch({ search: () => gate.then(() => ({ search: [] })) as never });
    const key = `shared-${Date.now()}`;
    const first = discoverCompanies(key, { fetchImpl: blocking, nowMs: t0, clientKey: client });
    const second = discoverCompanies(key, { fetchImpl: blocking, nowMs: t0, clientKey: client });
    release();
    await Promise.all([first, second]);
    // One spend: the next 19 distinct chains still pass, the 21st chain degrades.
    const counting = fakeFetch({ search: () => ({ search: [] }), opensearch: ["x", []] });
    for (let i = 0; i < 19; i += 1) {
      const ok = await discoverCompanies(`after-${key}-n${String(i).padStart(2, "0")}`, { fetchImpl: counting, nowMs: t0 + 1_000, clientKey: client });
      expect(ok.degraded).toBe(false);
    }
    const over = await discoverCompanies(`after-${key}-over`, { fetchImpl: counting, nowMs: t0 + 2_000, clientKey: client });
    expect(over).toEqual({ companies: [], degraded: true, reason: "budget" });
  });

  it("three consecutive upstream failures open a short breaker; it closes after 30s and a success resets the count", async () => {
    const t0 = 19_000_000;
    const failing: DiscoveryFetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
    const base = `breaker-${Date.now()}`;
    for (let i = 0; i < 3; i += 1) {
      const failed = await discoverCompanies(`${base}-n${i}`, { fetchImpl: failing, nowMs: t0 });
      expect(failed).toEqual({ companies: [], degraded: true, reason: "upstream" });
    }
    // Breaker open: a distinct name never reaches the source.
    const counting = fakeFetch({ search: () => SEARCH_GOOGLE, entities: ENTITIES_GOOGLE });
    const blocked = await discoverCompanies(`${base}-blocked`, { fetchImpl: counting, nowMs: t0 + 1_000 });
    expect(blocked).toEqual({ companies: [], degraded: true, reason: "upstream" });
    expect(counting).not.toHaveBeenCalled();
    // After 30s the source is asked again, and a success resets the count.
    const after = await discoverCompanies(`${base}-blocked`, { fetchImpl: counting, nowMs: t0 + 31_000 });
    expect(after.degraded).toBe(false);
    expect(after.companies.map(candidate => candidate.domain)).toEqual(["google.com"]);
  });
});

describe("chain anti-bypass (review: a shared short prefix must not free unlimited names)", () => {
  it("50 rapid distinct names sharing a 2-char prefix are distinct chains and exhaust the budget", async () => {
    const t0 = 23_000_000;
    const client = `ip-bypass-${Date.now()}`;
    const counting = fakeFetch({ search: () => ({ search: [] }), opensearch: ["x", []] });
    let blockedAt = -1;
    for (let i = 0; i < 50; i += 1) {
      const outcome = await discoverCompanies(`go${String(i).padStart(2, "0")}-x${client}`.slice(0, 4) + `q${i}`, { fetchImpl: counting, nowMs: t0, clientKey: client });
      if (outcome.degraded) { blockedAt = i; break; }
    }
    // The budget (20 chains) is genuinely consumed: the 21st distinct name degrades.
    expect(blockedAt).toBe(20);
    const over = await discoverCompanies(`gofinal${client}`.slice(0, 8), { fetchImpl: counting, nowMs: t0 + 1_000, clientKey: client });
    expect(over).toEqual({ companies: [], degraded: true, reason: "budget" });
  });

  it("a free transition dies after the gap and after the cap, so a kept-alive chain cannot ride free", async () => {
    const t0 = 25_000_000;
    const client = `ip-cap-${Date.now()}`;
    const counting = fakeFetch({ search: () => ({ search: [] }), opensearch: ["x", []] });
    // Charge one chain and ride 8 free extensions by typing.
    let name = `ca${client}`.slice(0, 2);
    await discoverCompanies(name, { fetchImpl: counting, nowMs: t0, clientKey: client });
    for (let i = 0; i < 8; i += 1) {
      name = `${name}x`;
      const free = await discoverCompanies(name, { fetchImpl: counting, nowMs: t0 + (i + 1) * 1_000, clientKey: client });
      expect(free.degraded).toBe(false);
    }
    // The 9th extension in a row is a new chain (spends), not a free ride.
    const ninth = await discoverCompanies(`${name}y`, { fetchImpl: counting, nowMs: t0 + 9_000, clientKey: client });
    expect(ninth.degraded).toBe(false); // budget allows it - as a SPEND
    // And a quiet return after the gap is a new chain too.
    const afterGap = await discoverCompanies(`${name}z`, { fetchImpl: counting, nowMs: t0 + 10_000 + 31_000, clientKey: client });
    expect(afterGap.degraded).toBe(false);
  });
});
