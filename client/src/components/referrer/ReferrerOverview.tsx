// Kit v4 referrer workspace "Overview" tab, ported from app/src/routes/referrer.tsx.
// Static product principles only: every statement here is true of the live
// product (private identity until accept, real capacity + pause, no ratings).
import { ArrowRight, EyeOff, HeartHandshake, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/kit/button";

export function ReferrerOverview({ onPreviewAsks }: { onPreviewAsks: () => void }) {
  return (
    <section className="referrer-dashboard">
      <div className="referrer-callout">
        <span className="callout-icon"><HeartHandshake /></span>
        <span className="eyebrow">A SMALL ACTION. A BIG NEXT STEP.</span>
        <h2>Help when the fit feels right.</h2>
        <p>You decide your pace, your criteria, and every introduction. Passing is private and always okay.</p>
        <Button type="button" onClick={onPreviewAsks}>Preview incoming asks <ArrowRight /></Button>
      </div>
      <div className="referrer-control-list">
        <div><ShieldCheck /><span><strong>Your identity stays private</strong><small>Revealed only after you accept.</small></span></div>
        <div><Settings2 /><span><strong>Set a real capacity</strong><small>Pause or change it at any time.</small></span></div>
        <div><EyeOff /><span><strong>No public ratings</strong><small>Kindness is not a performance metric.</small></span></div>
      </div>
    </section>
  );
}
