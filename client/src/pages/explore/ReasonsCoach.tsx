import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { captureClientError } from "@/lib/sentry";
import {
  REASONS_COACH_ENABLED, REASONS_COACH_HELP, REASONS_COACH_LABEL, REASONS_COACH_LIMIT_MESSAGE,
  reasonsCoachInputSchema, reasonsCoachResponseSchema, type ReasonsCoachInput,
} from "@shared/reasonsCoach";
import type { WhyMeReasons } from "@shared/whyMe";

export type ReasonsCoachProps = {
  reasons: WhyMeReasons;
  signedIn: boolean;
  roleTitle?: string;
  companyName?: string;
};

export function ReasonsCoach({ reasons, signedIn, roleTitle, companyName }: ReasonsCoachProps) {
  if (!REASONS_COACH_ENABLED || !signedIn) return null;
  const input: ReasonsCoachInput = {
    reasons: [reasons[0], reasons[1], reasons[2]],
    ...(roleTitle ? { roleTitle } : {}),
    ...(companyName ? { companyName } : {}),
  };
  // Each edit mounts a new result owner. A late answer can never attach to
  // different reasons, even if the old request completes after the edit.
  return <ActiveReasonsCoach key={JSON.stringify(input)} input={input} />;
}

class CoachingLimitError extends Error {}

function ActiveReasonsCoach({ input }: { input: ReasonsCoachInput }) {
  const { getToken } = useAuth();
  const coaching = useMutation({
    retry: false,
    mutationFn: async () => {
      const parsed = reasonsCoachInputSchema.safeParse(input);
      if (!parsed.success) return { questions: [] };
      const token = await getToken();
      const response = await fetch("/api/ask/reasons-coach", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(35_000),
      });
      if (response.status === 429) throw new CoachingLimitError(REASONS_COACH_LIMIT_MESSAGE);
      if (!response.ok) throw new Error("Reasons coaching is unavailable");
      return reasonsCoachResponseSchema.parse(await response.json());
    },
    onError: error => {
      if (!(error instanceof CoachingLimitError)) captureClientError(new Error("Reasons coaching failed"), { source: "reasons-coach" });
    },
  });
  const questions = coaching.data?.questions ?? [];
  return (
    <div className="grid gap-2">
      <GoalButton variant="ghost" size="sm" className="w-fit" busy={coaching.isPending} busyLabel="Finding questions…" onClick={() => coaching.mutate()}>
        Sharpen this
      </GoalButton>
      <div aria-live="polite">
        {questions.length ? (
          <section aria-label={REASONS_COACH_LABEL} className="grid gap-2">
            <p className="text-g-label text-g-ink">{REASONS_COACH_LABEL}</p>
            <ul className="list-disc space-y-1 ps-5 text-pretty text-g-meta text-g-ink-2">
              {questions.map(question => <li key={question}>{question}</li>)}
            </ul>
            <GoalButton variant="ghost" size="sm" className="w-fit" onClick={() => coaching.reset()}>Dismiss coaching</GoalButton>
          </section>
        ) : coaching.isError || coaching.isSuccess ? (
          <p className="text-pretty text-g-meta text-g-ink-3">{coaching.error instanceof CoachingLimitError ? REASONS_COACH_LIMIT_MESSAGE : REASONS_COACH_HELP}</p>
        ) : null}
      </div>
    </div>
  );
}
