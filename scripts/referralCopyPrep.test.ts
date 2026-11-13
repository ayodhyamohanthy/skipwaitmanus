// @vitest-environment jsdom
/**
 * D-180 referral-copy preparation (isolated PREP under D-308/D-309).
 *
 * Red-first regression coverage for the public terminology the owner asked for
 * on Oct 23/24: public nouns are "referral" and "referral request"; no display
 * string says "credit(s)" or the noun "ask(s)". The verb stays ("never ask you
 * for money", "Ask for a referral").
 *
 * This file covers only the presentation strings whose referral-only rewording
 * needs no purchase or plan change. Strings whose replacement depends on a
 * pricing decision that is not live (the "Add a credit pack" top-up,
 * PAID_PLANS_SENTENCE, the payment template, the
 * D-132 V2 strings) are deliberately not asserted here: per the packet, a hunk
 * that depends on a future behavior change is left unchanged and reported, not
 * promised. Internal identifiers, amounts, charges, card rules, timing,
 * expiration and recovery behavior stay exactly as they are.
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CREDIT_RULE,
  FREE_ASKS_CHIP,
  FREE_ASKS_PER_MONTH,
  MONEY_SENTENCE,
  MONEY_SENTENCE_SHORT,
  REFERRER_MONEY_SENTENCE,
  REFERRERS_NEVER_PAID,
  REFERRING_FREE_LINE,
  askCostLanding,
  askCostLine,
  creditReservedPhrase,
  creditUsedPhrase,
} from "../shared/moneyCopy";
import { FREE_PLAN } from "../shared/planCatalog";
import Emails from "../client/src/pages/Emails";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

afterEach(cleanup);

/**
 * The only allowed "ask" in these strings is the verb. Strip those verb
 * phrases, then any remaining "ask(s)" is the noun D-180 retires.
 */
const VERB_ASK = /\b(?:never )?asks? (?:you )?for (?:money|your password|a referral|referrals)\b/gi;

function forbiddenNoun(text: string): RegExpMatchArray | null {
  return text.replace(VERB_ASK, "").match(/\b(?:asks?|credits?)\b/i);
}

/**
 * Presentation strings whose referral-only rewording is safe today: it states
 * the same live charge (1 referral request) and the same live allowance without
 * implying any paused or unbuilt plan is on sale.
 */
const REFERRAL_SAFE_COPY: ReadonlyArray<readonly [string, string]> = [
  ["FREE_ASKS_CHIP", FREE_ASKS_CHIP],
  ["MONEY_SENTENCE", MONEY_SENTENCE],
  ["MONEY_SENTENCE_SHORT", MONEY_SENTENCE_SHORT],
  ["CREDIT_RULE", CREDIT_RULE],
  ["askCostLine: waiting for coverage", askCostLine({ open: false, balance: null }).line],
  ["askCostLine: availability unknown", askCostLine({ open: null, balance: null }).line],
  ["askCostLine: balance known", askCostLine({ open: true, balance: 2 }).line],
  ["askCostLine: one left", askCostLine({ open: true, balance: 1 }).line],
  ["askCostLine: empty wallet", askCostLine({ open: true, balance: 0 }).line],
  ["creditUsedPhrase: flat", creditUsedPhrase(false)],
  ["askCostLanding: waitBody", askCostLanding(false).waitBody],
  ["askCostLanding: fairRule", askCostLanding(false).fairRule],
];

