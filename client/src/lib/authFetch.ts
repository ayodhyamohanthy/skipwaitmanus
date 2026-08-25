import { readApiJson } from "./apiResponse";

export function bearerHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function createAuthFetch(getToken: () => Promise<string | null>) {
  return async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(path, { ...init, credentials: "include", headers: { ...init?.headers, ...bearerHeaders(token) } });
  };
}

export function createAuthJsonFetch<TDefault extends object>(getToken: () => Promise<string | null>, fallbackMessage: string) {
  const authFetch = createAuthFetch(getToken);
  return async <T extends object = TDefault>(path: string, init?: RequestInit): Promise<T> => {
    const response = await authFetch(path, init);
    const payload = await readApiJson<T & Record<string, unknown>>(response, fallbackMessage);
    if (!response.ok) throw new Error((payload as { error?: string }).error || fallbackMessage);
    return payload;
  };
}
