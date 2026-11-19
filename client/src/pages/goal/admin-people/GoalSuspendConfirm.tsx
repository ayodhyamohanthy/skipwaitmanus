// The goal suspension confirm (D-048-p3-admin-people). The kit page asked
// through components/ui/alert-dialog, which a goal page cannot reach
// (goalPagesBoundary.test.ts), so this is the goal dialog the doctrine already
// uses for a destructive step (GoalCancelDialog precedent): the same two steps
// and the same consequence copy the kit dialog showed, one commit.
import * as Dialog from "@radix-ui/react-dialog";
import { GoalButton } from "@/components/goal/GoalButton";

export type GoalSuspendConfirmProps = {
  /** The state being asked for: true suspends, false restores. */
  suspended: boolean;
  account: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function GoalSuspendConfirm({ suspended, account, busy, onConfirm, onClose }: GoalSuspendConfirmProps) {
  const title = suspended ? "Suspend this user?" : "Unsuspend this user?";
  const description = suspended ? `${account} will lose access immediately. You can unsuspend them at any time.` : `${account} regains access immediately.`;
  return (
    <Dialog.Root open onOpenChange={next => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim motion-reduce:animate-none" />
        <Dialog.Content
          data-testid="goal-suspend-confirm"
          className="g-scope animate-g-sheet-in fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-g-popover border border-g-hairline bg-g-surface p-5 motion-reduce:animate-none"
        >
          <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-g-meta text-g-ink-2">{description}</Dialog.Description>
          <div className="mt-5 grid gap-2">
            <GoalButton variant="ghost" onClick={onClose}>Cancel</GoalButton>
            <GoalButton variant="primary" busy={busy} busyLabel="Updating…" disabledReason={busy ? "An update is already in progress." : undefined} onClick={onConfirm}>
              {suspended ? "Suspend user" : "Unsuspend user"}
            </GoalButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
