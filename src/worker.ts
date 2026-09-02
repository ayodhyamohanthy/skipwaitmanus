// src/worker.ts
// Worker entry: routes requests to the Container running the Express app.
import { Container, getContainer } from "@cloudflare/containers";

/**
 * SkipwaitApi container.
 *
 * Cloudflare Containers do NOT inherit Worker secrets automatically: the
 * Express app only sees what is passed through envVars at container start.
 * We forward the Worker's whole env (wrangler vars + `wrangler secret put`
 * secrets) so the app receives WORKOS_*, DATABASE_URL, ZEPTOMAIL_*, JWT_SECRET
 * at runtime — exactly the values configured on the Worker.
 */
export class SkipwaitApi extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
  envVars: Record<string, string> = {};

  // Called by the runtime on each start; merge the live Worker env so secret
  // rotations apply without an image rebuild.
  constructor(
    ctx: DurableObject["ctx"],
    env: Record<string, string>,
    options?: ConstructorParameters<typeof Container>[2]
  ) {
    super(ctx, env, options);
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") this.envVars[key] = value;
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & { SkipwaitApi: DurableObjectNamespace },
    ctx: ExecutionContext
  ): Promise<Response> {
    // Single-instance API: all requests to one container for session affinity.
    return getContainer(env.SkipwaitApi, "skipwaitmanus-api", true).fetch(request);
  },
};
