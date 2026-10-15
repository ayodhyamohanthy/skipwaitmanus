import { describe, expect, it } from "vitest";
import { formatEffectiveDate, noticeCopy, VERIFIED_REFERRER_SENTENCE, noticeMessageFor } from "./premiumDmChangeNoticeCopy";

// The owner-approved text (D-020), rendered for 20 October 2026. Do not edit without a new approval.
const APPROVED = {
  "notification": {
    "title": "A change to messaging on Pro and Max",
    "body": "From 20 October 2026, you can message a referrer only after they accept your referral request, on every plan. This keeps our privacy promise to referrers. Everything else in your plan stays the same. Within 30 days you can choose a pro-rata refund for your current billing cycle or bonus referral credits of equal value: write to support@skipwait.me."
  },
  "email": {
    "subject": "A change to messaging on your SkipWait plan",
    "text": "Hi,\n\nWe are writing about a change to SkipWait Pro and Max.\n\nWhat changes\nFrom 20 October 2026, you can send a direct message to a referrer only after that referrer accepts your referral request. This applies on every plan, so Pro and Max no longer include messaging referrers directly. Once a referrer accepts, you can message each other on any plan.\n\nWhy\nOur privacy page promises referrers that job seekers can message them only after they accept a specific request. Allowing messages before acceptance went against that promise, so the rule now applies to everyone.\n\nWhat stays the same\nEverything else in your plan, including your monthly referral requests, any credits you bought and your billing date.\n\nYour choice\nYour plan included this, so within 30 days of this email you can choose one of these:\n- a pro-rata refund for your current billing cycle, or\n- bonus referral credits of equal value.\nWrite to support@skipwait.me with your choice. If you do nothing, your plan continues as it is.\n\nThank you for using SkipWait.\nThe SkipWait team"
  }
} as const;

// The credits_only text for gifted or unbilled plans, rendered for 20 October
// 2026. NOT approved yet (D-020): runPremiumDmChangeNotice refuses to write it
// without creditsOnlyCopyApproved. Pinned so the owner approves these exact
// words; change it only together with that approval request.
const AWAITING_APPROVAL_CREDITS_ONLY = {
  "notification": {
    "title": "A change to messaging on Pro and Max",
    "body": "From 20 October 2026, you can message a referrer only after they accept your referral request, on every plan. This keeps our privacy promise to referrers. Everything else in your plan stays the same. Within 30 days you can ask for bonus referral credits equal in value to the rest of your current plan period: write to support@skipwait.me."
  },
  "email": {
    "subject": "A change to messaging on your SkipWait plan",
    "text": "Hi,\n\nWe are writing about a change to SkipWait Pro and Max.\n\nWhat changes\nFrom 20 October 2026, you can send a direct message to a referrer only after that referrer accepts your referral request. This applies on every plan, so Pro and Max no longer include messaging referrers directly. Once a referrer accepts, you can message each other on any plan.\n\nWhy\nOur privacy page promises referrers that job seekers can message them only after they accept a specific request. Allowing messages before acceptance went against that promise, so the rule now applies to everyone.\n\nWhat stays the same\nEverything else in your plan, including your monthly referral requests and the date your plan ends or renews.\n\nYour choice\nYour plan included this. It was not billed to you (for example, it was a gift), so within 30 days of this email you can ask for bonus referral credits equal in value to the rest of your current plan period.\nWrite to support@skipwait.me to ask for them. If you do nothing, your plan continues as it is.\n\nThank you for using SkipWait.\nThe SkipWait team"
  }
} as const;

