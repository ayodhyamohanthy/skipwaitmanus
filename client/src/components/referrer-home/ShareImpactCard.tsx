// Referrer impact card (shareable moment, slice C). Flag off (VITE_SHARE_IMPACT_CARD).
// Renders only aggregate stats + the referrer's own screen name from
// GET /api/referrer/impact-card. Copy verbatim from content.json shareImpact;
// every string the referrer can copy comes from shared/shareImpactCard.ts, so no
// seeker can ever appear on the card. Min-3 gate enforced server-side: on
// "insufficient" the card renders nothing.
import { useEffect, useState } from "react";
import { Check, Copy, Linkedin } from "lucide-react";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { SHARE_IMPACT_CARD } from "@/lib/shareFlags";
import { IMPACT_CARD_COPY, impactCardLinkedIn, impactCardText, impactVerifiedLine, impactReferredLine, impactStatLines, type ImpactCardInput } from "@shared/shareImpactCard";

type Payload = { state: "ready" | "insufficient"; screenName?: string; companyName?: string; companySlug?: string; linkPath?: string; stats?: ImpactCardInput["stats"] };

export function ShareImpactCard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [copied, setCopied] = useState<null | "text" | "linkedin">(null);

  useEffect(() => {
    if (!SHARE_IMPACT_CARD) return;
    let alive = true;
    fetch("/api/referrer/impact-card", { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (alive) setPayload(data); })
      .catch(() => { if (alive) setPayload({ state: "insufficient" }); });
    return () => { alive = false; };
  }, []);

  if (!SHARE_IMPACT_CARD || !payload || payload.state !== "ready" || !payload.screenName || !payload.companyName || !payload.linkPath || !payload.stats) return null;
  const input: ImpactCardInput = { screenName: payload.screenName, companyName: payload.companyName, companySlug: payload.companySlug ?? "", linkPath: payload.linkPath, stats: payload.stats };

  const copy = async (kind: "text" | "linkedin") => {
    const text = kind === "text" ? impactCardText(input) : impactCardLinkedIn(input);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Panel>
      <span className="eyebrow">{IMPACT_CARD_COPY.heading.toUpperCase()}</span>
      <p className="mt-2 text-sm text-muted-foreground">{IMPACT_CARD_COPY.intro}</p>
      <div className="share-impact-card" data-testid="share-impact-card">
        <p className="share-impact-verified">{impactVerifiedLine(input)}</p>
        <p className="share-impact-lead">{impactReferredLine({ companyName: input.companyName, count: input.stats.referredThisMonth })}</p>
        <div className="share-impact-stats">
          {impactStatLines(input.stats).map(line => <span key={line}>{line}</span>)}
        </div>
        <p className="share-impact-link">skipwait.me{input.linkPath}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy("text")}>
          {copied === "text" ? <Check /> : <Copy />}{copied === "text" ? IMPACT_CARD_COPY.copied : IMPACT_CARD_COPY.copyText}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copy("linkedin")}>
          {copied === "linkedin" ? <Check /> : <Linkedin />}{copied === "linkedin" ? IMPACT_CARD_COPY.copied : IMPACT_CARD_COPY.copyLinkedIn}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{IMPACT_CARD_COPY.note}</p>
    </Panel>
  );
}
