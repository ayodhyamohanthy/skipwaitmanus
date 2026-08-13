import { describe, expect, it } from "vitest";
import { resolveDeviceLocale } from "./device";

describe("device locale selection", () => {
  it("prefers the device language priority list", () => {
    expect(resolveDeviceLocale({ languages: ["fr-CA", "en"], language: "en-US" })).toBe("fr-CA");
  });

  it("falls back to the device language and then English", () => {
    expect(resolveDeviceLocale({ language: "pt-BR" })).toBe("pt-BR");
    expect(resolveDeviceLocale()).toBe("en");
  });
});
