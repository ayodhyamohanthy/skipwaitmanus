// Pages Function: proxies every /api/* request from skipwait.me to the API
// server (Render). Keeps frontend and API same-origin so cookies, WorkOS
// redirects, and CORS all work without extra domains.
const DEFAULT_API_ORIGIN = "https://skipwaitmanus.ayodhya-711.workers.dev";

export const onRequest: PagesFunction<{ API_ORIGIN?: string; PROXY_SHARED_SECRET?: string }> = async (context) => {
  const url = new URL(context.request.url);
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const target = `${apiOrigin}${url.pathname}${url.search}`;
  const headers = new Headers(context.request.headers);
  // Cloudflare forbids setting `Host` on an outbound fetch, so the browser's host
  // travels as `X-Forwarded-Host` instead — the API cannot read the original host
  // any other way, and host-scoped decisions (CSRF origin check, live-vs-test
  // billing, outbound links) depend on it.
  //
  // `x-skipwait-proxy` is what proves the request actually came through this
  // proxy, so the API may trust that forwarded host. Set the same
  // PROXY_SHARED_SECRET here (Pages env) and on the API container to enable it;
  // without it the API still honours the forwarded host, but unproven.
  headers.set("x-forwarded-host", url.hostname);
  headers.delete("host");
  const proxySecret = context.env.PROXY_SHARED_SECRET;
  if (proxySecret) headers.set("x-skipwait-proxy", proxySecret);
  const upstream = await fetch(target, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : await context.request.arrayBuffer(),
    redirect: "manual",
  });
  const responseHeaders = new Headers(upstream.headers);
  const location = responseHeaders.get("location");
  if (location && location.startsWith(apiOrigin)) {
    responseHeaders.set("location", location.replace(apiOrigin, url.origin));
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};
