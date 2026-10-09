// Right column of /referrer-home (kit v4 referrer-home.tsx aside).
// The kit's private thank-you wall has no backend (thank-yous are copied, not
// stored), so its slot carries the live colleague-invite card instead, and
// the record shows only metrics the server computes.
import { Pause, Play } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import type { ReferrerImpact } from "./referrerData";

type Props = { impact: ReferrerImpact | null; paused: boolean; pending: boolean; onToggle: () => void };

export function HomeAside({ impact, paused, pending, onToggle }: Props) {
  const reply = impact?.repliedWithin3DaysPct;
  const record: Array<[string, string]> = [
    ["Introductions", String(impact?.introductions ?? 0)],
    ["People helped", String(impact?.approved ?? 0)],
    ["Replied within 3 days", typeof reply === "number" ? `${reply}%` : "—"],
  ];
  return (
    <aside className="space-y-4">
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
      <Button variant="outline" className="w-full" disabled={pending} onClick={onToggle}>
        {paused ? <><Play />{pending ? "Resuming…" : "Resume new asks"}</> : <><Pause />{pending ? "Pausing…" : "Pause new asks"}</>}
      </Button>
    </aside>
  );
}
