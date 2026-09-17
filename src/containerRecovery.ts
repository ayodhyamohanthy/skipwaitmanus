const STOPPED_CONTAINER_PROXY_ERROR = "Error proxying request to container: The container is not running, consider calling start()";

export type ContainerRecoveryStub = {
  fetch(request: Request): Promise<Response>;
  start(
    startOptions?: { envVars?: Record<string, string>; entrypoint?: string[]; enableInternet?: boolean },
    waitOptions?: { portToCheck: number; signal?: AbortSignal; retries?: number; waitInterval?: number }
  ): Promise<void>;
};

export async function fetchContainerWithStoppedRecovery(
  container: ContainerRecoveryStub,
  request: Request
): Promise<Response> {
  const first = await container.fetch(request);
  if (first.status !== 500) return first;
  const diagnostic = await first.clone().text();
  if (diagnostic.trim() !== STOPPED_CONTAINER_PROXY_ERROR) return first;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return new Response("Service temporarily unavailable. Retry the request safely.", {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "1" },
    });
  }

  // Safe methods may be replayed after the exact stopped-instance diagnostic.
  // Mutations are never cloned or replayed: proxy wording cannot prove that the
  // origin did not apply their effects.
  await container.start(undefined, {
    portToCheck: 3000,
    signal: request.signal,
    retries: 8,
    waitInterval: 500,
  });
  return container.fetch(request);
}
