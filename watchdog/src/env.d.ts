// REL-watchdog: the few Cloudflare Workers types this Worker uses, declared locally
// because @cloudflare/workers-types is not a dependency and none may be added.

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface WatchdogKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
