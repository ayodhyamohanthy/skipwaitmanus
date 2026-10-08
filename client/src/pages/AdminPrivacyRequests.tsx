import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { AlertCircle, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { readApiJson } from "@/lib/apiResponse";

type PrivacyRequest = { id: number; kind: "erasure"; status: "requested" | "in_review" | "completed" | "declined"; source: string; resolution: string | null; createdAt: string; updatedAt: string; userId: number; requesterName: string | null; requesterEmail: string | null; reviewedAt: string | null };

export default function AdminPrivacyRequests() {
  const { isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const [workingId, setWorkingId] = useState<number | null>(null); const [resolutions, setResolutions] = useState<Record<number, string>>({});
  const requestsQuery = useQuery({
    queryKey: ["admin-privacy-requests"],
    enabled: isSignedIn,
    retry: false,
    queryFn: async (): Promise<PrivacyRequest[]> => {
      const token = await getToken();
      const response = await fetch("/api/admin/privacy-requests?limit=100", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ requests?: PrivacyRequest[]; error?: string }>(response, "We could not load privacy requests");
      if (!response.ok) throw new Error(payload.error || "We could not load privacy requests");
      return payload.requests || [];
    },
  });
  const reviewMutation = useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) => {
      const token = await getToken();
      const response = await fetch(`/api/admin/privacy-requests/${requestId}/review`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ status: "in_review", resolution: resolutions[requestId] || undefined }) });
      const payload = await readApiJson<{ request?: Partial<PrivacyRequest>; error?: string }>(response, "We could not update this request");
      if (!response.ok) throw new Error(payload.error || "We could not update this request");
      return payload.request || null;
    },
    onMutate: ({ requestId }) => { setWorkingId(requestId); },
    onSettled: () => { setWorkingId(null); },
    onSuccess: (request, { requestId }) => {
      queryClient.setQueryData<PrivacyRequest[]>(["admin-privacy-requests"], current => current?.map(item => item.id === requestId ? { ...item, ...(request || {}), updatedAt: new Date().toISOString() } : item));
    },
  });
  const requests = requestsQuery.data ?? [];
  const loading = requestsQuery.isPending;
  const error = requestsQuery.error instanceof Error ? requestsQuery.error.message : reviewMutation.error instanceof Error ? reviewMutation.error.message : "";
  const review = (requestId: number, status: "in_review") => { if (status === "in_review") reviewMutation.mutate({ requestId }); };
  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Privacy request review</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to review authenticated privacy requests.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  return <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-5xl"><AdminNav current="privacy-requests" /><section className="mt-8 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Administrator queue</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Privacy requests</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Start deletion reviews deliberately. Completion is disabled until a real erasure workflow verifies every resource step and any approved retained-data exception.</p>{error ? <p role="alert" className="mt-5 flex items-center gap-2 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-3 text-sm text-[#B45309]"><AlertCircle className="h-4 w-4" />{error}</p> : null}{loading ? <div className="mt-8 flex items-center gap-2 text-sm text-[#505050]"><LoaderCircle className="h-4 w-4 animate-spin" />Loading privacy requests…</div> : <div className="mt-7 grid gap-4">{requests.map(request => <article key={request.id} className="rounded-xl border border-[#e5e5e5] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-black">Account deletion review</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${request.status === "completed" ? "bg-[#15803d]/10 text-[#15803d]" : request.status === "declined" ? "bg-[#b91c1c]/10 text-[#B91C1C]" : request.status === "in_review" ? "bg-[#f5f5f5] text-black" : "bg-[#b45309]/10 text-[#B45309]"}`}>{request.status.replace("_", " ")}</span></div><p className="mt-1 text-sm text-[#505050]">{request.requesterName || "Account holder"} · {request.requesterEmail || `User ${request.userId}`}</p><p className="mt-1 text-xs text-[#505050]">Requested {new Date(request.createdAt).toLocaleString()}</p></div><Clock3 className="h-5 w-5 text-[#505050]" /></div><label className="mt-4 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#505050]">Internal resolution note</span><textarea value={resolutions[request.id] ?? request.resolution ?? ""} onChange={event => setResolutions(current => ({ ...current, [request.id]: event.target.value.slice(0, 500) }))} maxLength={500} rows={2} placeholder="Record the next step or outcome." className="mt-2 w-full resize-none rounded-lg border border-[#e5e5e5] p-3 text-sm outline-none focus:border-[#141414]" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={workingId === request.id} onClick={() => void review(request.id, "in_review")} className="rounded-lg border border-[#141414] bg-[#f5f5f5] px-3 py-2 text-xs font-bold text-black">Start review</button><span className="rounded-lg border border-[#b45309]/30 bg-[#b45309]/10 px-3 py-2 text-xs font-bold text-[#B45309]">Completion blocked until erasure evidence is verified</span></div></article>)}{!requests.length ? <p className="rounded-xl bg-white p-8 text-center text-sm text-[#505050]">No privacy requests are waiting for review.</p> : null}</div>}</section></div></main>;
}
