import { captureClientError, scrubSentryUrl } from "./sentry";

export async function readApiJson<T extends Record<string, unknown>>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok && response.status >= 500) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    captureClientError(new Error(`API ${response.status}: ${fallbackMessage}`), {
      source: "api-response",
      status: response.status,
      url: scrubSentryUrl(response.url, origin),
    });
  }
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as T;
  } catch {
    // An HTML gateway, sign-in, or static fallback response is not safe to expose as a parser error.
  }
  throw new Error(fallbackMessage);
}
