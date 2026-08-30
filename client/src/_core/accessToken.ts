/**
 * Module-level bridge between the AuthKit React SDK (inside the provider tree)
 * and non-React API clients (tRPC links, plain fetch helpers) that need the
 * current WorkOS access token but render outside the provider.
 */
let currentToken: string | null = null;

export function setGlobalAccessToken(token: string | null) {
  currentToken = token;
}

export function getGlobalAccessToken(): string | null {
  return currentToken;
}
