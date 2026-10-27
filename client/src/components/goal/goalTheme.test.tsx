// D-048-dark-mode §3.1/§5 and D-224: the dark counterpart covers exactly the
// 27 goal colour tokens, keeps the approved trust/commit values, meets AA
// against its own surfaces, and never changes the light table.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const indexCss = read("client/src/index.css");
const darkCss = read("client/src/styles/goalDark.css");
const html = read("client/index.html");
const themeSource = read("client/src/contexts/ThemeContext.tsx");

const COLOUR = /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|oklch\()/i;
const TEXT_SURFACES = [
  "--g-canvas",
  "--g-surface",
  "--g-surface-sunken",
  "--g-surface-hover",
  "--g-surface-selected",
] as const;

function declarations(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const match of Array.from(source.matchAll(/(--g-[a-z0-9-]+)\s*:\s*([^;]+);/g))) {
    const name = match[1] ?? "";
    const value = (match[2] ?? "").trim().replace(/\s+/g, " ");
    if (!name || !COLOUR.test(value)) continue;
    out.set(name, [...(out.get(name) ?? []), value]);
  }
  return out;
}

function darkBlock(source: string): string {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const match = stripped.match(/^\.dark \.g-scope\s*\{([\s\S]*)\}$/);
  return match?.[1] ?? "";
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
  return (
    0.2126 * channel(parseInt(full.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(full.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(full.slice(4, 6), 16))
  );
}

function contrast(foreground: string, background: string): number {
  const [light = 0, dark = 0] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const lightColours = declarations(indexCss);
const darkColours = declarations(darkBlock(darkCss));
const darkValue = (name: string) => darkColours.get(name)?.[0] ?? "";

describe("goalDark.css covers the light colour table exactly", () => {
  it("exists and is a single .dark .g-scope block", () => {
    expect(darkCss, "client/src/styles/goalDark.css must exist").not.toBe("");
    expect(darkBlock(darkCss), "only one .dark .g-scope block").not.toBe("");
  });

  it("sets color-scheme: dark in that block", () => {
    expect(darkBlock(darkCss)).toMatch(/color-scheme\s*:\s*dark\s*;/);
  });

  it("redefines each of the 27 light colour tokens exactly once", () => {
    const lightNames = Array.from(lightColours.keys()).sort();
    expect(lightNames).toHaveLength(27);
    for (const name of lightNames) expect(lightColours.get(name), name).toHaveLength(1);
    expect(Array.from(darkColours.keys()).sort()).toEqual(lightNames);
    for (const name of lightNames) expect(darkColours.get(name), name).toHaveLength(1);
  });

  it("keeps the owner-approved dark trust mark and commit colours", () => {
    expect(darkValue("--g-trust").toLowerCase()).toBe("#60a5fa");
    expect(darkValue("--g-primary").toLowerCase()).toBe("#fafafa");
  });

  it("is imported once from index.css", () => {
    const imports = indexCss.match(/@import\s+["']\.\/styles\/goalDark\.css["'];?/g) ?? [];
    expect(imports).toHaveLength(1);
  });
});

describe("dark colours meet the packet's AA bar", () => {
  it("text tokens reach 4.5:1 on every dark text surface", () => {
    const failures: string[] = [];
    for (const text of ["--g-ink", "--g-ink-2", "--g-ink-3"]) {
      for (const surface of TEXT_SURFACES) {
        const ratio = contrast(darkValue(text), darkValue(surface));
        if (!(ratio >= 4.5)) failures.push(`${text} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("inverse and commit pairs reach 4.5:1", () => {
    expect(contrast(darkValue("--g-ink-inverse"), darkValue("--g-ink"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkValue("--g-on-primary"), darkValue("--g-primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it("trust and status hues reach 4.5:1 on the dark surface", () => {
    for (const name of ["--g-trust", "--g-emerald", "--g-amber", "--g-crimson"]) {
      expect(contrast(darkValue(name), darkValue("--g-surface")), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("control edges and the visible mark reach 3:1", () => {
    for (const surface of ["--g-canvas", "--g-surface", "--g-surface-hover"]) {
      expect(contrast(darkValue("--g-control-edge"), darkValue(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(darkValue("--g-mark-2"), darkValue("--g-surface"))).toBeGreaterThanOrEqual(3);
  });
});

describe("the default never follows the system setting", () => {
  it("no theme source reads prefers-color-scheme", () => {
    expect(themeSource).not.toContain("prefers-color-scheme");
    expect(html).not.toContain("prefers-color-scheme");
    expect(indexCss).not.toContain("prefers-color-scheme");
  });

  it("index.html applies a stored dark choice before first paint", () => {
    expect(html).toMatch(/localStorage\.getItem\(\s*["']sw-theme["']\s*\)/);
    expect(html).toMatch(/classList\.add\(\s*["']dark["']\s*\)/);
  });
});
