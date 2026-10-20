// GoalDrawer (spec §4.10): desktop = docked 480px column, no scrim, the list
// stays visible; phone = full-height sheet over a scrim. Built on Radix
// dialog (never vaul, never shadcn sheet/drawer).
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GoalIconButton } from "./GoalIconButton";

const DESKTOP_QUERY = "(min-width: 641px)";

/** jsdom has no matchMedia; without one the layout reads as desktop, never as a crash. */
function desktopQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(DESKTOP_QUERY);
}

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => desktopQuery()?.matches ?? true);
  useEffect(() => {
    const query = desktopQuery();
    if (!query) return;
    const onChange = () => setDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

export type GoalDrawerProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  context?: string;
  closeLabel: string;
  children: ReactNode;
  footer: ReactNode;
};

export function GoalDrawer({ open, onOpenChange, title, context, closeLabel, children, footer }: GoalDrawerProps) {
  const desktop = useIsDesktop();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={!desktop}>
      {desktop ? (
        <Dialog.Content
          data-testid="goal-drawer"
          className="g-scope animate-g-drawer-in sticky top-(--g-topbar-h) flex h-[calc(100vh-var(--g-topbar-h))] w-[480px] flex-col bg-g-surface shadow-g-drawer data-[state=closed]:animate-g-drawer-out motion-reduce:animate-none"
        >
          <DrawerHeader title={title} context={context} closeLabel={closeLabel} onClose={() => onOpenChange(false)} desktop />
          <div className="flex-1 overflow-y-auto p-6 [display:grid] [gap:28px] [align-content:start]">{children}</div>
          <div className="sticky bottom-0 border-t border-g-hairline bg-g-surface px-6 pt-4 pb-5">{footer}</div>
        </Dialog.Content>
      ) : (
        <Dialog.Portal>
          <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out motion-reduce:animate-none" />
          <Dialog.Content
            data-testid="goal-drawer"
            className="g-scope animate-g-sheet-in fixed inset-x-0 bottom-0 top-2 z-50 flex flex-col rounded-t-[12px] bg-g-surface data-[state=closed]:animate-g-sheet-out motion-reduce:animate-none"
          >
            <span aria-hidden="true" className="mx-auto mt-2 h-1 w-8 rounded-[2px] bg-g-control-edge" />
            <DrawerHeader title={title} context={context} closeLabel={closeLabel} onClose={() => onOpenChange(false)} desktop={false} />
            <div className="flex-1 overflow-y-auto px-4 py-5 [display:grid] [gap:24px] [align-content:start]">{children}</div>
            <div className="border-t border-g-hairline bg-g-surface px-4 pt-4 pb-5">{footer}</div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

function DrawerHeader({ title, context, closeLabel, onClose, desktop }: { title: string; context?: string; closeLabel: string; onClose(): void; desktop: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 border-b border-g-hairline", desktop ? "min-h-[76px] py-3.5 pr-3 pl-6" : "min-h-16 px-4 pt-1 pb-3")}>
      <div className="min-w-0 flex-1">
        <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
        {context ? <Dialog.Description className="text-g-meta text-g-ink-2">{context}</Dialog.Description> : null}
      </div>
      <Dialog.Close asChild>
        <GoalIconButton icon={X} aria-label={closeLabel} onClick={onClose} />
      </Dialog.Close>
    </div>
  );
}
