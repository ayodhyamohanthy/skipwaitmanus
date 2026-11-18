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
const goalFiles = ["client/src/pages/conversation/ReferrerConversation.tsx", "client/src/pages/conversation/SeekerConversation.tsx"];
assert.equal(execFileSync("git", ["diff", before.sourceCommit, "--", ...goalFiles], { cwd: root, encoding: "utf8" }), "");
const results = [];
for (const [index, item] of after.results.entries()) {
  const prior = before.results[index];
  assert.equal(item.file, prior.file);
  assert.equal(item.horizontalOverflowPx, 0);
  assert.equal(prior.horizontalOverflowPx, 0);
  assert.deepEqual(item.errors, []);
  assert.deepEqual(prior.errors, []);
  const buffers = await Promise.all(["before", "after"].map(async phase => {
    const buffer = await readFile(path.join(here, phase, item.file));
    const manifest = phase === "before" ? prior : item;
    assert.equal(createHash("sha256").update(buffer).digest("hex"), manifest.sha256);
    return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  }));
  assert.deepEqual(buffers[0].info, buffers[1].info);
  const [a, b] = buffers;
  let changedPixels = 0;
  const box = { xMin: a.info.width, yMin: a.info.height, xMax: 0, yMax: 0 };
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) continue;
    changedPixels += 1;
    const x = (i / 4) % a.info.width, y = Math.floor(i / 4 / a.info.width);
    box.xMin = Math.min(box.xMin, x); box.xMax = Math.max(box.xMax, x);
    box.yMin = Math.min(box.yMin, y); box.yMax = Math.max(box.yMax, y);
  }
  results.push({ state: item.state, width: item.width, changedPixels, bounds: changedPixels ? box : null });
}
const report = { beforeSourceSha256: before.sourceSha256, afterSourceSha256: after.sourceSha256, unchangedGoalFiles: goalFiles, results };
await writeFile(path.join(here, "comparison.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ compared: results.length, pixelIdentical: results.filter(item => item.changedPixels === 0).length, differences: results.filter(item => item.changedPixels > 0) }, null, 2));
