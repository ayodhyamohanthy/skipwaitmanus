import { ArrowRight, BadgeCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { SetupWizard } from "@/components/referrer-home/SetupWizard";
import { companyIdentity, fetchCompanyAccess, fetchReferrerPreferences, type CompanyAccess, type ReferrerPreferences, type TokenSource } from "@/components/referrer-home/referrerData";

type SetupData = { access: CompanyAccess; preferences: ReferrerPreferences | null };

async function fetchSetup(getToken: TokenSource): Promise<SetupData> {
  const access = await fetchCompanyAccess(getToken);
  if (!access.verified) return { access, preferences: null };
  return { access, preferences: await fetchReferrerPreferences(getToken) };
}

export default function ReferrerSetup() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  // Seeded once from the saved settings; the wizard owns edits until Finish.
  const setup = useQuery({ queryKey: ["referrer-setup", userId ?? null], queryFn: () => fetchSetup(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false, staleTime: Infinity });

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-setup-sign-in" className="page-content mx-auto max-w-2xl">
        <Heading eyebrow="REFERRER SETUP" title="Set up referring" text="Sign in, verify a work email, then choose what you can judge." />
        <SignInButton className={buttonVariants()}>Sign in</SignInButton>
      </main>
    );
  }

  const data = setup.data;
  return (
    <main data-skipwait-screen="referrer-setup" className="page-content mx-auto max-w-2xl">
      {setup.isPending ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your referrer setup…</p> : setup.isError ? (
        <Panel tone="muted" className="text-center">
          <h1 className="text-2xl font-semibold">We could not load your setup.</h1>
          <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{setup.error.message || "Check your connection and try again."}</p>
          <Button className="mt-4" disabled={setup.isFetching} onClick={() => { void setup.refetch(); }}>{setup.isFetching ? "Trying again…" : "Try again"}</Button>
        </Panel>
      ) : !data?.access.verified || !data.preferences ? (
        <Panel className="text-center">
          <BadgeCheck className="mx-auto mb-3 size-8 text-primary" />
          <h1 className="text-2xl font-semibold">Verify first.</h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">Setup opens after a one-time code confirms your work email.</p>
          <Button className="mt-6" asChild><Link href="/verify">Verify work email <ArrowRight /></Link></Button>
        </Panel>
      ) : (
        <SetupWizard
          initial={data.preferences}
          companyName={data.access.domain ? companyIdentity(data.access.domain).name : "your company"}
          fetchToken={fetchToken}
          onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["referrer-home"] }); void queryClient.invalidateQueries({ queryKey: ["referrer-setup"] }); }}
        />
      )}
    </main>
  );
}
