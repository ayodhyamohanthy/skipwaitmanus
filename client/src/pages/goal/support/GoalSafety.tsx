// Goal /safety (D-048-p3-support, packet docs/plans/D-048-account.md).
// Goal line proposed by this row from the doctrine (the contract table had
// none for /safety): "Stay safe on SkipWait." Every kit answer is kept, the
// first open on arrival; the pay answer links to the live Report flow; the
// one next step is the kit's own: explore, sharing only when ready. Rows are
// disclosure buttons (review 6563729015), not bare <summary> flex rows.
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { GoalButton, GoalNextStep } from "@/components/goal";
import { cn } from "@/lib/utils";
import { SAFETY_ANSWERS, SAFETY_PAY_QUESTION } from "./supportContent";

export const GOAL_PAGE = { goalLine: "Stay safe on SkipWait." } as const;

const ANSWER = "pb-4 text-g-body text-g-ink-2";
// Review 6563729015: each row is a native button (Enter and Space toggle it)
// with aria-expanded and a visible chevron, like the help answers.
const ROW = "g-hit flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-g-label text-g-ink";

const rows: ReadonlyArray<{ question: string; answer: ReactNode }> = [
  ...SAFETY_ANSWERS.map(([question, answer]) => ({ question, answer })),
  { question: SAFETY_PAY_QUESTION, answer: <>Do not pay for a referral or share sensitive financial information. Use <Link href="/report" className="text-g-ink underline underline-offset-4">Report</Link> on the conversation — it&rsquo;s confidential.</> },
];

export default function GoalSafety() {
  // Several answers may be open at once, as with the kit's details rows; the first opens on arrival.
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const toggle = (index: number) => setOpen(current => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  return (
    <main data-skipwait-screen="safety" data-goal-page="safety" className="g-scope mx-auto flex w-full max-w-2xl flex-col bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-5 gdesk:py-7">
      <p className="text-g-meta text-g-ink-3">Help &amp; safety</p>
      <h1 className="mt-2 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-body text-g-ink-2">Clear boundaries. Real people. No fine-print surprises.</p>

      <div className="mt-5">
        <GoalNextStep reason="Explore freely. Share only when you’re ready.">
          <div className="mt-3">
            <GoalButton variant="primary" asChild><Link href="/explore">Explore companies</Link></GoalButton>
          </div>
        </GoalNextStep>
      </div>

      <section aria-label="Safety questions" className="mt-6 border-t border-g-hairline">
        {rows.map(({ question, answer }, index) => {
          const expanded = open.has(index);
          return (
            <div key={question} className="border-b border-g-hairline">
              <button
                type="button"
                id={`safety-q-${index}`}
                aria-expanded={expanded}
                aria-controls={`safety-a-${index}`}
                onClick={() => toggle(index)}
                className={ROW}
              >
                {question}
                <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 text-g-ink-3 transition-transform duration-(--g-dur-hover)", expanded && "rotate-180")} strokeWidth={1.75} />
              </button>
              <div id={`safety-a-${index}`} hidden={!expanded}>
                <p className={ANSWER}>{answer}</p>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
