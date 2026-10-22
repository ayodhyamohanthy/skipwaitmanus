import { describe, expect, it } from "vitest";
import {
  ASK_WORK_SECTION_TITLE,
  MAX_ASK_WORK_ITEMS,
  askWorkItemIdsSchema,
  askWorkItemSchema,
  askWorkItemsListSchema,
  dedupeAskWorkItemIds,
  safeAskWorkUrl,
} from "../shared/askWorkItems";
import { ENTITLED_PLAN_IDS, planEntitlementsFor } from "../shared/planEntitlements";

/*
 * The pinned-work contract shared by the ask composer, the create path and the
 * referrer preview (queue task 13). Lives under server/ because vitest only
 * collects scripts/, server/ and client/ — shared/ has no test root.
 */

const piece = { title: "Shipped the mobile PWA", kind: "case_study", source: "IIT Bombay hackathon", url: "https://example.com/pwa" };

describe("askWorkItemIdsSchema (POST /api/company-referrals body)", () => {
  it("accepts the ids the seeker picked, in their tap order", () => {
    expect(askWorkItemIdsSchema.safeParse([12, 11]).success).toBe(true);
    expect(askWorkItemIdsSchema.safeParse([]).success).toBe(true);
  });

  it.each([
    ["a non-numeric id", ["abc"]],
    ["a zero id", [0]],
    ["a negative id", [-3]],
    ["a fractional id", [1.5]],
    ["a list that is not an array", "12"],
    ["an id map rather than a list", { 0: 12 }],
    ["nothing at all", undefined],
  ])("refuses %s so the route can answer 400 instead of sending the ask without the work", (_label, input) => {
    expect(askWorkItemIdsSchema.safeParse(input).success).toBe(false);
  });

  it("caps one request at the transport ceiling", () => {
    const count = (n: number) => Array.from({ length: n }, (_, index) => index + 1);
    expect(askWorkItemIdsSchema.safeParse(count(MAX_ASK_WORK_ITEMS)).success).toBe(true);
    expect(askWorkItemIdsSchema.safeParse(count(MAX_ASK_WORK_ITEMS + 1)).success).toBe(false);
  });

  it("carries at least the largest pin allowance any plan sells", () => {
    // A new tier that pins more than today's ceiling would otherwise have its
    // seekers refused with a schema error instead of the plan's own 409 copy.
    const widestPin = Math.max(...ENTITLED_PLAN_IDS.map(plan => planEntitlementsFor(plan).showcase.pins));
    expect(MAX_ASK_WORK_ITEMS).toBeGreaterThanOrEqual(widestPin);
  });
});

describe("dedupeAskWorkItemIds", () => {
  it("keeps the seeker's order and folds a repeated tap to first-copy-wins", () => {
    expect(dedupeAskWorkItemIds([12, 11, 12])).toEqual([12, 11]);
    expect(dedupeAskWorkItemIds([])).toEqual([]);
  });
});

describe("askWorkItemSchema (what a referrer is shown)", () => {
  it("reads the four public fields of a pinned piece", () => {
    expect(askWorkItemSchema.parse(piece)).toEqual(piece);
  });

  it.each([
    ["an empty title", { ...piece, title: "" }],
    ["a title longer than the showcase allows", { ...piece, title: "x".repeat(161) }],
    ["a kind outside the shared enum", { ...piece, kind: "resume" }],
    ["a source longer than the column", { ...piece, source: "s".repeat(81) }],
    ["a url longer than the column", { ...piece, url: `https://example.com/${"u".repeat(2048)}` }],
    ["a missing title", { kind: "code", source: null, url: null }],
  ])("refuses %s rather than half-rendering it", (_label, input) => {
    expect(askWorkItemSchema.safeParse(input).success).toBe(false);
  });

  it("strips anything beyond the public four, so no showcase row or owner id can ride along", () => {
    const parsed = askWorkItemSchema.parse({ ...piece, id: 41, ownerId: 7, userId: 7, visibleOnProfile: true, fileKey: "private/resume.pdf" });
    expect(Object.keys(parsed).sort()).toEqual(["kind", "source", "title", "url"]);
  });
});

describe("askWorkItemsListSchema (client boundary parse)", () => {
  it("passes a valid list through untouched", () => {
    expect(askWorkItemsListSchema.parse([piece, { ...piece, title: "Approvals redesign", kind: "code", source: null, url: null }])).toHaveLength(2);
  });

  it.each([
    ["no field at all, as an older API sends", undefined],
    ["a null list", null],
    ["a list with one malformed entry", [{ ...piece, kind: "resume" }]],
    ["a list that is not a list", "case_study"],
  ])("reads %s as no pinned work instead of crashing the referrer card", input => {
    expect(askWorkItemsListSchema.parse(input)).toEqual([]);
  });
});

describe("safeAskWorkUrl", () => {
  it.each([
    ["https://example.com/pwa"],
    ["http://example.com/pwa"],
    ["HTTPS://example.com/pwa"],
    ["  https://example.com/pwa  "],
    ["https://example.com/jobs?utm_source=share#team"],
  ])("keeps an absolute http(s) link: %s", url => {
    expect(safeAskWorkUrl(url)).toBe(url.trim());
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["vbscript:msgbox(1)"],
    ["file:///etc/passwd"],
    ["mailto:referrer@acme.com"],
    ["tel:+15551234"],
    ["/relative/path"],
    ["example.com/pwa"],
    ["https://"],
    ["https://exa mple.com/pwa"],
    ["not a url at all"],
  ])("refuses %s: it never becomes a link a referrer can click", url => {
    expect(safeAskWorkUrl(url)).toBeNull();
  });

  it("refuses an absent link, which renders as plain text", () => {
    expect(safeAskWorkUrl(null)).toBeNull();
  });
});

describe("ASK_WORK_SECTION_TITLE", () => {
  it("is the one heading the composer and the referrer card share", () => {
    expect(ASK_WORK_SECTION_TITLE).toBe("Pinned work");
  });
});
