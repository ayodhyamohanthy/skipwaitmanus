import { Compass, Search } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

/**
 * Honest stand-in for the kit's Saved alerts tab (app/src/routes/alerts.tsx).
 * There is no saved-alert table, endpoint or firing job yet, so nothing can be
 * saved, paused or deleted here. The panel keeps the kit's empty Saved alerts
 * layout (muted panel + full-width outline action) and only promises what the
 * server already does: when an ask is waiting for company coverage, opening
 * referrer capacity at that company sends the seeker a notification
 * (server/db.ts openCompanyReferralAvailability).
 */
export function SavedAlertsUnavailable() {
  return (
    <div className="mt-4 space-y-3" data-skipwait-saved-alerts="unavailable">
      <Panel tone="muted" className="text-center">
        <Search className="mx-auto mb-3 size-8" />
        <h2 className="text-lg font-semibold">Get told when a door opens.</h2>
        <p className="mt-1 text-sm text-muted-foreground">Saved company alerts aren&apos;t available yet. If your ask is waiting for a verified referrer, we&apos;ll tell you here when one opens.</p>
      </Panel>
      <Button variant="outline" className="w-full" asChild><Link href="/explore"><Compass />Explore companies</Link></Button>
    </div>
  );
}
