import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");

describe("Cloudflare API origin boundary", () => {
  it("disables workers.dev and exposes only the canonical API route", () => {
    expect(config).toContain('"workers_dev": false');
    expect(config).toContain('"pattern": "skipwait.me/api/*"');
    expect(config).toContain('"zone_name": "skipwait.me"');
  });

  it("rejects noncanonical host, plaintext, and non-API dispatch before the container", () => {
    const guard = worker.slice(worker.indexOf("const url = new URL"), worker.indexOf("const release ="));
    expect(guard).toContain('url.protocol !== "https:"');
    expect(guard).toContain('url.hostname !== "skipwait.me"');
    expect(guard).toContain('!(url.pathname.startsWith("/api/") || url.pathname === "/sitemap.xml")');
    expect(guard).not.toMatch(/forwarded-host|req\.headers/i);
    expect(guard).toContain('status: 404');
  });

  it("keeps /sitemap.xml free of a same-zone Pages function (it shadows the Worker route and 404s API reads)", () => {
    expect(existsSync(new URL("../functions/sitemap.xml.ts", import.meta.url))).toBe(false);
  });
});
