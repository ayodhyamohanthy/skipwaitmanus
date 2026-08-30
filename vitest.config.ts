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
      // WorkOS is the only auth provider; @clerk/react resolves to the
      // WorkOS-backed compat module (mirrors vite.config.ts).
      "@clerk/react": path.resolve(templateRoot, "client", "src", "_core", "auth.tsx"),
      "@clerk/react/legacy": path.resolve(templateRoot, "client", "src", "_core", "auth.tsx"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx"],
  },
});
