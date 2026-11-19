/** Maps an express.json() failure to a response: a body over the limit is 413, a body that is not valid JSON is 400. */
export function jsonBodyError(error: unknown): { status: 413 | 400; body: { error: string } } {
  const type = (error as { type?: string } | null)?.type;
  if (type === "entity.too.large") return { status: 413, body: { error: "Request body is too large" } };
  return { status: 400, body: { error: "Request body is not valid JSON" } };
}
