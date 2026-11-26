// Owner, Nov 19 2026 (D-365): "dont show my name in support page or any where".
// No file the site ships (client source, static public files, Pages functions)
// may carry the owner's personal name or personal mailbox. Business identity is
// described without naming a person (client/src/lib/business.ts).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["client/src", "client/public", "client/index.html", "functions", "shared"];
// The Cloudflare account subdomain in the internal API origin (functions/api) is
// a server-to-server hostname, never rendered to a visitor, so it is allowed.
const FORBIDDEN = [/Ayodhya(?!-711\.workers\.dev)/i, /Mohanthy/i, /ayodh?ya@skipwait/i];

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap(name => (name === "node_modules" ? [] : files(join(path, name))));
}

describe("no personal name on the site (D-365)", () => {
  it("no shipped file names the owner or links the owner's personal email", () => {
    const offenders = ROOTS.flatMap(root => files(resolve(process.cwd(), root)))
      // Tests are not shipped; they may name what they forbid.
      .filter(file => !/\.test\.[jt]sx?$/.test(file) && /\.(tsx?|jsx?|mjs|html|json|txt|xml|md|webmanifest)$/.test(file))
      .filter(file => FORBIDDEN.some(pattern => pattern.test(readFileSync(file, "utf8"))));
    expect(offenders).toEqual([]);
  });
});
