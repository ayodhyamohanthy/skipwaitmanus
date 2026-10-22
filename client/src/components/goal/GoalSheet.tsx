// GoalSheet (spec §4.10): the phone medium sheet (e.g. pass reasons at
// ≤640px). Desktop callers use the popover variant instead.
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function GoalSheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out motion-reduce:animate-none" />
        <Dialog.Content
          data-testid="goal-sheet"
          className="g-scope animate-g-sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-[12px] bg-g-surface px-4 pt-2 pb-5 data-[state=closed]:animate-g-sheet-out motion-reduce:animate-none"
        >
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-8 rounded-[2px] bg-g-control-edge" />
          <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
          {description ? <Dialog.Description className="text-g-meta text-g-ink-2">{description}</Dialog.Description> : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
