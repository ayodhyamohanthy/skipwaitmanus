// Inbox row presentation for the goal inbox (D-048-p3-inbox). Split out so the
// page file stays readable: the status vocabulary and one row, both driven by
// the shared inboxThreads model. Nothing here decides identity or access - the
// model does (pre-acceptance privacy), and this file only renders what it gets.
import { Link } from "wouter";
import { GoalCompanyMark, GoalNum, GoalStatus, type GoalStatusValue } from "@/components/goal";
import { timeAgo, type InboxSide, type InboxThread } from "@/components/inbox/inboxThreads";

/** The dot + text vocabulary of My asks and the conversation, keyed off the model's kit status. */
export function threadView(thread: InboxThread): { status: GoalStatusValue; label: string } {
  if (thread.side === "referring" && thread.pill === "Requested") return { status: "queue_new", label: "New referral request" };
  switch (thread.pill) {
    case "Accepted": return { status: "accepted", label: "Accepted" };
    case "Referred": return { status: "referred", label: "Referred" };
    case "Interviewing": return { status: "accepted", label: "Interviewing" };
    case "Offer": return { status: "accepted", label: "Offer" };
    case "Closed": return { status: "withdrawn", label: "Closed" };
    case "Expired": return { status: "expired", label: "Expired" };
    case "Declined": return { status: "expired", label: "Declined" };
    case "Withdrawn": return { status: "withdrawn", label: "Withdrawn" };
    default: return { status: "waiting", label: "Waiting" };
  }
}

/** The thread that needs the reader first: an unread reply, then a fresh referral request to review. */
export function needsYou(thread: InboxThread): boolean {
  return thread.unread > 0 || (thread.side === "referring" && thread.pill === "Requested");
}

/**
 * The row's note in referral-only words (D-180). The shared model still words a fresh request with the retired noun
 * for the kit page; the goal row restates that one line without changing the model or the kit.
 */
export function goalNote(thread: InboxThread): string {
  return thread.note.replace(/\bNew ask for you to review\b/, "New referral request to review");
}

/** One conversation: mark, who, dot+text status, role and note. The whole row is the link. */
export function ThreadRow({ thread }: { thread: InboxThread }) {
  const view = threadView(thread);
  return (
    <li data-testid="goal-list-row">
      <Link
        href={thread.href}
        aria-label={`${thread.who}, ${thread.role}, ${view.label}${thread.unread ? `, ${thread.unread} unread` : ""}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover"
      >
        <span className="row-span-2"><GoalCompanyMark initials={thread.mark} /></span>
        <span className="min-w-0 truncate text-g-label text-g-ink">{thread.who}</span>
        <span className="justify-self-end"><GoalStatus status={view.status} label={view.label} /></span>
        <span className="min-w-0 truncate text-g-meta text-g-ink-2">{thread.role} · {goalNote(thread)}</span>
        <span className="justify-self-end whitespace-nowrap text-g-meta text-g-ink-3"><GoalNum>{timeAgo(thread.updatedAt)}</GoalNum></span>
      </Link>
    </li>
  );
}

/** The page's sections in reading order: first the side the reader can act on. */
export function splitByOwner(threads: readonly InboxThread[], side: "all" | InboxSide) {
  const visible = side === "all" ? threads : threads.filter(thread => thread.side === side);
  return { visible, waitingOnYou: visible.filter(needsYou), waitingOnThem: visible.filter(thread => !needsYou(thread)) };
}
