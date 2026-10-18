import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { GoalButton } from "./GoalButton";
import { GoalSheet } from "./GoalDrawer";
import { GoalKeycap } from "./GoalKeycap";
import { gcn } from "./gcn";
import { useGoalDesktop } from "./useGoalMedia";

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !["radio", "checkbox"].includes(target.type);
  return target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

type Position = { index: number; total: number; onPrev?: () => void; onNext?: () => void };

function PositionButton({ label, icon: Icon, keyHint, onClick }: { label: string; icon: LucideIcon; keyHint: string; onClick?: () => void }) {
  const inactive = !onClick;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={inactive ? true : undefined}
      onClick={() => onClick?.()}
      className={gcn(
        "g-hit inline-flex h-8 items-center gap-1 rounded-g-control px-1.5 text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink max-gdesk:h-11 max-gdesk:min-w-11 max-gdesk:justify-center",
        inactive && "cursor-not-allowed text-g-control-edge hover:bg-transparent hover:text-g-control-edge",
      )}
    >
      <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      <span aria-hidden="true" className="max-gdesk:hidden"><GoalKeycap value={keyHint} /></span>
    </button>
  );
}

/** "1 / 5" with previous and next (K/J). Private to the referrer; never a ranking. */
export function GoalPosition({ index, total, onPrev, onNext }: Position) {
  return (
    <div className="flex items-center gap-1 max-gdesk:gap-0">
      <span aria-hidden="true" className="g-num mr-2 text-g-ink-2">{index} / {total}</span>
      <span className="sr-only">Ask {index} of {total}</span>
      <PositionButton label="Previous ask" icon={ChevronUp} keyHint="K" onClick={onPrev} />
      <PositionButton label="Next ask" icon={ChevronDown} keyHint="J" onClick={onNext} />
    </div>
  );
}

export type GoalDecisionBarProps = {
  position?: Position;
  secondary: { label: string; keyHint?: string; disabledReason?: string };
  primary: { label: string; keyHint?: string; onClick: () => void; busy?: boolean; busyLabel?: string; disabledReason?: string };
  /** The pass reasons: a popover above the button on desktop, a medium sheet on phones. */
  pass: { open: boolean; onOpenChange: (open: boolean) => void; title: string; content: ReactNode };
  /** Desktop keys: A opens the accept confirmation, P the pass reasons, J/K move. Keys never commit. */
  keyboard?: boolean;
  /** A failure in plain words, ink (never crimson in the referrer queue). */
  message?: ReactNode;
};

/** The pinned decision bar: position, Pass privately (ghost) and Accept & connect (the screen's one primary). */
export function GoalDecisionBar({ position, secondary, primary, pass, keyboard = true, message }: GoalDecisionBarProps) {
  const desktop = useGoalDesktop();
  const latest = useRef({ position, secondary, primary, pass });
  latest.current = { position, secondary, primary, pass };

  useEffect(() => {
    if (!keyboard || !desktop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typingInField(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const { position: pos, secondary: sec, primary: pri, pass: pas } = latest.current;
      const key = event.key.toLowerCase();
      if (key === "j" && pos?.onNext) {
        event.preventDefault();
        pos.onNext();
      } else if (key === "k" && pos?.onPrev) {
        event.preventDefault();
        pos.onPrev();
      } else if (key === "p" && !sec.disabledReason) {
        event.preventDefault();
        pas.onOpenChange(true);
      } else if (key === "a" && !pri.disabledReason && !pri.busy) {
        event.preventDefault();
        pri.onClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, desktop]);

  const passButton = (
    <GoalButton
      variant="ghost"
      touch="large"
      keys={secondary.keyHint ? [secondary.keyHint] : []}
      disabledReason={secondary.disabledReason}
      aria-haspopup="dialog"
      aria-expanded={pass.open}
      onClick={desktop ? undefined : () => pass.onOpenChange(true)}
      className="max-gdesk:w-full"
    >
      {secondary.label}
    </GoalButton>
  );

  return (
    <div data-testid="goal-decision-bar" className="sticky bottom-0 z-10 border-t border-g-hairline bg-g-surface">
      {message ? (
        <p role="alert" className="max-w-[calc(var(--g-detail-max)+80px)] px-10 pt-3 text-g-meta text-g-ink-2 max-gdesk:px-4">{message}</p>
      ) : null}
      <div className="flex h-(--g-decision-bar-h) max-w-[calc(var(--g-detail-max)+80px)] items-center justify-between gap-4 px-10 max-gdesk:px-4 max-gdesk:py-3">
        {position ? <div className="max-gdesk:hidden"><GoalPosition {...position} /></div> : null}
        <div className="ml-auto flex items-center gap-2 max-gdesk:ml-0 max-gdesk:grid max-gdesk:flex-1 max-gdesk:grid-cols-2">
          {desktop ? (
            <Popover.Root open={pass.open} onOpenChange={pass.onOpenChange}>
              <Popover.Trigger asChild>{passButton}</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="end"
                  sideOffset={8}
                  aria-label={pass.title}
                  className="g-scope z-50 w-[368px] rounded-g-popover bg-g-surface px-3 pb-3 pt-4 text-g-ink shadow-g-popover data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in"
                >
                  {pass.content}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <>
              {passButton}
              <GoalSheet open={pass.open} onOpenChange={pass.onOpenChange} title={pass.title}>
                {pass.content}
              </GoalSheet>
            </>
          )}
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-g-hairline max-gdesk:hidden" />
          <GoalButton
            variant="primary"
            touch="large"
            keys={primary.keyHint ? [primary.keyHint] : []}
            busy={primary.busy}
            busyLabel={primary.busyLabel}
            disabledReason={primary.disabledReason}
            onClick={primary.onClick}
            className="max-gdesk:w-full"
          >
            {primary.label}
          </GoalButton>
        </div>
      </div>
    </div>
  );
}
