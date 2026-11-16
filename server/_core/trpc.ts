import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";

// P1-client-error-boundary: what a failed call may tell the browser.
// Unexpected failures get one fixed line; only messages classified here as
// intentional and safe pass through. Never pass an arbitrary exception message.
export const NEUTRAL_INTERNAL_ERROR_MESSAGE = "Something went wrong. Please try again.";

// Intentional application auth/permission lines (exact match, explicit list).
export const SAFE_CLIENT_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  UNAUTHED_ERR_MSG,
  NOT_ADMIN_ERR_MSG,
  "Use the private company referral flow for this action",
]);

const NEUTRAL_BY_CODE: Partial<Record<TRPCError["code"], string>> = {
  PARSE_ERROR: "The request could not be read.",
  BAD_REQUEST: "The request was not valid.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "Not found.",
  METHOD_NOT_SUPPORTED: "That request method is not supported.",
  TIMEOUT: "The request took too long. Please try again.",
  CONFLICT: "That could not be done right now. Please try again.",
  PRECONDITION_FAILED: "That could not be done right now. Please try again.",
  PAYLOAD_TOO_LARGE: "The request was too large.",
  UNPROCESSABLE_CONTENT: "The request was not valid.",
  TOO_MANY_REQUESTS: "Too many requests. Please wait a moment and try again.",
  CLIENT_CLOSED_REQUEST: "The request was cancelled.",
};

/** The message the client may see for this error, by explicit classification. */
export function clientSafeErrorMessage(error: TRPCError): string {
  if (error.code === "INTERNAL_SERVER_ERROR") return NEUTRAL_INTERNAL_ERROR_MESSAGE;
  // Input validation from a procedure's own schema: the schema's messages.
  if (error.code === "BAD_REQUEST" && error.cause instanceof ZodError) return error.message;
  if ((error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") && SAFE_CLIENT_ERROR_MESSAGES.has(error.message)) {
    return error.message;
  }
  return NEUTRAL_BY_CODE[error.code] ?? NEUTRAL_INTERNAL_ERROR_MESSAGE;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Only the routing facts the client already uses: code, status, path. No stack or cause.
    return {
      message: clientSafeErrorMessage(error),
      code: shape.code,
      data: { code: shape.data.code, httpStatus: shape.data.httpStatus, path: shape.data.path },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
