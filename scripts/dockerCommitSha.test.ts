import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Cloudflare Workers Builds runs `wrangler deploy` on main, which builds this
// Dockerfile WITHOUT the GHA-generated commit-sha.txt artifact (the file is
// gitignored and only exists inside the deploy-api workflow). A plain
// `COPY commit-sha.txt` fails that build; the build stage must guarantee the
// file and the final stage must copy it from the build stage.
describe("the API image builds without the GHA-generated commit-sha.txt", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");

  it("never COPYs commit-sha.txt straight from the build context", () => {
    expect(dockerfile).not.toMatch(/^COPY commit-sha\.txt/m);
  });

  it("guarantees the artifact inside the build stage and copies it from there", () => {
    expect(dockerfile).toContain('if [ ! -f commit-sha.txt ]; then echo "unknown" > commit-sha.txt; fi');
    expect(dockerfile).toContain("COPY --from=build /app/commit-sha.txt ./commit-sha.txt");
  });
});
