import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const loader = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1])
  .find(source => source?.includes("%VITE_ANALYTICS_ENDPOINT%"));

function loadScripts(href: string, endpoint = "https://stats.example", websiteId = "site-1") {
  if (!loader) throw new Error("Analytics loader not found in client/index.html");
  const scripts: HTMLScriptElement[] = [];
  const document = {
    createElement: () => ({ attributes: {}, setAttribute(name: string, value: string) {
      Object.assign(this.attributes, { [name]: value });
    } }),
    head: { appendChild: (script: HTMLScriptElement) => scripts.push(script) },
  };
  const source = loader.replace("%VITE_ANALYTICS_ENDPOINT%", endpoint).replace("%VITE_ANALYTICS_WEBSITE_ID%", websiteId);
  runInNewContext(source, { document, location: new URL(href, "https://skipwait.me") });
  return scripts;
}

describe("the optional Umami loader", () => {
  it.each(["/reset-password?token=example#private", "/reset-password/", "/ReSeT-PaSsWoRd", "/%72eset-password"])(
    "does not append a tracker on %s (S-10)",
    path => expect(loadScripts(path)).toEqual([]),
  );

  it("loads on ordinary routes with both build-time values and excludes query and hash", () => {
    expect(loadScripts("/explore", "%VITE_ANALYTICS_ENDPOINT%")).toEqual([]);
    expect(loadScripts("/explore", "https://stats.example", "%VITE_ANALYTICS_WEBSITE_ID%")).toEqual([]);
    expect(loadScripts("/explore?tab=jobs#results")).toEqual([
      expect.objectContaining({
        src: "https://stats.example/umami",
        defer: true,
        attributes: { "data-website-id": "site-1", "data-exclude-search": "true", "data-exclude-hash": "true" },
      }),
    ]);
  });
});
