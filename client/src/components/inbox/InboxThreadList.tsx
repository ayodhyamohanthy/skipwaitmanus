// Kit v4 inbox list, empty and error blocks, ported from app/src/routes/inbox.tsx.
import { AlertCircle, BadgeCheck, Eye, EyeOff, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { StatusPill } from "@/components/kit/status-pill";
import { timeAgo, type CounterpartIdentity, type InboxThread } from "./inboxThreads";

function IdentityIcon({ identity }: { identity: CounterpartIdentity }) {
  if (identity === "hidden") return <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />;
  if (identity === "shared") return <Eye className="size-3.5 shrink-0" aria-hidden="true" />;
  return <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />;
}

export function InboxThreadList({ threads }: { threads: readonly InboxThread[] }) {
  return (
    <ul className="overflow-hidden rounded-3xl border border-border">
      {threads.map(t => (
        <li key={t.key} className="border-b border-border last:border-0">
          <Link href={t.href} aria-label={`${t.who}, ${t.role}, ${t.pill}${t.unread ? `, ${t.unread} unread` : ""}`} className={`flex min-h-20 items-center gap-3 p-4 hover:bg-muted ${t.highlight ? "bg-primary/5" : ""}`}>
            <span className="company-mark" aria-hidden="true">{t.mark}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold"><IdentityIcon identity={t.identity} /><span className="truncate">{t.who}</span></span>
              <span className="block truncate text-sm text-muted-foreground">{t.role} · {t.note}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</span>
              <StatusPill status={t.pill} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** True empty: kit copy. Filtered empty: conversations exist, none match. */
export function InboxEmpty({ filtered }: { filtered: boolean }) {
  return (
    <section className="rounded-3xl bg-muted p-10 text-center">
      <MessageSquare className="mx-auto mb-3 size-8" aria-hidden="true" />
      {filtered ? (
        <>
          <h2 className="text-lg font-semibold">No matching conversations.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try another search, or switch between Asking and Referring.</p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">No conversations yet.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Send an ask to a verified referrer. When they accept, you&apos;ll talk here.</p>
          <Button asChild className="mt-4"><Link href="/explore">Find a referrer</Link></Button>
        </>
      )}
    </section>
  );
}

/** Load failure: never shown as an empty inbox. `partial` keeps loaded rows visible below. */
export function InboxLoadError({ message, partial, retrying, onRetry }: { message: string; partial: boolean; retrying: boolean; onRetry: () => void }) {
  if (partial) {
    return (
      <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-3xl border border-border p-4 text-sm">
        <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block font-semibold">Some conversations could not load.</span><span className="block text-muted-foreground">{message}</span></span>
        <Button variant="outline" size="sm" onClick={onRetry} aria-busy={retrying}>{retrying ? "Retrying…" : "Try again"}</Button>
      </div>
    );
  }
  return (
    <section role="alert" className="rounded-3xl bg-muted p-10 text-center">
      <AlertCircle className="mx-auto mb-3 size-8 text-destructive" aria-hidden="true" />
      <h2 className="text-lg font-semibold">We couldn&apos;t load your inbox.</h2>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry} aria-busy={retrying}>{retrying ? "Retrying…" : "Try again"}</Button>
    </section>
  );
}
