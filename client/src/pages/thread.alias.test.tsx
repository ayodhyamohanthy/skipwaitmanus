/**
 * /thread/:requestId (kit v4 `app/src/routes/thread.tsx`) resolves to the same
 * real conversation screen as /conversation/:requestId. The kit URL is the
 * canonical thread address; /conversation stays as a permanent alias so
 * existing links, emails and notifications do not break.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const aliasSource = readFileSync(new URL("./ThreadAlias.tsx", import.meta.url), "utf8");

describe("/thread alias for the conversation screen", () => {
  it("routes /thread/:requestId through the AppShell conversation screen like /conversation/:requestId", () => {
    expect(appSource).toMatch(/<Route\s+path="\/thread\/:requestId">/);
    expect(appSource).toMatch(/<Route\s+path="\/conversation\/:requestId">/);
  });

  it("renders the real conversation component rather than a new screen", () => {
    expect(aliasSource).toContain("ReferralConversation");
  });
});
