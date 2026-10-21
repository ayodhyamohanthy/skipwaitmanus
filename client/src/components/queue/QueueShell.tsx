// The live shell adapter for the moved referral queue (D-048 phase 3). GoalShell
// fetches nothing, so this owns the two facts it needs: who is signed in and
// whether the server's verified-referrer verdict says verified. A referrer
// surface shows no credits pill (D-055), so credits are explicitly null.
import type { ReactNode } from "react";
import { useAuth, useUser } from "@/_core/auth";
import { GoalShell } from "@/components/goal";

function initialsOf(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "";
  const name = user.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return `${first}${last}`.toUpperCase();
  }
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
  return email.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}

export function QueueShell({ verified, pageTitle, children }: { verified: boolean; pageTitle: string; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  return (
    <GoalShell
      active="queue"
      verifiedReferrer={verified}
      pageTitle={pageTitle}
      credits={null}
      account={{ initials: isSignedIn && isLoaded ? initialsOf(user) : "" }}
      alertsHref="/alerts"
    >
      {children}
    </GoalShell>
  );
}
