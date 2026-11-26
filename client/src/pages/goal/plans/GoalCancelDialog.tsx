// Goal cancel-renewal confirmation (D-048-p3-plans). It replaces the kit
// /billing modal for the goal surface only: the same server behaviour (a
// cancellation is scheduled for the end of the paid cycle), the same two steps,
// and the kit's keyboard contract (Escape closes, focus returns on close).
// Radix dialog is already the goal primitive's engine (GoalDrawer, GoalSheet).
import * as Dialog from "@radix-ui/react-dialog";
import { GoalButton } from "@/components/goal";
import { kitDate } from "@/components/plans/format";

export type GoalCancelDialogProps = {
  planLabel: string;
  termEnd: string | null;
  step: "confirm" | "done";
  cancelling: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function GoalCancelDialog({ planLabel, termEnd, step, cancelling, error, onConfirm, onClose }: GoalCancelDialogProps) {
  const until = termEnd ? kitDate(termEnd, false) : null;
  const keeps = `You keep ${planLabel}${until ? ` until ${until}` : " until the end of this paid cycle"}. Unused plan referral requests expire then; added referral requests stay.`;
  return (
    <Dialog.Root open onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim motion-reduce:animate-none" />
        <Dialog.Content
          data-testid="goal-cancel-dialog"
          className="g-scope animate-g-sheet-in fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-g-popover border border-g-hairline bg-g-surface p-5 motion-reduce:animate-none"
        >
          {step === "confirm" ? (
            <>
              <Dialog.Title className="text-g-heading text-g-ink">Before you go</Dialog.Title>
              <Dialog.Description className="mt-2 text-g-meta text-g-ink-2">{`Cancel at the end of this paid cycle? ${keeps}`}</Dialog.Description>
              <div className="mt-5 grid gap-2">
                <GoalButton variant="ghost" onClick={onClose}>Keep my plan</GoalButton>
                <GoalButton variant="primary" busy={cancelling} busyLabel="Cancelling…" onClick={onConfirm}>Cancel anyway</GoalButton>
              </div>
              {error ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{error}</p> : null}
            </>
          ) : (
            <>
              <Dialog.Title className="text-g-heading text-g-ink">Renewal cancelled.</Dialog.Title>
              <Dialog.Description className="mt-2 text-g-meta text-g-ink-2">{keeps}</Dialog.Description>
              <div className="mt-5 flex justify-end">
                <GoalButton variant="primary" onClick={onClose}>Done</GoalButton>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
