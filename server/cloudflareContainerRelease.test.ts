import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const verify = readFileSync("scripts/verify-cloudflare-container-release.sh", "utf8");
const deploy = readFileSync("scripts/deploy-cloudflare-two-phase.sh", "utf8");
const workflow = readFileSync(".github/workflows/deploy-api.yml", "utf8");
const resetWorkflow = readFileSync(".github/workflows/reviewer-qa-passwords.yml", "utf8");
const envExample = readFileSync(".env.example", "utf8");

function job(source: string, name: string): string {
  const start = source.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`Missing workflow job: ${name}`);
  const rest = source.slice(start + 1);
  const end = rest.slice(1).search(/\n  [a-zA-Z][a-zA-Z0-9_-]*:\n/);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
describe("Cloudflare container acceptance", () => {
  it("gates release acceptance on exact baked SHA readiness", () => {
    expect(verify).toContain('poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA"');
    expect(verify).toContain('RUNTIME CONVERGED: release=$EXPECTED_SHA state=ready');
  });
  it("keeps the public workers.dev origin closed", () => {
    expect(verify).toContain("skipwaitmanus.ayodhya-711.workers.dev/api/health/ready");
    expect(verify).toContain('[[ "$direct_status" == "404" ]]');
    expect(deploy).toContain('[[ "$direct_status" == "404" ]]');
  });
  it("does not require unavailable container control-plane reads", () => {
    for (const source of [verify, deploy, workflow]) {
      expect(source).not.toContain("containers list --json");
      expect(source).not.toContain("containers info");
      expect(source).not.toContain("containers instances");
    }
  });
  it("uploads secrets with the release instead of editing them afterwards (D-369)", () => {
    expect(deploy).toContain('npx wrangler deploy --secrets-file "$secrets_file"');
    expect(deploy).toContain('build-deploy-secrets.mjs" "$secrets_file"');
    expect(deploy).toContain("trap 'rm -rf \"$secrets_dir\"' EXIT");
    expect(deploy).not.toContain("wrangler secret put DATABASE_URL");
    expect(workflow).toContain("REVIEWER_SEEKER_PASSWORD_HASH: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_SEEKER_PASSWORD_HASH || '' }}");
    expect(workflow).toContain("REVIEWER_REFERRER_PASSWORD_HASH: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_REFERRER_PASSWORD_HASH || '' }}");
    expect(workflow).not.toMatch(/run:[^\n]*github\.event\.inputs\.reviewer_/);
  });
  it("accepts only a non-sensitive reset choice at the workflow boundary", () => {
    const dispatch = workflow.slice(workflow.indexOf("  workflow_dispatch:"), workflow.indexOf("\nconcurrency:"));
    expect(dispatch).toMatch(/reset_reviewer_passwords:\n[\s\S]*type: boolean\n[\s\S]*default: false/);
    expect(dispatch).not.toMatch(/(?:reviewer_seeker_hash|reviewer_referrer_hash|seeker_hash|referrer_hash):/);
    expect(workflow).not.toMatch(/(?:inputs|github\.event\.inputs)\.(?:reviewer_seeker_hash|reviewer_referrer_hash)/);
    expect(workflow).not.toMatch(/run:[^\n]*secrets\.REVIEWER_/);
    expect(envExample).toContain("REVIEWER_RESET=false");
    expect(envExample).toContain("REVIEWER_SEEKER_PASSWORD_HASH=");
    expect(envExample).toContain("REVIEWER_REFERRER_PASSWORD_HASH=");
  });
  it("validates protected reset inputs before migration and deployment", () => {
    const preflight = job(workflow, "reviewer-reset-preflight");
    expect(preflight).toContain("needs: release-gate");
    expect(preflight).toContain("node scripts/build-deploy-secrets.mjs --validate-reviewer-reset");
    expect(preflight).toContain("REVIEWER_RESET: ${{ inputs.reset_reviewer_passwords == true }}");
    expect(preflight).not.toContain("CLOUDFLARE_API_TOKEN:");
    expect(preflight).not.toContain("upload-artifact");
    expect(job(workflow, "migrate-db")).toContain("needs: [release-gate, source-retirement, reviewer-reset-preflight]");
    expect(job(workflow, "deploy")).toContain("needs: migrate-db");
    expect(job(workflow, "deploy")).toContain("REVIEWER_RESET: ${{ inputs.reset_reviewer_passwords == true }}");
    expect(workflow).toContain("Re-check green CI before migrating");
    expect(workflow).toContain("Verify administrator sign-in gate");
    expect(workflow).toContain("Verify active Cloudflare container release");
  });
  it.each([
    ["migrate-db", "Apply pending production migrations"],
    ["deploy", "Ensure admin smoke signing secret exists"],
  ])("revalidates reset inputs before production writes when only %s is rerun", (name, firstWrite) => {
    const source = job(workflow, name);
    const validation = source.indexOf("node scripts/build-deploy-secrets.mjs --validate-reviewer-reset");
    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(source.indexOf(`- name: ${firstWrite}`));
    expect(source).toContain("REVIEWER_RESET: ${{ inputs.reset_reviewer_passwords == true }}");
    expect(source).toContain("REVIEWER_SEEKER_PASSWORD_HASH: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_SEEKER_PASSWORD_HASH || '' }}");
    expect(source).toContain("REVIEWER_REFERRER_PASSWORD_HASH: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_REFERRER_PASSWORD_HASH || '' }}");
  });
  it("routes the original reset workflow through the protected gated release", () => {
    expect(resetWorkflow).not.toMatch(/(?:seeker_hash|referrer_hash):/);
    expect(resetWorkflow).not.toContain("api.cloudflare.com");
    expect(resetWorkflow).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(resetWorkflow).toContain("actions: write");
    expect(resetWorkflow).toContain("gh workflow run deploy-api.yml --ref main -f reset_reviewer_passwords=true");
    expect(resetWorkflow).toContain("REVIEWER_SEEKER_PASSWORD_HASH");
    expect(resetWorkflow).toContain("REVIEWER_REFERRER_PASSWORD_HASH");
    expect(resetWorkflow).not.toContain("same two hashes");
  });
  // OPS-reviewer-plaintext-reset (D-373 (3)): the plaintext pair rides the same reset-only expressions as the hashes.
  it.each(["reviewer-reset-preflight", "migrate-db", "deploy"])("passes the plaintext pair to %s only on a reset, through env", name => {
    const source = job(workflow, name);
    expect(source).toContain("REVIEWER_SEEKER_PASSWORD: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_SEEKER_PASSWORD || '' }}");
    expect(source).toContain("REVIEWER_REFERRER_PASSWORD: ${{ inputs.reset_reviewer_passwords == true && secrets.REVIEWER_REFERRER_PASSWORD || '' }}");
  });
  it("never puts a plaintext reviewer secret in a command, an input or anywhere but a reset-gated env", () => {
    expect(workflow).not.toMatch(/run:[^\n]*REVIEWER_(?:SEEKER|REFERRER)_PASSWORD\b/);
    expect(workflow).not.toMatch(/inputs\.reviewer_(?:seeker|referrer)_password/);
    const uses = workflow.match(/secrets\.REVIEWER_(?:SEEKER|REFERRER)_PASSWORD\b/g) ?? [];
    const gated = workflow.match(/inputs\.reset_reviewer_passwords == true && secrets\.REVIEWER_(?:SEEKER|REFERRER)_PASSWORD \|\| ''/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    expect(gated.length).toBe(uses.length);
    expect(envExample).toMatch(/^REVIEWER_SEEKER_PASSWORD=$/m);
    expect(envExample).toMatch(/^REVIEWER_REFERRER_PASSWORD=$/m);
    expect(resetWorkflow).toContain("REVIEWER_SEEKER_PASSWORD and REVIEWER_REFERRER_PASSWORD");
  });
});
