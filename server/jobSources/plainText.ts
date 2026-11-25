// Job snippets as plain text (D-174 release, Nov 25). Providers send descriptions as HTML, and Greenhouse's
// ?content=true sends it entity-encoded ("&lt;p&gt;AI &amp;amp; People&lt;/p&gt;"). Decode entities, remove tags
// (and the contents of script/style) until nothing changes, decode the remaining text's entities, then collapse
// whitespace, so no markup or entity code ever reaches the jobs list. The result is rendered as React text.
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
  // Strip until nothing changes: one pass over "<scr<script>ipt>" would leave "<script>" behind (CodeQL
  // js/incomplete-multi-character-sanitization). Each pass only shortens the text, so this ends; the bound is a guard.
  let text = decodeEntities(html);
  for (let pass = 0; pass < 10; pass += 1) {
    const next = text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      // Block-level tags separate words; inline tags (b, strong, a, span) join them ("<b>pay</b>." stays "pay.").
      .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|blockquote|hr)\b[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, "");
    if (next === text) break;
    text = next;
  }
  // Greenhouse escapes its HTML twice, so the text left between tags still carries entities ("AI &amp; People"):
  // decode the text once more. Whatever then still opens a tag (pathological nesting, or markup decoded from the
  // text) loses its "<", so no markup can survive.
  return decodeEntities(text).replace(/<(?=[a-z/!?])/gi, "").replace(/\s+/g, " ").trim().slice(0, max);
}
