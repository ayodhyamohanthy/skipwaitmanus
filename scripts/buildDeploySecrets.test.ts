import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// OPS-deploy-secrets-file (D-369): the deploy uploads its secrets with the Worker version itself,
// because Cloudflare refuses later secret edits (10215) while a branch preview is the newest version.
const script = new URL("./build-deploy-secrets.mjs", import.meta.url).pathname;
const SEEKER = `scrypt$${"a1".repeat(16)}$${"b2".repeat(32)}`;
const REFERRER = `scrypt$${"c3".repeat(16)}$${"d4".repeat(32)}`;
const BASE = { PATH: process.env.PATH ?? "" };

function run(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-secrets-"));
  const out = join(dir, "secrets.json");
  const result = spawnSync(process.execPath, [script, out], { env: { ...BASE, ...env }, encoding: "utf8" });
  const body = existsSync(out) ? readFileSync(out, "utf8") : null;
  const mode = existsSync(out) ? statSync(out).mode & 0o777 : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, body, mode };
}

describe("build-deploy-secrets", () => {
  it("writes DATABASE_URL with an encoded password and both reviewer hashes, owner-only", () => {
    const r = run({ NEWDB_HOST: "db.example", NEWDB_USER: "app", NEWDB_PASSWORD: "p@ss/w:rd", REVIEWER_SEEKER_HASH: SEEKER, REVIEWER_REFERRER_HASH: REFERRER });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.body ?? "")).toEqual({
      DATABASE_URL: "mysql://app:p%40ss%2Fw%3Ard@db.example:3306/skipwait",
      REVIEWER_SEEKER_PASSWORD_HASH: SEEKER,
      REVIEWER_REFERRER_PASSWORD_HASH: REFERRER,
    });
    expect(r.mode).toBe(0o600);
  });

  it("prints secret names but never a value", () => {
    const r = run({ NEWDB_HOST: "db.example", NEWDB_USER: "app", NEWDB_PASSWORD: "hunter2-secret", REVIEWER_SEEKER_HASH: SEEKER });
    const printed = r.stdout + r.stderr;
    expect(printed).toContain("DATABASE_URL");
    expect(printed).toContain("REVIEWER_SEEKER_PASSWORD_HASH");
    expect(printed).not.toContain("hunter2-secret");
    expect(printed).not.toContain(SEEKER);
  });

  it("writes an empty object when nothing is supplied, so the deploy keeps every existing secret", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(JSON.parse(r.body ?? "")).toEqual({});
  });

  it("refuses a partial database configuration and writes nothing", () => {
    const r = run({ NEWDB_PASSWORD: "x", NEWDB_HOST: "db.example" });
    expect(r.status).toBe(4);
    expect(r.body).toBeNull();
  });

  it.each([
    ["not a hash", "plaintext-password"],
    ["wrong scheme", `bcrypt$${"a1".repeat(16)}$${"b2".repeat(32)}`],
    ["short digest", `scrypt$${"a1".repeat(16)}$${"b2".repeat(31)}`],
    ["line break", `${SEEKER}\nEXTRA=1`],
  ])("refuses a reviewer hash that is %s and writes nothing", (_label, bad) => {
    const r = run({ REVIEWER_REFERRER_HASH: bad });
    expect(r.status).toBe(3);
    expect(r.body).toBeNull();
    expect(r.stdout + r.stderr).not.toContain(bad);
  });

  it("refuses without an output path", () => {
    const result = spawnSync(process.execPath, [script], { env: BASE, encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});
