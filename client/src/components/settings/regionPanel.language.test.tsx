// @vitest-environment jsdom
// D-093.picker (packet §5.4, C5): the Region panel's Language field and its conditional footnote. The rule the
// packet is strictest about: the page must never say the language follows the device, must state plainly that
// English is the language available today while only English is visible, and must promise no future language.
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const visible = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@shared/languages", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../../shared/languages")>();
  const current = () => (visible.list.length ? (visible.list as typeof actual.LANGUAGES) : actual.visibleLanguages());
  return {
    ...actual,
    visibleLanguages: current,
    isVisibleLanguage: (code: unknown) => current().some(entry => entry.code === code),
  };
});
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null, getToken: async () => null }) }));
vi.mock("@/lib/displayPrefs", () => ({ useDisplayPrefs: () => ({ timeZone: null, dateFormat: null }), setDisplayPrefs: vi.fn(async () => undefined) }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { RegionPanel } from "./RegionPanel";
import { regionFootnote } from "@/components/goal/GoalLanguagePicker";

beforeEach(() => { visible.list = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Region panel footnote while English is the only visible language (C5)", () => {
  const text = regionFootnote(1);

  it("states that English is the available language and that only currency follows the device", () => {
    expect(text).toContain("English is the language available today");
    expect(text).toContain("Currency follows this device");
  });

  it("never claims the language follows the device or that the reader can choose one", () => {
    expect(text).not.toContain("Language and currency follow this device");
    expect(text).not.toMatch(/language follows this device/i);
    expect(text).not.toMatch(/choose|select/i);
  });

  it("promises no future language", () => {
    expect(text).not.toMatch(/coming|soon|more languages/i);
  });

  it("renders that footnote and hides the picker", () => {
    const { container } = render(<RegionPanel />);
    const footnote = container.querySelector("#region-footnote");
    expect(footnote?.textContent).toBe(text);
    expect(container.querySelector('select[aria-label="Language"]')).toBeNull();
  });
});

describe("Region panel footnote with two visible languages (test-only fixture)", () => {
  it("says the language follows the reader's choice while currency follows the device", () => {
    const text = regionFootnote(2);
    expect(text).toContain("Language follows your choice");
    expect(text).toContain("Currency follows this device");
    expect(text).not.toContain("English is the language available today");
  });
});
