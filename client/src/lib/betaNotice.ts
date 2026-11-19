/**
 * Beta notice (owner, Oct 21 - verified phonemsg-01M5F17SGNAJH3T7696TCV9JK9
 * "show skipwait as BETA" + phonemsg-01M5F18399WHPNQFJEHDDAX6YB "Users should
 * know"): a small "Beta" badge beside the wordmark and one honest line. ONE
 * switch, one line, one link - flip BETA_NOTICE_ENABLED to false to remove
 * every trace. The line must never promise anything or weaken trust copy.
 */
export const BETA_NOTICE_ENABLED = true;
export const BETA_BADGE_LABEL = "Beta";
export const BETA_NOTICE_LINE = "skipwait.me is in beta. We're improving it every day, and your feedback shapes it.";
/** Feedback lives on Help; the notice links the word "feedback" there. */
export const BETA_NOTICE_LINK = { href: "/help", word: "feedback" } as const;
