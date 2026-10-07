import { EyeOff, Inbox as InboxIcon, MessageSquare, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import StatusBadge from "@/components/StatusBadge";
import { getJobSeekerReferralState, referralStatusLabels, type ReferralStatus } from "@shared/referral";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type AskingRow = { id: number; title?: string | null; companyDomain: string; status: ReferralStatus; referrerId: number | null; queueStatus?: "available_for_review" | "waiting_for_coverage" | null; referrerMessage: string | null; unreadMessageCount: number; updatedAt: string };
type ReferringRow = { id: number; companyDomain: string; status: ReferralStatus; unreadMessageCount: number; updatedAt: string };
type ThreadRow = { id: number; side: "asking" | "referring"; companyDomain: string; title: string; note: string; unread: number; updatedAt: string; pill: string; tone: "blue" | "amber" | "green" | "slate" };

const stateBadgeTones = { blue: "blue", amber: "amber", emerald: "green", slate: "slate" } as const;
const PERSONAL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me"]);

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1d" : `${days}d`;
}

export default function UnifiedInbox() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const [asking, setAsking] = useState<AskingRow[]>([]);
  const [referring, setReferring] = useState<ReferringRow[]>([]);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [side, setSide] = useState<"all" | "asking" | "referring">("all");
  const [query, setQuery] = useState("");

  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses?.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && domain && !PERSONAL.has(domain);
  }));

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const mineResponse = await fetch("/api/company-referrals/mine", { credentials: "include", headers });
        const mine = await readApiJson<{ requests?: AskingRow[] }>(mineResponse, "");
        if (active && mineResponse.ok && Array.isArray(mine.requests)) setAsking(mine.requests);
        if (active && hasVerifiedWorkEmail) {
          const [fresh, done] = await Promise.all([
            fetch("/api/company-referrals/inbox?scope=new", { credentials: "include", headers }).then(async r => (await readApiJson<{ requests?: ReferringRow[] }>(r, ""))),
            fetch("/api/company-referrals/inbox?scope=completed", { credentials: "include", headers }).then(async r => (await readApiJson<{ requests?: ReferringRow[] }>(r, ""))),
          ]);
          if (!active) return;
          const seen = new Set<number>();
          const merged = [...(fresh.requests ?? []), ...(done.requests ?? [])].filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
          setReferring(merged);
          setQueueCount((fresh.requests ?? []).length);
        } else if (active) { setReferring([]); setQueueCount(null); }
      } catch { /* list renders what loaded */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, hasVerifiedWorkEmail]);

  const rows: ThreadRow[] = useMemo(() => {
    const askingRows: ThreadRow[] = asking.map(item => {
      const state = item.queueStatus === "available_for_review"
        ? { label: "Available for review", tone: "blue" as const }
        : item.queueStatus === "waiting_for_coverage"
          ? { label: "Waiting for coverage", tone: "amber" as const }
          : getJobSeekerReferralState({ status: item.status, referrerId: item.referrerId });
      const note = item.unreadMessageCount > 0 ? `${item.unreadMessageCount} new message${item.unreadMessageCount === 1 ? "" : "s"}` : (item.referrerMessage && item.status !== "pending" ? item.referrerMessage : state.label);
      return { id: item.id, side: "asking" as const, companyDomain: item.companyDomain, title: item.title || "Referral request", note, unread: item.unreadMessageCount, updatedAt: item.updatedAt, pill: state.label, tone: stateBadgeTones[state.tone] };
    });
    const referringRows: ThreadRow[] = referring.map(item => {
      const pill = item.status === "pending" ? "Needs your decision" : (referralStatusLabels[item.status] ?? item.status);
      const tone = item.status === "pending" ? "blue" as const : item.status === "approved" ? "green" as const : "slate" as const;
      const note = item.unreadMessageCount > 0 ? `${item.unreadMessageCount} new message${item.unreadMessageCount === 1 ? "" : "s"}` : item.status === "pending" ? "Review the candidate note" : pill;
      return { id: item.id, side: "referring" as const, companyDomain: item.companyDomain, title: "Seeker · identity hidden", note, unread: item.unreadMessageCount, updatedAt: item.updatedAt, pill, tone };
    });
    const all = [...askingRows, ...referringRows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const q = query.trim().toLowerCase();
    return all.filter(item => (side === "all" || item.side === side) && (!q || `${item.companyDomain} ${item.title} ${item.note}`.toLowerCase().includes(q)));
  }, [asking, referring, side, query]);

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="inbox-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Messages</p>
        <h1 className="mt-2 text-3xl font-semibold">Inbox.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Conversations open when a referrer accepts. Until then, identities stay private.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="inbox" className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-2"><span className="eyebrow">Messages</span><h1 className="mt-2 text-4xl font-semibold">Inbox</h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Conversations open when a referrer accepts. Until then, identities stay private.</p></div>

      {hasVerifiedWorkEmail && queueCount !== null && queueCount > 0 ? (
        <button type="button" onClick={() => go("/queue")} className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-[var(--foreground)] bg-[var(--secondary)] p-4 text-left shadow-[var(--shadow-offset)]">
          <InboxIcon className="size-5 shrink-0" />
          <span className="min-w-0 flex-1"><strong className="block text-sm">Review queue · {queueCount} new {queueCount === 1 ? "ask" : "asks"} waiting</strong><small className="text-[var(--muted-foreground)]">Decide as a referrer — your identity stays hidden.</small></span>
        </button>
      ) : null}

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-[var(--muted)] p-1 text-sm" role="tablist" aria-label="Inbox side">
          {(["all", "asking", "referring"] as const).map(value => (
            <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)} className={`min-h-9 rounded-full px-4 capitalize ${side === value ? "bg-[var(--background)] font-semibold shadow-sm" : "text-[var(--muted-foreground)]"}`}>{value === "all" ? "All" : value}</button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <span className="sr-only">Search conversations</span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" className="h-11 w-full rounded-full border border-[var(--input)] bg-[var(--background)] pl-9 pr-4 text-sm" />
        </label>
      </div>

      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your conversations…</p> : null}
      {!loading && rows.length === 0 ? (
        <section className="rounded-3xl bg-[var(--muted)] p-10 text-center">
          <MessageSquare className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">No conversations yet.</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Send an ask to a verified referrer. When they accept, you&apos;ll talk here.</p>
          <Link href="/explore" className="brand-button mt-4">Find a referrer</Link>
        </section>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-[var(--border)]">
          {rows.map(row => (
            <li key={`${row.side}-${row.id}`} className="border-b border-[var(--border)] last:border-0">
              <Link href={`/conversation/${row.id}${row.side === "referring" ? "?from=inbox" : ""}`} className={`flex min-h-20 items-center gap-3 p-4 ${row.unread ? "bg-[var(--primary)]/5" : ""}`} aria-label={`${row.companyDomain} conversation, ${row.pill}${row.unread ? `, ${row.unread} unread` : ""}`}>
                <span className="company-mark">{row.companyDomain.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {row.side === "referring" ? <EyeOff className="size-3.5 shrink-0" /> : null}<span className="truncate">{row.title}</span>
                  </span>
                  <span className="block truncate text-sm text-[var(--muted-foreground)]">{row.companyDomain} · {row.note}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-[var(--muted-foreground)]">{timeAgo(row.updatedAt)}</span>
                  <StatusBadge label={row.pill} tone={row.tone} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
