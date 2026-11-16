// Shell meta (D-048 phase 3, F-credits): the nav id and page title for the
// current path live here, so a surface never edits AppShell to name itself.
// Moved verbatim from AppShell.tsx - same tables, same fallbacks.
import type { GoalNavId } from "./nav";

export function shellActiveNav(path: string): GoalNavId {
  if (path.startsWith("/queue")) return "queue";
  if (path.startsWith("/requests") || path.startsWith("/ask")) return "asks";
  if (path.startsWith("/inbox") || path.startsWith("/conversation") || path.startsWith("/messages")) return "inbox";
  return "find";
}

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/explore/, "Find a referral"],
  [/^\/requests/, "My asks"],
  [/^\/ask/, "Ask for a referral"],
  [/^\/queue/, "Referral queue"],
  [/^\/inbox/, "Inbox"],
  [/^\/conversation/, "Conversation"],
  [/^\/alerts/, "Alerts"],
  [/^\/plans/, "Plans and credits"],
  [/^\/billing/, "Billing"],
  [/^\/profile/, "Profile"],
  [/^\/settings/, "Settings"],
  [/^\/help/, "Help and safety"],
  [/^\/referrer-home/, "Refer"],
];

export function shellPageTitle(path: string): string {
  for (const [re, title] of PAGE_TITLES) if (re.test(path)) return title;
  return "skipwait.me";
}

export function useGoalShellMeta(path: string): { active: GoalNavId; pageTitle: string } {
  return { active: shellActiveNav(path), pageTitle: shellPageTitle(path) };
}
