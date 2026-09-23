// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applySeo, faqJsonLd, jobsJsonLd } from "./seo";

describe("seo utilities", () => {
  it("applies per-route title, description, canonical, and JSON-LD to the document", () => {
    applySeo({ title: "Browse roles worth a referral", description: "Search published roles.", path: "/jobs", jsonLd: { "@type": "ItemList" } });
    expect(document.title).toBe("Browse roles worth a referral · skipwait.me");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Search published roles.");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://skipwait.me/jobs");
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe("https://skipwait.me/jobs");
    expect(document.querySelector("script#route-jsonld")?.textContent).toContain('"@type":"ItemList"');
  });

  it("swaps route JSON-LD on subsequent calls and removes it when omitted", () => {
    applySeo({ path: "/jobs", jsonLd: { "@type": "ItemList" } });
    applySeo({ path: "/jobs", jsonLd: { "@type": "BreadcrumbList" } });
    expect(document.querySelector("script#route-jsonld")?.textContent).toContain('"@type":"BreadcrumbList"');
    applySeo({ path: "/jobs" });
    expect(document.querySelector("script#route-jsonld")).toBeNull();
  });

  it("builds a FAQPage from entries that are also rendered as page copy", () => {
    const ld = faqJsonLd([{ question: "Is this a public job board?", answer: "No." }]);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(1);
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Is this a public job board?", acceptedAnswer: { "@type": "Answer", text: "No." } });
  });

  it("builds an ItemList of JobPosting entries with deep-link URLs", () => {
    const ld = jobsJsonLd([{ id: 3, title: "Designer", company: "Acme", location: "Bengaluru" }]);
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.itemListElement).toHaveLength(1);
    expect(ld.itemListElement[0].item["@type"]).toBe("JobPosting");
    expect(ld.itemListElement[0].item.hiringOrganization.name).toBe("Acme");
    expect(ld.itemListElement[0].item.url).toBe("https://skipwait.me/jobs?job=3");
  });
});