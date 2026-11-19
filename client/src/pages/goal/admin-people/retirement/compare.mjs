// Compare the browser's saved pixels without a tolerance mask.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "evidence");
const results = [];
for (const surface of ["users", "privacy", "privacy-ready"]) {
  for (const viewportWidth of [1280, 390]) {
    const beforeName = `${surface}-before-${viewportWidth}.png`;
    const afterName = `${surface}-after-${viewportWidth}.png`;
    const beforeBytes = await readFile(join(root, beforeName));
    const afterBytes = await readFile(join(root, afterName));
    const before = await sharp(beforeBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(afterBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (before.info.width !== after.info.width || before.info.height !== after.info.height) throw new Error(`${surface} ${viewportWidth}: image dimensions changed`);
    let changedPixels = 0;
    let maximumChannelDelta = 0;
    let totalDelta = 0;
    for (let index = 0; index < before.data.length; index += 4) {
      const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(before.data[index + channel] - after.data[index + channel])));
      if (delta === 0) continue;
      changedPixels += 1;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      totalDelta += delta;
    }
    results.push({
      surface, viewportWidth, imageWidth: before.info.width, imageHeight: before.info.height,
      before: beforeName, after: afterName, changedPixels, maximumChannelDelta,
      meanMaximumChannelDelta: changedPixels ? totalDelta / changedPixels : 0,
      beforeSha256: createHash("sha256").update(beforeBytes).digest("hex"),
      afterSha256: createHash("sha256").update(afterBytes).digest("hex"),
    });
  }
}
await writeFile(join(root, "comparison.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
