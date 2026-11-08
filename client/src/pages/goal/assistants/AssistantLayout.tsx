import type { ReactNode } from "react";
import { GoalButton, GoalStatus, useOnlineStatus } from "@/components/goal";

export function AssistantLayout({ title, description, children, screen = "assistants" }: { title: string; description: string; children: ReactNode; screen?: string }) {
  const online = useOnlineStatus();
  return <main data-skipwait-screen={screen} className="g-scope mx-auto w-full max-w-5xl px-4 py-6 text-g-ink gdesk:px-10 gdesk:py-10">
    <nav aria-label="Assistant tools" className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-g-meta text-g-ink-2">
      <a className="g-hit underline underline-offset-4" href="/assistants">Connections</a>
      <a className="g-hit underline underline-offset-4" href="/agents">Agent keys</a>
      <a className="g-hit underline underline-offset-4" href="/approve">Approvals</a>
    </nav>
    <header className="mb-8 max-w-2xl"><h1 className="text-g-display">{title}</h1><p className="mt-3 text-g-body text-g-ink-2">{description}</p></header>
    {!online ? <p role="status" className="mb-5 text-g-meta text-g-ink-2">You are offline. Review what is here; reconnect before making changes.</p> : null}
    {children}
  </main>;
}
export function Section({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={`border-t border-g-hairline py-5 ${className}`}>{title ? <h2 className="mb-3 text-g-heading">{title}</h2> : null}{children}</section>;
}
export function NextStep({ children }: { children: ReactNode }) {
  return <section aria-label="Your next step" className="mb-6 border border-g-control-edge p-4 gdesk:p-5"><h2 className="mb-3 text-g-label">Your next step</h2>{children}</section>;
}
export function Message({ title, children }: { title: string; children?: ReactNode }) {
  return <Section title={title}><div className="text-g-body text-g-ink-2">{children}</div></Section>;
}
export function NetworkButton({ blocked, ...props }: React.ComponentProps<typeof GoalButton> & { blocked?: string }) {
  const online = useOnlineStatus();
  return <GoalButton {...props} disabledReason={!online ? "Reconnect to continue" : blocked ?? props.disabledReason} />;
}
export function AccessStatus({ children }: { children: string }) {
  return <GoalStatus status="queue_new" label={children} />;
}
