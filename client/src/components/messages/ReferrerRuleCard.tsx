// Shown instead of a composer when a direct message involves a verified
// referrer who has not accepted a request linking the two people (D-012
// item 3). It states the rule; no plan or follow can change it, so there is
// no upgrade path here.
import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";
import type { DmSendBlock } from "@shared/directMessages";
import { buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

export function ReferrerRuleCard({ block }: { block: DmSendBlock }) {
  const isReferrer = block.senderRole === "referrer";
  return <div data-skipwait-screen="dm-referrer-rule" role="status">
    <Panel tone="muted">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-background text-foreground"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></span>
      <h2 className="mt-4 text-xl font-semibold tracking-[-.02em] text-foreground">Messages open after acceptance</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.error} No plan or follow changes this.</p>
      <Link href={isReferrer ? "/inbox" : "/requests"} className={buttonVariants({ variant: "outline", className: "mt-4 h-11 w-full" })}>{isReferrer ? "Open my company inbox" : "Go to My requests"}</Link>
    </Panel>
  </div>;
}
