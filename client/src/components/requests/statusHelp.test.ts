// D-094-ai-in-ui.status-help (packet §4.7, §7 T7; D-264 (3), §15 F3): the help
// is retrieved from an approved catalogue keyed by what the seeker sees - the
// askView label, plus the pending queueStatus for "Waiting" - so one sentence
// is never false for another state. It never states a money movement:
// held_for_credit has no entry and keeps requestNote's own line.
import { describe, expect, it } from "vitest";
import { COVERAGE_WAIT_DAYS } from "@shared/referral";
import { askView } from "./askView";
import { STATUS_HELP, STATUS_HELP_ENABLED, statusHelpFor, statusHelpKeyFor, type StatusHelpSource } from "./statusHelp";

const source = (overrides: Partial<StatusHelpSource> = {}): StatusHelpSource => ({ status: "pending", referrerId: null, queueStatus: null, ...overrides });

describe("status help catalogue (D-094 item 3)", () => {
  // The release row D-094-ai-in-ui turns it on (packet §6.4); the off path stays pinned in myRequests.statusHelp.test.tsx.
  it("is switched on by the D-094 release", () => {
    expect(STATUS_HELP_ENABLED).toBe(true);
  });

  it("has an entry for every askView label the seeker can see", () => {
    const sources = [
      source({ status: "pending", referrerId: null, queueStatus: "available_for_review" }),
      source({ status: "pending", referrerId: 7, queueStatus: "available_for_review" }),
      source({ status: "approved", referrerId: 7 }),
      source({ status: "intro_made", referrerId: 7 }),
      source({ status: "interview", referrerId: 7 }),
      source({ status: "offer", referrerId: 7 }),
      source({ status: "declined", referrerId: 7 }),
      source({ status: "withdrawn", referrerId: 7 }),
      source({ status: "closed", referrerId: 7 }),
      source({ status: "closed", referrerId: null }),
    ];
    const labels = new Set(sources.map(item => askView(item).label));
    expect(labels.size).toBe(10);
    for (const item of sources) {
      const help = statusHelpFor(item);
      expect(help, askView(item).label).not.toBeNull();
      expect(help?.title.trim().length, askView(item).label).toBeGreaterThan(0);
      expect(help?.body.trim().length, askView(item).label).toBeGreaterThan(0);
    }
  });

  it("distinguishes every pending queue state requestNote distinguishes, and gives held_for_credit no entry", () => {
    const waiting = (queueStatus: StatusHelpSource["queueStatus"]) => source({ status: "pending", referrerId: null, queueStatus });
    expect(statusHelpKeyFor(waiting("available_for_review"))).not.toBeNull();
    expect(statusHelpKeyFor(waiting("waiting_for_coverage"))).not.toBeNull();
    expect(statusHelpKeyFor(waiting(null))).not.toBeNull();
    expect(new Set([statusHelpKeyFor(waiting("available_for_review")), statusHelpKeyFor(waiting("waiting_for_coverage")), statusHelpKeyFor(waiting(null))]).size).toBe(3);
    expect(statusHelpKeyFor(waiting("held_for_credit"))).toBeNull();
    expect(statusHelpFor(waiting("held_for_credit"))).toBeNull();
  });

  it("never states a money movement", () => {
    const movement = /refund|credit(ed)? back|charged|charge|spent|returned to you|refunded|cost/i;
    for (const [key, entry] of Object.entries(STATUS_HELP)) {
      expect(`${entry.title} ${entry.body}`, key).not.toMatch(movement);
    }
  });

  // C1 (PR #1174 review): the rule is that employees CANNOT see the seeker's
  // name or files until one accepts (D-019(e)), not that they hold them and
  // choose to keep them private. The wrong reading tells a seeker their resume
  // is already in a stranger's hands.
  it("never says employees hold the seeker's name or files (C1)", () => {
    for (const [key, entry] of Object.entries(STATUS_HELP)) {
      expect(`${entry.title} ${entry.body}`, key).not.toMatch(/keep your name|keep your (?:files|resume)|keeps your name/i);
    }
    // Positive form: the available-for-review line says they cannot see them.
    const line = STATUS_HELP["waiting:available_for_review"].body;
    expect(line).toMatch(/can(?:no|')t see your name or files until/i);
  });

  // C2/C4 (PR #1174 review, D-153): "any time" promises something the
  // open-request limit and the two-per-company cap can refuse (D-006), and a
  // closed entry should say what happened and what to do next.
  it("never promises a new request any time, and names the limit instead (C2, C4)", () => {
    for (const [key, entry] of Object.entries(STATUS_HELP)) {
      expect(`${entry.title} ${entry.body}`, key).not.toMatch(/any time\.?$/i);
      expect(`${entry.title} ${entry.body}`, key).not.toMatch(/request a referral (?:at this or another company )?any time/i);
    }
    expect(STATUS_HELP.closed.body).toMatch(/no longer active/i);
    expect(STATUS_HELP.closed.body).toMatch(/under your limit/i);
    expect(STATUS_HELP.expired.body).toMatch(/You can send a new referral request/i);
  });

  // C3 (PR #1174 review): an instruction to "update the status" must say who does it.
  it("names who records a milestone in the interviewing entry (C3)", () => {
    expect(STATUS_HELP.interviewing.body).toMatch(/whoever hears first|you or the referrer|either of you/i);
  });

  it("distinguishes acceptance from a submitted referral without promising submission", () => {
    const accepted = statusHelpFor(source({ status: "approved", referrerId: 7 }));
    const referred = statusHelpFor(source({ status: "intro_made", referrerId: 7 }));
    expect(accepted?.body).toMatch(/accepted your referral request/i);
    expect(accepted?.body).toMatch(/does not mean.*submitted/i);
    expect(accepted?.body).not.toMatch(/(?:they|your referrer) (?:will )?submit(?:s)? (?:your|the) referral/i);
    expect(referred?.body).toMatch(/has submitted the referral/i);
    expect(accepted).not.toEqual(referred);
  });

  // D-379 (D-363 (4), D-153): the legacy 90-day waiting close (ask-expiry-sweep) still runs until
  // D-174-expiry-clock-removal lands, so the waiting-for-coverage help states it and no entry promises
  // an indefinite wait. The help states no money (packet §4.7). The clock-removal row removes the sentence.
  it("states the 90-day waiting close and never promises an indefinite wait (D-379)", () => {
    const body = STATUS_HELP["waiting:waiting_for_coverage"].body;
    expect(body).toBe("No verified employee at this company can see it yet. It stays private while it waits; when one joins, the oldest waiting requests reach them first. If none joins within 90 days, it closes, and you can send it again while you are under your limit.");
    expect(body).toContain(`within ${COVERAGE_WAIT_DAYS} days`);
    for (const [key, entry] of Object.entries(STATUS_HELP)) {
      expect(`${entry.title} ${entry.body}`, key).not.toMatch(/stays? (?:private|waiting|open) until|until (?:one|someone|an employee|a referrer) joins|whenever (?:one|an employee|a referrer) joins/i);
    }
  });

  it("keys the catalogue by the waiting sub-state, not by the raw status alone", () => {
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: null, queueStatus: "waiting_for_coverage" }))).toBe("waiting:waiting_for_coverage");
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: null, queueStatus: null }))).toBe("waiting:default");
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: 7, queueStatus: "available_for_review" }))).toBe("under_review");
    expect(statusHelpKeyFor(source({ status: "closed", referrerId: null }))).toBe("expired");
  });
});
