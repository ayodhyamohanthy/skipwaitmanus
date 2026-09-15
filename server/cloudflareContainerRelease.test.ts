import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Cloudflare container acceptance", () => {
  it("uses control-plane application, image, version and running release identity without HTTP probes", () => {
    const script = readFileSync("scripts/verify-cloudflare-container-release.sh", "utf8");
    expect(script).toContain("containers info"); expect(script).toContain("containers instances"); expect(script).toContain("configuration.image");
    expect(script).toContain("sleep 660"); expect(script).toContain("curl -sS --max-time 90"); expect(script).not.toContain("/api/health");
    expect(script).toContain("::error::Cloudflare uploaded/configured image");
  });
});
