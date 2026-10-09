import { BadgeCheck, BarChart3, LoaderCircle, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { field } from "@/components/kit/preview-kit";
import { EmployerFrame, EmployerSkeleton } from "@/components/employer/EmployerFrame";
import { EmployerOverview } from "@/components/employer/EmployerOverview";
import { fetchEmployerAccount, fetchEmployerActivity, openEmployerAccount } from "@/components/employer/employerData";
import { applySeo } from "@/lib/seo";

const ACCOUNT_KEY = ["employer", "account"] as const;
const ACTIVITY_KEY = ["employer", "activity"] as const;
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export default function EmployerDashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    // Public employer entry point: it keeps its own title instead of inheriting
    // whatever screen the visitor came from.
    applySeo({ title: "Hire on skipwait.me", description: "Sponsor roles to opt-in job seekers, unlock anonymized opt-in talent, and manage a self-serve promotion budget. The seeker-referrer loop stays free.", path: "/employer" });
  }, []);

  const accountQuery = useQuery({ queryKey: ACCOUNT_KEY, queryFn: fetchEmployerAccount, enabled: isLoaded && isSignedIn, retry: false });
  const account = accountQuery.data ?? null;
  const activityQuery = useQuery({ queryKey: ACTIVITY_KEY, queryFn: fetchEmployerActivity, enabled: Boolean(account), retry: false });
  const start = useMutation({
    mutationFn: () => openEmployerAccount(companyName),
    onSuccess: opened => { if (opened) { queryClient.setQueryData(ACCOUNT_KEY, opened); void queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY }); } },
  });

  if (!isLoaded) return <EmployerFrame withNav={false}><EmployerSkeleton /></EmployerFrame>;
  if (!isSignedIn) return <EmployerFrame withNav={false}><section className="mx-auto w-full max-w-xl rounded-3xl bg-background p-6"><h1 className="text-3xl font-semibold">Hire without the noise.</h1><p className="mt-2 text-muted-foreground">Sign in to sponsor roles, discover opt-in talent, and manage your promotion budget.</p><SignInButton><Button type="button" className="mt-6 h-12 w-full">Sign in to continue</Button></SignInButton></section></EmployerFrame>;
  if (accountQuery.isPending) return <EmployerFrame withNav={false}><EmployerSkeleton /></EmployerFrame>;
  if (accountQuery.isError && !account) {
    return <EmployerFrame withNav={false}><section role="alert" className="mx-auto w-full max-w-xl rounded-3xl bg-background p-6"><h1 className="text-2xl font-semibold">We could not load your employer account</h1><p className="mt-2 text-sm text-muted-foreground">{errorText(accountQuery.error, "We could not load your employer account")}</p><p className="mt-2 text-sm text-muted-foreground">Nothing was changed. Check your connection and try again.</p><Button type="button" className="mt-5 h-12 w-full" disabled={accountQuery.isFetching} onClick={() => void accountQuery.refetch()}>Try again</Button></section></EmployerFrame>;
  }
  if (!account) {
    const startError = start.isError ? errorText(start.error, "We could not open your employer account") : "";
    return <EmployerFrame withNav={false}><section className="mx-auto w-full max-w-xl rounded-3xl bg-background p-6">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted"><Sparkles className="size-5" /></span>
      <h1 className="mt-5 text-3xl font-semibold">Become an employer on skipwait.me</h1>
      <p className="mt-2 text-muted-foreground">Sponsor your open roles to the top of seeker feeds, unlock anonymized opt-in talent with credits, and keep the seeker-referrer loop free for everyone.</p>
      <ul className="mt-4 space-y-2 text-sm"><li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />Priority placement in role feeds and search</li><li className="flex items-start gap-2"><UsersRound className="mt-0.5 size-4 shrink-0 text-primary" />Talent discovery — only seekers who opted in</li><li className="flex items-start gap-2"><BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" />Self-serve promotion budget, pay per unlock</li></ul>
      <label className="mt-6 block text-sm font-medium">Company name<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Acme Robotics" className={field} /></label>
      {startError && <p role="alert" className="mt-3 rounded-xl bg-muted p-3 text-sm text-destructive">{startError}</p>}
      <Button type="button" className="mt-5 h-12 w-full" disabled={start.isPending || !companyName.trim()} onClick={() => start.mutate()}>{start.isPending ? <LoaderCircle className="animate-spin" /> : null}Get started</Button>
    </section></EmployerFrame>;
  }
  return <EmployerFrame companyName={account.companyName} withNav>
    {activityQuery.isPending ? <EmployerSkeleton /> : <EmployerOverview account={account} activity={activityQuery.data} activityError={activityQuery.isError ? errorText(activityQuery.error, "We could not load your employer activity") : ""} onRetry={() => void activityQuery.refetch()} retrying={activityQuery.isFetching} />}
  </EmployerFrame>;
}
