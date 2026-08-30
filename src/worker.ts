// Worker entry: routes requests to the Container running the Express app.
import { Container, getContainer } from "@cloudflare/containers";

export class SkipwaitApi extends Container {
  defaultPort = 3000;
  sleepAfter = "10m";
}

export default {
  async fetch(request: Request, env: { SkipwaitApi: DurableObjectNamespace }, ctx: ExecutionContext): Promise<Response> {
    // Single-instance API: all requests to one container for session affinity.
    return getContainer(env.SkipwaitApi, "skipwait-api", true).fetch(request);
  },
};
