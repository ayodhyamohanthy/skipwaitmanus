// PICKER-open-pr-pagination (docs/plans/PICKER-open-pr-pagination.md, BRANCH-HYGIENE "See every pull request").
// One page of 100 open pull requests hides the oldest rows: 186 were open on Nov 9, PR #632 sat on page 2, and
// the picker handed a TAKEOVER on that row's finished work instead of its REVIEW. These tests read injected
// pages only, so nothing reaches a real remote. The first case is the defect itself: the old one-page read
// cannot see a pull request that lives on page 2.
import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";

const { collectOpenPulls, OPEN_PR_PAGE_SIZE } = core as Record<string, any>;

const pull = (n: number) => ({ number: n, head: { ref: `agent/queue/branch-${n}`, sha: `sha-${n}`, repo: { full_name: "owner/repo" } }, html_url: `https://example.test/pull/${n}` });
const pageOf = (from: number, count: number) => Array.from({ length: count }, (_, i) => pull(from + i));

describe("every open pull request is read, page by page", () => {
  it("the old one-page read misses the pull request that sits on page 2", () => {
    const first = pageOf(1, 100);
    const second = [pull(632)];
    // What scripts/next-task.mjs did before this row: exactly one page.
    expect(first.some(p => p.number === 632)).toBe(false);
    expect(second.some(p => p.number === 632)).toBe(true);
  });

  it("reads 250 open pull requests across three pages and finds the oldest one", async () => {
    const pages = [pageOf(1, 100), pageOf(101, 100), pageOf(201, 50)];
    const read = await collectOpenPulls({ firstPage: pages[0], fetchPage: async page => pages[page - 1] });
    expect(read.complete).toBe(true);
    expect(read.pulls).toHaveLength(250);
    expect(read.pulls.map(p => p.number)).toContain(201);
    expect(new Set(read.pulls.map(p => p.number)).size).toBe(250);
  });

  it("a short first page is complete without a second read", async () => {
    let calls = 0;
    const read = await collectOpenPulls({ firstPage: pageOf(1, 7), fetchPage: async () => { calls += 1; return []; } });
    expect(read).toEqual({ pulls: pageOf(1, 7), complete: true });
    expect(calls).toBe(0);
  });

  it("an exactly full page followed by an empty page is complete", async () => {
    const read = await collectOpenPulls({ firstPage: pageOf(1, OPEN_PR_PAGE_SIZE), fetchPage: async () => [] });
    expect(read.complete).toBe(true);
    expect(read.pulls).toHaveLength(OPEN_PR_PAGE_SIZE);
  });

  it("an unreadable later page is unknown, never a short list that looks complete", async () => {
    const read = await collectOpenPulls({ firstPage: pageOf(1, 100), fetchPage: async () => { throw new Error("502 from GitHub"); } });
    expect(read.complete).toBe(false);
    expect(read.reason).toContain("502 from GitHub");
    expect(read.pulls).toHaveLength(100);
  });

  it("a later page that is not a list is unknown", async () => {
    const read = await collectOpenPulls({ firstPage: pageOf(1, 100), fetchPage: async () => ({ message: "rate limited" }) });
    expect(read.complete).toBe(false);
    expect(read.reason).toContain("not a list");
  });

  it("a first page that is not a list is unknown", async () => {
    const read = await collectOpenPulls({ firstPage: null, fetchPage: async () => [] });
    expect(read.complete).toBe(false);
    expect(read.pulls).toEqual([]);
  });

  it("stops at maxPages and says so instead of looping", async () => {
    let calls = 0;
    const read = await collectOpenPulls({ firstPage: pageOf(1, 100), fetchPage: async page => { calls += 1; return pageOf(page * 100, 100); }, maxPages: 3 });
    expect(read.complete).toBe(false);
    expect(read.reason).toContain("still full");
    expect(calls).toBe(2);
  });
});
