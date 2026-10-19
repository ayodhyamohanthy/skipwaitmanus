// Kit v4 referrer workspace frame (app/src/routes/referrer.tsx): page heading,
// "Set up as a referrer" action and the four workspace tabs. The kit switches
// tabs with local state; production maps each tab to its real route so every
// view is deep-linkable and backed by live data. "Set up as a referrer" opens
// the kit setup dialog in place; signed-out visitors sign in first.
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/kit/button";
import { ReferrerSetupDialog } from "./ReferrerSetupDialog";

export type ReferrerView = "overview" | "queue" | "setup" | "impact";

export const REFERRER_VIEWS: ReadonlyArray<{ readonly id: ReferrerView; readonly label: string; readonly href: string }> = [
  { id: "overview", label: "Overview", href: "/referrer" },
  { id: "queue", label: "Request queue", href: "/queue" },
  { id: "setup", label: "Setup & capacity", href: "/referrer?view=setup" },
  { id: "impact", label: "Impact", href: "/referrer/impact" },
];

/** The work-email sign-in door for tabs that cannot open the sign-in dialog themselves. */
export const REFERRER_SIGN_IN_HREF = "/referrer?setup=work-email";

/** `verifyOnOpen`: a signed-in ?setup=work-email deep link opens setup at its verify step. */
export function ReferrerWorkspace({ view, screen, isSignedIn, onSignIn, verifyOnOpen = false, children }: { view: ReferrerView; screen: string; isSignedIn: boolean; onSignIn: () => void; verifyOnOpen?: boolean; children: ReactNode }) {
  const [, go] = useLocation();
  const [setupStep, setSetupStep] = useState<number | null>(null);
  useEffect(() => { if (verifyOnOpen && isSignedIn) setSetupStep(1); }, [verifyOnOpen, isSignedIn]);
  return (
    <main data-skipwait-screen={screen} className="page-content referrer-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">REFERRER WORKSPACE</span>
          <h1>Open doors.<br />On your terms<span className="brand-dot">.</span></h1>
          <p>Choose the requests you believe in. Keep your identity private until you accept.</p>
        </div>
        <Button type="button" onClick={() => { if (isSignedIn) setSetupStep(0); else onSignIn(); }}>Set up as a referrer <ArrowRight /></Button>
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
      {setupStep !== null && isSignedIn ? <ReferrerSetupDialog initialStep={setupStep} onClose={() => setSetupStep(null)} /> : null}
    </main>
  );
}
