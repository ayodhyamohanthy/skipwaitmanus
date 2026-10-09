// Kit v4 cancel flow (billing.tsx "Before you go" → "Plan cancelled."), limited
// to what the server does: cancellation is scheduled for the end of the paid
// cycle. The kit's reason survey and "Pause for 1 month" have no backend, so
// they are not shown.
import { Button } from "@/components/kit/button";
import { KitDialog } from "./KitDialog";
import { kitDate } from "./format";
import { planLabel } from "./planCatalog";

type CancelPlanDialogProps = {
  plan: string;
  termEnd: string | null;
  step: "confirm" | "done";
  cancelling: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function CancelPlanDialog({ plan, termEnd, step, cancelling, error, onConfirm, onClose }: CancelPlanDialogProps) {
  const name = planLabel(plan);
  const until = termEnd ? kitDate(termEnd, false) : null;
  return <KitDialog as="section" labelledBy="cancel-plan-title" onClose={onClose}>
    {step === "confirm" ? <>
      <h2 id="cancel-plan-title" className="text-xl font-semibold">Before you go</h2>
      <p className="mt-2 text-muted-foreground">Cancel at the end of this paid cycle? You keep {name}{until ? ` until ${until}` : " until then"}. Unused plan credits expire then; purchased credits never do.</p>
      <div className="mt-4 grid gap-2">
        <Button variant="outline" data-autofocus onClick={onClose}>Keep my plan</Button>
        <Button variant="ghost" disabled={cancelling} onClick={onConfirm}>{cancelling ? "Cancelling…" : "Cancel anyway"}</Button>
      </div>
      {error ? <p role="alert" className="mb-0 font-semibold text-destructive">{error}</p> : null}
    </> : <>
      <h2 id="cancel-plan-title" className="text-xl font-semibold">Plan cancelled.</h2>
      <p className="mt-2 text-muted-foreground">You keep {name}{until ? ` until ${until}` : " until the end of this paid cycle"}. Unused plan credits expire then; purchased credits never do.</p>
      <footer className="mt-6 flex justify-end"><Button data-autofocus onClick={onClose}>Done</Button></footer>
    </>}
  </KitDialog>;
}