describe("D-180 public money copy", () => {
  it("distinguishes the submitted request from its balance debit and refund", () => {
    const lines = [askCostLine({ open: true, balance: 8, cost: 5 }).line, askCostLine({ open: true, balance: 3, cost: 5 }).line, CREDIT_RULE, askCostLanding(false).fairRule];
    for (const line of lines) expect(line).not.toMatch(/(?:costs? \d+ referral requests?|uses? \d+ of your \d+ referral requests?|\d+ referral requests? (?:is|are) used|referral request comes back)/i);
    expect(lines[0]).toBe("Uses 5 from your balance of 8");
    expect(lines[1]).toBe("This referral request uses 5 from your balance. You have 3. Add 2 more.");
    expect(CREDIT_RULE).toContain("The charge is refunded once");
    expect(CREDIT_RULE).toContain("has not expired, ended or been revoked and has room for the refund");
  });

  // Vacuity guard: the detector must catch the retired nouns and still allow
  // the verb the owner kept ("never ask you for money", "Ask for a referral").
  it("detects the retired nouns and allows the verb", () => {
    expect(forbiddenNoun("3 free credits every month")?.[0]).toBe("credits");
    expect(forbiddenNoun("An ask waits at no cost")?.[0]).toBe("ask");
    expect(forbiddenNoun("Referrers are never paid and never ask you for money.")).toBeNull();
    expect(forbiddenNoun("Ask for a referral")).toBeNull();
    expect(forbiddenNoun("3 free referrals every month")).toBeNull();
  });

  it("names referral requests, never credits or the noun ask", () => {
    const violations = REFERRAL_SAFE_COPY.flatMap(([label, text]) => {
      const hit = forbiddenNoun(text);
      return hit ? [`${label}: ${text} -> ${hit[0]}`] : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps administrator-only reservation facts unchanged", () => {
    expect(creditReservedPhrase(false)).toBe("1 credit reserved");
    expect(creditReservedPhrase(true)).toBe("Credits reserved");
  });

  it("keeps the allowance derived from the live catalog, not a new hardcoded amount", () => {
    expect(FREE_ASKS_PER_MONTH).toBe(FREE_PLAN.creditsPerMonth);
    const numbers = FREE_ASKS_CHIP.match(/\d+/g) ?? [];
    expect(numbers).toEqual([String(FREE_ASKS_PER_MONTH)]);
    expect(FREE_ASKS_CHIP.startsWith(`${FREE_ASKS_PER_MONTH} free `)).toBe(true);
  });

  it("keeps referrers unpaid and says so plainly", () => {
    expect(REFERRERS_NEVER_PAID).toBe("Referrers are never paid.");
    expect(REFERRER_MONEY_SENTENCE).toContain("never ask you for money");
    expect(REFERRING_FREE_LINE).toContain("Referrers are never paid");
    for (const text of [MONEY_SENTENCE, MONEY_SENTENCE_SHORT, REFERRER_MONEY_SENTENCE, REFERRING_FREE_LINE]) {
      expect(text).not.toMatch(/referrers? (?:are|get|earn|receive|take) (?:a )?(?:cut|commission|payment|paid)|paid (?:referrers?|for referrals?)/i);
    }
  });

  it("never presents a request as a guaranteed or completed referral", () => {
    for (const [label, text] of REFERRAL_SAFE_COPY) {
      expect(text, label).not.toMatch(/guarantee[sd]? (?:an? )?(?:referral|introduction|interview|job|offer)|completed referral|referral completed/i);
    }
  });

  it("keeps the live charge and the empty-wallet block unchanged", () => {
    expect(askCostLine({ open: true, balance: 2 }).line).toMatch(/\b1\b/);
    expect(askCostLine({ open: false, balance: 2 }).blockedReason).toBeNull();
    expect(askCostLine({ open: true, balance: 0 }).blockedReason).not.toBeNull();
    expect(askCostLine({ open: true, balance: 3, cost: 5 }).blockedReason).toContain("Add 2 more");
  });
});

describe("D-180 kit email gallery", () => {
  const STAGES = [/claims|claimed/i, /accepted/i, /passed/i, /coverage/i, /slot opened/i];

  function articleText(): string {
    const text = screen.getByRole("article").textContent ?? "";
    // The shared money footer is independently covered by the money-copy
    // suite above, including its allowance and balance-use tail. Remove it
    // only to isolate the gallery stage text in this separate control.
    return text.replace(MONEY_SENTENCE, "");
  }

  it("names the referral stages with referral nouns", () => {
    render(React.createElement(Emails));
    const violations = STAGES.flatMap(stage => {
      const name = screen.getByRole("button", { name: stage }).textContent ?? "";
      const hit = forbiddenNoun(name);
      return hit ? [`${name} -> ${hit[0]}`] : [];
    });
    expect(violations).toEqual([]);
  });

  it("describes each stage with referral nouns, never credits or the noun ask", () => {
    render(React.createElement(Emails));
    const violations = STAGES.flatMap(stage => {
      fireEvent.click(screen.getByRole("button", { name: stage }));
      const text = articleText();
      const hit = forbiddenNoun(text);
      return hit ? [`${stage}: ${text} -> ${hit[0]}`] : [];
    });
    expect(violations).toEqual([]);
  });

  it("shows an accepted request as accepted, never as a completed referral", () => {
    render(React.createElement(Emails));
    fireEvent.click(screen.getByRole("button", { name: /accepted/i }));
    const text = articleText();
    expect(text).toMatch(/accepted/i);
    expect(text).not.toMatch(/completed referral|referral completed|was referred|is referred|guaranteed referral/i);
  });
});
