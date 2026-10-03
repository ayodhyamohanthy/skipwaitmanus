// Fails a GitHub Actions workflow edit that would silently stop triggering.
// A path filter that misses a build input is how a merged change reaches main
// and never deploys, which is exactly what happened to the SEO work on Sep 24.
import { readFileSync } from "node:fs";

const workflows = {
  pages: {
    file: ".github/workflows/deploy-pages.yml",
    must: [
      "client/**",
      "shared/**",
      "functions/**",
      "scripts/prerender-public-pages.tsx",
      "scripts/prerenderSeo.ts",
      "vite.config.ts",
      "package.json",
      ".github/workflows/deploy-pages.yml",
    ],
  },
  api: {
    file: ".github/workflows/deploy-api.yml",
    must: ["server/**", "shared/**", "drizzle/**", "src/worker.ts", "wrangler.jsonc", "tsconfig.json"],
  },
};

const problems = [];
for (const { file, must } of Object.values(workflows)) {
  const source = readFileSync(file, "utf8");
  if (/\t/.test(source)) problems.push(`${file} contains a tab`);
  for (const path of must) {
    if (!source.includes(`- "${path}"`)) problems.push(`${file} does not watch ${path}`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("workflow path filters cover every build input");