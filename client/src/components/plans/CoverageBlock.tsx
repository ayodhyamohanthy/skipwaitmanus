// /plans coverage block (GO-LIVE-1 C5): who can see the seeker's asks, shown
// above the purchase sections. Signed-in seekers only read their own asks
// (GET /api/company-referrals/mine, the same query and cache key as /requests)
// and, only when a waiting ask needs it, the public directory. While sign-in
// or a read is loading, or a read failed, the block is hidden: the purchase
// sections never depend on it.
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hourglass, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useCompanyDirectory } from "@/lib/companyDirectory";
import { fetchMyRequests } from "@/components/requests/requestsApi";
import { COVERAGE_FALLBACK, coverageLines, coverageSentence, needsAvailability, pendingAsks } from "./coverage";

type CoverageProps = { isLoaded: boolean; isSignedIn: boolean; userId: string | null; getToken: () => Promise<string | null | undefined> };

export function CoverageBlock({ isLoaded, isSignedIn, userId, getToken }: CoverageProps) {
  const fetchToken = usePersistFn(getToken);
  const asks = useQuery({ queryKey: ["requests", "mine", userId ?? "session"], enabled: isSignedIn, retry: false, queryFn: () => fetchMyRequests(fetchToken) });
  const pending = isSignedIn && asks.data ? pendingAsks(asks.data.requests) : [];
  const needsDirectory = pending.some(needsAvailability);
  const directory = useCompanyDirectory({ enabled: needsDirectory });

  if (!isLoaded || (isSignedIn && !asks.data)) return null;
  if (needsDirectory && !directory.data) return null;
  const lines = coverageLines(pending, directory.data?.companies ?? []);

  return <section className="plans-section" aria-labelledby="coverage-heading">
    <span className="eyebrow">BEFORE YOU PAY</span>
    <h2 id="coverage-heading">Who can see your asks</h2>
    {lines.length > 0
      ? <ul className="grid gap-3">{lines.map(line => <li key={line.key} className="flex items-start gap-3 text-sm leading-6">{line.open ? <ShieldCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /> : <Hourglass aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />}{coverageSentence(line)}</li>)}</ul>
      : <p className="text-sm leading-6 text-muted-foreground">{COVERAGE_FALLBACK} <Link href="/explore" className="text-link">Explore companies<ArrowRight className="size-4" /></Link></p>}
  </section>;
}
