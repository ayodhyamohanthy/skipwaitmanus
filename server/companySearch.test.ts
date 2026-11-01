import { describe, expect, it } from "vitest";
import type { PublicCompany } from "../shared/companies";
import { normalizeCompanyName, searchCompanies } from "./companySearch";

const make = (slug: string, name: string, extra: Partial<PublicCompany> = {}): PublicCompany => ({ slug, name, initials: name.slice(0, 2), industry: "Technology", location: "Global", functions: ["Data"], blurb: "x", domains: [`${slug}.com`], openToReferrals: true, ...extra });
const tcs = make("tcs", "TCS");
const sg = make("sg", "Société Générale");
const dataCo = make("dataco", "Acme Analytics", { industry: "Data", functions: ["Data"] });

describe("normalizeCompanyName", () => {
  it("folds accents, case and punctuation and drops legal suffixes", () => {
    expect(normalizeCompanyName("Société Générale")).toBe("societe generale");
    expect(normalizeCompanyName("Acme Pvt. Ltd.")).toBe("acme");
    expect(normalizeCompanyName("Foo GmbH")).toBe("foo");
  });
});

describe("searchCompanies", () => {
  it("finds TCS by the alias 'tata'", () => { expect(searchCompanies([tcs, sg], "tata").map(c => c.slug)).toEqual(["tcs"]); });
  it("matches accent-folded names", () => { expect(searchCompanies([tcs, sg], "Societe Generale").map(c => c.slug)).toEqual(["sg"]); });
  it("never matches industry or functions", () => { expect(searchCompanies([tcs, sg, dataCo], "Data")).toEqual([]); });
  it("returns at most 10", () => {
    const many = Array.from({ length: 25 }, (_, i) => make(`co-${i}`, `Acme ${i}`));
    expect(searchCompanies(many, "acme")).toHaveLength(10);
  });
  it("ranks name prefix before alias before contains", () => {
    const a = make("a", "Zeta Tata Works");
    const b = make("b", "Tata Steel");
    const c = make("c", "Other");
    const out = searchCompanies([a, c, b], "tata", { c: ["Tata Other"] }).map(x => x.slug);
    expect(out).toEqual(["b", "c", "a"]);
  });
  it("empty query returns nothing", () => { expect(searchCompanies([tcs], "  ")).toEqual([]); });
});
