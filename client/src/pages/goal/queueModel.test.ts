import { describe, expect, it } from "vitest";
import type { QueueRow } from "./queueApi";
import { clockText, qualityChecks, readOpened, sortQueue, toQueueItem, writeOpened } from "./queueModel";

const NOW = Date.parse("2026-10-08T00:00:00.000Z");
const row = (over: Partial<QueueRow>): QueueRow => ({
  id: 1, displayRef: "R-AAAAA", targetRoleUrl: "https://example.com/jobs/data-analyst", companyDomain: "example.com", companyName: "Example", jobFunction: "Data",
  jobTitle: "Role from shared job link", status: "pending", waitingForCoverage: false, coverageVisibleAt: "2026-10-03T00:00:00.000Z", createdAt: "2026-10-03T00:00:00.000Z",
  attachmentCount: 2, officialLinkIncluded: true, resumeAttached: true, askStrength: "strong", expiresAt: null, ...over,
});

describe("queue model", () => {
  it("counts days from first visibility and sorts soonest to close first", () => {
    const items = [row({ id: 1, coverageVisibleAt: "2026-10-06T00:00:00.000Z" }), row({ id: 2, coverageVisibleAt: "2026-10-02T00:00:00.000Z" }), row({ id: 3, expiresAt: "2026-10-12T00:00:00.000Z" })].map(item => toQueueItem(item, new Set(), NOW));
    expect(items.map(item => item.daysLeft)).toEqual([5, 1, 4]);
    expect(sortQueue(items).map(item => item.id)).toEqual([2, 3, 1]);
  });
  it("names the role from the link and marks opened asks", () => {
    const item = toQueueItem(row({ id: 9 }), new Set([9]), NOW);
    expect(item.role).toBe("Data Analyst");
    expect(item.state).toBe("opened");
    expect(item.received).toBe("2026-10-03T00:00:00.000Z");
  });
  it("writes day-level clocks only", () => {
    expect([clockText(0), clockText(1), clockText(5)]).toEqual(["Closes today", "1 day left", "5 days left"]);
  });
  it("lists passed checks on the ask, including a specific proof found in the note", () => {
    expect(qualityChecks(row({}), { candidateMessage: "Cut onboarding time by 40% for 2,000 users.", targetRoleUrl: null })).toEqual(["Official job link", "Specific proof of fit", "Resume attached", "Ask strength: Strong"]);
    expect(qualityChecks(row({ officialLinkIncluded: false, resumeAttached: false, askStrength: null }), { candidateMessage: "I am keen.", targetRoleUrl: null })).toEqual([]);
  });
  it("keeps opened asks on this device per account", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    writeOpened("u1", new Set([3, 4]), storage);
    expect([...readOpened("u1", storage)]).toEqual([3, 4]);
    expect(readOpened("u2", storage).size).toBe(0);
  });
});
