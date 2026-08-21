import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("skipwait.me metadata and route loading", () => {
  it("uses skipwait.me as the homepage canonical and sharing URL with a factual first-party asset", () => {
    expect(html).toContain('<link rel="canonical" href="https://skipwait.me/"');
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/"');
    expect(html).toContain('<meta property="og:site_name" content="skipwait.me"');
    expect(html).toContain('content="/manus-storage/skipwait-og_41bb73c1.png"');
    expect(html).not.toMatch(/Sarah was just|fast-tracked|hiring guarantee/i);
  });

  it("uses a fixed-viewport loading shell while dashboard-heavy screens are imported on demand", () => {
    expect(app).toContain('const MyRequests = lazy(() => import("./pages/MyRequests"))');
    expect(app).toContain('const MyCompanyInbox = lazy(() => import("./pages/MyCompanyInbox"))');
    expect(app).toContain('data-skipwait-screen="route-loading"');
    expect(app).toContain('h-dvh min-h-dvh overflow-hidden');
    expect(app).toContain('<Suspense fallback={<RouteLoading/>}>');
  });
});