describe("D-012 premium DM change notice: copy", () => {
  it("keeps the refund-or-credits copy exactly as the owner approved it (D-020)", () => {
    const copy = noticeCopy("2026-10-20").byOffer.refund_or_credits;
    expect(copy.notification).toEqual(APPROVED.notification);
    expect(copy.email).toEqual(APPROVED.email);
  });

  it("renders the credits-only copy exactly as it goes to the owner for approval", () => {
    const copy = noticeCopy("2026-10-20").byOffer.credits_only;
    expect(copy.notification).toEqual(AWAITING_APPROVAL_CREDITS_ONLY.notification);
    expect(copy.email).toEqual(AWAITING_APPROVAL_CREDITS_ONLY.email);
  });

  it("offers a gifted or unbilled plan bonus credits only, with the same change, reason and support address", () => {
    const { refund_or_credits: paid, credits_only: gifted } = noticeCopy("2026-10-20").byOffer;
    for (const text of [gifted.email.text, gifted.notification.body]) {
      expect(text).toContain("20 October 2026");
      expect(text).toContain("support@skipwait.me");
      expect(text).toMatch(/bonus referral credits equal in value to the rest of your current plan period/);
      expect(text).toMatch(/30 days/);
      expect(text).not.toMatch(/refund|billing cycle|billing date|credits you bought/i);
    }
    expect(gifted.email.text).toMatch(/If you do nothing, your plan continues as it is/);
    expect(gifted.email.subject).toBe(paid.email.subject);
    expect(gifted.notification.title).toBe(paid.notification.title);
    // What changes and why are the approved text, word for word.
    const head = (text: string) => text.slice(0, text.indexOf("What stays the same"));
    expect(head(gifted.email.text)).toBe(head(paid.email.text));
  });

  it("says what stays the same in words true for each offer", () => {
    const stays = (text: string) => text.slice(text.indexOf("What stays the same"), text.indexOf("Your choice"));
    const { refund_or_credits: paid, credits_only: gifted } = noticeCopy("2026-10-20").byOffer;
    expect(stays(paid.email.text)).toBe("What stays the same\nEverything else in your plan, including your monthly referral requests, any credits you bought and your billing date.\n\n");
    expect(stays(gifted.email.text)).toBe("What stays the same\nEverything else in your plan, including your monthly referral requests and the date your plan ends or renews.\n\n");
  });

  it("states what changes, when, why, what stays, and the 30-day refund-or-credits choice", () => {
    const copy = noticeCopy("2026-10-20").byOffer.refund_or_credits;
    for (const text of [copy.email.text, copy.notification.body]) {
      expect(text).toContain("20 October 2026");
      expect(text).toContain("support@skipwait.me");
      expect(text).toMatch(/pro-rata refund for your current billing cycle/);
      expect(text).toMatch(/bonus referral credits of equal value/);
      expect(text).toMatch(/30 days/);
    }
    expect(copy.email.text).toMatch(/privacy/);
    expect(copy.email.text).toMatch(/If you do nothing, your plan continues as it is/);
    expect(copy.notification.title.length).toBeLessThanOrEqual(180);
    for (const variant of Object.values(noticeCopy("2026-10-20").byOffer)) expect(`${variant.email.text} ${variant.notification.body}`).not.toMatch(/reply to this email|hurry|last chance|act now/i);
  });

  it("gives subscribers who are verified referrers the same text plus one sentence, and only them (D-020 follow-up)", () => {
    const copy = noticeCopy("2026-10-20");
    for (const offer of ["refund_or_credits", "credits_only"] as const) {
      const base = copy.byOffer[offer];
      const referrer = copy.verifiedReferrerByOffer[offer];
      expect(base.email.text).not.toContain(VERIFIED_REFERRER_SENTENCE);
      expect(base.notification.body).not.toContain(VERIFIED_REFERRER_SENTENCE);
      expect(referrer.email.text).toContain(VERIFIED_REFERRER_SENTENCE);
      expect(referrer.notification.body).toContain(VERIFIED_REFERRER_SENTENCE);
      expect(referrer.email.text.replace(` ${VERIFIED_REFERRER_SENTENCE}`, "")).toBe(base.email.text);
      expect(referrer.notification.body.replace(` ${VERIFIED_REFERRER_SENTENCE}`, "")).toBe(base.notification.body);
      expect(noticeMessageFor(copy, { offer, verifiedReferrer: true })).toBe(referrer);
      expect(noticeMessageFor(copy, { offer, verifiedReferrer: false })).toBe(base);
      expect(`${referrer.email.text} ${referrer.notification.body}`).not.toMatch(/reply to this email|hurry|last chance|act now/i);
    }
  });

  it("rejects an effective date that is not a real calendar date", () => {
    expect(formatEffectiveDate("2026-10-20")).toBe("20 October 2026");
    for (const bad of ["2026-02-30", "20-10-2026", "tomorrow", ""]) expect(() => formatEffectiveDate(bad)).toThrow(/YYYY-MM-DD/);
  });
});
