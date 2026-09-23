// Link previews for the URLs SkipWait asks people to share (#97). Crawlers
// (WhatsApp, LinkedIn, X, Slack) never run our JS, so the route-specific
// og:/twitter:/canonical tags must be in the served HTML. Humans get the same
// SPA shell, so the app still renders. Only public data is used: the company
// domain the public API already returns. Never a name, email or resume.
export type ShareMeta = { title: string; description: string; url: string; image: string; imageAlt: string };

const SITE = "https://skipwait.me";
const DEFAULT_IMAGE = `${SITE}/og-skipwait.png`;

function escapeAttr(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
}

function setTag(html: string, pattern: RegExp, tag: string) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}\n</head>`);
}

/** Replace the shell's generic head tags with route-specific ones. */
export function injectShareMeta(html: string, meta: ShareMeta | null): string {
  if (!meta) {
    return setTag(html, /<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex" />');
  }
  const t = escapeAttr(meta.title), d = escapeAttr(meta.description), u = escapeAttr(meta.url), i = escapeAttr(meta.image), a = escapeAttr(meta.imageAlt);
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  out = setTag(out, /<meta name="description"[^>]*>/, `<meta name="description" content="${d}" />`);
  out = setTag(out, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${u}" />`);
  out = setTag(out, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${t}" />`);
  out = setTag(out, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${d}" />`);
  out = setTag(out, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${u}" />`);
  out = setTag(out, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${i}" />`);
  out = setTag(out, /<meta property="og:image:alt"[^>]*>/, `<meta property="og:image:alt" content="${a}" />`);
  out = setTag(out, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${t}" />`);
  out = setTag(out, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${d}" />`);
  out = setTag(out, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${i}" />`);
  return out;
}

const SAFE_DOMAIN = /^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/i;

// Headline copy is a placeholder pending the founder's pick (#97 asks for two
// options before merge). Keep all wording in this one place.
export const SHARE_COPY = {
  fastTrack: (domain: string) => ({ title: `Ask a verified ${domain} employee for a referral`, description: `Send a private referral request to a verified ${domain} employee on skipwait.me. Your request stays private until they accept.` }),
  shareCard: (domain: string) => ({ title: `Accepted referral at ${domain} | skipwait.me`, description: `A private referral at ${domain} was accepted on skipwait.me. Start your own private referral request.` }),
};

type ApiFetch = (path: string) => Promise<Response>;

async function readDomain(apiFetch: ApiFetch, path: string, key: "link" | "card"): Promise<string | null> {
  try {
    const response = await apiFetch(path);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, { companyDomain?: unknown } | undefined>;
    const domain = body[key]?.companyDomain;
    return typeof domain === "string" && SAFE_DOMAIN.test(domain) ? domain.toLowerCase() : null;
  } catch { return null; }
}

/** Resolve preview metadata for a share path, or null when the link is not live. */
export async function resolveShareMeta(pathname: string, apiFetch: ApiFetch): Promise<ShareMeta | null> {
  const url = `${SITE}${pathname}`;
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "share-card" && parts.length === 2 && /^[a-zA-Z0-9-]{16,64}$/.test(parts[1])) {
    const domain = await readDomain(apiFetch, `/api/referral-share-cards/public/${encodeURIComponent(parts[1])}`, "card");
    if (!domain) return null;
    return { ...SHARE_COPY.shareCard(domain), url, image: `${SITE}/api/referral-share-cards/public/${encodeURIComponent(parts[1])}/image.png`, imageAlt: `Accepted referral at ${domain}` };
  }
  if (parts[0] === "fast" && parts.length === 2 && /^[a-zA-Z0-9_-]{1,64}$/.test(parts[1])) {
    const domain = await readDomain(apiFetch, `/api/referrer-fast-track/${encodeURIComponent(parts[1])}`, "link");
    if (!domain) return null;
    return { ...SHARE_COPY.fastTrack(domain), url, image: DEFAULT_IMAGE, imageAlt: `Private referral requests at ${domain}` };
  }
  if (parts[0] === "refer" && parts.length === 3 && /^[a-z0-9-]{1,80}$/i.test(parts[1]) && /^[a-z0-9-]{1,64}$/i.test(parts[2])) {
    const domain = await readDomain(apiFetch, `/api/referrer-fast-track/vanity/${encodeURIComponent(parts[1])}/${encodeURIComponent(parts[2])}`, "link");
    if (!domain) return null;
    return { ...SHARE_COPY.fastTrack(domain), url, image: DEFAULT_IMAGE, imageAlt: `Private referral requests at ${domain}` };
  }
  return null;
}

const DEFAULT_API_ORIGIN = "https://skipwait.me";

/** Pages Function body shared by /share-card/*, /fast/*, /refer/*. */
export async function serveShareRoute(context: { request: Request; next: () => Promise<Response>; env: { API_ORIGIN?: string } }): Promise<Response> {
  const shell = await context.next();
  const type = shell.headers.get("content-type") || "";
  if (context.request.method !== "GET" || !type.includes("text/html")) return shell;
  const pathname = new URL(context.request.url).pathname;
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const meta = await resolveShareMeta(pathname, path => fetch(`${apiOrigin}${path}`, { headers: { accept: "application/json" } }));
  const headers = new Headers(shell.headers);
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  return new Response(injectShareMeta(await shell.text(), meta), { status: meta ? 200 : 404, headers });
}
