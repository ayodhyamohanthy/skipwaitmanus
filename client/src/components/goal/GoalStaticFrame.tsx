// GoalStaticFrame (D-048-F-static-frame): the goal frame for the twelve
// prerendered public pages. It fetches NOTHING: no useAuth, no useQuery, no
// router state - a header, a footer and children, so a goal page can never
// fetch on /terms or /privacy. Import it by its own path
// ("@/components/goal/GoalStaticFrame"), not via components/goal/index.ts.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const FRAME_NAV = [
  { href: "/explore", label: "Explore companies" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-companies", label: "For companies" },
] as const;

const FRAME_FOOTER = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/cancellations", label: "Cancellations" },
  { href: "/shipping", label: "Shipping" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/support", label: "Support" },
  { href: "/guidelines", label: "Guidelines" },
] as const;

export type GoalStaticFrameProps = {
  /** One honest status line for the page (dot + text), e.g. "Free to read". */
  status?: string;
  children: ReactNode;
};

export function GoalStaticFrame({ status, children }: GoalStaticFrameProps) {
  return (
    <div className="min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <a href="/" aria-label="skipwait.me home" className="inline-flex items-center">
            <img src="/brand/lockup.svg" alt="skipwait.me" className="h-5 w-auto" />
          </a>
          <nav aria-label="Site" className="flex items-center gap-4 text-g-meta text-g-ink-2">
            {FRAME_NAV.map(item => (
              <a key={item.href} href={item.href} className={cn("transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink", item.label === "For companies" ? "max-gdesk:hidden" : null)}>
                {item.label}
              </a>
            ))}
            <a href="/sign-in" className="font-medium text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">
              Sign in
            </a>
          </nav>
        </div>
      </header>
      {status ? (
        <p className="mx-auto flex max-w-3xl items-center gap-2 px-5 pt-6 text-g-meta text-g-ink-2">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-g-ink-3" />
          {status}
        </p>
      ) : null}
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
      <footer className="border-t border-g-hairline">
        <div className="mx-auto max-w-3xl px-5 py-8">
          <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-2 text-g-meta text-g-ink-2">
            {FRAME_FOOTER.map(item => (
              <a key={item.href} href={item.href} className="transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">
                {item.label}
              </a>
            ))}
          </nav>
          <p className="mt-6 text-g-meta text-g-ink-3">skipwait.me</p>
        </div>
      </footer>
    </div>
  );
}

export default GoalStaticFrame;
