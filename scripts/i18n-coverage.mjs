#!/usr/bin/env node
// D-093 packet §5.3 item 4: the static fallback-share report for the i18n
// catalogue. Plain JavaScript twin of the checks in shared/i18n/catalog.ts —
// keep the two in sync (scripts/i18nCoverage.test.ts pins this one's CLI).
//
// Usage: node scripts/i18n-coverage.mjs [--root <dir>]
// Prints, per locale file, present/total English leaves and the English
// fallback share. Missing keys are fine (partial locales allowed); they only
// widen the share. Exits non-zero only on errors: invalid JSON, a key English
// does not define, or a renamed {placeholder}.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const root = resolve(rootFlag !== -1 ? args[rootFlag + 1] : join(scriptDir, ".."));

const CLDR = new Set(["zero", "one", "two", "few", "many", "other"]);
const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

const isPlainObject = value => typeof value === "object" && value !== null && !Array.isArray(value);
const isPluralNode = value => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(key => CLDR.has(key)) && Object.values(value).every(item => typeof item === "string");
};

function collectLeaves(tree) {
  const leaves = new Map();
  const walk = (node, prefix) => {
    if (typeof node === "string" || isPluralNode(node)) { leaves.set(prefix, node); return; }
    if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${prefix}.${index}`)); return; }
    if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (prefix === "" && key === "_meta") continue;
        walk(value, prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  walk(tree, "");
  return leaves;
}

const placeholderNames = template => {
  const names = new Set();
  for (const match of template.matchAll(PLACEHOLDER)) names.add(match[1]);
  return names;
};
const sameNames = (a, b) => a.size === b.size && [...a].every(name => b.has(name));
const placeholderNamesOfLeaf = leaf => {
  if (typeof leaf === "string") return placeholderNames(leaf);
  const names = new Set();
  for (const template of Object.values(leaf)) for (const name of placeholderNames(template)) names.add(name);
  return names;
};
const leafMatches = (enLeaf, loLeaf) => {
  if (isPluralNode(enLeaf) !== isPluralNode(loLeaf)) return false;
  if (typeof enLeaf === "string" && typeof loLeaf === "string") return sameNames(placeholderNames(enLeaf), placeholderNames(loLeaf));
  const reference = placeholderNamesOfLeaf(enLeaf);
  return Object.values(loLeaf).every(template => sameNames(placeholderNames(template), reference));
};

const contentPath = join(root, "design", "goal-ui", "content.json");
const enTree = JSON.parse(readFileSync(contentPath, "utf8"));
const enLeaves = collectLeaves(enTree);
console.log(`English leaves: ${enLeaves.size}`);

const localesDir = join(root, "shared", "i18n", "locales");
const files = existsSync(localesDir) ? readdirSync(localesDir).filter(name => name.endsWith(".json")).sort() : [];
console.log(`locales: ${files.length}`);

let errors = 0;
for (const file of files) {
  let locale;
  try {
    locale = JSON.parse(readFileSync(join(localesDir, file), "utf8"));
  } catch (error) {
    console.error(`${file}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    errors += 1;
    continue;
  }
  const loLeaves = collectLeaves(locale);
  const missing = [];
  const extra = [];
  const mismatched = [];
  for (const [key, enLeaf] of enLeaves) {
    const loLeaf = loLeaves.get(key);
    if (loLeaf === undefined) { missing.push(key); continue; }
    if (!leafMatches(enLeaf, loLeaf)) mismatched.push(key);
  }
  for (const key of loLeaves.keys()) if (!enLeaves.has(key)) extra.push(key);

  const present = enLeaves.size - missing.length;
  const fallbackShare = ((missing.length / enLeaves.size) * 100).toFixed(1);
  console.log(`${file}: ${present}/${enLeaves.size} leaves, fallback share ${fallbackShare}%`);
  for (const key of extra) { console.error(`${file}: key English does not define: ${key}`); errors += 1; }
  for (const key of mismatched) { console.error(`${file}: placeholder mismatch: ${key}`); errors += 1; }
}

process.exit(errors === 0 ? 0 : 1);
