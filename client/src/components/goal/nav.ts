import { Inbox, MessagesSquare, Search, Send, type LucideIcon } from "lucide-react";

/** One navigation for everyone (D-070): Find, My asks, Inbox; a verified referrer also gets the Referral queue.
 * Impact is a quiet link in the queue header, so the rail and the phone bar keep at most four places (D-077). */
export type GoalNavId = "find" | "asks" | "queue" | "inbox";
export type GoalNavItem = { id: GoalNavId; label: string; railLabel: string; icon: LucideIcon; href: string };

export const GOAL_NAV: Readonly<Record<GoalNavId, GoalNavItem>> = {
  find: { id: "find", label: "Find a referral", railLabel: "Find", icon: Search, href: "/explore" },
  asks: { id: "asks", label: "My asks", railLabel: "My asks", icon: Send, href: "/requests" },
  queue: { id: "queue", label: "Referral queue", railLabel: "Queue", icon: Inbox, href: "/queue" },
  inbox: { id: "inbox", label: "Inbox", railLabel: "Inbox", icon: MessagesSquare, href: "/inbox" },
};

export function goalNavFor(verifiedReferrer: boolean): GoalNavItem[] {
  return verifiedReferrer
    ? [GOAL_NAV.find, GOAL_NAV.asks, GOAL_NAV.queue, GOAL_NAV.inbox]
    : [GOAL_NAV.find, GOAL_NAV.asks, GOAL_NAV.inbox];
}
