/**
 * src/components/seeker/SeekerSearchPage.tsx
 * SkipWait Kinetic · Seeker Search Page
 */
import { useState, type ReactNode } from "react";
import { Chip, PrimaryButton, ResponsiveDrawer, SecondaryButton, StatusPill, VerifiedBadge } from "@/components/ui/primitives";

export interface InsiderSummary {
  id: string;
  companyName: string;
  companyDomain: string;
  companyLogoUrl?: string | null;
  roleTitle: string;
  discipline: "engineering" | "product-design" | "other";
  medianResponseHours: number | null;
  responseRate: number | null;
  existingRequest?: { status: any; hoursRemaining?: number | null } | null;
}

export function SeekerSearchPage({ insiders, resumes, onSubmitRequest }: { insiders: readonly InsiderSummary[]; resumes: readonly any[]; onSubmitRequest: (payload: any) => Promise<any> }) {
  const [query, setQuery] = useState("");
  const [selectedInsider, setSelectedInsider] = useState<InsiderSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = insiders.filter((i) => i.companyName.toLowerCase().includes(query.toLowerCase()) || i.roleTitle.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-6">
      <h1 className="type-display-goal">Where do you want a warm intro?</h1>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company, team, or role" className="min-h-14 w-full rounded-card border border-hairline bg-surface px-5 text-ink shadow-segment focus:border-ink focus:outline-hidden" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip label="All Companies" selected />
        <Chip label="⚡ Fast Responder (<12h)" />
        <Chip label="Engineering" />
        <Chip label="Product & Design" />
      </div>
      <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface">
        {filtered.map((insider) => (
          <li key={insider.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5 hover:bg-canvas">
            <div>
              <h3 className="text-body-primary font-semibold text-ink">{insider.roleTitle}</h3>
              <p className="text-label-ui text-ink-muted">{insider.companyName}</p>
              <div className="mt-2 flex items-center gap-3">
                <VerifiedBadge domain={insider.companyDomain} />
                <span className="type-mono-data text-ink-muted">{insider.responseRate ? `${Math.round(insider.responseRate * 100)}% reply rate` : "New insider"}</span>
              </div>
            </div>
            <SecondaryButton onClick={() => { setSelectedInsider(insider); setDrawerOpen(true); }}>
              Request Intro →
            </SecondaryButton>
          </li>
        ))}
      </ul>
      <ResponsiveDrawer open={drawerOpen && selectedInsider !== null} onOpenChange={setDrawerOpen} title="Request a warm intro" description={selectedInsider ? `${selectedInsider.roleTitle} · ${selectedInsider.companyName}` : undefined} primaryAction={{ label: "Send Intro Request", onClick: () => setDrawerOpen(false) }}>
        <p className="text-body-primary text-ink-body">MatchDrawer 3-Field Rule form content goes here.</p>
      </ResponsiveDrawer>
    </div>
  );
}

export default SeekerSearchPage;