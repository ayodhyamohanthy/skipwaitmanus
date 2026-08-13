import { useMutationState } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function WorkspaceDataGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth(); const utils = trpc.useUtils(); const failedMutations = useMutationState({ filters: { status: "error" }, select: mutation => mutation.state.error });
  const jobs = trpc.jobs.list.useQuery({}); const referrers = trpc.community.listReferrers.useQuery({}); const profile = trpc.profile.mine.useQuery(undefined, { enabled: isAuthenticated }); const savedRoles = trpc.savedRoles.list.useQuery(undefined, { enabled: isAuthenticated }); const referralStats = trpc.referrals.stats.useQuery(undefined, { enabled: isAuthenticated }); const referralRequests = trpc.referrals.listMine.useQuery(undefined, { enabled: isAuthenticated }); const messages = trpc.messaging.list.useQuery(undefined, { enabled: isAuthenticated }); const notifications = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated });
  const error = jobs.error || referrers.error || profile.error || savedRoles.error || referralStats.error || referralRequests.error || messages.error || notifications.error || failedMutations[0];
  const retry = () => { jobs.refetch(); referrers.refetch(); if (isAuthenticated) { profile.refetch(); savedRoles.refetch(); referralStats.refetch(); referralRequests.refetch(); messages.refetch(); notifications.refetch(); } utils.referrals.invalidate(); utils.savedRoles.invalidate(); utils.messaging.invalidate(); utils.notifications.invalidate(); };
  return <>{error && <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 lg:px-10"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" /><span><strong>We couldn’t load or save the latest workspace data.</strong> Your information has not been changed.</span></div><button onClick={retry} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div></div>}{children}</>;
}
