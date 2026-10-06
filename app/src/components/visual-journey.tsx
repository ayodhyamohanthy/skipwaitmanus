import { useState } from "react";
import { Search, Send, MessagesSquare, UserRound, MailCheck, HeartHandshake, ArrowRight, Check, DoorOpen, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = { title: string; text: string; icon: LucideIcon; detail: string };
export const referrerSteps: Step[] = [
  { title: "Introduce yourself", text: "Start with your personal account.", icon: UserRound, detail: "Use your personal account. Your public profile does not show your name." },
  { title: "Verify your email", text: "Confirm your work-email ownership.", icon: MailCheck, detail: "Confirm access to your work email. This verifies email ownership, not employment or company endorsement." },
  { title: "Choose who to help", text: "Review. Accept. Make the introduction.", icon: HeartHandshake, detail: "Set your capacity. Review each request and accept only when you feel there’s a fit. Submit the referral through your employer." },
];
const seekerSteps: Step[] = [
  { title: "Find a company", text: "Start with where you want to work.", icon: Search, detail: "Look for a company with someone available to refer. You can explore before signing in." },
  { title: "Ask for a referral", text: "Share the role and why you fit.", icon: Send, detail: "Make a thoughtful request. The referrer chooses whether to accept. No payments, no paid priority." },
  { title: "Connect privately", text: "Talk, then follow your next steps.", icon: MessagesSquare, detail: "Once accepted, your private conversation opens. Track the introduction in My requests. A referral does not guarantee an interview." },
];

export function VisualJourney({ referrer = false, compact = false }: { referrer?: boolean; compact?: boolean }) {
  const steps = referrer ? referrerSteps : seekerSteps;
  const [selected, setSelected] = useState(0);
  return <section className={`visual-journey ${compact ? "compact" : ""}`} aria-label={referrer ? "How referring works" : "How referrals work"}>
    <div className="visual-journey-grid">{steps.map((step, index) => <Button variant="ghost" key={step.title} className={`journey-choice ${selected === index ? "is-selected" : ""}`} onClick={() => setSelected(index)} aria-pressed={selected === index}>
      <span className="journey-number">0{index + 1}</span>
      <span className="journey-scene" aria-hidden="true"><span className="scene-main"><step.icon /></span><span className="scene-badge">{index === 2 ? <Check /> : <ArrowRight />}</span><span className="scene-line" /><span className="scene-line short" /></span>
      <span className="journey-title">{step.title}</span><span className="journey-text">{step.text}</span>
      {index < 2 && <ArrowRight className="journey-connector" aria-hidden="true" />}
    </Button>)}</div>
    <div className="journey-detail" aria-live="polite"><DoorOpen size={20} /><p>{steps[selected]?.detail}</p></div>
  </section>;
}