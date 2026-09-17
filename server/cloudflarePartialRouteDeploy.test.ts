import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const deploy = readFileSync(new URL("../scripts/deploy-cloudflare-two-phase.sh", import.meta.url), "utf8");
describe("Cloudflare partial route deployment",()=>{
  it("accepts only the known post-apply zone-list failure and keeps hard runtime gates",()=>{
    expect(deploy).toContain('Uploaded skipwaitmanus');
    expect(deploy).toContain('SUCCESS.*Modified application skipwaitmanus-api|no changes skipwaitmanus-api');
    expect(deploy).toContain('Applied changes|No changes to be made');
    expect(deploy).toContain('/workers/routes');
    expect(deploy).toContain('Authentication error \\[code: 10000\\]');
    expect(deploy).toContain(`grep -q '"pattern": "skipwait.me/api/\\*"' wrangler.jsonc`);
    expect(deploy).toContain('poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA"');
    expect(deploy).toContain('direct_status=$(curl');
    expect(deploy).toContain('[[ "$direct_status" == "404" ]]');
  });
});
