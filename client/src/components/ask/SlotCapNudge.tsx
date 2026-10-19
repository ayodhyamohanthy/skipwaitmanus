// UPGRADE_NUDGES #1 "Slot cap reached", shown at the moment a send hits the
// plan's open-ask cap (the server's typed 409). Copy and the next plan's cap
// come from shared/openAskSlots.ts (the plan catalog); paying never changes
// queue position, and the copy says so.
import { Link } from "wouter";
import { slotCapNudgeCopy, type OpenAskSlots } from "@shared/openAskSlots";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

export function SlotCapNudge({ slots, onWait }: { slots: OpenAskSlots; onWait: () => void }) {
  const copy = slotCapNudgeCopy(slots);
  return (
    <div role="alert" data-skipwait-nudge="slot_cap">
      <Panel tone="muted">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {copy.cta ? <Button size="sm" variant="outline" asChild><Link href="/plans">{copy.cta}</Link></Button> : null}
          <Button size="sm" variant="ghost" onClick={onWait}>I&apos;ll wait</Button>
        </div>
      </Panel>
    </div>
  );
}
