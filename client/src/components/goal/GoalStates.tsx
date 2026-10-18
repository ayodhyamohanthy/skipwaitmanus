import type { ReactNode } from "react";
import { Link } from "wouter";
import { GoalButton } from "./GoalButton";
import { gcn } from "./gcn";

type Action = { label: string; onClick: () => void } | { label: string; href: string };

function ActionButton({ action }: { action: Action }) {
  if ("href" in action) {
    return (
      <GoalButton asChild size="sm" variant="ghost" className="-ml-3">
        <Link href={action.href}>{action.label}</Link>
      </GoalButton>
    );
  }
  return (
    <GoalButton size="sm" variant="ghost" className="-ml-3" onClick={action.onClick}>
      {action.label}
    </GoalButton>
  );
}

/** Empty list or nothing selected: plain words, no illustration and no black element. */
export function GoalEmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: Action; className?: string }) {
  return (
    <div data-testid="goal-empty" className={gcn("grid justify-items-start gap-1 px-5 py-6 max-gdesk:px-4", className)}>
      <p className="text-g-label text-g-ink">{title}</p>
      {body ? <p className="text-g-meta text-g-ink-2">{body}</p> : null}
      {action ? <div className="mt-2"><ActionButton action={action} /></div> : null}
    </div>
  );
}

/** A load error: ink, not crimson (crimson means an ended state or an input error). */
export function GoalErrorState({ title, body, retry, className }: { title: string; body?: ReactNode; retry: { label: string; onClick: () => void }; className?: string }) {
  return (
    <div role="alert" data-testid="goal-error" className={gcn("grid justify-items-start gap-1 px-5 py-6 max-gdesk:px-4", className)}>
      <p className="text-g-label text-g-ink">{title}</p>
      {body ? <p className="text-g-meta text-g-ink-2">{body}</p> : null}
      <div className="mt-2"><ActionButton action={retry} /></div>
    </div>
  );
}

const ROW_HEIGHT = { company: "h-[52px] max-gdesk:h-16", queue: "h-16 max-gdesk:h-[72px]", ask: "h-[92px]", detail: "h-6" } as const;

/** Static skeleton rows (no shimmer: the Frequency Principle). */
export function GoalSkeletonRows({ density, count = 4, label = "Loading" }: { density: keyof typeof ROW_HEIGHT; count?: number; label?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-0.5 px-1">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} aria-hidden="true" className={gcn("block rounded-g-keycap bg-g-surface-hover", ROW_HEIGHT[density])} />
      ))}
    </div>
  );
}
