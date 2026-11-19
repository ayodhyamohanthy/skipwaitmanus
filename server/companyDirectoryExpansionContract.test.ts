import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicCompanySchema } from "../shared/companies";
import { LAUNCH_COMPANY_SEED } from "../shared/companyDirectorySeed";
import { DIRECTORY_EXPANSION_SEED, DIRECTORY_EXPANSION_SEED_2 } from "../shared/companyDirectoryExpansionSeed";

const batches = [["0092_company_directory_expansion.sql", DIRECTORY_EXPANSION_SEED], ["0093_company_directory_expansion_2.sql", DIRECTORY_EXPANSION_SEED_2]] as const;
const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;

describe("directory expansion seed", () => {
  it("has valid entries with unique slugs and domains that do not collide with the launch seed", () => {
    const all = [...LAUNCH_COMPANY_SEED, ...DIRECTORY_EXPANSION_SEED, ...DIRECTORY_EXPANSION_SEED_2];
    expect(new Set(all.map(c => c.slug)).size).toBe(all.length);
    expect(new Set(all.flatMap(c => c.domains)).size).toBe(all.flatMap(c => c.domains).length);
    expect(new Set(all.map(c => c.sortOrder)).size).toBe(all.length);
    for (const seed of [...DIRECTORY_EXPANSION_SEED, ...DIRECTORY_EXPANSION_SEED_2]) publicCompanySchema.parse({ ...seed, functions: [...seed.functions], domains: [...seed.domains], openToReferrals: false });
  });

  it.each(batches)("migration %s inserts exactly the seed rows and domains, additively", (file, seedRows) => {
    const migration = readFileSync(join(__dirname, "..", "drizzle", "deploy", file), "utf8");
    for (const [index, seed] of seedRows.entries()) {
      const v = [seed.slug, seed.name, seed.initials, seed.industry, seed.location, JSON.stringify(seed.functions), seed.blurb].map(sqlText);
      expect(migration).toContain(index === 0
        ? `SELECT ${v[0]} AS slug, ${v[1]} AS name, ${v[2]} AS initials, ${v[3]} AS industry, ${v[4]} AS location, ${v[5]} AS functions, ${v[6]} AS blurb, ${seed.sortOrder} AS sortOrder`
        : `UNION ALL SELECT ${v.join(", ")}, ${seed.sortOrder}`);
      expect(migration).toContain(index === 0 ? `SELECT ${sqlText(seed.slug)} AS slug, ${sqlText(seed.domains[0]!)} AS domain` : `UNION ALL SELECT ${sqlText(seed.slug)}, ${sqlText(seed.domains[0]!)}`);
    }
    expect(migration.match(/UNION ALL SELECT/g)).toHaveLength((seedRows.length - 1) * 2);
    expect(migration).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM `companies` c WHERE c\.slug = v\.slug\)/);
    expect(migration).not.toMatch(/\b(DELETE|DROP|UPDATE)\b/i);
  });
});
