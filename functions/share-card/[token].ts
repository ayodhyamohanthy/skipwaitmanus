// A share-card URL whose token cannot be a real token (same shape check the API
// uses: 16-64 letters, digits or dashes) must answer 404, not the SPA's 200.
// Well-formed tokens still render the app, which asks the API and shows the
// unavailable state itself. No API call is made here, so no view is recorded twice.
const OPAQUE_SHARE_TOKEN = /^[a-zA-Z0-9-]{16,64}$/;

export function isWellFormedShareToken(value: string): boolean {
  return OPAQUE_SHARE_TOKEN.test(value);
}

export const onRequest: PagesFunction = async context => {
  const token = String(context.params.token ?? "");
  const response = await context.next();
  if (isWellFormedShareToken(token)) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, { status: 404, headers });
};
