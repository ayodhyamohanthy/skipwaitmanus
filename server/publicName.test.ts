import { describe, expect, it } from "vitest";
import { publicDisplayNameOf, publicFirstNameOf } from "./publicName";

/*
 * P0-referrer-exposure, review round 1. Work-email sign-ups stored the part of
 * the address before the @ as the account name (and the seeker email-code and
 * WorkOS fallbacks still do). Beside a verified company domain that part
 * rebuilds the work email, which every referrer surface promises never to
 * show. These rules decide at read time whether a stored name may appear.
 */

describe("publicFirstNameOf", () => {
  it("shows the first word of a real name, never the last name", () => {
    expect(publicFirstNameOf("Maya Chen", "maya.chen@acme.com")).toBe("Maya");
    expect(publicFirstNameOf("  Ravi   Patel ", "r.patel@acme.com")).toBe("Ravi");
    expect(publicFirstNameOf("Anne-Marie O'Neil", "amoneil@acme.com")).toBe("Anne-Marie");
    expect(publicFirstNameOf("José Álvarez", "jalvarez@acme.com")).toBe("José");
    expect(publicFirstNameOf("Maya", null)).toBe("Maya");
  });

  it("withholds a name that is the address's local part, in any case", () => {
    expect(publicFirstNameOf("zoya.quill", "zoya.quill@quasar-ledgers.com")).toBeNull();
    expect(publicFirstNameOf("ravi", "ravi@acme.com")).toBeNull();
    // A real first name that is the whole local part still rebuilds the address next to the company.
    expect(publicFirstNameOf("Ravi Patel", "ravi@acme.com")).toBeNull();
    expect(publicFirstNameOf("RAVI", " Ravi@Acme.com ")).toBeNull();
  });

  it("withholds anything shaped like an address or a handle, even with no email to compare", () => {
    for (const name of ["zoya.quill", "zoya_quill", "zoya+jobs", "zoya2", "zoya.quill@quasar-ledgers.com", "J. Robert"]) {
      expect(publicFirstNameOf(name, null), name).toBeNull();
      expect(publicFirstNameOf(name, "someone-else@acme.com"), name).toBeNull();
    }
  });

  it("returns null when there is no name at all", () => {
    for (const name of [null, undefined, "", "   "]) expect(publicFirstNameOf(name, "zoya@acme.com")).toBeNull();
  });
});

describe("publicDisplayNameOf", () => {
  it("keeps a person's name exactly as stored", () => {
    expect(publicDisplayNameOf("Zoya Quill", "zoya.quill@quasar-ledgers.com")).toBe("Zoya Quill");
    expect(publicDisplayNameOf("Maya Chen", "maya@acme.com")).toBe("Maya Chen");
    expect(publicDisplayNameOf("Asha", "asha.r@gmail.com")).toBe("Asha");
    expect(publicDisplayNameOf("Dr. Maya Chen", null)).toBe("Dr. Maya Chen");
  });

  it("withholds the address's local part in any case, an address, or one address-shaped word", () => {
    expect(publicDisplayNameOf("zoya.quill", "zoya.quill@quasar-ledgers.com")).toBeNull();
    expect(publicDisplayNameOf("zoya", "zoya@quasar-ledgers.com")).toBeNull();
    expect(publicDisplayNameOf("Zoya", "zoya@quasar-ledgers.com")).toBeNull();
    expect(publicDisplayNameOf("zoya.quill@quasar-ledgers.com", null)).toBeNull();
    expect(publicDisplayNameOf("Zoya Quill <zoya@quasar-ledgers.com>", null)).toBeNull();
    for (const name of ["zoya.quill", "zoya_quill", "zoya+jobs", "zq2026"]) expect(publicDisplayNameOf(name, null), name).toBeNull();
  });

  it("returns null when there is no name at all", () => {
    for (const name of [null, undefined, "", "   "]) expect(publicDisplayNameOf(name, "zoya@acme.com")).toBeNull();
  });
});
