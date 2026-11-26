// QA-only Vite config for the D-090 capture runner.
//
// The agent worktrees symlink node_modules to the main checkout, so Vite's
// strict fs serving refuses the @fontsource files the app imports (403) and
// every capture records console errors. Extend the allow list to the symlink
// target; everything else comes from the real config.
import { realpathSync } from "node:fs";
import path from "node:path";
import base from "../../vite.config";

export default async function qaViteConfig(env) {
  const resolved = typeof base === "function" ? await base(env) : base;
  const allow = [process.cwd(), realpathSync(path.join(process.cwd(), "node_modules"))];
  return { ...resolved, server: { ...resolved.server, fs: { ...resolved.server?.fs, allow } } };
}
