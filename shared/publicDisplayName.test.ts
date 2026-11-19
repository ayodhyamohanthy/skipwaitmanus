import { describe, expect, it } from "vitest";
import { publicDisplayName } from "./publicDisplayName";

describe("publicDisplayName", () => {
  it("keeps a real name", () => expect(publicDisplayName("Priya Nair", "priya.nair@acme.com")).toBe("Priya Nair"));
  it("drops an empty name", () => expect(publicDisplayName("  ", "a@b.co")).toBeNull());
  it("drops an email used as the name", () => expect(publicDisplayName("priya@acme.com", "priya@acme.com")).toBeNull());
  it("drops the email local-part used as the name", () => expect(publicDisplayName("Priya.Nair", "priya.nair@acme.com")).toBeNull());
  it("keeps a one-word name that is not the email local-part", () => expect(publicDisplayName("Priya", "pn@acme.com")).toBe("Priya"));
});
