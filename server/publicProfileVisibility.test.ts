import { describe, expect, it } from "vitest";
import { shapePublicProfile } from "./db";

const owner = { id: 5, name: "Asha" };
const base = { userId: 5, handle: "asha-r", headline: "Designer", currentTitle: null, location: null, bio: null, skills: null, company: null, workEmailVerifiedAt: null, workEmailDomain: null } as never;
const withVisibility = (profileVisibility: unknown) => ({ ...(base as object), profileVisibility }) as never;
const items = [
  { id: 1, userId: 5, title: "Shown", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: true },
  { id: 2, userId: 5, title: "Hidden", kind: "project", source: null, url: null, pinned: false, visibleOnProfile: false },
] as never;

describe("public profile visibility", () => {
  it("treats a missing visibility as private for everyone but the owner", () => {
    for (const missing of [undefined, null]) {
      expect(shapePublicProfile(owner, withVisibility(missing), items, undefined)).toEqual({ visible: false, visibility: "private" });
      expect(shapePublicProfile(owner, withVisibility(missing), items, 99)).toEqual({ visible: false, visibility: "private" });
      expect(shapePublicProfile(owner, withVisibility(missing), items, 5)).toMatchObject({ visible: true, isOwner: true });
    }
  });

  it("hides a private profile from anonymous and other signed-in viewers", () => {
    expect(shapePublicProfile(owner, withVisibility("private"), items, undefined)).toEqual({ visible: false, visibility: "private" });
    expect(shapePublicProfile(owner, withVisibility("private"), items, 99)).toEqual({ visible: false, visibility: "private" });
  });

  it("shows link and public profiles with only items the owner marked visible", () => {
    for (const visibility of ["link", "public"]) {
      const view = shapePublicProfile(owner, withVisibility(visibility), items, undefined) as { visible: boolean; workItems: { title: string }[] };
      expect(view.visible).toBe(true);
      expect(view.workItems.map(item => item.title)).toEqual(["Shown"]);
    }
  });

  it("shows the owner every item and never exposes an email field", () => {
    const view = shapePublicProfile(owner, withVisibility("private"), items, 5) as Record<string, unknown> & { workItems: unknown[] };
    expect(view.workItems).toHaveLength(2);
    expect(Object.keys(view)).not.toContain("email");
  });

  it("parses open-to roles defensively for public viewers", () => {
    const withOpenTo = (openTo: unknown) => ({ ...(base as object), profileVisibility: "public", openTo }) as never;
    expect((shapePublicProfile(owner, withOpenTo('["Product Designer", "UX Lead"]'), items, undefined) as { openTo: string[] }).openTo).toEqual(["Product Designer", "UX Lead"]);
    expect((shapePublicProfile(owner, withOpenTo("not-json"), items, undefined) as { openTo: string[] }).openTo).toEqual([]);
    expect((shapePublicProfile(owner, withOpenTo(null), items, undefined) as { openTo: string[] }).openTo).toEqual([]);
  });
});
