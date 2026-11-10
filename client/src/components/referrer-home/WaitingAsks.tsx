// "Waiting for you" column of /referrer-home (kit v4 referrer-home.tsx).
// Rows come from the live company inbox. The second line leads with the ask's
// job function as in the kit ("Design · …"), or the company when it has none;
// the role title and ask strength are not in that payload yet, so rows show
// the private reference and attachment count instead of invented detail. A row
// opens that request in the queue (/queue?request=:id), where an unclaimed ask
// can be previewed; the conversation only exists after acceptance.
import { ArrowRight, Inbox } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { displayJobFunction } from "@shared/jobFunctions";
import { askCountdown, type ReferrerHomeView } from "./referrerData";
import { ReferrerSampleRows } from "./ReferrerSampleRows";

export function WaitingAsks({ view, nowMs }: { view: ReferrerHomeView; nowMs: number }) {
  const company = view.company;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-semibold">Waiting for you</h2><Link href="/queue" className="text-link text-sm">Full queue →</Link></div>
      {view.atCapacity ? (
        <Panel tone="muted"><h3 className="font-semibold">You&apos;ve hit your capacity.</h3><p className="mt-1 text-sm text-muted-foreground">Finish what&apos;s open first. Raise your limit only if you really have time.</p><Button variant="outline" className="mt-3" asChild><Link href="/referrer?view=setup">Adjust capacity</Link></Button></Panel>
      ) : view.waiting.length === 0 && view.showSamples ? (
        // Sample-filled first-run state (owner override, Oct 21 11:35 PM): two inert
        // SAMPLE rows teach the accept/pass anatomy. Server-durable flag only -
        // hasEverReviewed===false strictly; real counts/capacity untouched.
        <ReferrerSampleRows
          rows={[
            { name: "A. Sample · Product Analyst", time: "2H AGO", reason: "Asked for you by name. Three lines of why, no pile.", next: "Waiting on you" },
            { name: "B. Example · Data Engineer", time: "1D AGO", reason: "Sent to the company queue · fits what you said you can judge.", next: "Waiting on you" },
          ]}
          caption="Samples show what a real ask looks like. They are never counted and disappear after your first real ask."
        />
      ) : view.waiting.length === 0 ? (
        <Panel tone="muted" className="text-center">
          <Inbox className="mx-auto mb-2 size-8" />
          <h3 className="font-semibold">{view.isNew ? "Your first ask will appear here." : "No asks right now."}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{view.isNew ? `Referral requests${company ? ` for ${company.name}` : ""} now reach you privately. Share your profile to help them find you.` : "Enjoy the quiet."}</p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {view.waiting.map(item => {
            const countdown = askCountdown(item, nowMs);
            const files = item.attachmentCount ?? 0;
            const name = company?.name ?? item.companyDomain;
            return (
              <li key={item.id}>
                <Link href={`/queue?request=${item.id}`} aria-label={`Private ask · Ref-${1000 + item.id}`} className="flex min-h-16 items-center gap-3 rounded-3xl border border-border p-4 hover:border-foreground/40">
                  <span className="company-mark">{company?.mark ?? (item.companyDomain.charAt(0) || "?").toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><strong className="block">{item.jobTitle?.trim() || `Private ask · Ref-${1000 + item.id}`}</strong><small className="text-muted-foreground">{displayJobFunction(item.jobFunction) ?? name}{item.askStrength ? ` · ask strength: ${item.askStrength === "strong" ? "Strong" : item.askStrength === "good" ? "Good" : "Basic"}` : ""}{files > 0 ? ` · ${files} ${files === 1 ? "file" : "files"} attached` : ""}</small></span>
                  {countdown ? <span className={`shrink-0 text-xs ${countdown.urgent ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{countdown.label}</span> : null}
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
