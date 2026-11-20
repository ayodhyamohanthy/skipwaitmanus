import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [beforeRoot, afterRoot, baseline = "4af170fbb"] = process.argv.slice(2);
assert.ok(beforeRoot && afterRoot, "provide baseline and candidate dist directories");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { maxBuffer: 16 * 1024 * 1024 });
git("merge-base", "--is-ancestor", baseline, "HEAD");
const preserved = [
  "client/src/pages/MyRequests.tsx", "client/src/pages/MyCompanyInbox.tsx",
  "client/src/pages/Ask.tsx", "client/src/pages/Explore.tsx", "client/src/pages/ExploreCompany.tsx",
  "client/src/pages/goal/seeker-small/GoalLanded.tsx", "client/src/pages/CompanyClaim.tsx",
  "client/src/components/requests/RequestStates.tsx", "client/src/components/requests/requestModel.ts",
  "client/src/components/requests/requestsApi.ts", "client/src/components/explore/CompanyResponseSignal.tsx",
  "client/src/components/explore/companyResponseSignal.test.tsx",
];
const sourceHashes = [];
for (const path of preserved) {
  const before = hash(git("show", `${baseline}:${path}`));
  const after = hash(await readFile(path));
  assert.equal(after, before, `preserved source changed: ${path}`);
  sourceHashes.push({ path, sha256: after, unchangedFromBaseline: true });
}
const names = root => readdir(resolve(root, "public/assets"));
const beforeNames = await names(beforeRoot), afterNames = await names(afterRoot);
const stableName = name => name.replace(/-[\w-]{8}(?=\.(?:js|css)$)/, "-[content-hash]");
async function javascript(root, assets) {
  const escaped = [...assets].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(escaped.join("|"), "g");
  return Promise.all(assets.filter(name => name.endsWith(".js")).map(async name => ({
    logicalName: stableName(name),
    normalizedSha256: hash((await readFile(resolve(root, "public/assets", name), "utf8")).replace(pattern, stableName)),
  })));
}
const sort = rows => rows.sort((a, b) => `${a.logicalName}:${a.normalizedSha256}`.localeCompare(`${b.logicalName}:${b.normalizedSha256}`));
const beforeJs = sort(await javascript(beforeRoot, beforeNames));
const afterJs = sort(await javascript(afterRoot, afterNames));
const beforeCssName = beforeNames.find(name => /^index-.*\.css$/.test(name));
const afterCssName = afterNames.find(name => /^index-.*\.css$/.test(name));
assert.ok(beforeCssName && afterCssName);
const beforeCss = await readFile(resolve(beforeRoot, "public/assets", beforeCssName), "utf8");
const afterCss = await readFile(resolve(afterRoot, "public/assets", afterCssName), "utf8");
const rules = css => new Set([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => match[0]));
const beforeRules = rules(beforeCss), afterRules = rules(afterCss);
const captures = JSON.parse(await readFile("docs/evidence/D-048-K-inplace/verified/capture.json", "utf8"));
const parity = JSON.parse(await readFile("docs/evidence/D-048-K-inplace/verified/parity.json", "utf8"));
assert.equal(captures.results.length, 32); assert.equal(parity.pairs.length, 16);
assert.ok(parity.pairs.every(pair => pair.pngByteIdentical && pair.textAndApiCountsEqual));
const result = {
  task: "D-048-K-inplace",
  checkedHead: git("rev-parse", "HEAD").toString().trim(),
  baseline: git("rev-parse", baseline).toString().trim(),
  candidateSource: "6f3b28cc6: two unused components deleted; captured bundles were built before that commit while HEAD was 4af170fbb",
  sourceHashes,
  generatedBuild: {
    rawBytesIdentical: false,
    javascriptChunks: { before: beforeJs.length, after: afterJs.length, identicalAfterAssetFilenameNormalization: JSON.stringify(beforeJs) === JSON.stringify(afterJs) },
    serverBundleIdentical: hash(await readFile(resolve(beforeRoot, "index.js"))) === hash(await readFile(resolve(afterRoot, "index.js"))),
    css: { beforeBytes: Buffer.byteLength(beforeCss), afterBytes: Buffer.byteLength(afterCss), removedRules: [...beforeRules].filter(rule => !afterRules.has(rule)), addedRules: [...afterRules].filter(rule => !beforeRules.has(rule)) },
  },
  browser: { synthetic: true, productionRequests: 0, pairs: parity.pairs.length, byteIdenticalPairs: parity.pairs.filter(pair => pair.pngByteIdentical).length, allTextAndApiCountsEqual: true, apiOrderingMatches: parity.pairs.filter(pair => pair.apiSequenceEqual).length, overflowOrPageErrors: 0, inspected: ["after/company-390.png", "after/requests-populated-1280.png", "after/landed-error-390.png"] },
  limits: [
    "Local synthetic fixtures, not canonical production or authentication acceptance.",
    "Initial harness attempts lacked work-items/company schema fields and selected premature loading headings; those incomplete captures were excluded and retained only in local scratch.",
    "Concurrent React Query launch ordering differs; method/path counts and all rendered text match. No business write was performed.",
    "RequestStates remains imported by GoalLanded and still renders its existing Kit error state. CompanyClaim retains the response-signal view and all seven tests. This row does not remove the entire Kit layer.",
    "The first broad focused command timed out without results; a narrower 12-test run passed. Full-local suite and exact-head CI are separate evidence.",
  ],
};
await writeFile("docs/evidence/D-048-K-inplace/audit.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ normalizedJsEqual: result.generatedBuild.javascriptChunks.identicalAfterAssetFilenameNormalization, serverBundleEqual: result.generatedBuild.serverBundleIdentical, pixelIdenticalPairs: result.browser.byteIdenticalPairs }));
