import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { useEffect, useId, useState } from "react";
import { GoalButton } from "./GoalButton";
import { GoalKeycap } from "./GoalKeycap";
import { gcn } from "./gcn";

export type GoalPassReasonsCopy = { title: string; description: string; note: string; cancel: string; confirm: string; busyLabel?: string };

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return target.type !== "radio";
  return target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** The seven shipped pass reasons (shared/passReasons.ts, D-052) in their shipped order, none preselected. Keys 1–7
 * pick a reason and never commit; Pass is an ink outline that stays unavailable until a reason is picked. */
export function GoalPassReasons({ copy, variant, busy = false, onCancel, onConfirm, titleId }: {
  copy: GoalPassReasonsCopy;
  variant: "popover" | "sheet";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (code: PassReasonCode) => void;
  titleId?: string;
}) {
  const generated = useId();
  const headingId = titleId ?? `${generated}-title`;
  const [picked, setPicked] = useState<PassReasonCode | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typingInField(event.target)) return;
      const index = Number.parseInt(event.key, 10);
      if (Number.isInteger(index) && index >= 1 && index <= PASS_REASON_OPTIONS.length) {
        event.preventDefault();
        setPicked(PASS_REASON_OPTIONS[index - 1].code);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sheet = variant === "sheet";
  return (
    <div data-testid="goal-pass-reasons">
      <h2 id={headingId} className={gcn("text-g-heading text-g-ink", !sheet && "px-2")}>{copy.title}</h2>
      <p className={gcn("mt-1 text-g-meta text-g-ink-2", !sheet && "px-2")}>{copy.description}</p>
      <div role="radiogroup" aria-labelledby={headingId} className={gcn(sheet ? "mt-3 border-t border-g-hairline" : "mt-2 grid")}>
        {PASS_REASON_OPTIONS.map((option, index) => {
          const checked = picked === option.code;
          return (
            <label
              key={option.code}
              className={gcn(
                "flex cursor-pointer items-center gap-3 text-g-body text-g-ink",
                sheet ? "min-h-12 border-b border-g-hairline" : "h-10 rounded-g-control px-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover",
              )}
            >
              <input
                type="radio"
                name={`${generated}-reason`}
                value={option.code}
                checked={checked}
                onChange={() => setPicked(option.code)}
                className={gcn(
                  "m-0 shrink-0 appearance-none rounded-full border-[1.5px] border-g-control-edge bg-g-surface",
                  sheet ? "size-5 checked:border-[6px] checked:border-g-ink" : "size-[18px] checked:border-[5px] checked:border-g-ink",
                )}
              />
              <span className="min-w-0 flex-1 whitespace-nowrap">{option.label}</span>
              {!sheet ? <span aria-hidden="true" className="max-gdesk:hidden"><GoalKeycap value={String(index + 1)} /></span> : null}
            </label>
          );
        })}
      </div>
      <p className={gcn("text-g-meta text-g-ink-3", sheet ? "mt-3" : "mt-2 px-2")}>{copy.note}</p>
      <div className={gcn(sheet ? "mt-4 grid grid-cols-2 gap-2" : "-mx-3 mt-3 flex justify-end gap-2 border-t border-g-hairline px-3 pt-3")}>
        <GoalButton variant="ghost" size="sm" touch="large" onClick={onCancel}>{copy.cancel}</GoalButton>
        <GoalButton
          variant="outline"
          size="sm"
          touch="large"
          inactive={picked === null}
          busy={busy}
          busyLabel={copy.busyLabel}
          onClick={() => picked && onConfirm(picked)}
        >
          {copy.confirm}
        </GoalButton>
      </div>
    </div>
  );
}
