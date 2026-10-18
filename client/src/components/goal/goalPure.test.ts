import { describe, expect, it } from "vitest";
import { gcn } from "./gcn";
import { goalInitials } from "./GoalListRow";
import { GOAL_NAV, goalNavFor } from "./nav";
import { goalSteps } from "./stepper";

describe("goal navigation (D-070, D-077)", () => {
  it("gives everyone Find, My asks and Inbox, and never Impact", () => {
    expect(goalNavFor(false).map(item => item.id)).toEqual(["find", "asks", "inbox"]);
  });
  it("adds the Referral queue for a verified referrer, still without Impact", () => {
    expect(goalNavFor(true).map(item => item.id)).toEqual(["find", "asks", "queue", "inbox"]);
  });
  it("points at the live routes", () => {
    expect(Object.values(GOAL_NAV).map(item => item.href)).toEqual(["/explore", "/requests", "/queue", "/inbox"]);
  });
});

describe("goalSteps (content.json screenC.stepper.rules)", () => {
  const states = (stage: number, terminal?: { kind: "expired" | "withdrawn"; label: string }) => goalSteps(stage, terminal).map(node => node.state);
  it("marks the reached step current and later steps upcoming", () => {
    expect(states(0)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(states(1)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(states(2)).toEqual(["done", "done", "current", "upcoming"]);
  });
  it("shows a Referred ask with every step done and the Referred node alone in emerald", () => {
    expect(states(3)).toEqual(["done", "done", "done", "referred"]);
  });
  it("puts an ended ask's terminal mark in place of the next step", () => {
    expect(goalSteps(0, { kind: "expired", label: "Expired" })).toEqual([
      { label: "Sent", state: "done" },
      { label: "Expired", state: "expired" },
      { label: "Accepted", state: "upcoming" },
      { label: "Referred", state: "upcoming" },
    ]);
    expect(states(0, { kind: "withdrawn", label: "Withdrawn" })).toEqual(["done", "withdrawn", "upcoming", "upcoming"]);
  });
  it("clamps out-of-range stages", () => {
    expect(states(-4)).toEqual(states(0));
    expect(states(9)).toEqual(states(3));
  });
});

describe("goalInitials", () => {
  it("uses the first letters of the first two words, or one letter for a single word", () => {
    expect(goalInitials("Acme Payments")).toBe("AP");
    expect(goalInitials("acme")).toBe("A");
    expect(goalInitials("  Go-Neutrinos Labs ")).toBe("GN");
    expect(goalInitials("")).toBe("?");
  });
});

describe("gcn", () => {
  it("keeps a goal font size and a goal colour together (the default merger drops one)", () => {
    expect(gcn("text-g-body text-g-ink").split(" ").sort()).toEqual(["text-g-body", "text-g-ink"]);
  });
  it("lets a later class win inside the same group", () => {
    expect(gcn("text-g-ink text-g-ink-3")).toBe("text-g-ink-3");
    expect(gcn("rounded-g-control rounded-g-tile")).toBe("rounded-g-tile");
    expect(gcn("text-g-label text-g-meta")).toBe("text-g-meta");
  });
});
