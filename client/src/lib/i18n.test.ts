// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { getLanguage, setLanguage, useT } from "./i18n";

// D-093 packet §5.3 red-first tests. They fail on main because ./i18n does not
// exist yet.
const STORE_KEY = "sw:language";

beforeEach(() => {
  globalThis.localStorage?.clear();
  setLanguage("en", { persistLocal: false });
});

afterEach(() => {
  globalThis.localStorage?.clear();
  setLanguage("en", { persistLocal: false });
});

describe("D-093 i18n store", () => {
  it("ignores an invisible code stored in localStorage", async () => {
    globalThis.localStorage.setItem(STORE_KEY, "te");
    vi.resetModules();
    const fresh = await import("./i18n");
    expect(fresh.getLanguage()).toBe("en");
  });

  it("ignores junk stored in localStorage", async () => {
    globalThis.localStorage.setItem(STORE_KEY, "not-a-language");
    vi.resetModules();
    const fresh = await import("./i18n");
    expect(fresh.getLanguage()).toBe("en");
  });

  it("accepts a stored visible language", async () => {
    globalThis.localStorage.setItem(STORE_KEY, "en");
    vi.resetModules();
    const fresh = await import("./i18n");
    expect(fresh.getLanguage()).toBe("en");
  });

  it("never stores a language that is not visible", () => {
    setLanguage("te", { persistLocal: true });
    expect(getLanguage()).toBe("en");
    expect(globalThis.localStorage.getItem(STORE_KEY)).toBeNull();
  });

  it("sets the document lang and dir from the visible language (en/ltr default)", () => {
    const { unmount } = renderHook(() => useT());
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    unmount();
  });

  it("useT looks up the active language and returns plain text", () => {
    const { result } = renderHook(() => useT());
    expect(result.current("shell.brand")).toBe("SkipWait");
  });
});
