// Goal /help (D-048-p3-support, packet docs/plans/D-048-account.md): "Get help."
// The kit page's behaviour is kept: search over questions and answers, the
// category filter, one answer open at a time (the first open on arrival), the
// honest no-match line, the support route and the live policy links. Nothing
// here loads data, so there is no load state to fake.
import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { GoalButton, GoalFilterChip, GoalNextStep, GoalSearchInput } from "@/components/goal";
import { cn } from "@/lib/utils";
import { HELP_ANSWERS, HELP_CATEGORIES, HELP_POLICY_LINKS, type HelpCategory } from "./supportContent";

export const GOAL_PAGE = { goalLine: "Get help." } as const;

export default function GoalHelp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "All">("All");
  const [open, setOpen] = useState<string | null>(HELP_ANSWERS[0]?.question ?? null);
  const needle = query.toLowerCase();
  const list = HELP_ANSWERS.filter(item => (category === "All" || item.category === category) && (item.question + item.answer).toLowerCase().includes(needle));

  return (
    <main data-skipwait-screen="help" data-goal-page="help" className="g-scope mx-auto flex w-full max-w-2xl flex-col bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-5 gdesk:py-7">
      <p className="text-g-meta text-g-ink-3">Help centre</p>
      <h1 className="mt-2 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-body text-g-ink-2">Find the answer, or reach a person.</p>

      <div className="mt-5">
        <GoalNextStep reason="Still stuck after the answers below? A person replies within 1 working day.">
          <div className="mt-3">
            <GoalButton variant="primary" asChild><Link href="/support">Contact support</Link></GoalButton>
          </div>
        </GoalNextStep>
      </div>

      <div className="mt-6">
        <GoalSearchInput label="Search help" value={query} onChange={setQuery} placeholder="Search: credits, verify, expire…" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Help categories">
        <GoalFilterChip label="All" pressed={category === "All"} onPressedChange={() => setCategory("All")} />
        {HELP_CATEGORIES.map(name => (
          <GoalFilterChip key={name} label={name} pressed={category === name} onPressedChange={() => setCategory(name)} />
        ))}
      </div>

      <ul aria-label="Answers" className="mt-5 border-t border-g-hairline">
        {list.length === 0 ? (
          <li className="border-b border-g-hairline py-6">
            <p className="text-g-label text-g-ink">No answers for “{query}”.</p>
            <p className="mt-1 text-g-meta text-g-ink-2">Try another word, or contact support above.</p>
          </li>
        ) : list.map(({ question, answer }) => {
          const expanded = open === question;
          return (
            <li key={question} className="border-b border-g-hairline">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : question)}
                className="g-hit flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left text-g-label text-g-ink"
              >
                {question}
                <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 text-g-ink-3 transition-transform duration-(--g-dur-hover)", expanded && "rotate-180")} strokeWidth={1.75} />
              </button>
              {expanded ? <p className="pb-4 text-g-body text-g-ink-2">{answer}</p> : null}
            </li>
          );
        })}
      </ul>

      <nav aria-label="Rules & policies" className="mt-6">
        <h2 className="text-g-label text-g-ink">Rules &amp; policies</h2>
        <ul className="mt-2 grid gap-1">
          {HELP_POLICY_LINKS.map(([label, href]) => (
            <li key={href}><Link href={href} className="g-hit text-g-body text-g-ink underline underline-offset-4">{label}</Link></li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
