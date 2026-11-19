import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin-people retirement (D-048-K-admin-people)", () => {
  it.each(["AdminUsers", "AdminPrivacyRequests"])("%s keeps only the released goal entry", page => {
    const source = readFileSync(join(__dirname, "../..", `${page}.tsx`), "utf8");
    expect(source).not.toMatch(/goalSurfaceOn|components\/kit|useAuth|useEffect|useState/);
    expect(source).toContain(`export default function ${page}()`);
    expect(source).toContain(`import("./goal/admin-people/Goal${page}")`);
    expect(source).toContain(`<Goal${page} />`);
  });
});
