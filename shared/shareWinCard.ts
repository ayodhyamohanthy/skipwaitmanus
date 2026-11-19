// Seeker win card (owner-approved Oct 21, flag VITE_SHARE_WIN_CARD, off until QA). Copy is verbatim from
// design/goal-ui/content.json "shareWin" (sync pinned in shareWinCard.test.ts).
// PRIVACY BY TYPE: the builders accept only a role title, a company name and a status. There is no field
// through which a referrer's name, id or message could reach the card, and nothing here posts anywhere.
export const SHARE_WIN_COPY = {
  heading: "Share the win?",
  intro: "Your ask was accepted at {company}. Tell people if you want to – it is always your choice.",
  badgeAccepted: "Accepted",
  badgeReferred: "Referred",
  quote: "Someone who works there is vouching for me. Asked through skipwait.me – my name stayed private until they said yes.",
  footer: "skipwait.me · A warmer way in",
  copyText: "Copy card as text",
  copyLinkedIn: "Copy for LinkedIn",
  copied: "Copied.",
  note: "Nothing posts itself. The card never names your referrer – their help stays between you two unless they say otherwise.",
} as const;

export type WinCardInput = { roleTitle: string | null | undefined; companyName: string; status: string };

/** Accepted until the referrer has actually referred; every later step reads as Referred. */
export function winBadge(status: string): string {
  return status === "approved" ? SHARE_WIN_COPY.badgeAccepted : SHARE_WIN_COPY.badgeReferred;
}

export function winIntro(companyName: string): string {
  return SHARE_WIN_COPY.intro.replace("{company}", companyName);
}

function lines(input: WinCardInput): string[] {
  const role = input.roleTitle?.trim();
  return [winBadge(input.status), ...(role ? [role] : []), input.companyName, "", SHARE_WIN_COPY.quote, SHARE_WIN_COPY.footer];
}

/** Plain card text for any app. */
export function winCardText(input: WinCardInput): string { return lines(input).join("\n"); }

/** Same card plus the site link, for pasting into a LinkedIn post. */
export function winCardLinkedIn(input: WinCardInput): string { return `${lines(input).join("\n")}\nhttps://skipwait.me`; }
