// @vitest-environment jsdom
// D-093.picker (packet §5.4, C6): the goal Settings Region section must carry the same conditional footnote as the
// kit panel, with the same two assertions, so releasing goal settings cannot restore a static English field or the
// old "Language and currency follow this device" claim.
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const visible = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@shared/languages", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../../../shared/languages")>();
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

import RegionSection from "./RegionSection";

const sectionText = (container: HTMLElement) => (container.textContent ?? "").replace(/\s+/g, " ");

beforeEach(() => { visible.list = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Goal Region section while English is the only visible language (C6)", () => {
  it("states that English is available today and that only currency follows the device", () => {
    const { container } = render(<RegionSection />);
    const text = sectionText(container);
    expect(text).toContain("English is the language available today");
    expect(text).toContain("Currency follows this device");
  });

  it("does not restore the old device-language claim, a choice promise, or a future-language promise", () => {
    const { container } = render(<RegionSection />);
    const text = sectionText(container);
    expect(text).not.toContain("Language and currency follow this device");
    expect(text).not.toMatch(/language follows this device/i);
    expect(text).not.toMatch(/coming|soon|more languages/i);
  });

  it("shows the static English field and hides the picker", () => {
    const { container } = render(<RegionSection />);
    expect(sectionText(container)).toContain("English");
    expect(container.querySelector('select[aria-label="Language"]')).toBeNull();
  });
});

describe("Goal Region section with two visible languages (test-only fixture)", () => {
  it("says the language follows the reader's choice and renders the picker", () => {
    visible.list = [
      { code: "en", endonym: "English", script: "Latn", dir: "ltr", reviewed: true },
      { code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: true },
    ];
    const { container } = render(<RegionSection />);
    const text = sectionText(container);
    expect(text).toContain("Language follows your choice");
    expect(text).toContain("Currency follows this device");
    expect(container.querySelector('select[aria-label="Language"]')).toBeTruthy();
  });
});
