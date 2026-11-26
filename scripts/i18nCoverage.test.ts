import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// D-093 packet §5.3 red-first tests. They fail on main because
// ./i18n-coverage.mjs does not exist yet.
const script = join(__dirname, "i18n-coverage.mjs");

function makeFixture(files: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "i18n-coverage-"));
  const en = files["content.json"] ?? {
    greet: "Hello {name}",
    inbox: { one: "{count} ask", other: "{count} asks" },
    plain: "Plain line",
  };
  mkdirSync(join(root, "design", "goal-ui"), { recursive: true });
  writeFileSync(join(root, "design", "goal-ui", "content.json"), JSON.stringify(en));
  mkdirSync(join(root, "shared", "i18n", "locales"), { recursive: true });
  for (const [name, tree] of Object.entries(files)) {
    if (name === "content.json") continue;
    writeFileSync(join(root, "shared", "i18n", "locales", name), typeof tree === "string" ? tree : JSON.stringify(tree));
  }
  return root;
}

function run(root: string) {
  try {
    const stdout = execFileSync(process.execPath, [script, "--root", root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const err = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

describe("i18n-coverage (D-093 fallback-share report)", () => {
  it("passes with no locale files and prints the English leaf count", () => {
    const root = makeFixture({});
    try {
      const result = run(root);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/English leaves: 3/);
      expect(result.stdout).toMatch(/locales: 0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints the fallback share for a partial locale without failing", () => {
    const root = makeFixture({ "te.json": { greet: "నమస్తే {name}" } });
    try {
      const result = run(root);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/te\.json: 1\/3 leaves/);
      expect(result.stdout).toMatch(/fallback share 66\.7%/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits non-zero when a locale carries a key English does not define", () => {
    const root = makeFixture({ "te.json": { greet: "నమస్తే {name}", bogus: "only te" } });
    try {
      const result = run(root);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/bogus/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits non-zero when a locale renames a {placeholder}", () => {
    const root = makeFixture({ "te.json": { greet: "నమస్తే {nama}" } });
    try {
      const result = run(root);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/greet/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits non-zero when a locale file is not valid JSON", () => {
    const root = makeFixture({ "te.json": "{ not json" });
    try {
      const result = run(root);
      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/te\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
