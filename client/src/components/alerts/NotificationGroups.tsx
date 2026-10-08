import { BadgeCheck, Check, MessageSquare, Wallet } from "lucide-react";
import { isToday, timeAgo, type NotificationCategory, type NotificationItem } from "./notifications";

// Kit row icons (app/src/routes/alerts.tsx), chosen by the live category.
const CATEGORY_ICON: Record<NotificationCategory, typeof Check> = {
  status: Check,
  message: MessageSquare,
  referral: BadgeCheck,
  system: Wallet,
};

const GROUPS = ["Today", "Earlier"] as const;

/**
 * Kit Today/Earlier notification list. Rows are buttons, not links: opening one
 * marks it read on the server first, then follows the category destination the
 * page decides.
 */
export function NotificationGroups({ items, onOpen }: { items: readonly NotificationItem[]; onOpen: (item: NotificationItem) => void }) {
  return (
    <>
      {GROUPS.map(group => {
        const rows = items.filter(item => (group === "Today") === isToday(item.createdAt));
        if (!rows.length) return null;
        return (
          <div key={group} className="mb-4">
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{group.toUpperCase()}</h2>
            <ul className="overflow-hidden rounded-3xl border border-border">
              {rows.map(item => {
                const Icon = CATEGORY_ICON[item.category];
                const unread = !item.readAt;
                return (
                  <li key={item.id} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      aria-label={`${item.title}${unread ? ", unread" : ""}`}
                      className={`flex min-h-16 w-full items-start gap-3 p-4 text-left hover:bg-muted ${unread ? "bg-primary/5" : ""}`}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"><Icon className="size-5" /></span>
                      <span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong><span className="block truncate text-sm text-muted-foreground">{item.body}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                      {unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}
