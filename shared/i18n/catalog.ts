// D-093 "measure first": the i18n catalogue. design/goal-ui/content.json stays
// the English source of truth (packet §4.6); other languages live in
// shared/i18n/locales/<code>.json, mirroring its key paths, and may be partial.
// A key the active catalogue lacks falls back to English per key — never to a
// guess, never to silence. Plurals are objects keyed by CLDR category chosen by
// Intl.PluralRules(code); placeholders are {name}. Prices, amounts and counts
// are data passed in, never translated text.
//
// A language becomes selectable only in a per-language row: its locale file
// lands here, is registered in LOCALE_TREES, and a human review of the money,
// credit, legal and trust strings is recorded in the PR (packet §6.3). Until
// then only English is visible and every other lookup falls back to English.

import contentJson from "../../design/goal-ui/content.json";

export type Tree = Record<string, unknown>;
export type PluralNode = Record<string, string>;
export type TranslateParams = Record<string, string | number>;
export interface TranslateResult {
  text: string;
  fellBack: boolean;
}

const CLDR_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function isPlainObject(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPluralNode(value: unknown): value is PluralNode {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(key => CLDR_CATEGORIES.has(key)) && Object.values(value).every(value => typeof value === "string");
}

function placeholderNames(template: string): Set<string> {
  const names = new Set<string>();
  for (const match of Array.from(template.matchAll(PLACEHOLDER))) names.add(match[1]);
  return names;
}

function sameNames(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && Array.from(a).every(name => b.has(name));
}

export interface LocaleValidation {
  totalEnglishLeaves: number;
  presentLeaves: number;
  missingKeys: string[];
  extraKeys: string[];
  placeholderMismatches: string[];
}

/**
 * Collect every translatable leaf: a string, or a plural-category object.
 * `_meta` is design-deck metadata, not user-facing copy, and is excluded from
 * both the catalogue count and the completeness rule.
 */
export function collectEnglishLeaves(tree: Tree): Map<string, string | PluralNode> {
  const leaves = new Map<string, string | PluralNode>();
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === "string" || isPluralNode(node)) {
      leaves.set(prefix, node as string | PluralNode);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${prefix}.${index}`));
      return;
    }
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

function placeholderNamesOfLeaf(leaf: string | PluralNode): Set<string> {
  if (typeof leaf === "string") return placeholderNames(leaf);
  const names = new Set<string>();
  for (const template of Object.values(leaf)) {
    for (const name of Array.from(placeholderNames(template))) names.add(name);
  }
  return names;
}

function leafPlaceholdersMatch(enLeaf: string | PluralNode, loLeaf: string | PluralNode): boolean {
  if (isPluralNode(enLeaf) !== isPluralNode(loLeaf)) return false;
  if (typeof enLeaf === "string" && typeof loLeaf === "string") {
    return sameNames(placeholderNames(enLeaf), placeholderNames(loLeaf));
  }
  // Every category of the locale node must carry the same placeholder set as
  // the English node, whatever categories it chose to translate.
  const reference = placeholderNamesOfLeaf(enLeaf);
  for (const template of Object.values(loLeaf as PluralNode)) {
    if (!sameNames(placeholderNames(template), reference)) return false;
  }
  return true;
}

export function validateLocaleAgainstEnglish(english: Tree, locale: Tree): LocaleValidation {
  const enLeaves = collectEnglishLeaves(english);
  const loLeaves = collectEnglishLeaves(locale);
  const missingKeys: string[] = [];
  const extraKeys: string[] = [];
  const placeholderMismatches: string[] = [];
  enLeaves.forEach((enLeaf, key) => {
    const loLeaf = loLeaves.get(key);
    if (loLeaf === undefined) {
      missingKeys.push(key);
      return;
    }
    if (!leafPlaceholdersMatch(enLeaf, loLeaf)) placeholderMismatches.push(key);
  });
  loLeaves.forEach((_leaf, key) => {
    if (!enLeaves.has(key)) extraKeys.push(key);
  });
  return {
    totalEnglishLeaves: enLeaves.size,
    presentLeaves: enLeaves.size - missingKeys.length,
    missingKeys: missingKeys.sort(),
    extraKeys: extraKeys.sort(),
    placeholderMismatches: placeholderMismatches.sort(),
  };
}

function getPath(tree: Tree, keyPath: string): unknown {
  let node: unknown = tree;
  for (const part of keyPath.split(".")) {
    if (node == null) return undefined;
    if (Array.isArray(node)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      node = node[index];
    } else if (isPlainObject(node)) {
      node = node[part];
    } else {
      return undefined;
    }
  }
  return node;
}

function pickPlural(node: PluralNode, count: number | undefined, code: string): string | undefined {
  if (count === undefined) return node["other"];
  const category = new Intl.PluralRules(code).select(count);
  return node[category] ?? node["other"];
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (original, name: string) => {
    const value = params[name];
    return value === undefined ? original : String(value);
  });
}

export function translateWithTrees(english: Tree, localeTree: Tree | undefined, code: string, keyPath: string, params?: TranslateParams, count?: number): TranslateResult {
  const enRaw = getPath(english, keyPath);
  const enLeaf = typeof enRaw === "string" || isPluralNode(enRaw) ? enRaw : undefined;
  const loRaw = localeTree ? getPath(localeTree, keyPath) : undefined;
  const loLeaf = typeof loRaw === "string" || isPluralNode(loRaw) ? loRaw : undefined;

  if (loLeaf === undefined) {
    if (enLeaf === undefined) return { text: keyPath, fellBack: true };
    const template = typeof enLeaf === "string" ? enLeaf : pickPlural(enLeaf, count, code);
    return template === undefined ? { text: keyPath, fellBack: true } : { text: interpolate(template, params), fellBack: true };
  }
  if (typeof loLeaf === "string") return { text: interpolate(loLeaf, params), fellBack: false };
  const template = pickPlural(loLeaf, count, code);
  if (template !== undefined) return { text: interpolate(template, params), fellBack: false };
  if (enLeaf && isPluralNode(enLeaf)) {
    const enTemplate = pickPlural(enLeaf, count, code);
    if (enTemplate !== undefined) return { text: interpolate(enTemplate, params), fellBack: true };
  }
  return { text: keyPath, fellBack: true };
}

const ENGLISH_TREE = contentJson as unknown as Tree;

// A reviewed language registers its file here. Adding one is a per-language
// row: the file, its place in LOCALE_TREES and a human review of the money,
// credit, legal and trust strings recorded in the PR — never a silent green.
const LOCALE_TREES: Partial<Record<string, Tree>> = {};

export function translate(code: string, keyPath: string, params?: TranslateParams, count?: number): TranslateResult {
  const localeTree = code === "en" ? ENGLISH_TREE : LOCALE_TREES[code];
  return translateWithTrees(ENGLISH_TREE, localeTree, code, keyPath, params, count);
}
