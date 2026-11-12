// D-094-ai-in-ui.status-help (packet §4.7, §7 T7; D-264 (3), §15 F3): the help
// is retrieved from an approved catalogue keyed by what the seeker sees - the
// askView label, plus the pending queueStatus for "Waiting" - so one sentence
// is never false for another state. It never states a money movement:
// held_for_credit has no entry and keeps requestNote's own line.
import { describe, expect, it } from "vitest";
import { askView } from "./askView";
import { STATUS_HELP, STATUS_HELP_ENABLED, statusHelpFor, statusHelpKeyFor, type StatusHelpSource } from "./statusHelp";

const source = (overrides: Partial<StatusHelpSource> = {}): StatusHelpSource => ({ status: "pending", referrerId: null, queueStatus: null, ...overrides });

describe("status help catalogue (D-094 item 3)", () => {
  it("ships switched off", () => {
    expect(STATUS_HELP_ENABLED).toBe(false);
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

  it("keys the catalogue by the waiting sub-state, not by the raw status alone", () => {
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: null, queueStatus: "waiting_for_coverage" }))).toBe("waiting:waiting_for_coverage");
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: null, queueStatus: null }))).toBe("waiting:default");
    expect(statusHelpKeyFor(source({ status: "pending", referrerId: 7, queueStatus: "available_for_review" }))).toBe("under_review");
    expect(statusHelpKeyFor(source({ status: "closed", referrerId: null }))).toBe("expired");
  });
});
