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
    include: ["scripts/**/*.test.ts", "server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
    // The suite runs in parallel and the client tests render whole pages with
    // several sequential awaits before first paint. The 5s default was tight
    // enough that a fully loaded machine produced timeouts that passed in
    // isolation, which is indistinguishable from a real regression and is how a
    // red main stayed hidden. CI runners are slower than a dev laptop, not faster.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
