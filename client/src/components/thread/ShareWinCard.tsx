import { toast } from "sonner";
import { SHARE_WIN_COPY as copy, winBadge, winCardLinkedIn, winCardText, winIntro, type WinCardInput } from "@shared/shareWinCard";
import { SHARE_WIN_CARD } from "@/lib/shareFlags";

/** Seeker-only, opt-in: copies text to the clipboard. Never posts, never names the referrer. Off with the flag. */
export function ShareWinCard({ roleTitle, companyName, status }: WinCardInput) {
  if (!SHARE_WIN_CARD) return null;
  const input = { roleTitle, companyName, status };
  const copyTo = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(copy.copied); }
    catch { /* Clipboard blocked: the card text stays visible to select by hand. */ }
  };
  return <section className="share-win" data-testid="share-win-card" aria-label={copy.heading}>
    <span className="eyebrow">{copy.heading}</span>
    <p>{winIntro(companyName)}</p>
    <article className="share-win-card">
      <span className="share-win-badge" data-status={winBadge(status)}>{winBadge(status)}</span>
      {roleTitle ? <strong>{roleTitle}</strong> : null}
      <span>{companyName}</span>
      <p>{copy.quote}</p>
      <small>{copy.footer}</small>
    </article>
    <div className="share-win-actions">
      <button type="button" className="brand-button" onClick={() => { void copyTo(winCardText(input)); }}>{copy.copyText}</button>
      <button type="button" className="brand-button outline" onClick={() => { void copyTo(winCardLinkedIn(input)); }}>{copy.copyLinkedIn}</button>
    </div>
    <small>{copy.note}</small>
  </section>;
}
