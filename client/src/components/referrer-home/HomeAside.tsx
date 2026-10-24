// Right column of /referrer-home (kit v4 referrer-home.tsx aside).
// The private thank-you wall (queue row 20 slice D) shows the notes seekers let this
// referrer keep, from /api/referrer/thank-yous — real ones only, with the kit's honest
// empty state before the first arrives. The colleague-invite card stays below it.
import { Heart, Pause, Play } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import type { ReferrerThankYouWall } from "@shared/landedJourney";
import type { ReferrerImpact } from "./referrerData";
import { ShareImpactCard } from "./ShareImpactCard";

type Props = { impact: ReferrerImpact | null; thankYous: ReferrerThankYouWall | null; paused: boolean; pending: boolean; onToggle: () => void };

export function HomeAside({ impact, thankYous, paused, pending, onToggle }: Props) {
  const reply = impact?.repliedWithin3DaysPct;
  const notes = thankYous?.thankYous ?? [];
  const record: Array<[string, string]> = [
    ["Introductions", String(impact?.introductions ?? 0)],
    ["People helped", String(impact?.approved ?? 0)],
    ["Replied within 3 days", typeof reply === "number" ? `${reply}%` : "—"],
    ["Thank-yous", thankYous ? String(thankYous.total) : "—"],
  ];
  return (
    <aside className="space-y-4">
      <Panel>
        <span className="eyebrow">YOUR THANK-YOU WALL · PRIVATE</span>
        {notes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Notes from people you help will live here. Only you can see them.</p> : (
          <ul className="mt-3 space-y-3">
            {notes.map(note => (
              <li key={note.id} className="rounded-2xl bg-muted p-4 text-sm">
                <Heart className="mb-2 size-4 text-primary" aria-hidden="true" />
                “{note.message}”
                <footer className="mt-2 text-xs text-muted-foreground">{[note.seekerName, note.roleTitle].filter(Boolean).join(" · ")}</footer>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <span className="eyebrow">INVITE A COLLEAGUE</span>
        <p className="mt-3 text-sm text-muted-foreground">More verified colleagues means faster answers for seekers.</p>
        <Link href="/invite?mode=invite" className="text-link mt-1 text-sm">Invite someone inside →</Link>
      </Panel>
      <Panel>
        <span className="eyebrow">YOUR RECORD · PRIVATE</span>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{record.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-muted-foreground">Never ranked. Never public.</p>
      </Panel>
      <ShareImpactCard />
      <Button variant="outline" className="w-full" disabled={pending} onClick={onToggle}>
        {paused ? <><Play />{pending ? "Resuming…" : "Resume new asks"}</> : <><Pause />{pending ? "Pausing…" : "Pause new asks"}</>}
      </Button>
    </aside>
  );
}
