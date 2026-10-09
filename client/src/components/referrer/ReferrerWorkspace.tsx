// Kit v4 referrer workspace frame (app/src/routes/referrer.tsx): page heading,
// "Set up as a referrer" action and the four workspace tabs. The kit switches
// tabs with local state; production maps each tab to its real route so every
// view is deep-linkable and backed by live data.
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/kit/button";

export type ReferrerView = "overview" | "queue" | "setup" | "impact";

export const REFERRER_VIEWS: ReadonlyArray<{ readonly id: ReferrerView; readonly label: string; readonly href: string }> = [
  { id: "overview", label: "Overview", href: "/referrer" },
  { id: "queue", label: "Request queue", href: "/queue" },
  { id: "setup", label: "Setup & capacity", href: "/referrer?view=setup" },
  { id: "impact", label: "Impact", href: "/referrer/impact" },
];

/** Where "Set up as a referrer" leads when the page cannot open the sign-in dialog itself. */
export function referrerSetUpHref(isSignedIn: boolean) {
  return isSignedIn ? "/referrer-setup" : "/referrer?setup=work-email";
}

export function ReferrerWorkspace({ view, screen, onSetUp, children }: { view: ReferrerView; screen: string; onSetUp: () => void; children: ReactNode }) {
  const [, go] = useLocation();
  return (
    <main data-skipwait-screen={screen} className="page-content referrer-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REFERRER WORKSPACE</span>
          <h1>Open doors.<br />On your terms<span className="brand-dot">.</span></h1>
          <p>Choose the requests you believe in. Keep your identity private until you accept.</p>
        </div>
        <Button type="button" onClick={onSetUp}>Set up as a referrer <ArrowRight /></Button>
      </div>
      <div className="directory-tabs section-tabs" role="tablist" aria-label="Referrer workspace views">
        {REFERRER_VIEWS.map(item => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={view === item.id}
            className={view === item.id ? "selected" : ""}
            onClick={() => { if (view !== item.id) go(item.href); }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {children}
    </main>
  );
}
