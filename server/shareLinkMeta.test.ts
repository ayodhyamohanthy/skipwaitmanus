import { describe, expect, it } from "vitest";
import { injectShareMeta, resolveShareMeta } from "../functions/_lib/shareMeta";

const shell = `<html><head><title>skipwait.me — Job Referrals</title>
<meta name="description" content="generic" />
<link rel="canonical" href="https://skipwait.me/" />
<meta property="og:title" content="skipwait.me — Private job referrals, made simpler." />
<meta property="og:description" content="generic" />
<meta property="og:url" content="https://skipwait.me/" />
<meta property="og:image" content="https://skipwait.me/og-skipwait.png" />
<meta property="og:image:alt" content="generic" />
<meta name="twitter:title" content="generic" />
<meta name="twitter:description" content="generic" />
<meta name="twitter:image" content="https://skipwait.me/og-skipwait.png" />
</head><body><div id="root"></div></body></html>`;

const api = (routes: Record<string, unknown>) => async (path: string) =>
  path in routes ? new Response(JSON.stringify(routes[path]), { status: 200 }) : new Response("{}", { status: 404 });

describe("share link previews (#97)", () => {
  it("fast-track links carry the company in title, og and canonical", async () => {
    const meta = await resolveShareMeta("/fast/abc123", api({ "/api/referrer-fast-track/abc123": { link: { companyDomain: "google.com", isActive: true } } }));
    const html = injectShareMeta(shell, meta);
    expect(html).toContain("<title>Ask a verified google.com employee for a referral</title>");
    expect(html).toContain('<meta property="og:title" content="Ask a verified google.com employee for a referral" />');
    expect(html).toContain('<link rel="canonical" href="https://skipwait.me/fast/abc123" />');
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/fast/abc123" />');
    expect(html).not.toContain('href="https://skipwait.me/"');
    expect(html).toContain('<div id="root"></div>');
  });

  it("vanity links resolve through the vanity API", async () => {
    const meta = await resolveShareMeta("/refer/google/priya", api({ "/api/referrer-fast-track/vanity/google/priya": { link: { companyDomain: "google.com", isActive: true } } }));
    expect(meta?.title).toContain("google.com");
    expect(meta?.url).toBe("https://skipwait.me/refer/google/priya");
  });

  it("share cards use the card's own image", async () => {
    const token = "abcdefghijklmnop1234";
    const meta = await resolveShareMeta(`/share-card/${token}`, api({ [`/api/referral-share-cards/public/${token}`]: { card: { companyDomain: "zoho.com", status: "accepted" } } }));
    expect(meta?.image).toBe(`https://skipwait.me/api/referral-share-cards/public/${token}/image.png`);
    expect(meta?.title).toContain("zoho.com");
  });

  it("unknown or inactive links get no preview and are noindex", async () => {
    expect(await resolveShareMeta("/fast/nope", api({}))).toBeNull();
    expect(await resolveShareMeta("/share-card/short", api({}))).toBeNull();
    expect(injectShareMeta(shell, null)).toContain('<meta name="robots" content="noindex" />');
  });

  it("escapes and rejects unsafe API values", async () => {
    expect(await resolveShareMeta("/fast/x1", api({ "/api/referrer-fast-track/x1": { link: { companyDomain: '"><script>alert(1)</script>' } } }))).toBeNull();
    const html = injectShareMeta(shell, { title: 'a"b<c', description: "d", url: "https://skipwait.me/fast/x", image: "https://skipwait.me/i.png", imageAlt: "i" });
    expect(html).toContain("a&quot;b&lt;c");
  });
});
