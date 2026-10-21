// Empty / error / skeleton states (§4.11). Not drawn in the comps: layout is
// the token-derived recommendation. Load errors are ink, never crimson.
// All copy arrives as props (the sample-data ban).
import { cn } from "@/lib/utils";
import { GoalButton } from "./GoalButton";

export function GoalEmptyState({ title, body, action, className }: { title: string; body?: string; action?: { label: string; onClick?(): void; href?: string }; className?: string }) {
  return (
    <div data-testid="goal-empty-state" className={cn("px-5 py-6 max-gdesk:px-4", className)}>
      <p className="text-g-label text-g-ink">{title}</p>
      {body ? <p className="mt-1 text-g-meta text-g-ink-2">{body}</p> : null}
      {action ? (
        <GoalButton className="mt-3" size="sm" variant="outline" onClick={action.onClick} {...(action.href ? { asChild: true } : {})}>
          {action.href ? <a href={action.href}>{action.label}</a> : action.label}
        </GoalButton>
      ) : null}
    </div>
  );
}

export function GoalErrorState({ title, body, retry, className }: { title: string; body?: string; retry: { label: string; onClick(): void }; className?: string }) {
  return (
    <div data-testid="goal-error-state" role="alert" className={cn("px-5 py-6 max-gdesk:px-4", className)}>
      <p className="text-g-label text-g-ink">{title}</p>
      {body ? <p className="mt-1 text-g-meta text-g-ink-2">{body}</p> : null}
      <GoalButton className="mt-3" size="sm" variant="ghost" onClick={retry.onClick}>{retry.label}</GoalButton>
    </div>
  );
}

const ROW_HEIGHT = { company: "h-[52px]", queue: "h-16", ask: "h-[88px]" } as const;

export function GoalSkeletonRows({ density, count, className }: { density: keyof typeof ROW_HEIGHT; count: number; className?: string }) {
  return (
    <div data-testid="goal-skeleton-rows" aria-busy="true" className={cn("grid gap-2 px-3", className)}>
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} aria-hidden="true" className={cn("rounded bg-g-surface-hover", ROW_HEIGHT[density])} />
      ))}
    </div>
  );
}
