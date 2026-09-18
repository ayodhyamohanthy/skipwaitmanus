import { AlertCircle, BadgeCheck, Search, ShieldCheck, ShieldOff } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useAuth, SignInButton } from "@/_core/auth";
import StatusBadge, { type StatusTone } from "@/components/StatusBadge";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { readApiJson } from "@/lib/apiResponse";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type AdminUserRow = { id: number; email: string | null; name: string | null; role: "user" | "admin"; accountType: "job_seeker" | "referrer" | null; company: string | null; workEmailVerifiedAt: string | Date | null; suspended: boolean; createdAt: string | Date };
const accountTypeLabels: Record<"job_seeker" | "referrer", { label: string; tone: StatusTone }> = { job_seeker: { label: "Job Seeker", tone: "blue" }, referrer: { label: "Referrer", tone: "green" } };
const compactDate = (value: string | Date) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AdminUsers() {
  const { isSignedIn, getToken } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ userId: number; message: string; suspended: boolean } | null>(null);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setDenied(false);
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/users?limit=200", { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
      if (response.status === 403) { setDenied(true); setUsers([]); return; }
      const payload = await readApiJson<{ users?: AdminUserRow[]; error?: string }>(response, "We could not load the users directory");
      if (!response.ok) throw new Error(payload.error || "We could not load the users directory");
      setUsers(payload.users || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the users directory"); }
    finally { setLoading(false); }
  };

  const setSuspension = async (user: AdminUserRow, suspended: boolean) => {
    setWorkingId(user.id); setRowError(null);
    const previous = users;
    setUsers(current => current.map(row => row.id === user.id ? { ...row, suspended } : row));
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/users/${user.id}/suspend`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ suspended }) });
      const payload = await readApiJson<{ user?: { suspended?: boolean }; error?: string }>(response, "We could not update this user account");
      if (!response.ok) throw new Error(payload.error || "We could not update this user account");
    } catch (suspendError) {
      setUsers(previous);
      setRowError({ userId: user.id, message: suspendError instanceof Error ? suspendError.message : "We could not update this user account", suspended });
    }
    finally { setWorkingId(null); }
  };

  const filteredUsers = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return users;
    return users.filter(user => `${user.email ?? ""} ${user.name ?? ""}`.toLowerCase().includes(term));
  }, [users, filter]);

  useEffect(() => { void load(); }, [isSignedIn]);
  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator users directory</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to review accounts and suspend access when required.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#0000ff] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  if (denied) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator access is required</h1><p className="mt-2 text-sm leading-6 text-[#505050]">The users directory is available only to the designated administrator account.</p><a href="/" className="mt-5 inline-flex items-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-3 text-sm font-semibold text-black hover:border-[#0000ff] hover:bg-[#ededff]">Back to skipwait.me</a></section></div></main>;
  return <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="users" /><section className="mt-10 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Users directory</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Every account, one roster.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Newest accounts first, with role, company, and suspension state. Suspending an account removes its access immediately; unsuspending restores it.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#505050]">{users.length ? `${users.length} accounts` : "Directory"}</span></div><form onSubmit={event => event.preventDefault()} className="mt-5"><label className="relative block max-w-md"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#505050]" /><input aria-label="Search users" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search by email or name" className="w-full rounded-lg border border-[#e5e5e5] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0000ff]" /></label></form>{error ? <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#B45309]"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#B45309]">Retry</button></div> : loading ? <div className="mt-7 grid gap-3">{[0, 1, 2].map(index => <div key={index} className="h-20 animate-pulse rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="h-4 w-52 rounded bg-[#f0f0f0]" /><div className="mt-3 h-3 w-72 rounded bg-[#f0f0f0]" /></div>)}</div> : !filteredUsers.length ? <div className="mt-7 rounded-xl border border-dashed border-[#e5e5e5] p-10 text-center"><p className="text-sm font-bold text-black">{users.length ? "No accounts match this search" : "No accounts yet"}</p><p className="mt-1 text-sm text-[#505050]">{users.length ? "Clear the search to see the full directory." : "Accounts appear here as people join skipwait.me."}</p></div> : <ul className="mt-7 grid gap-3">{filteredUsers.map(user => { const badge = user.suspended ? { label: "Suspended", tone: "red" as StatusTone } : user.accountType ? accountTypeLabels[user.accountType] : { label: "No profile", tone: "slate" as StatusTone }; const working = workingId === user.id; return <li key={user.id} className="rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-bold text-black">{user.email || `User #${user.id}`}</h2><p className="mt-1 truncate text-[11px] text-[#505050]">{[user.name, user.company, `Joined ${compactDate(user.createdAt)}`].filter(Boolean).join(" · ")}</p></div><div className="flex shrink-0 items-center gap-2"><StatusBadge label={badge.label} tone={badge.tone} />{user.workEmailVerifiedAt ? <span title="Work email verified" className="inline-flex items-center gap-1 rounded-full border border-[#15803d]/30 bg-[#15803d]/10 px-2.5 py-1 text-[11px] font-bold text-[#15803d]"><BadgeCheck className="h-3.5 w-3.5" />Verified</span> : null}</div></div>{rowError?.userId === user.id ? <div role="alert" className="mt-3 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2 text-xs font-semibold text-[#B91C1C]"><p>Update failed — {rowError.message}. The account is unchanged.</p><button type="button" disabled={working} onClick={() => void setSuspension(user, rowError.suspended)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#b91c1c]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#B91C1C]">Retry</button></div> : null}<div className="mt-3 flex sm:justify-end">{user.suspended ? <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={working} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#15803d]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#15803d] hover:bg-[#15803d]/10"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Unsuspend</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Unsuspend this user?</AlertDialogTitle><AlertDialogDescription>{user.email || `User #${user.id}`} regains access immediately.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={working} onClick={() => void setSuspension(user, false)} className="border border-[#15803d]/30 bg-white text-[#15803d] hover:bg-[#15803d]/10">{working ? "Updating…" : "Unsuspend user"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={working} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#b91c1c]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-[#b91c1c]/10"><ShieldOff className="mr-1.5 h-3.5 w-3.5" />Suspend</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Suspend this user?</AlertDialogTitle><AlertDialogDescription>{user.email || `User #${user.id}`} will lose access immediately. You can unsuspend them at any time.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={working} onClick={() => void setSuspension(user, true)} className="border border-[#b91c1c]/30 bg-white text-[#b91c1c] hover:bg-[#b91c1c]/10">{working ? "Updating…" : "Suspend user"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></li>; })}</ul>}</section></div></main>;
}
