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

// waitFor's default async-utility timeout is 1000ms. Several components perform
// three or more sequential awaits before their first meaningful paint, and under
// a fully parallel suite run the event loop starves past that budget — producing
// failures that pass 3/3 in isolation. That is indistinguishable from a real
// regression, and it is how a red main stayed hidden. Raised here as well as
// vitest's own testTimeout, because raising only one moves the failure to the
// other budget.
//
// Imported lazily and only where a DOM exists: this setup file also runs for the
// server tests, and pulling React Testing Library in for those adds real import
// cost to every server test file.
if (typeof window !== "undefined") {
  void import("@testing-library/react").then(({ configure }) => {
    configure({ asyncUtilTimeout: 5_000 });
  });
}

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
