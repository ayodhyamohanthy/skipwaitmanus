/**
 * HTML escaping for the string-built email bodies.
 *
 * Every outbound email here is assembled by concatenation, so any interpolated
 * value that contains `<`, `>`, `&`, `"` or `'` can break out of its element or
 * attribute. The dangerous case is the one-click review link: the token in its URL
 * is by itself sufficient to approve or decline a referral, so an injected `href`
 * would hand that capability to whoever the injection points at.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ESCAPES[character] ?? character);
}

/**
 * An href that is safe to interpolate into email HTML: escaped, and restricted to
 * http(s) so a `javascript:` or `data:` URL can never become a live link.
 * Falls back to `#` rather than emitting something unusable.
 */
export function safeEmailHref(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "#";
    return escapeHtml(url.toString());
  } catch {
    return "#";
  }
}
