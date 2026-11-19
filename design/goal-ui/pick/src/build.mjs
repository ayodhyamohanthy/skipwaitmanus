#!/usr/bin/env node
// Writes the three "your pick" comps (D-070: Triage Desk's layout, Signal's type, no mode switch)
// next to this folder:
//   node design/goal-ui/pick/src/build.mjs
// Then render: node design/goal-ui/tools/render.mjs design/goal-ui/pick/*.html
// And gate:    node design/goal-ui/pick/src/gate.mjs
import fs from "node:fs";
import path from "node:path";
import { DIRECTION_DIR, OVERLAYS } from "./lib.mjs";
import find from "./page-find.mjs";
import queue from "./page-queue.mjs";
import asks from "./page-asks.mjs";

for (const note of OVERLAYS) console.log(`overlay: ${note}`);
const pages = { "find-a-referral.html": find, "referral-queue.html": queue, "my-asks.html": asks };
for (const [file, html] of Object.entries(pages)) {
  fs.writeFileSync(path.join(DIRECTION_DIR, file), html);
  console.log(`wrote ${file} (${html.length} bytes)`);
}
