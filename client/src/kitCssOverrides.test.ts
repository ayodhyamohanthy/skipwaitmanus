import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Live-only CSS layered on top of the verbatim kit (client/src/styles/kit.css).
// The kit v4 PNGs win where the two disagree, so these overrides must not
// repaint kit components.
const css = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");
const kit = readFileSync(fileURLToPath(new URL("./styles/kit.css", import.meta.url)), "utf8");

describe("live CSS overrides respect the kit", () => {
  it("keeps the solid grey disabled state off kit brand buttons", () => {
    expect(css).toContain("button:disabled:not(.brand-button) { opacity: 1 !important;");
    expect(css).toContain("button:disabled:not(.brand-button) svg { color: #505050 !important; }");
    expect(css).not.toMatch(/(^|\n)button:disabled \{ opacity/);
    expect(css).not.toMatch(/(^|\n)button:disabled svg \{/);
  });

  it("sizes dialog checkboxes and radios like the kit (size-4 mt-1)", () => {
    expect(css).toContain('.app-dialog input[type="checkbox"],.app-dialog input[type="radio"]{width:16px;height:16px;margin-top:4px;');
  });

  it("leaves Work thumbnails to the kit rule and carries no dead legacy rules", () => {
    expect(kit).toContain(".work-thumb{");
    for (const legacy of [".work-thumb", ".pinned-pill", ".role-list", ".role-row"]) expect(css).not.toContain(legacy);
  });
});
