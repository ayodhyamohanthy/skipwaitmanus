import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARE_WIN_COPY, winBadge, winCardLinkedIn, winCardText, winIntro } from "./shareWinCard";

describe("share win card", () => {
  it("copy matches design/goal-ui/content.json verbatim", () => {
    const content = JSON.parse(readFileSync(join(__dirname, "..", "design", "goal-ui", "content.json"), "utf8"));
    expect(content.shareWin).toEqual(SHARE_WIN_COPY);
  });
  it("badge: approved is Accepted, later steps are Referred", () => {
    expect(winBadge("approved")).toBe("Accepted");
    for (const status of ["intro_made", "interview", "offer"]) expect(winBadge(status)).toBe("Referred");
  });
  it("card text carries role, company and the privacy line, nothing else", () => {
    expect(winCardText({ roleTitle: "Backend Engineer, Sync", companyName: "Quillmint", status: "approved" })).toBe(
      "Accepted\nBackend Engineer, Sync\nQuillmint\n\nSomeone who works there is vouching for me. Asked through skipwait.me – my name stayed private until they said yes.\nskipwait.me · A warmer way in");
  });
  it("omits the role line when the ask has no title", () => {
    expect(winCardText({ roleTitle: null, companyName: "Quillmint", status: "approved" })).not.toMatch(/\n\n\n|null|undefined/);
  });
  it("LinkedIn text adds only the site link", () => {
    const base = { roleTitle: "Designer", companyName: "Quillmint", status: "intro_made" };
    expect(winCardLinkedIn(base)).toBe(`${winCardText(base)}\nhttps://skipwait.me`);
  });
  it("intro names the company", () => { expect(winIntro("Quillmint")).toBe("Your ask was accepted at Quillmint. Tell people if you want to – it is always your choice."); });
  it("the builders take no referrer field (privacy by type)", () => {
    const text = winCardText({ roleTitle: "R", companyName: "C", status: "approved", referrerName: "Asha Rao", referrerMessage: "hi" } as never);
    expect(text).not.toMatch(/Asha|Rao|hi$/);
  });
});
