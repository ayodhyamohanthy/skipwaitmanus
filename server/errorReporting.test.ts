import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeError,
  isUnexpectedFailure,
  respondDomainFailure,
  respondInternalFailure,
} from "./errorReporting";

function responseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("error reporting", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive values and truncates messages", () => {
    const result = describeError(
      new Error(
        `See https://private.example/resume.pdf and contact person@example.com. ${"x".repeat(400)}`
      )
    );
    expect(result.message).toContain("[url]");
    expect(result.message).toContain("[email]");
    expect(result.message).not.toContain("private.example");
    expect(result.message.length).toBe(300);
  });

  it.each([
    ["a non-Error value", "failure", true],
    ["a programming error", new TypeError("bad type"), true],
    ["an unavailable database", new Error("Database unavailable"), true],
    ["a refused connection", new Error("connect ECONNREFUSED"), true],
    [
      "a domain error",
      new Error("This referral request is no longer available"),
      false,
    ],
  ])("classifies %s as unexpected=%s", (_label, error, expected) => {
    expect(isUnexpectedFailure(error)).toBe(expected);
  });

  it("returns a generic 500 for infrastructure failures and preserves domain failures", () => {
    const infrastructureResponse = responseDouble();
    respondDomainFailure(
      infrastructureResponse as never,
      "test route",
      new Error("Database unavailable"),
      {
        status: 409,
        message: "This request is no longer available",
        unexpectedMessage: "We could not process this request",
      }
    );
    expect(infrastructureResponse.status).toHaveBeenCalledWith(500);
    expect(infrastructureResponse.json).toHaveBeenCalledWith({
      error: "We could not process this request",
    });

    const domainResponse = responseDouble();
    respondDomainFailure(
      domainResponse as never,
      "test route",
      new Error("This request is no longer available"),
      {
        status: 409,
        message: "This request is no longer available",
      }
    );
    expect(domainResponse.status).toHaveBeenCalledWith(409);
    expect(domainResponse.json).toHaveBeenCalledWith({
      error: "This request is no longer available",
    });
  });

  it("logs internal failures while preserving their status and copy", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = responseDouble();
    respondInternalFailure(
      response as never,
      "test route",
      new Error("Database unavailable"),
      {
        status: 503,
        message: "The service is unavailable",
      }
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      error: "The service is unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith("[skipwait] test route failed", {
      name: "Error",
      message: "Database unavailable",
      status: 503,
    });
  });
});
