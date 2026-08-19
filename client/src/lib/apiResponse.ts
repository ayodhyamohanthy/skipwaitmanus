export async function readApiJson<T extends Record<string, unknown>>(response: Response, fallbackMessage: string): Promise<T> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as T;
  } catch {
    // An HTML gateway, sign-in, or static fallback response is not safe to expose as a parser error.
  }
  throw new Error(fallbackMessage);
}
