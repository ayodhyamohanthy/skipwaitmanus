// Pages Function: proxies every /api/* request from skipwait.me to the API
// server (Render). Keeps frontend and API same-origin so cookies, WorkOS
// redirects, and CORS all work without extra domains.
export const onRequest: PagesFunction<{ API_ORIGIN: string }> = async (context) => {
  const url = new URL(context.request.url);
  const target = `${context.env.API_ORIGIN}${url.pathname}${url.search}`;
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
  if (location && location.startsWith(context.env.API_ORIGIN)) {
    responseHeaders.set("location", location.replace(context.env.API_ORIGIN, url.origin));
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};
