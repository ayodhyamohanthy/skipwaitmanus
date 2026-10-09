// OAuth discovery for assistants. The API Worker is routed only on skipwait.me/api/*, so this
// Pages function serves the well-known path from the same JSON the API owns.
export const onRequestGet: PagesFunction = async () => {
  const upstream = await fetch("https://skipwait.me/api/oauth/authorization-server");
  return new Response(upstream.body, { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
};
