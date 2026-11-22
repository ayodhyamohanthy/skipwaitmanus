import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyReviewerPassword } from "../server/_core/reviewerLogin";

// OPS-deploy-secrets-file (D-369): the deploy uploads its secrets with the Worker version itself,
// because Cloudflare refuses later secret edits (10215) while a branch preview is the newest version.
const script = new URL("./build-deploy-secrets.mjs", import.meta.url).pathname;
const SEEKER = `scrypt$${"a1".repeat(16)}$${"b2".repeat(32)}`;
const REFERRER = `scrypt$${"c3".repeat(16)}$${"d4".repeat(32)}`;
const BASE = { PATH: process.env.PATH ?? "" };

function run(env: Record<string, string>, validateOnly = false) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-secrets-"));
  const out = join(dir, "secrets.json");
  const result = spawnSync(process.execPath, [script, validateOnly ? "--validate-reviewer-reset" : out], { cwd: dir, env: { ...BASE, ...env }, encoding: "utf8" });
  const body = existsSync(out) ? readFileSync(out, "utf8") : null;
  const mode = existsSync(out) ? statSync(out).mode & 0o777 : null;
  const files = readdirSync(dir);
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, body, mode, files };
}

describe("build-deploy-secrets", () => {
  it("writes DATABASE_URL with an encoded password and both reviewer hashes, owner-only", () => {
    const r = run({ NEWDB_HOST: "db.example", NEWDB_USER: "app", NEWDB_PASSWORD: "p@ss/w:rd", REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.body ?? "")).toEqual({
      DATABASE_URL: "mysql://app:p%40ss%2Fw%3Ard@db.example:3306/skipwait",
      REVIEWER_SEEKER_PASSWORD_HASH: SEEKER,
      REVIEWER_REFERRER_PASSWORD_HASH: REFERRER,
    });
    expect(r.mode).toBe(0o600);
  });

  it("prints secret names but never a value", () => {
    const r = run({ NEWDB_HOST: "db.example", NEWDB_USER: "app", NEWDB_PASSWORD: "hunter2-secret", REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER });
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
    const r = run({ REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: bad });
    expect(r.status).toBe(3);
    expect(r.body).toBeNull();
    expect(r.stdout + r.stderr).not.toContain(bad);
  });

  it.each(["", "false"])("keeps current reviewer bindings on an ordinary deploy with reset=%s", reset => {
    const r = run({ REVIEWER_RESET: reset, REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER, NEWDB_HOST: "db.example", NEWDB_USER: "app", NEWDB_PASSWORD: "database-secret" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.body ?? "")).toEqual({ DATABASE_URL: "mysql://app:database-secret@db.example:3306/skipwait" });
    expect(r.stdout + r.stderr).not.toContain(SEEKER);
    expect(r.stdout + r.stderr).not.toContain(REFERRER);
  });

  it.each([
    {},
    { REVIEWER_SEEKER_PASSWORD_HASH: SEEKER },
    { REVIEWER_REFERRER_PASSWORD_HASH: REFERRER },
  ])("refuses an incomplete reset pair before writing a deployment file", pair => {
    const r = run({ REVIEWER_RESET: "true", ...pair });
    expect(r.status).toBe(3);
    expect(r.body).toBeNull();
    expect(r.files).toEqual([]);
    expect(r.stdout + r.stderr).not.toContain(SEEKER);
    expect(r.stdout + r.stderr).not.toContain(REFERRER);
  });

  it("preflights a complete reset without a file or database inputs", () => {
    const r = run({ REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER }, true);
    expect(r.status).toBe(0);
    expect(r.files).toEqual([]);
    expect(r.stdout + r.stderr).not.toContain(SEEKER);
    expect(r.stdout + r.stderr).not.toContain(REFERRER);
  });

  it.each([
    {},
    { REVIEWER_SEEKER_PASSWORD_HASH: SEEKER },
    { REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: "malformed-secret" },
  ])("preflight refuses a missing, partial or malformed pair without files", pair => {
    const r = run({ REVIEWER_RESET: "true", ...pair }, true);
    expect(r.status).toBe(3);
    expect(r.files).toEqual([]);
    expect(r.stdout + r.stderr).not.toContain(SEEKER);
    expect(r.stdout + r.stderr).not.toContain("malformed-secret");
  });

  it("rejects a reset option other than an exact boolean string without reflecting it", () => {
    const r = run({ REVIEWER_RESET: "invalid-sensitive-value", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER });
    expect(r.status).toBe(3);
    expect(r.files).toEqual([]);
    expect(r.stdout + r.stderr).not.toContain("invalid-sensitive-value");
  });

  it("refuses without an output path", () => {
    const result = spawnSync(process.execPath, [script], { env: BASE, encoding: "utf8" });
    expect(result.status).toBe(2);
  });

  // OPS-reviewer-plaintext-reset (D-373 (3)): one plaintext secret pair serves the release and the signed-in QA runner.
  describe("plaintext reviewer secrets", () => {
    const SEEKER_PLAIN = "seeker-synthetic-pass-0001";
    const REFERRER_PLAIN = "referrer-synthetic-pass-0002";
    const plain = { REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD: SEEKER_PLAIN, REVIEWER_REFERRER_PASSWORD: REFERRER_PLAIN };
    const neverPrinted = (r: { stdout: string; stderr: string }, ...values: string[]) => {
      for (const value of values) expect(r.stdout + r.stderr).not.toContain(value);
    };

    it("derives both hashes in the runner, in the format the live sign-in verifies", () => {
      const r = run(plain);
      expect(r.status).toBe(0);
      const body = JSON.parse(r.body ?? "");
      expect(Object.keys(body).sort()).toEqual(["REVIEWER_REFERRER_PASSWORD_HASH", "REVIEWER_SEEKER_PASSWORD_HASH"]);
      expect(body.REVIEWER_SEEKER_PASSWORD_HASH).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
      expect(verifyReviewerPassword(SEEKER_PLAIN, body.REVIEWER_SEEKER_PASSWORD_HASH)).toBe(true);
      expect(verifyReviewerPassword(REFERRER_PLAIN, body.REVIEWER_REFERRER_PASSWORD_HASH)).toBe(true);
      expect(verifyReviewerPassword(REFERRER_PLAIN, body.REVIEWER_SEEKER_PASSWORD_HASH)).toBe(false);
      expect(r.mode).toBe(0o600);
      expect(r.stdout).toContain("REVIEWER_SEEKER_PASSWORD_HASH");
      neverPrinted(r, SEEKER_PLAIN, REFERRER_PLAIN, body.REVIEWER_SEEKER_PASSWORD_HASH, body.REVIEWER_REFERRER_PASSWORD_HASH);
    });

    it("prefers the plaintext pair over stored hashes, and uses a fresh salt each time", () => {
      const a = JSON.parse(run({ ...plain, REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER }).body ?? "");
      const b = JSON.parse(run(plain).body ?? "");
      expect(a.REVIEWER_SEEKER_PASSWORD_HASH).not.toBe(SEEKER);
      expect(verifyReviewerPassword(SEEKER_PLAIN, a.REVIEWER_SEEKER_PASSWORD_HASH)).toBe(true);
      expect(a.REVIEWER_SEEKER_PASSWORD_HASH).not.toBe(b.REVIEWER_SEEKER_PASSWORD_HASH);
    });

    it("keeps the stored-hash path when neither plaintext value is set", () => {
      const r = run({ REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.body ?? "")).toEqual({ REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER });
    });

    it.each([
      ["REVIEWER_REFERRER_PASSWORD", { REVIEWER_SEEKER_PASSWORD: SEEKER_PLAIN }],
      ["REVIEWER_SEEKER_PASSWORD", { REVIEWER_REFERRER_PASSWORD: REFERRER_PLAIN }],
    ])("refuses a single plaintext value, naming the missing %s, before any file", (missing, one) => {
      for (const validateOnly of [false, true]) {
        const r = run({ REVIEWER_RESET: "true", REVIEWER_SEEKER_PASSWORD_HASH: SEEKER, REVIEWER_REFERRER_PASSWORD_HASH: REFERRER, ...one }, validateOnly);
        expect(r.status).toBe(3);
        expect(r.files).toEqual([]);
        expect(r.stderr).toContain(missing);
        neverPrinted(r, SEEKER_PLAIN, REFERRER_PLAIN, SEEKER, REFERRER);
      }
    });

    it.each([
      ["REVIEWER_SEEKER_PASSWORD", { REVIEWER_SEEKER_PASSWORD: "short-pass-15ch" }],
      ["REVIEWER_REFERRER_PASSWORD", { REVIEWER_REFERRER_PASSWORD: "referrer-two\nlines-here" }],
    ])("refuses a short or multi-line %s without printing it", (name, bad) => {
      for (const validateOnly of [false, true]) {
        const r = run({ ...plain, ...bad }, validateOnly);
        expect(r.status).toBe(3);
        expect(r.files).toEqual([]);
        expect(r.stderr).toContain(name);
        neverPrinted(r, ...Object.values(bad), SEEKER_PLAIN, REFERRER_PLAIN);
      }
    });

    it("preflights a complete plaintext pair without a file", () => {
      const r = run(plain, true);
      expect(r.status).toBe(0);
      expect(r.files).toEqual([]);
      neverPrinted(r, SEEKER_PLAIN, REFERRER_PLAIN);
    });

    it.each(["", "false"])("ignores plaintext values on an ordinary deploy with reset=%s", reset => {
      const r = run({ ...plain, REVIEWER_RESET: reset });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.body ?? "")).toEqual({});
      neverPrinted(r, SEEKER_PLAIN, REFERRER_PLAIN);
    });
  });
});
