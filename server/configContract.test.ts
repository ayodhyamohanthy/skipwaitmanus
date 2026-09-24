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

// A key can be consumed by a test gate, a CI build, a deploy manifest, or a build-time
// `%VITE_*%` substitution rather than by runtime code, so the consumer side is the whole
// tree minus prose, vendored output, and the example files that declare the contract.
// This file itself is excluded so it cannot certify its own keys as consumed.
function consumerFiles(): string[] {
  const skippedDirs = new Set(["node_modules", ".git", "dist", "build", "coverage", ".wrangler", ".vercel"]);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skippedDirs.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (!/\.(md|txt|snap|log)$/i.test(entry) && !entry.startsWith(".env") && full !== __filename) out.push(full);
    }
  };
  walk(ROOT);
  return out;
}

// The container runtime binds the listen port itself; it is not a Worker secret.
const RUNTIME_PROVIDED = new Set(["PORT"]);

function serverReadKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles(["server"])) {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const match of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (!AMBIENT.test(match[1])) keys.add(match[1]);
    }
    for (const match of text.matchAll(/process\.env\["([^"]+)"\]/g)) {
      if (!AMBIENT.test(match[1])) keys.add(match[1]);
    }
  }
  return keys;
}

function consumedKeys(): Set<string> {
  const consumed = new Set<string>();
  const files = consumerFiles();
  const texts = files.map(file => {
    try { return readFileSync(file, "utf8"); } catch { return ""; }
  });
  for (const key of exampleKeys()) {
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    const pattern = new RegExp(`\\b${key}\\b`);
    if (texts.some(text => pattern.test(text))) consumed.add(key);
  }
  return consumed;
}

describe("config contract", () => {
  it("declares every referenced key in .env.example", () => {
    const example = exampleKeys();
    const { vite, env } = referencedKeys();
    const missing = [...vite, ...env].filter(key => !example.has(key));
    expect(missing, `undeclared config keys (add to .env.example): ${missing.join(", ")}`).toEqual([]);
  });

  it("declares nothing in .env.example that no file consumes", () => {
    const consumed = consumedKeys();
    const dead = [...exampleKeys()].filter(key => !consumed.has(key));
    expect(dead, `.env.example advertises keys nothing reads (wire it through its boundary, or delete it): ${dead.join(", ")}`).toEqual([]);
  });

  it("forwards every container env key declared for the Worker", () => {
    const example = exampleKeys();
    const missing = workerPassthroughKeys().filter(key => !example.has(key));
    expect(missing, `worker passthrough keys missing from .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("forwards every key the server reads at runtime", () => {
    const forwarded = new Set(workerPassthroughKeys());
    const unreadable = [...serverReadKeys()].filter(key => !forwarded.has(key) && !RUNTIME_PROVIDED.has(key));
    expect(unreadable, `read under server/ but absent from CONTAINER_ENV_KEYS in src/worker.ts, so it can never be set in the container: ${unreadable.join(", ")}`).toEqual([]);
  });

  it("forwards runtime server secrets that must reach the container", () => {
    // Regression: PROMO_GRANTS_ENABLED and TRUST_CLOUDFLARE_CONNECTING_IP were
    // read server-side but silently dropped at the Worker→container boundary.
    const forwarded = new Set(workerPassthroughKeys());
    for (const key of ["PROMO_GRANTS_ENABLED", "TRUST_CLOUDFLARE_CONNECTING_IP"]) {
      expect(forwarded.has(key), `container passthrough missing ${key}`).toBe(true);
    }
  });
});
