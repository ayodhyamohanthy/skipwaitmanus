import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_SUMMARY, LANDING_TITLE } from "../shared/landingContent";

describe("application title configuration", () => {
  it("keeps VITE_APP_TITLE unset-or-canonical; the shipped index.html carries the production title", () => {
    // VITE_APP_TITLE has zero runtime readers (grep-verified: no server/client code or
    // wrangler config references it), so an unset value on bare clones/CI is acceptable.
    const title = process.env.VITE_APP_TITLE;
    expect(title === undefined || title === "skipwait.me").toBe(true);

    const indexHtml = readFileSync(join(__dirname, "..", "client", "index.html"), "utf8");
    // The shell title comes from the same constant the build-time snapshot and
    // the React landing page use, so crawler and visitor never disagree.
    expect(indexHtml).toContain(`<title>${LANDING_TITLE} — skipwait.me</title>`);
    expect(indexHtml).toContain(`<meta name="description" content="${LANDING_SUMMARY}" />`);
    expect(indexHtml).toContain(`<meta property="og:description" content="${LANDING_SUMMARY}" />`);
  });
});
