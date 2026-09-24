import { config } from "dotenv";
import { isolateLiveOutboundCredentials } from "./server/_core/testCredentialGuard";

// Load the WorkOS CLI-provisioned secrets first, then the general .env on top
// (dotenv does not override variables that are already set).
config({ path: ".env.local" });
config();

// Those two lines put a developer's real provider keys in front of every test in
// this process. Remove them unless the operator asked for live credential tests,
// so an ordinary `pnpm test` cannot email a user, touch billing, or send member
// data to a provider by forgetting to stub a call.
isolateLiveOutboundCredentials(process.env);

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
