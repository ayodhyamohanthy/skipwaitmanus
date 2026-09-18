import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const verify = readFileSync("scripts/verify-cloudflare-container-release.sh", "utf8");
const deploy = readFileSync("scripts/deploy-cloudflare-two-phase.sh", "utf8");
const workflow = readFileSync(".github/workflows/deploy-api.yml", "utf8");
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
});
