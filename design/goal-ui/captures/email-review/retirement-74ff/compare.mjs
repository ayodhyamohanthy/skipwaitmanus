// Validate retained capture bytes, request multiplicity and private-flow order.
// Pixel differences are reported without masks; visual acceptance is separate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../..");
const receipt = JSON.parse(await readFile(path.join(here, "receipt.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const source = file => execFileSync("git", ["show", `${receipt.baseline}:${file}`], { cwd: root });
assert.equal(hash(source(receipt.entryPath)), receipt.beforeSourceSha256);
assert.equal(hash(await readFile(path.join(root, receipt.entryPath))), receipt.afterSourceSha256);
const unchanged = ["client/src/pages/goal/email-review/GoalEmailReviewAction.tsx", "client/public/brand/lockup.svg", "client/src/components/goal/GoalBrandMark.tsx", "client/src/index.css"];
for (const file of unchanged) assert.equal(hash(source(file)), hash(await readFile(path.join(root, file))));

const canonicalBag = rows => rows.map(row => JSON.stringify(row)).sort();
const privateFlow = rows => rows.filter(row => /^\/api\/(referrer-review-links\/|referrer\/step-up\/|company-referrals\/access$)/.test(row.path));
const pairs = [];
assert.equal(receipt.results.length, 40);
for (const before of receipt.results.filter(row => row.phase === "before")) {
  const matches = receipt.results.filter(row => row.phase === "after" && row.state === before.state && row.width === before.width);
  assert.equal(matches.length, 1);
  const after = matches[0];
  // Global preference and review GETs are independent effects. Their arrival
  // order can change when a nested lazy import is removed. Keep every request,
  // method, payload and duplicate, and separately preserve private-flow order.
  assert.deepEqual(canonicalBag(before.requests), canonicalBag(after.requests));
  assert.deepEqual(privateFlow(before.requests), privateFlow(after.requests));
  const images = [];
  for (const row of [before, after]) {
    assert.equal(row.overflow, 0); assert.deepEqual(row.errors, []); assert.deepEqual(row.unmatched, []);
    const bytes = await readFile(path.join(here, row.file));
    assert.equal(hash(bytes), row.sha256);
    images.push(await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  const [a, b] = images;
  assert.deepEqual(a.info, b.info);
  let changedPixels = 0;
  const bounds = { left: a.info.width, top: a.info.height, right: 0, bottom: 0 };
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.readUInt32LE(i) === b.data.readUInt32LE(i)) continue;
    changedPixels++;
    const x = (i / 4) % a.info.width, y = Math.floor(i / 4 / a.info.width);
    bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
  }
  let differingRegionHashes = null;
  if (changedPixels) {
    const region = { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left + 1, height: bounds.bottom - bounds.top + 1 };
    differingRegionHashes = await Promise.all([before, after].map(async row => hash(await sharp(path.join(here, row.file)).extract(region).raw().toBuffer())));
  }
  pairs.push({ state: before.state, width: before.width, changedPixels, bounds: changedPixels ? bounds : null, differingRegionHashes, requestMultisetMatches: true, privateFlowSequenceMatches: true });
}
const result = { baseline: receipt.baseline, unchangedSource: unchanged, pairs, pixelIdentical: pairs.filter(row => !row.changedPixels).length, visualInspectionRequired: pairs.some(row => row.changedPixels), noPixelMasks: true };
await writeFile(path.join(here, "comparison.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
