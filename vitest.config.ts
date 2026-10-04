import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

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
