// S-10 (seeker passwords packet): the optional Umami loader in client/index.html must never run on
// /reset-password, where the address bar briefly holds a single-use WorkOS reset token, and never sends query
// strings anywhere. Runs the real inline loader with build-time values filled in, as Vite would.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync("client/index.html", "utf8");
const loader = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1]).find(source => source.includes("%VITE_ANALYTICS_ENDPOINT%"));

function run(pathname: string, built = true): Array<Record<string, string>> {
  if (!loader) throw new Error("analytics loader not found in client/index.html");
  const source = built ? loader.replace("%VITE_ANALYTICS_ENDPOINT%", "https://stats.example").replace("%VITE_ANALYTICS_WEBSITE_ID%", "site-1") : loader;
  const appended: Array<Record<string, string>> = [];
  const document = {
    createElement: () => {
      const attributes: Record<string, string> = {};
      return { set src(value: string) { attributes.src = value; }, set defer(value: boolean) { attributes.defer = String(value); }, setAttribute: (name: string, value: string) => { attributes[name] = value; }, attributes };
    },
    head: { appendChild: (node: { attributes: Record<string, string> }) => { appended.push(node.attributes); } },
  };
  runInNewContext(source, { document, location: { pathname } });
  return appended;
}

describe("the optional analytics loader", () => {
  it("never loads on /reset-password", () => {
    expect(run("/reset-password")).toEqual([]);
    expect(run("/reset-password/")).toEqual([]);
  });

  it("elsewhere loads only with build-time values, and never reports query strings", () => {
    expect(run("/explore", false)).toEqual([]);
    const [script] = run("/explore");
    expect(script).toEqual(expect.objectContaining({ src: "https://stats.example/umami", "data-website-id": "site-1", "data-exclude-search": "true" }));
  });
});
