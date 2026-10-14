// Draft copy for the D-012 item 3 notice to active Pro/Max subscribers.
// Plain and factual: what changes and when, why, what stays the same, and the
// 30-day choice of a pro-rata refund or bonus credits of equal value. The
// owner approves this text before anyone runs the script with --apply.
//
// Transactional email is sent from noreply@skipwait.me with no Reply-To, so
// the copy points people at the support address rather than "reply to this
// email" (a reply would not reach anyone).
export const NOTICE_SUPPORT_EMAIL = "support@skipwait.me";
export const NOTICE_CHOICE_WINDOW_DAYS = 30;

export type NoticeCopy = {
  effectiveDate: string;
  notification: { title: string; body: string };
  email: { subject: string; text: string };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-15" -> "15 October 2026"; throws on anything that is not a real calendar date. */
export function formatEffectiveDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!DATE_PATTERN.test(isoDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) throw new Error(`Effective date must be a real date written YYYY-MM-DD (got "${isoDate}")`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function noticeCopy(effectiveIsoDate: string): NoticeCopy {
  const when = formatEffectiveDate(effectiveIsoDate);
  const days = NOTICE_CHOICE_WINDOW_DAYS;
  return {
    effectiveDate: effectiveIsoDate,
    notification: {
      title: "A change to messaging on Pro and Max",
      body: `From ${when}, you can message a referrer only after they accept your referral request, on every plan. This keeps our privacy promise to referrers. Everything else in your plan stays the same. Within ${days} days you can choose a pro-rata refund for your current billing cycle or bonus referral credits of equal value: write to ${NOTICE_SUPPORT_EMAIL}.`,
    },
    email: {
      subject: "A change to messaging on your SkipWait plan",
      text: [
        "Hi,",
        "",
        "We are writing about a change to SkipWait Pro and Max.",
        "",
        "What changes",
        `From ${when}, you can send a direct message to a referrer only after that referrer accepts your referral request. This applies on every plan, so Pro and Max no longer include messaging referrers directly. Once a referrer accepts, you can message each other on any plan.`,
        "",
        "Why",
        "Our privacy page promises referrers that job seekers can message them only after they accept a specific request. Allowing messages before acceptance went against that promise, so the rule now applies to everyone.",
        "",
        "What stays the same",
        "Everything else in your plan, including your monthly referral requests, any credits you bought and your billing date.",
        "",
        "Your choice",
        `Your plan included this, so within ${days} days of this email you can choose one of these:`,
        "- a pro-rata refund for your current billing cycle, or",
        "- bonus referral credits of equal value.",
        `Write to ${NOTICE_SUPPORT_EMAIL} with your choice. If you do nothing, your plan continues as it is.`,
        "",
        "Thank you for using SkipWait.",
        "The SkipWait team",
      ].join("\n"),
    },
  };
}
