import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { gcn } from "./gcn";
import { GoalIconButton } from "./GoalIconButton";
import { useGoalDesktop } from "./useGoalMedia";

function focusFirstField(event: Event, container: EventTarget | null) {
  const root = container instanceof HTMLElement ? container : null;
  const target = root?.querySelector<HTMLElement>("[data-g-autofocus]");
  if (target) {
    event.preventDefault();
    target.focus();
  }
}

/** The ask drawer: on desktop a 480px column docked flush under the top bar with no scrim, so the list stays visible
 * and its selected row stays lit; on phones a full-height sheet over the scrim. Closing keeps the draft (the screen
 * owns the form state). Built on Radix Dialog, never vaul. */
export function GoalDrawer({ open, onOpenChange, title, context, closeLabel, children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  context?: string;
  closeLabel: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const desktop = useGoalDesktop();
  const header = (
    <div className="flex min-h-[76px] items-center gap-3 border-b border-g-hairline py-3.5 pl-6 pr-3 max-gdesk:min-h-16 max-gdesk:pb-3 max-gdesk:pl-4 max-gdesk:pr-1 max-gdesk:pt-1">
      <div className="min-w-0 flex-1">
        <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
        {context ? <Dialog.Description className="mt-0.5 text-g-meta text-g-ink-2">{context}</Dialog.Description> : null}
      </div>
      <Dialog.Close asChild>
        <GoalIconButton label={closeLabel} icon={X} />
      </Dialog.Close>
    </div>
  );
  const body = (
    <>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-7 p-6 max-gdesk:gap-6 max-gdesk:px-4 max-gdesk:py-5">{children}</div>
      </div>
      <div className="grid gap-1 border-t border-g-hairline bg-g-surface px-6 pb-5 pt-4 max-gdesk:px-4">{footer}</div>
    </>
  );
  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <Dialog.Content
          data-testid="goal-drawer"
          {...(context ? {} : { "aria-describedby": undefined })}
          onInteractOutside={event => event.preventDefault()}
          onOpenAutoFocus={event => focusFirstField(event, event.currentTarget)}
          className="g-scope flex h-full w-(--g-drawer-w) flex-col bg-g-surface shadow-g-drawer data-[state=closed]:animate-g-drawer-out data-[state=open]:animate-g-drawer-in"
        >
          {body}
        </Dialog.Content>
      </Dialog.Root>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="g-scope fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in" />
        <Dialog.Content
          data-testid="goal-drawer"
          onOpenAutoFocus={event => focusFirstField(event, event.currentTarget)}
          className="g-scope fixed inset-x-0 bottom-0 top-2 z-50 flex flex-col rounded-t-g-sheet bg-g-surface text-g-ink data-[state=closed]:animate-g-sheet-out data-[state=open]:animate-g-sheet-in"
        >
          <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-8 shrink-0 rounded-[2px] bg-g-control-edge" />
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A medium phone sheet over the scrim (the pass reasons on phones). */
export function GoalSheet({ open, onOpenChange, title, children, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title when the children do not render a Dialog.Title themselves. */
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="g-scope fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={gcn(
            "g-scope fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-24px)] overflow-y-auto rounded-t-g-sheet bg-g-surface px-4 pb-5 pt-2 text-g-ink",
            "data-[state=closed]:animate-g-sheet-out data-[state=open]:animate-g-sheet-in",
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-8 rounded-[2px] bg-g-control-edge" />
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A confirm step (for example "Accept this request?"): a centred card on desktop, a bottom sheet on phones. */
export function GoalConfirmDialog({ open, onOpenChange, title, body, children, actions }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="g-scope fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in" />
        <Dialog.Content
          data-testid="goal-confirm"
          {...(body ? {} : { "aria-describedby": undefined })}
          className={gcn(
            "g-scope fixed z-50 bg-g-surface p-6 text-g-ink",
            "gdesk:left-1/2 gdesk:top-1/2 gdesk:w-[min(440px,calc(100vw-32px))] gdesk:-translate-x-1/2 gdesk:-translate-y-1/2 gdesk:rounded-g-popover gdesk:shadow-g-popover",
            "gdesk:data-[state=closed]:animate-g-fade-out gdesk:data-[state=open]:animate-g-fade-in",
            "max-gdesk:inset-x-0 max-gdesk:bottom-0 max-gdesk:rounded-t-g-sheet max-gdesk:px-4 max-gdesk:pb-5 max-gdesk:pt-4",
            "max-gdesk:data-[state=closed]:animate-g-sheet-out max-gdesk:data-[state=open]:animate-g-sheet-in",
          )}
        >
          <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
          {body ? <Dialog.Description className="mt-1 text-g-body text-g-ink-2">{body}</Dialog.Description> : null}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-2">{actions}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
