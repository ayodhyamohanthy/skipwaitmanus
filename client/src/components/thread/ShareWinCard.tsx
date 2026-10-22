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
    <article className="sharecard share-win-card">
      <p className="sharecard__status" data-status={winBadge(status)}><span className="share-win-dot" aria-hidden="true" />{winBadge(status)}</p>
      <strong className="share-win-company">{companyName}</strong>
      {roleTitle ? <span className="share-win-role">{roleTitle}</span> : null}
      <p>{copy.quote}</p>
      <small>{copy.footer}</small>
    </article>
    <div className="share-win-actions">
      <button type="button" className="share-win-primary" onClick={() => { void copyTo(winCardText(input)); }}>{copy.copyText}</button>
      <button type="button" className="share-win-ghost" onClick={() => { void copyTo(winCardLinkedIn(input)); }}>{copy.copyLinkedIn}</button>
    </div>
    <small>{copy.note}</small>
  </section>;
}
