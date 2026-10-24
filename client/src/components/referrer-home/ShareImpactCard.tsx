// Referrer impact card (shareable moment, slice C). Flag off (VITE_SHARE_IMPACT_CARD).
// Renders only aggregate stats + the referrer's own screen name from
// GET /api/referrer/impact-card. Copy verbatim from content.json shareImpact;
// every string the referrer can copy comes from shared/shareImpactCard.ts, so no
// seeker can ever appear on the card. Min-3 gate enforced server-side: on
// "insufficient" the card renders nothing. Structure follows the approved
// captures under design/goal-ui/captures/share-impact/ (impact-1280.png,
// impact-390.png): blue verified mark, hero numeral, mono stat numerals,
// one black commit button + ghost LinkedIn.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Check, Copy, Linkedin } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { usePersistFn } from "@/hooks/usePersistFn";
import { SHARE_IMPACT_CARD } from "@/lib/shareFlags";
import { trackClarityEvent } from "@/lib/clarity";
import { IMPACT_CARD_COPY, impactCardLinkedIn, impactCardText, impactVerifiedLine, impactReferredBig, impactReferredLine, impactStatPairs, type ImpactCardInput } from "@shared/shareImpactCard";
import { fetchImpactCard } from "./referrerData";

export function ShareImpactCard() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [copied, setCopied] = useState<null | "text" | "linkedin">(null);
  const card = useQuery({
    queryKey: ["referrer-impact-card", userId ?? null] as const,
    queryFn: () => fetchImpactCard(fetchToken),
    enabled: SHARE_IMPACT_CARD && Boolean(isSignedIn),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const payload = card.data ?? null;
  if (!SHARE_IMPACT_CARD || !payload || payload.state !== "ready") return null;
  const input: ImpactCardInput = { screenName: payload.screenName, companyName: payload.companyName, companySlug: payload.companySlug, linkPath: payload.linkPath, stats: payload.stats };

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
    trackClarityEvent(kind === "text" ? "impact_card_copy_text" : "impact_card_copy_linkedin");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Panel>
      <span className="eyebrow">{IMPACT_CARD_COPY.heading.toUpperCase()}</span>
      <p className="mt-2 text-sm text-muted-foreground">{IMPACT_CARD_COPY.intro}</p>
      <div className="sharecard" data-testid="share-impact-card">
        <p className="sharecard__status"><BadgeCheck className="size-4 text-primary" />{impactVerifiedLine(input)}</p>
        <p className="sharecard__big">{impactReferredBig(input.stats.referredThisMonth)}</p>
        <p className="sharecard__line">{impactReferredLine(input.companyName)}</p>
        <div className="sharecard__stats">
          {impactStatPairs(input.stats).map(pair => (
            <div className="sharecard__stat" key={pair.label}><b>{pair.value}</b><span>{pair.label}</span></div>
          ))}
        </div>
        <p className="sharecard__brand">skipwait.me{input.linkPath}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90" onClick={() => void copy("text")}>
          {copied === "text" ? <Check /> : <Copy />}{copied === "text" ? IMPACT_CARD_COPY.copied : IMPACT_CARD_COPY.copyText}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void copy("linkedin")}>
          {copied === "linkedin" ? <Check /> : <Linkedin />}{copied === "linkedin" ? IMPACT_CARD_COPY.copied : IMPACT_CARD_COPY.copyLinkedIn}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{IMPACT_CARD_COPY.note}</p>
    </Panel>
  );
}
