import type { Response } from "express";

const MAX_MESSAGE_LENGTH = 300;

const redactions: Array<[RegExp, string]> = [
  [/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/g, "[url]"],
  [/[^\s"'<>@]+@[^\s"'<>@]+\.[a-zA-Z]{2,}/g, "[email]"],
  [/\b\d{12,19}\b/g, "[number]"],
];

const unexpectedErrorNames = new Set([
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "EvalError",
  "URIError",
  "AggregateError",
]);
const unexpectedMessagePattern =
  /database unavailable|storage unavailable|econnrefused|econnreset|etimedout|enotfound|epipe|socket hang up|fetch failed|ER_[A-Z_]+|pool is closed|connection lost|query timed out/i;

/**
 * Describes a thrown value with routing-safe metadata only. Resume bytes, job
 * links, email addresses, OTPs, and payment identifiers never reach the log.
 */
export function describeError(error: unknown) {
  const name = error instanceof Error ? error.name : typeof error;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = redactions
    .reduce(
      (current, [pattern, replacement]) =>
        current.replace(pattern, replacement),
      raw
    )
    .slice(0, MAX_MESSAGE_LENGTH);
  return { name, message };
}

type LogDetails = Record<string, string | number | boolean | null | undefined>;

/** Records a handled failure so a swallowed error still leaves an operational trace. */
export function logHandledError(
  scope: string,
  error: unknown,
  details?: LogDetails
) {
  const described = describeError(error);
  console.error(`[skipwait] ${scope} failed`, {
    ...described,
    ...(details ?? {}),
  });
}

/**
 * Reports whether a thrown value represents an unexpected failure — an
 * infrastructure fault or a programming error — rather than a domain rule the
 * caller can act on. Unexpected failures must surface as 5xx so administrator
 * alerting sees them instead of being reported as a client mistake.
 */
export function isUnexpectedFailure(error: unknown) {
  if (!(error instanceof Error)) return true;
  if (unexpectedErrorNames.has(error.name)) return true;
  return unexpectedMessagePattern.test(error.message);
}

/** Logs a handled failure and responds with a fixed, user-safe message. */
export function respondInternalFailure(
  res: Response,
  scope: string,
  error: unknown,
  failure: { status?: number; message: string }
) {
  const status = failure.status ?? 500;
  logHandledError(scope, error, { status });
  return res.status(status).json({ error: failure.message });
}

/**
 * Logs a handled failure and responds with the domain status when the error
 * describes a domain rule, or 500 with a generic message when the error is an
 * unexpected infrastructure or programming fault.
 */
export function respondDomainFailure(
  res: Response,
  scope: string,
  error: unknown,
  failure: { status: number; message: string; unexpectedMessage?: string }
) {
  if (isUnexpectedFailure(error)) {
    logHandledError(scope, error, { status: 500 });
    return res
      .status(500)
      .json({ error: failure.unexpectedMessage ?? failure.message });
  }
  logHandledError(scope, error, { status: failure.status });
  return res
    .status(failure.status)
    .json({
      error:
        error instanceof Error && error.message
          ? error.message
          : failure.message,
    });
}
