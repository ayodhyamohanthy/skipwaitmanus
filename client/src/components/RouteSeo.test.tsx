// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_ROUTES } from "@shared/publicRoutes";

/**
 * The route-level head writer.
 *
 * The bug this covers: `applySeo` was called by 10 of 83 pages, so every other
 * route kept the previous page's <title> after client-side navigation, and
 * /admin, /settings and /thread were indexable through any link to them.
 */

let setLocation = (_: string) => {};
vi.mock("wouter", () => ({
  useLocation: () => [current],
}));

let current = "/";

async function mount(path: string) {
  current = path;
  const { default: RouteSeo } = await import("./RouteSeo");
  render(<RouteSeo />);
}

function robots(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.title = "";
  vi.resetModules();
});
afterEach(() => {
  document.head.innerHTML = "";
});

describe("RouteSeo", () => {
  it("writes the registry title and description for a listed route", async () => {
    const plans = PUBLIC_ROUTES.find(route => route.route === "/plans");
    expect(plans, "/plans must be in the public registry").toBeTruthy();
    await mount("/plans");
    expect(document.title).toBe(`${plans!.title} · skipwait.me`);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(plans!.description);
  });

  it("marks a listed route index,follow", async () => {
    await mount("/about");
    expect(robots()).toBe("index,follow");
  });

  it("marks an UNLISTED route noindex,nofollow", async () => {
    // The registry's contract is that an unlisted path "is not a page we ask a
    // crawler to index". Without the tag that is intent, not fact.
    for (const path of ["/settings", "/admin", "/inbox", "/work"]) {
      document.head.innerHTML = "";
      await mount(path);
      expect(robots(), `${path} must be noindex`).toBe("noindex,nofollow");
    }
  });

  it("keeps a private detail route out of the index", async () => {
    await mount("/p/some-handle");
    expect(robots()).toBe("noindex,nofollow");
  });

  it("sets a canonical URL for a listed route", async () => {
    await mount("/pricing");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://skipwait.me/pricing");
  });

  it("does not overwrite a page that wrote its own metadata", async () => {
    // ExploreCompany names the company it is showing. React runs child effects
    // before parent effects, so this handler runs AFTER the page -- it must
    // stand down rather than clobber it.
    //
    // The claim is module state, so the page and the handler have to come from
    // the SAME module instance. Importing applySeo from the top-level binding
    // here would use the pre-resetModules instance and the claim would be
    // invisible -- which is a fact about the test, not about the app, where
    // there is only ever one instance.
    current = "/explore/wipro";
    const seo = await import("@/lib/seo");
    seo.applySeo({ title: "Referrals at Wipro", description: "Ask a verified Wipro employee.", path: "/explore/wipro" });
    const { default: RouteSeo } = await import("./RouteSeo");
    render(<RouteSeo />);
    expect(document.title).toBe("Referrals at Wipro · skipwait.me");
  });

  it("clears a stale noindex when navigating back to a public page", async () => {
    // A noindex left behind on a public page is worse than none: it de-indexes
    // a page we do want found.
    await mount("/settings");
    expect(robots()).toBe("noindex,nofollow");
    document.head.innerHTML = "";
    await mount("/pricing");
    expect(robots()).toBe("index,follow");
  });

  it("ignores a query string when matching the registry", async () => {
    await mount("/plans?plan=max&currency=INR");
    const plans = PUBLIC_ROUTES.find(route => route.route === "/plans");
    expect(document.title).toBe(`${plans!.title} · skipwait.me`);
  });

  it("every registry route resolves to a real title", async () => {
    for (const route of PUBLIC_ROUTES) {
      document.head.innerHTML = "";
      await mount(route.route);
      expect(document.title, `${route.route} produced an empty title`).not.toBe("");
      expect(document.title).toContain("·");
    }
  });
});
