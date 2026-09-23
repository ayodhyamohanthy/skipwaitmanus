import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");

// Ambient toolchain keys that are never application config.
const AMBIENT = /^(CI|GITHUB_|NPM_|PATH|HOME|PWD|SHELL|TERM|LANG|TZ|VITEST_|NODE_OPTIONS|DOTENV_)/;

function exampleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(join(ROOT, ".env.example"), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function sourceFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx|html|mjs|cjs|jsonc?)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
  };
  for (const dir of dirs) {
    try { walk(join(ROOT, dir)); } catch { /* optional dir */ }
  }
  return out;
}

function referencedKeys(): { vite: Set<string>; env: Set<string> } {
  const vite = new Set<string>();
  const env = new Set<string>();
  const files = [
    ...sourceFiles(["client/src", "server", "src", "shared", "functions"]),
    join(ROOT, "client", "index.html"),
    join(ROOT, "vite.config.ts"),
  ];
  for (const file of files) {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const rel = relative(ROOT, file);
    if (rel === ".env.example") continue;
    for (const match of text.matchAll(/\bVITE_[A-Z][A-Z0-9_]*\b/g)) vite.add(match[0]);
    for (const match of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (!AMBIENT.test(match[1])) env.add(match[1]);
    }
    for (const match of text.matchAll(/process\.env\["([^"]+)"\]/g)) {
      if (!AMBIENT.test(match[1])) env.add(match[1]);
    }
  }
  return { vite, env };
}

function workerPassthroughKeys(): string[] {
  const text = readFileSync(join(ROOT, "src", "worker.ts"), "utf8");
  const block = text.match(/CONTAINER_ENV_KEYS\s*=\s*\[(.*?)\]/s)?.[1] ?? "";
  return [...block.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map(m => m[1]);
}

describe("config contract", () => {
  it("declares every referenced key in .env.example", () => {
    const example = exampleKeys();
    const { vite, env } = referencedKeys();
    const missing = [...vite, ...env].filter(key => !example.has(key));
    expect(missing, `undeclared config keys (add to .env.example): ${missing.join(", ")}`).toEqual([]);
  });

  it("forwards every container env key declared for the Worker", () => {
    const example = exampleKeys();
    const missing = workerPassthroughKeys().filter(key => !example.has(key));
    expect(missing, `worker passthrough keys missing from .env.example: ${missing.join(", ")}`).toEqual([]);
  });
});
