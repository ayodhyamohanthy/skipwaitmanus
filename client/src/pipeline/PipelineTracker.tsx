/**
 * src/components/pipeline/PipelineTracker.tsx
 * skipwait.me Kinetic · Linear Pipeline Tracker component.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useId } from "react";
import { SecondaryButton, VerifiedBadge, cx } from "@/components/ui/primitives";

export type PipelineStep = "sent" | "viewed" | "submitted" | "screen";

export interface PipelineItem {
  id: string;
  roleTitle: string;
  companyName: string;
  companyDomain: string;
  currentStep: PipelineStep;
  updatedAt: string;
}

export interface PipelineTrackerProps {
  items: readonly PipelineItem[];
  onViewDetails?: (id: string) => void;
}

const STEPS: readonly { id: PipelineStep; label: string }[] = [
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed by Insider" },
  { id: "submitted", label: "Submitted to ATS" },
  { id: "screen", label: "Recruiter Screen" },
];

export function PipelineTracker({ items, onViewDetails }: PipelineTrackerProps) {
  const headingId = useId();

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center">
        <p className="type-heading-section">No active referrals in pipeline</p>
        <p className="mt-1 text-body-primary text-ink-muted">Find an insider to request your first warm intro.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <h2 id={headingId} className="type-display-goal">Your Referral Pipeline</h2>
      <ul className="space-y-4">
        {items.map((item) => {
          const currentStepIndex = STEPS.findIndex((s) => s.id === item.currentStep);
          return (
            <li key={item.id} className="rounded-card border border-hairline bg-surface p-5 shadow-segment">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                <div>
                  <h3 className="text-body-primary font-semibold text-ink">{item.roleTitle}</h3>
                  <p className="text-label-ui text-ink-muted">{item.companyName}</p>
                </div>
                <VerifiedBadge domain={item.companyDomain} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STEPS.map((step, idx) => {
                  const passed = idx <= currentStepIndex;
                  return (
                    <div key={step.id} className={cx("flex flex-col rounded-control border p-3", passed ? "border-ink bg-surface-sunken" : "border-hairline bg-surface opacity-50")}>
                      <span className="type-mono-data text-ink-subtle">0{idx + 1}</span>
                      <span className="mt-1 text-label-ui font-medium text-ink">{step.label}</span>
                    </div>
                  );
                })}
              </div>
              {onViewDetails ? (
                <div className="mt-4 flex justify-end">
                  <SecondaryButton onClick={() => onViewDetails(item.id)}>View Progress Details</SecondaryButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PipelineTracker;