import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const before = JSON.parse(await readFile(path.join(here, "before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(here, "after.json"), "utf8"));
assert.equal(before.results.length, after.results.length);
assert.equal(after.sourceSha256, createHash("sha256").update(await readFile(path.join(root, after.entryPath))).digest("hex"));
const unchangedFiles = ["client/src/pages/goal/verify/GoalVerify.tsx", "client/src/components/verify/verifyApi.ts", "client/src/pages/loginRule.test.tsx", "client/src/pages/signIn.test.tsx"];
assert.equal(execFileSync("git", ["diff", before.checkoutBase, "--", ...unchangedFiles], { cwd: root, encoding: "utf8" }), "");
const results = [];
for (const [index, item] of after.results.entries()) {
  const prior = before.results[index];
  assert.equal(item.file, prior.file);
  assert.equal(item.overflow, 0); assert.equal(prior.overflow, 0);
  assert.deepEqual(item.errors, []); assert.deepEqual(prior.errors, []);
  assert.deepEqual(item.calls, prior.calls);
  const [a, b] = await Promise.all(["before", "after"].map(async phase => {
    const buffer = await readFile(path.join(here, phase, item.file));
    assert.equal(createHash("sha256").update(buffer).digest("hex"), (phase === "before" ? prior : item).sha256);
    return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  }));
  assert.deepEqual(a.info, b.info);
  let changedPixels = 0;
  const bounds = { xMin: a.info.width, yMin: a.info.height, xMax: 0, yMax: 0 };
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) continue;
    changedPixels++;
    const x = (i / 4) % a.info.width, y = Math.floor(i / 4 / a.info.width);
    bounds.xMin = Math.min(bounds.xMin, x); bounds.xMax = Math.max(bounds.xMax, x);
    bounds.yMin = Math.min(bounds.yMin, y); bounds.yMax = Math.max(bounds.yMax, y);
  }
  results.push({ state: item.state, width: item.width, changedPixels, bounds: changedPixels ? bounds : null });
}
await writeFile(path.join(here, "comparison.json"), JSON.stringify({ beforeSourceSha256: before.sourceSha256, afterSourceSha256: after.sourceSha256, unchangedFiles, matchingApiCallSequences: true, results }, null, 2));
console.log(JSON.stringify({ pairs: results.length, pixelIdentical: results.filter(item => item.changedPixels === 0).length, differences: results.filter(item => item.changedPixels) }, null, 2));
