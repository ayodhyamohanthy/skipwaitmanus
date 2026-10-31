import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Date fixtures use UTC calendar days, regardless of the developer or CI timezone.
process.env.TZ = "UTC";

// Date and number fixtures are also written for the en-US default locale (CI's C.UTF-8
// resolves to en-US). Node's ICU reads its default locale once, from LC_ALL, then
// LC_MESSAGES, then LANG, when a process starts, so an en-IN machine prints "8 Oct" where a
// fixture expects "Oct 8". The test workers are forked child processes that inherit this
// environment, and LC_ALL wins over every other locale variable. vitest.setup.ts fails
// loudly if a worker still resolves another locale (for example under --pool=threads).
process.env.LC_ALL = "en_US.UTF-8";
process.env.LANG = "en_US.UTF-8";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [react()],
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["scripts/**/*.test.ts", "server/**/*.test.ts", "server/**/*.spec.ts", "shared/**/*.test.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
    // The suite runs in parallel and the client tests render whole pages with
    // several sequential awaits before first paint. The 5s default was tight
    // enough that a fully loaded machine produced timeouts that passed in
    // isolation, which is indistinguishable from a real regression and is how a
    // red main stayed hidden. CI runners are slower than a dev laptop, not faster.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Cap parallel test FILES. ~53 suites drive an Express app through supertest,
    // which binds an ephemeral port per request (app.listen(0), closed only after
    // the response). On a high-core machine Vitest's default (~core count) opens
    // so many concurrent servers that a port is recycled to another fork before
    // the first close() lands, so a request reaches a live server that has no such
    // route -> a 404/empty-body assertion fails in a payment or referral suite and
    // passes in isolation. That reads as a P0 regression but is a harness race.
    // 4 matches the ~4-vCPU CI runner, so local and CI fail the same way or not at
    // all; --maxWorkers=1 (quality:gate) still overrides via CLI. Deterministic and
    // near-free: full suite ~128s at 4 vs ~122s at the default.
    maxWorkers: 4,
  },
});
