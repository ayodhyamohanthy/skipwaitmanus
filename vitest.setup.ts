import { config } from "dotenv";

// Load the WorkOS CLI-provisioned secrets first, then the general .env on top
// (dotenv does not override variables that are already set).
config({ path: ".env.local" });
config();

// Components can still fire a same-origin request (e.g. "/api/...") after a
// test unmounts them and vi.unstubAllGlobals() has restored the real fetch.
// Node's fetch rejects relative URLs, which Vitest reports as an unhandled
// error and fails the whole run even when every test passes (issue #69).
// Make the baseline fetch leave late relative requests pending instead;
// absolute URLs still reach the real fetch, and tests that stub fetch are
// unaffected.
const realFetch = globalThis.fetch;
if (realFetch) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/")) return new Promise<Response>(() => {});
    return realFetch(input, init);
  }) as typeof fetch;
}
