import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
const json = async path => JSON.parse(await readFile(path, "utf8"));
const before = await json(join(root, "before", "manifest-all.json"));
const after = await json(join(root, "after", "manifest-all.json"));
const beforeSource = await json(join(root, "before", "source-receipt.json"));
const afterSource = await json(join(root, "after", "source-receipt.json"));
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
assert.equal(before.results.length, 36);
assert.equal(after.results.length, 36);
const oldByFile = new Map(before.results.map(shot => [shot.file, shot]));
assert.equal(oldByFile.size, before.results.length);
assert.equal(new Set(after.results.map(shot => shot.file)).size, after.results.length);
const pairs = [];

for (const next of after.results) {
  const previous = oldByFile.get(next.file);
  assert.ok(previous, `missing baseline ${next.file}`);
  for (const field of ["route", "screen", "persona", "viewport", "fixture", "h1", "nextStepBlocks", "primaryCommits", "nestedButtons"]) {
    assert.deepEqual(next[field], previous[field], `${next.file}: ${field} changed`);
  }
  for (const shot of [previous, next]) {
    assert.equal(shot.horizontalOverflowPx, 0, `${shot.file}: horizontal overflow`);
    assert.equal(shot.nestedButtons, 0, `${shot.file}: nested interactive controls`);
    assert.deepEqual(shot.unmatchedApi, [], `${shot.file}: missing synthetic API response`);
    assert.deepEqual(shot.consoleErrors.filter(message => message.startsWith("pageerror:")), [], `${shot.file}: uncaught page error`);
  }
  const [oldPng, newPng] = await Promise.all([
    readFile(join(root, "before", next.file)),
    readFile(join(root, "after", next.file)),
  ]);
  const [oldImage, newImage] = await Promise.all([
    sharp(oldPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(newPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert.deepEqual(newImage.info, oldImage.info, `${next.file}: image dimensions changed`);
  let changedPixels = 0;
  let minX = oldImage.info.width;
  let minY = oldImage.info.height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < oldImage.data.length; offset += 4) {
    if (oldImage.data[offset] === newImage.data[offset]
      && oldImage.data[offset + 1] === newImage.data[offset + 1]
      && oldImage.data[offset + 2] === newImage.data[offset + 2]
      && oldImage.data[offset + 3] === newImage.data[offset + 3]) continue;
    changedPixels += 1;
    const pixel = offset / 4;
    const x = pixel % oldImage.info.width;
    const y = Math.floor(pixel / oldImage.info.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  pairs.push({
    file: next.file,
    viewportPixelWidth: next.viewport.width * next.viewport.dpr,
    documentPixelWidth: newImage.info.width,
    documentExceedsViewport: newImage.info.width > next.viewport.width * next.viewport.dpr,
    beforeSha256: hash(oldPng),
    afterSha256: hash(newPng),
    samePng: oldPng.equals(newPng),
    samePixels: changedPixels === 0,
    changedPixels,
    changedBounds: changedPixels ? [minX, minY, maxX, maxY] : null,
  });
}

const result = {
  before: beforeSource,
  after: afterSource,
  pairs,
  identicalPngPairs: pairs.filter(pair => pair.samePng).length,
  identicalPixelPairs: pairs.filter(pair => pair.samePixels).length,
  pageErrors: 0,
  rootElementHorizontalOverflow: 0,
  existingDocumentWidthFindings: pairs.filter(pair => pair.documentExceedsViewport).map(pair => ({ file: pair.file, viewportPixelWidth: pair.viewportPixelWidth, documentPixelWidth: pair.documentPixelWidth })),
  unmatchedApiCalls: 0,
  consoleDiagnosticScope: "Retained: local SDK configuration notice and intentional mocked HTTP/API failure or denial logs. These are not claimed to be absent.",
};
await writeFile(join(root, "comparison.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ pairs: pairs.length, identicalPngPairs: result.identicalPngPairs, identicalPixelPairs: result.identicalPixelPairs, changed: pairs.filter(pair => !pair.samePixels), pageErrors: 0, rootElementHorizontalOverflow: 0, existingDocumentWidthFindings: result.existingDocumentWidthFindings, unmatchedApiCalls: 0 }));
