// Goal-UI navigation (D-070, D-071): Find, My referrals, Inbox for everyone, plus
// Referral queue for a verified referrer. Impact is NOT a nav item: the
// approved comp reaches it from a quiet link in the queue header (D-077(2)).
import { Inbox, MessagesSquare, Search, Send, type LucideIcon } from "lucide-react";

export type GoalNavId = "find" | "asks" | "queue" | "inbox";
export type GoalNavItem = { id: GoalNavId; label: string; railLabel: string; icon: LucideIcon; href: string };

export const GOAL_NAV: Record<GoalNavId, GoalNavItem> = {
  find: { id: "find", label: "Find a referral", railLabel: "Find", icon: Search, href: "/explore" },
  asks: { id: "asks", label: "My referrals", railLabel: "My referrals", icon: Send, href: "/requests" },
  queue: { id: "queue", label: "Referral queue", railLabel: "Queue", icon: Inbox, href: "/queue" },
  inbox: { id: "inbox", label: "Inbox", railLabel: "Inbox", icon: MessagesSquare, href: "/inbox" },
};

export function goalNavFor(verifiedReferrer: boolean): GoalNavItem[] {
  return verifiedReferrer
    ? [GOAL_NAV.find, GOAL_NAV.asks, GOAL_NAV.queue, GOAL_NAV.inbox]
    : [GOAL_NAV.find, GOAL_NAV.asks, GOAL_NAV.inbox];
}
