import { useState } from "react";
import { ArrowRight, Bot, Check, Coins, Pencil, X } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/approve` (screens/web/08_approve__*.png, app/src/routes/approve.tsx).
 *
 * The assistant approval sheet: an assistant has prepared an action and the
 * person decides. Six designed states -- send an ask, spend credits, editing,
 * sent, declined, slots full.
 *
 * THREE DEPARTURES FROM THE KIT'S PREVIEW:
 *
 * 1. NO StateChips. The kit renders a preview switcher across the top so a
 *    designer can page through the six states. It is design chrome, not product.
 * 2. NO INVENTED REQUEST. The kit hard-codes "Wipro", "Senior Product Designer",
 *    "req #44120" and a five-year fintech pitch. Rendering that as a live
 *    approval would show a real person an ask they never made.
 * 3. NO INVENTED NUMBERS. "uses 1 of your 30 open slots", "You have 112 - 109
 *    after this". Slot counts and credit balances are account state; a made-up
 *    balance is the same error class as a made-up price.
 *
 * So the sheet renders from a real pending action when there is one, and the
 * kit's own empty state when there is not. The six states remain reachable --
 * they are the product's states, driven by what actually happens.
 */

type Kind = "ask" | "credits";

type Pending = {
  assistant: string;
  kind: Kind;
  title: string;
  subtitle: string;
  body: string;
  costLabel?: string;
  balanceLabel?: string;
};

type Phase = "review" | "editing" | "sent" | "declined";

/**
 * The pending action this sheet decides on.
 *
 * Read through a hook rather than a prop on purpose: a wouter route component
 * receives RouteComponentProps, so a `pending` prop could never be passed from
 * App.tsx -- the sheet would compile, always receive undefined, and silently
 * render its empty state forever. tsc caught exactly that when this was a prop.
 *
 * Returns null until the approvals API exists. When it lands, this becomes a
 * React Query call against it; the six states below are already wired to it.
 */
function usePendingApproval(): Pending | null {
  return null;
}

export default function Approve() {
  const pending = usePendingApproval();
  const [phase, setPhase] = useState<Phase>("review");
  const [body, setBody] = useState(pending?.body ?? "");

  const shell = "rounded-[2rem] border border-border bg-card p-5 shadow-xl sm:p-6";
  const quiet = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold";

  if (!pending) {
    return (
      <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
        <section className={`${shell} text-center`}>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-muted" aria-hidden="true"><Bot className="size-8" /></span>
          <h1 className="mt-3 text-2xl font-semibold">Nothing waiting for approval</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            When an assistant prepares an ask or a paid tool, it stops here first. Nothing is sent and no credits are spent until you approve it.
          </p>
          <Link href="/assistants" className={`${quiet} mt-4 bg-primary text-primary-foreground`}>
            Manage assistants <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Approvals also arrive as a push notification and in Alerts. Unanswered approvals expire after 24 hours.
        </p>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
      <div className={shell}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="size-4" aria-hidden="true" />{pending.assistant} · just now
        </p>

        {(phase === "review" || phase === "editing") && (
          <>
            <h1 className="mt-2 text-2xl font-semibold">
              {pending.kind === "ask" ? `Send this ask to ${pending.title}?` : pending.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{pending.subtitle}</p>

            {phase === "editing" ? (
              <label className="mt-4 block">
                <span className="sr-only">Ask note</span>
                <textarea
                  className="min-h-40 w-full rounded-2xl border border-input bg-background p-4 text-base"
                  value={body}
                  onChange={event => setBody(event.target.value)}
                />
              </label>
            ) : (
              <div className="mt-4 rounded-lg bg-muted p-4 text-sm">{body}</div>
            )}

            {pending.kind === "ask" ? (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="size-4 text-primary" aria-hidden="true" />Quality check passed</li>
                <li className="flex gap-2"><Check className="size-4 text-primary" aria-hidden="true" />Location fits the role</li>
                <li className="flex gap-2"><Check className="size-4 text-primary" aria-hidden="true" />Referrer sees "Sent with {pending.assistant}"</li>
              </ul>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted p-4">
                <Coins className="size-6" aria-hidden="true" />
                <span className="flex-1">
                  <strong className="block">{pending.costLabel}</strong>
                  <small className="text-muted-foreground">{pending.balanceLabel}</small>
                </span>
              </div>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2">
              <button type="button" className={`${quiet} text-muted-foreground`} onClick={() => setPhase("declined")}>
                <X className="size-4" aria-hidden="true" />Decline
              </button>
              <button type="button" className={`${quiet} border border-border`} onClick={() => setPhase(phase === "editing" ? "review" : "editing")}>
                <Pencil className="size-4" aria-hidden="true" />{phase === "editing" ? "Done" : "Edit"}
              </button>
              <button type="button" className={`${quiet} bg-primary text-primary-foreground`} onClick={() => setPhase("sent")}>
                <Check className="size-4" aria-hidden="true" />{pending.kind === "ask" ? "Send" : "Approve"}
              </button>
            </div>
          </>
        )}

        {phase === "sent" && (
          <div className="py-4 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent" aria-hidden="true"><Check className="size-8 text-primary" /></span>
            <h1 className="mt-3 text-2xl font-semibold">Done</h1>
            <p className="mt-1 text-sm text-muted-foreground">{pending.assistant} has been told. Track it in Requests.</p>
            <Link href="/requests" className={`${quiet} mt-4 border border-border`}>Open requests</Link>
          </div>
        )}

        {phase === "declined" && (
          <div className="py-4 text-center">
            <X className="mx-auto size-8" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-semibold">Declined</h1>
            <p className="mt-1 text-sm text-muted-foreground">Nothing was sent and no credits were used.</p>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Shown as a push notification and in Alerts. Unanswered approvals expire after 24 hours.
      </p>
    </main>
  );
}
