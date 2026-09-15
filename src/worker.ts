// src/worker.ts
// Worker entry: routes requests to the Container running the Express app.
import { Container, getContainer } from "@cloudflare/containers";

const WORKOS_CONTAINER_KEYS = [
  "WORKOS_API_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD",
  "WORKOS_REDIRECT_URI",
  "WORKOS_POST_SIGNIN_PATH",
  "ADMIN_SMOKE_SECRET",
] as const;

/**
 * SkipwaitApi container.
 *
 * Cloudflare Containers do not inherit Worker bindings automatically. Keep
 * this allowlist explicit so the container receives only the WorkOS values it
 * needs, including secret bindings that may not appear in Object.entries(env).
 */
export class SkipwaitApi extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars: Record<string, string> = {};

  constructor(
    ctx: DurableObject["ctx"],
    env: Record<string, unknown>,
    options?: ConstructorParameters<typeof Container>[2]
  ) {
    super(ctx, env, options);
    for (const key of WORKOS_CONTAINER_KEYS) {
      const value = env[key];
      if (typeof value === "string" && value.length > 0) this.envVars[key] = value;
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & { SkipwaitApi: DurableObjectNamespace; API_RELEASE?: string },
    ctx: ExecutionContext
  ): Promise<Response> {
    // Single-instance API: all requests to one container for session affinity.
    const release = typeof env.API_RELEASE === "string" && /^[a-f0-9]{40}$/.test(env.API_RELEASE) ? env.API_RELEASE.slice(0, 12) : "legacy";
    return getContainer(env.SkipwaitApi, `skipwaitmanus-api-${release}`, true).fetch(request);
  },
};
