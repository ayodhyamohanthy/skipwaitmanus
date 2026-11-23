import type { NextFunction, Request, Response } from "express";

/**
 * Timing only, no behaviour change: a Server-Timing header on /api answers and a log line for slow ones (path only,
 * no query or user data). Mounted at /api. Auth answers (/api/auth/*) never carry Server-Timing: on sign-in and
 * sign-up the exact server time would say how much work the server did for that email (S-6, D-078 ruling 7).
 */
export function apiTiming(req: Request, res: Response, next: NextFunction): void {
  const started = performance.now();
  if (!req.path.startsWith("/auth/")) {
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res;
    res.writeHead = ((...args: unknown[]) => {
      if (!res.headersSent) res.setHeader("Server-Timing", `app;dur=${Math.round(performance.now() - started)}`);
      return writeHead(...args);
    }) as typeof res.writeHead;
  }
  res.on("finish", () => {
    const ms = Math.round(performance.now() - started);
    if (ms >= 800) console.warn(`[slow-api] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
}
