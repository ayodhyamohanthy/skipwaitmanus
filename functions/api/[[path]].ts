// Pages Function: proxies every /api/* request from skipwait.me to the API
// server (Render). Keeps frontend and API same-origin so cookies, WorkOS
// redirects, and CORS all work without extra domains.
const DEFAULT_API_ORIGIN = "https://skipwait-api.ayodhya-711.workers.dev";

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = async (context) => {
  const url = new URL(context.request.url);
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const target = `${apiOrigin}${url.pathname}${url.search}`;
  const headers = new Headers(context.request.headers);
  headers.set("x-forwarded-host", url.hostname);
  headers.delete("host");
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
