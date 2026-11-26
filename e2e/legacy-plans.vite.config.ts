// PRICING-banded-oct25 (docs/plans/PRICING-banded-oct25.md): isolated bundle config
// for E2E journey testing of the legacy plans page.
//
// "The isolated config may exclude exactly the existing service-worker stamp plugin
// that writes a fixed default-output path; fail if that exclusion is not exactly one
// plugin. Verify the default output is unchanged."
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import baseConfigFn from "../vite.config";

export const LEGACY_PLANS_OUT_DIR = path.resolve(import.meta.dirname, ".results/legacy-plans-dist");

export function createLegacyPlansConfig(mode = "production") {
  const base = typeof baseConfigFn === "function" ? baseConfigFn({ mode, command: "build" }) : baseConfigFn;
  const rawPlugins = (base.plugins ?? []).flat(Infinity) as Plugin[];

  const excluded: Plugin[] = [];
  const kept: Plugin[] = [];
  for (const p of rawPlugins) {
    if (p && p.name === "skipwait-sw-build-stamp") {
      excluded.push(p);
    } else {
      kept.push(p);
    }
  }

  if (excluded.length !== 1) {
    throw new Error(`e2e/legacy-plans.vite.config.ts: expected to exclude exactly 1 plugin, but excluded ${excluded.length}`);
  }

  return {
    ...base,
    plugins: kept,
    define: {
      ...(base.define ?? {}),
      "import.meta.env.VITE_PLAN_FAMILY_V2": JSON.stringify("false"),
    },
    build: {
      ...(base.build ?? {}),
      outDir: LEGACY_PLANS_OUT_DIR,
      emptyOutDir: true,
    },
  };
}

export default defineConfig(({ mode }) => createLegacyPlansConfig(mode));
