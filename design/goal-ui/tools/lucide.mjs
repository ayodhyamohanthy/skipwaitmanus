#!/usr/bin/env node
// Prints inline SVG markup for lucide icons (the same set lucide-react ships),
// so static design comps use the product's icon library and nothing else.
// Usage: node design/goal-ui/tools/lucide.mjs badge-check search [--size 16] [--stroke 2]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const icons = path.resolve(here, "../../../node_modules/lucide-react/dist/esm/icons");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); if (i === -1) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const size = opt("--size", "16"), stroke = opt("--stroke", "2");
for (const name of args) {
  const file = path.join(icons, `${name}.js`);
  if (!fs.existsSync(file)) { console.error(`unknown lucide icon: ${name}`); process.exitCode = 1; continue; }
  const src = fs.readFileSync(file, "utf8");
  const body = src.slice(src.indexOf("createLucideIcon(") + 17, src.lastIndexOf(");"));
  const nodes = body.slice(body.indexOf("["));
  const parsed = Function(`"use strict"; return (${nodes});`)();
  const inner = parsed.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  console.log(`<!-- lucide:${name} --><svg class="icon icon-${name}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
}
