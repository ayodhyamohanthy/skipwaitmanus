import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * The kit screen fixtures (scripts/kit-screens/capture.mjs) mock the API a live
 * screen loads and drive it with actions. D-067 removed the Pro/Max plans and
 * the gift flow completely, so a fixture may not serve a retired plan, wait for
 * or click a control the product no longer has, or mock an endpoint the screen
 * no longer calls (/plans stopped loading /api/chargebee/gifts/mine).
 */

const dir = new URL("./kit-screens/fixtures/", import.meta.url);
const files = readdirSync(dir).filter(name => name.endsWith(".json")).sort();

type Fixture = { routes?: Array<{ path?: unknown }>; actions?: unknown[]; actionsWeb?: unknown[]; actionsMobile?: unknown[] };
const load = (name: string): Fixture => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Fixture;

/** Every value stored under a "plan" key, at any depth. */
function planValues(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) planValues(item, found);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "plan") found.push(child);
      planValues(child, found);
    }
  }
  return found;
}

describe("kit screen fixtures after D-067", () => {
  it("finds the fixture set", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(files)("%s serves no retired plan or item price", name => {
    const fixture = load(name);
    for (const plan of planValues(fixture)) expect(["pro", "max"]).not.toContain(plan);
    expect(JSON.stringify(fixture)).not.toMatch(/skipwait_(?:pro|max)_/);
  });

  it.each(files)("%s drives no removed control and mocks no gift endpoint", name => {
    const fixture = load(name);
    const actions = JSON.stringify([...(fixture.actions ?? []), ...(fixture.actionsWeb ?? []), ...(fixture.actionsMobile ?? [])]);
    expect(actions).not.toMatch(/\bPro\b|\bMax\b|gift|compare plans/i);
    for (const route of fixture.routes ?? []) expect(String(route.path)).not.toMatch(/^\/api\/chargebee\/gift/);
  });
});
