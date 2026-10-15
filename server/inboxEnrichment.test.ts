import { describe, expect, it } from "vitest";
import { enrichInboxRow, plainExcerpt } from "./inboxEnrichment";

const note = "I led the redesign of checkout at my last company and shipped it to 2 million users, cutting drop-off by 18%. I have worked closely with research and engineering for six years and would love to bring that to this team at your company in the product design role.";
describe("inbox enrichment", () => {
  it("rates a complete ask strong and exposes only safe fields", () => {
    const row = enrichInboxRow({ title: " Product Designer ", pitch: note, targetRoleUrl: "https://careers.example.com/1", attachmentCount: 1 });
    expect(row).toMatchObject({ jobTitle: "Product Designer", officialLinkIncluded: true, fitNoteIncluded: true, resumeAttached: true, askStrength: "strong" });
    expect(Object.keys(row).sort()).toEqual(["askStrength", "fitNoteIncluded", "jobTitle", "officialLinkIncluded", "resumeAttached"]);
  });
  it("rates a bare ask basic and tolerates nulls", () => {
    expect(enrichInboxRow({ title: null, pitch: null, targetRoleUrl: null, attachmentCount: null })).toMatchObject({ jobTitle: null, askStrength: "basic", resumeAttached: false });
  });
  it("trims the excerpt to 280 chars of plain text", () => {
    expect(plainExcerpt("<b>hi</b>   there")).toBe("hi there");
    expect(plainExcerpt("x".repeat(500))?.length).toBe(280);
  });
});
