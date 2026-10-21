// The live shell adapter for moved surfaces (D-048 phase 3): it owns the data
// GoalShell deliberately refuses to fetch — the account, the server's verified
// referrer verdict and the seeker's spendable credits — and renders nothing
// else. Unmoved surfaces keep AppShell until their own packet.
import type { ReactNode } from "react";
import { useAuth, useUser } from "@/_core/auth";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { GoalShell } from "./GoalShell";
import type { GoalNavId } from "./nav";

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

export function GoalAppShell({ active, pageTitle, children }: { active: GoalNavId; pageTitle: string; children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const access = useReferrerAccess();
  const verifiedReferrer = access.status === "verified";
  // A verified referrer never sees a credits pill (D-055); wait for the verdict
  // instead of flashing one while it is checked.
  const credits = useCreditBalance(isSignedIn && access.status !== "verified" && access.status !== "checking");
  return (
    <GoalShell
      active={active}
      verifiedReferrer={verifiedReferrer}
      pageTitle={pageTitle}
      credits={credits}
      account={{ initials: isSignedIn && isLoaded ? initialsOf(user) : "" }}
      alertsHref="/alerts"
    >
      {children}
    </GoalShell>
  );
}
