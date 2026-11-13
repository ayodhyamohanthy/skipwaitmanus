// D-094 item 2 (D-264 (2), packet §4.1): the preview reads a role title only
// from a body it already fetched, and marks every preview whose body was never
// requested with `fetched: false`, so the composer can stay silent instead of
// claiming "We could not reach this job link." for a link it never asked for.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractRoleTitle, previewJobLink, resetJobLinkPreviewCache } from "./jobLinkPreview";

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><main>role</main></body></html>`;
const ld = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const og = (content: string) => `<meta property="og:title" content="${content}">`;
const title = (content: string) => `<title>${content}</title>`;
const body = (canonicalUrl: string, content: string) => ({ canonicalUrl, body: content });

beforeEach(() => resetJobLinkPreviewCache());

describe("extractRoleTitle (D-094 packet T1)", () => {
  it("prefers a JSON-LD JobPosting title over og:title and <title>", () => {
    const html = page(ld({ "@context": "https://schema.org", "@type": "JobPosting", title: "Senior Designer" }) + og("Senior Designer (remote)") + title("Careers at Acme"));
    expect(extractRoleTitle(html)).toBe("Senior Designer");
  });

  it("finds a JobPosting inside an @graph and an array", () => {
    expect(extractRoleTitle(page(ld({ "@graph": [{ "@type": "Organization", name: "Acme" }, { "@type": "JobPosting", title: "Data Analyst" }] })))).toBe("Data Analyst");
    expect(extractRoleTitle(page(ld([{ "@type": "JobPosting", title: "Staff Engineer" }])))).toBe("Staff Engineer");
  });

  it("falls back to og:title", () => {
    expect(extractRoleTitle(page(og("Staff Engineer at Acme") + title("Careers")))).toBe("Staff Engineer at Acme");
  });

  it("falls back to <title>", () => {
    expect(extractRoleTitle(page(title("Product Manager - Acme")))).toBe("Product Manager - Acme");
  });

  it("decodes HTML entities, strips tags and collapses whitespace", () => {
    expect(extractRoleTitle(page(title("Design &amp; Research")))).toBe("Design & Research");
    expect(extractRoleTitle(page(title("Design <b>Research</b> Lead")))).toBe("Design Research Lead");
    expect(extractRoleTitle(page(title("  Regional   Sales\n Manager  ")))).toBe("Regional Sales Manager");
  });

  it("cuts a long title to 120 characters", () => {
    const long = "A".repeat(300);
    const roleTitle = extractRoleTitle(page(title(long)));
    expect(roleTitle).toHaveLength(120);
  });

  it("drops an empty title and a title that is only the company name", () => {
    expect(extractRoleTitle(page(""))).toBeUndefined();
    expect(extractRoleTitle(page(title("   ")))).toBeUndefined();
    expect(extractRoleTitle(page(title("Wipro")), "Wipro")).toBeUndefined();
  });

  it("keeps a role that merely contains the company name", () => {
    expect(extractRoleTitle(page(title("Senior Designer at Wipro")), "Wipro")).toBe("Senior Designer at Wipro");
  });
});

describe("previewJobLink roleTitle and fetched (D-094 packet T1/T2/T6b)", () => {
  it("adds roleTitle from a body it already fetched, once", async () => {
    const url = "https://careers.roletitle.test/jobs/1";
    const fetcher = vi.fn(async () => body(url, page(ld({ "@type": "JobPosting", title: "Senior Designer" }))));
    const result = await previewJobLink(url, async () => "roletitle.test", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ roleTitle: "Senior Designer", fetched: true, employerConfidence: "direct-domain" });
  });

  it("never fetches a reviewed listing, so it has no roleTitle and is marked fetched: false", async () => {
    const fetcher = vi.fn(async () => body("https://linkedin.com/jobs/view/4446365088", page(ld({ "@type": "JobPosting", title: "Should not be read" }))));
    const result = await previewJobLink("https://linkedin.com/jobs/view/4446365088", async () => "ethos.com", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.roleTitle).toBeUndefined();
    expect(result).toMatchObject({ fetched: false, employerConfidence: "verified", companyDomain: "ethos.com" });
  });

  it("marks a hosted link it never fetches with fetched: false (packet T6b)", async () => {
    const fetcher = vi.fn(async () => body("https://jobs.lever.co/wipro/abc", page(title("Any role"))));
    const result = await previewJobLink("https://jobs.lever.co/wipro/abc", async () => "wipro.com", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fetched: false, employerConfidence: "unreachable" });
    expect(result.roleTitle).toBeUndefined();
  });

  it("keeps the existing preview fields and cache key unchanged", async () => {
    const url = "https://careers.roletitle.test/jobs/2";
    const fetcher = vi.fn(async () => body(url, page(title("Analyst"))));
    const first = await previewJobLink(url, async () => "roletitle.test", fetcher);
    const cached = await previewJobLink(url, async () => "roletitle.test", fetcher);
    expect(cached).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Object.keys(first).sort()).toEqual(["canonicalUrl", "companyDomain", "employerConfidence", "fetched", "reason", "recoveryAction", "roleTitle", "status"].sort());
  });
});

// F1 (PR #1172 review): the body comes from whatever link a visitor pastes
// (any public domain, no sign-in, 12 previews/min/IP, cached per URL so a query
// string defeats the cache), and this runs on the public route whatever
// JOB_LINK_PREFILL_ENABLED says. Three regexes scanned to the end of the body
// from every unclosed tag, so a 512 KB body of repeated opening tags blocked the
// event loop for ~16-17 seconds per request. These cases pin a linear read.
describe("extractRoleTitle is linear on hostile bodies (F1)", () => {
  const LIMIT = 512_000;
  const hostile = (fragment: string) => fragment.repeat(Math.ceil(LIMIT / fragment.length)).slice(0, LIMIT);
  const elapsed = (html: string) => {
    const start = performance.now();
    const result = extractRoleTitle(html);
    return { ms: performance.now() - start, result };
  };
  // 1,000 ms is far above a linear scan of 512 KB (single-digit ms) and far
  // below the 16,175 ms / 17,076 ms measured on the reviewed head.
  const BOUND = 1_000;

  it("returns promptly when every <title> is unclosed", () => {
    const { ms } = elapsed(hostile("<title>"));
    expect(ms).toBeLessThan(BOUND);
  });

  it("returns promptly when every <meta is unclosed", () => {
    const { ms } = elapsed(hostile("<meta "));
    expect(ms).toBeLessThan(BOUND);
  });

  it("returns promptly when every JSON-LD <script> is unclosed", () => {
    const { ms } = elapsed(hostile('<script type="application/ld+json">'));
    expect(ms).toBeLessThan(BOUND);
  });

  it("still finds a JSON-LD JobPosting that sits after a large body, not only in the head", () => {
    const padding = `<div>${"x".repeat(200)}</div>`.repeat(2_000);
    const html = `<!doctype html><html><head>${og("Staff Engineer at Acme")}</head><body>${padding}<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Late Posting" })}</script></body></html>`;
    // Documented precedence is JSON-LD > og:title > <title>, so the late posting wins.
    expect(extractRoleTitle(html)).toBe("Late Posting");
  });
});
