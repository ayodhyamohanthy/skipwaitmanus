// Job snippets as plain text (D-174 release, Nov 25). Providers send descriptions as HTML, and Greenhouse's
// ?content=true sends it entity-encoded ("&lt;p&gt;..."). Decode entities first, then remove tags (and the
// contents of script/style), then collapse whitespace, so no markup ever reaches the jobs list. The result is
// rendered as React text, never as HTML.
const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}|#39);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (key.startsWith("#x")) { const code = parseInt(key.slice(2), 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole; }
    if (key.startsWith("#")) { const code = parseInt(key.slice(1), 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole; }
    return NAMED[key] ?? whole;
  });
}

export function plainTextSnippet(html: string | null | undefined, max = 400): string {
  if (!html) return "";
  const decoded = decodeEntities(html);
  const text = decoded
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    // Block-level tags separate words; inline tags (b, strong, a, span) join them ("<b>pay</b>." stays "pay.").
    .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|blockquote|hr)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}
