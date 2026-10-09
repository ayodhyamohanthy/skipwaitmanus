// Pages Function: the public MCP address skipwait.me/mcp forwards to the API at /api/mcp.
// Same-origin proxy as functions/api/[[path]].ts; the API does the bearer-token check.
const DEFAULT_API_ORIGIN = "https://skipwaitmanus.ayodhya-711.workers.dev";

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = async (context) => {
  const url = new URL(context.request.url);
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const headers = new Headers(context.request.headers);
  headers.set("x-forwarded-host", url.hostname);
  headers.delete("host");
  const upstream = await fetch(`${apiOrigin}/api/mcp`, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : await context.request.arrayBuffer(),
    redirect: "manual",
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};
