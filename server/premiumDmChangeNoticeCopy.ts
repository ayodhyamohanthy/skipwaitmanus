// Copy for the D-012 item 3 notice to active Pro/Max subscribers. Plain and
// factual: what changes and when, why, what stays the same, and the 30-day
// remediation choice.
//
// D-020: the "refund_or_credits" text is approved as written (pinned
// verbatim in premiumDmChangeNoticeCopy.test.ts). People whose plan was a
// gift, or was never billed to them, are offered bonus referral credits only,
// since cash refunds go only to whoever paid. The owner approved that
// "credits_only" text as written on Oct 15 (D-020 follow-up), and a third
// variant for subscribers who are themselves verified referrers: the same
// text plus VERIFIED_REFERRER_SENTENCE, because the gate also closes their
// messages with members who are not referrers. runPremiumDmChangeNotice still
// writes them only when the operator passes --credits-only-copy-approved and
// --verified-referrer-copy-approved, as a deliberate confirmation at send time.
//
// Transactional email is sent from noreply@skipwait.me with no Reply-To, so
// the copy points people at the support address rather than "reply to this
// email" (a reply would not reach anyone).
export const NOTICE_SUPPORT_EMAIL = "support@skipwait.me";
export const NOTICE_CHOICE_WINDOW_DAYS = 30;

export const NOTICE_OFFERS = ["refund_or_credits", "credits_only"] as const;
export type NoticeOffer = (typeof NOTICE_OFFERS)[number];

export type NoticeMessage = {
  notification: { title: string; body: string };
  email: { subject: string; text: string };
};

export type NoticeCopy = {
  effectiveDate: string;
  byOffer: Readonly<Record<NoticeOffer, NoticeMessage>>;
  /** Same texts plus VERIFIED_REFERRER_SENTENCE, for subscribers who themselves have a verified work email (D-020). */
  verifiedReferrerByOffer: Readonly<Record<NoticeOffer, NoticeMessage>>;
};

export const VERIFIED_REFERRER_SENTENCE = "Because you have a verified work email, all your direct messages now open only after an accepted referral request.";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-15" -> "15 October 2026"; throws on anything that is not a real calendar date. */
export function formatEffectiveDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!DATE_PATTERN.test(isoDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) throw new Error(`Effective date must be a real date written YYYY-MM-DD (got "${isoDate}")`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function message(when: string, staysTheSame: string, choice: { notification: string; email: readonly string[] }, verifiedReferrer: boolean): NoticeMessage {
  const referrerNote = verifiedReferrer ? ` ${VERIFIED_REFERRER_SENTENCE}` : "";
  return {
    notification: {
      title: "A change to messaging on Pro and Max",
      body: `From ${when}, you can message a referrer only after they accept your referral request, on every plan. This keeps our privacy promise to referrers.${referrerNote} Everything else in your plan stays the same. ${choice.notification}`,
    },
    email: {
      subject: "A change to messaging on your SkipWait plan",
      text: [
        "Hi,",
        "",
        "We are writing about a change to SkipWait Pro and Max.",
        "",
        "What changes",
        `From ${when}, you can send a direct message to a referrer only after that referrer accepts your referral request. This applies on every plan, so Pro and Max no longer include messaging referrers directly. Once a referrer accepts, you can message each other on any plan.${referrerNote}`,
        "",
        "Why",
        "Our privacy page promises referrers that job seekers can message them only after they accept a specific request. Allowing messages before acceptance went against that promise, so the rule now applies to everyone.",
        "",
        "What stays the same",
        staysTheSame,
        "",
        "Your choice",
        ...choice.email,
        "",
        "Thank you for using SkipWait.",
        "The SkipWait team",
      ].join("\n"),
    },
  };
}

export function noticeCopy(effectiveIsoDate: string): NoticeCopy {
  const when = formatEffectiveDate(effectiveIsoDate);
  const days = NOTICE_CHOICE_WINDOW_DAYS;
  const variants = (verifiedReferrer: boolean): Record<NoticeOffer, NoticeMessage> => ({
    refund_or_credits: message(when, "Everything else in your plan, including your monthly referral requests, any credits you bought and your billing date.", {
      notification: `Within ${days} days you can choose a pro-rata refund for your current billing cycle or bonus referral credits of equal value: write to ${NOTICE_SUPPORT_EMAIL}.`,
      email: [
        `Your plan included this, so within ${days} days of this email you can choose one of these:`,
        "- a pro-rata refund for your current billing cycle, or",
        "- bonus referral credits of equal value.",
        `Write to ${NOTICE_SUPPORT_EMAIL} with your choice. If you do nothing, your plan continues as it is.`,
      ],
    }, verifiedReferrer),
    // A gift recipient has no billing date or billing cycle of their own and usually bought no credits.
    credits_only: message(when, "Everything else in your plan, including your monthly referral requests and the date your plan ends or renews.", {
      notification: `Within ${days} days you can ask for bonus referral credits equal in value to the rest of your current plan period: write to ${NOTICE_SUPPORT_EMAIL}.`,
      email: [
        `Your plan included this. It was not billed to you (for example, it was a gift), so within ${days} days of this email you can ask for bonus referral credits equal in value to the rest of your current plan period.`,
        `Write to ${NOTICE_SUPPORT_EMAIL} to ask for them. If you do nothing, your plan continues as it is.`,
      ],
    }, verifiedReferrer),
  });
  return { effectiveDate: effectiveIsoDate, byOffer: variants(false), verifiedReferrerByOffer: variants(true) };
}

/** The exact text one recipient gets: their offer, plus the verified-referrer sentence when it applies. */
export function noticeMessageFor(copy: NoticeCopy, recipient: { readonly offer: NoticeOffer; readonly verifiedReferrer: boolean }): NoticeMessage {
  return (recipient.verifiedReferrer ? copy.verifiedReferrerByOffer : copy.byOffer)[recipient.offer];
}
