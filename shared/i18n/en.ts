// English string catalogue (i18n seed, docs/plans/global-readiness-i18n-ai-plan.md).
// Values are verbatim from design/goal-ui/content.json (screenA.askDrawer +
// otherStates); a pin test keeps the two in sync. {company} interpolates at the
// call site. Locales get one file each with identical keys (CI key-parity pin).
const askDrawer = {
  title: "Ask for a referral",
  verifiedLine: "Goes to verified {company} employees",
  privacyNote: "Referrers see your job link and reasons. Your name and resume are shared only if one accepts.",
  seeOpenRoles: "See open roles",
  jobLinkLabel: "Job link",
  jobLinkPlaceholder: "Paste the job posting link…",
  matchHint: "Matches {company}’s careers site",
  resumeLabel: "Resume",
  resumeEmpty: "Add your resume (PDF)",
  resumeChange: "Change",
  resumeHint: "Shared after a referrer accepts",
  whyMeLabel: "Why me",
  whyMeHelper: "Three reasons, up to 140 characters each. One specific result beats a list of skills.",
  reasonPlaceholder3: "A third reason: a skill the posting asks for, or why this team…",
  costLine: "Uses 1 of your {count} credits",
  costDetail: "Comes back if you withdraw before anyone picks it up, or if nobody picks it up within 7 days. Once picked up, it stays spent, even if they pass.",
  send: "Send ask",
  sending: "Sending your ask…",
  saveDraft: "Save draft",
  draftSaved: "Draft saved",
  sendDisabledReason: "a job link, your resume and your reasons",
  closedBody: "Nobody at {company} can take a new ask right now.",
  closedCta: "Get told when a referrer joins",
  closedFootnote: "An alert is not a referral.",
  signedOutBody: "Sign in to ask {company} for a referral.",
  signedOutCta: "Sign in to ask",
  errors: {
    draftSave: "We could not save this draft",
    invalidUrl: "That doesn’t look like a job posting link.",
    send: "We could not send this ask",
    alertSave: "We could not save this alert",
  },
} as const;

const exploreStates = {
  noResultsTitle: "No matching companies yet",
  noResultsBody: "Try a wider search.",
  errorTitle: "We couldn’t load companies.",
  errorCta: "Try again",
  slowLoad: "Taking longer than expected.",
} as const;

export const goalCopy = { askDrawer, exploreStates } as const;
/** Fill a {named} placeholder. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
