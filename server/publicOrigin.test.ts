import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { publicOrigin, type RequestOriginSource } from "./publicOrigin";

const source = (protocol: string, host: string): RequestOriginSource => ({
  protocol,
  get: (name: string) => (name.toLowerCase() === "host" ? host : undefined),
});

describe("publicOrigin", () => {
  it("prefers the configured origin and trims trailing slashes", () => {
    expect(publicOrigin(source("http", "localhost:3000"), "https://skipwait.me/")).toBe("https://skipwait.me");
  });
  it("falls back to the request origin when the configured value is unset", () => {
    expect(publicOrigin(source("http", "localhost:3000"), undefined)).toBe("http://localhost:3000");
  });
  it("falls back when the configured value is blank", () => {
    expect(publicOrigin(source("https", "skipwait.me"), "   ")).toBe("https://skipwait.me");
  });
  it("is assignable from an Express request", () => {
    const req = { protocol: "https", get: () => "skipwait.me" } as unknown as Request;
    expect(publicOrigin(req, "https://skipwait.me")).toBe("https://skipwait.me");
  });
});
