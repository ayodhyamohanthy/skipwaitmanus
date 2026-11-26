// D-406: one email carries the six-digit code and a one-click sign-in link; the link only appears while the switch is on.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMx } from "node:dns/promises";
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import { parseEmailSignInHash } from "@shared/emailSignIn";
import { getDb } from "./db";
import { createWorkEmailOtpService, otpEmailMessage, signInEmailMessage } from "./workEmailOtp";

vi.mock("./db", async () => {
  const { isCorporateEmailDomain } = await import("../shared/const");
  return { getDb: vi.fn(), isWorkEmailDomain: isCorporateEmailDomain };
});
vi.mock("node:dns/promises", () => ({ resolveMx: vi.fn(), resolve4: vi.fn() }));

beforeEach(() => {
  vi.mocked(resolveMx).mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
  const query = vi.fn(async () => [{ affectedRows: 1, insertId: 1 }, []]);
  vi.mocked(getDb).mockResolvedValue(drizzle({ client: { query } as unknown as Pool }));
});

const linkIn = (text: string) => text.match(/https?:\/\/\S+/)?.[0] ?? "";

describe("D-406 sign-in email", () => {
  it("is today's code-only email while the switch is off", () => {
    expect(signInEmailMessage({ to: "ana@gmail.com", code: "123456", seeker: true }, { enabled: false })).toEqual(otpEmailMessage("123456"));
  });

  it("keeps the code first in the subject and adds a seeker link whose fragment holds the same email and code", () => {
    const message = signInEmailMessage({ to: "ana@gmail.com", code: "123456", seeker: true }, { enabled: true, origin: "https://skipwait.me" });
    expect(message.subject).toBe("123456 is your skipwait.me sign-in code");
    expect(message.text).toContain("123456");
    const url = new URL(linkIn(message.text));
    expect(url.origin + url.pathname).toBe("https://skipwait.me/sign-in");
    expect(url.search).toBe("");
    expect(parseEmailSignInHash(url.hash)).toEqual({ email: "ana@gmail.com", code: "123456", plane: "s" });
    expect(message.html).toContain(linkIn(message.text).replace(/&/g, "&amp;"));
  });

  it("gives a referrer's work-email code the referrer plane", () => {
    const message = signInEmailMessage({ to: "ref@acme.com", code: "654321" }, { enabled: true, origin: "https://skipwait.me" });
    expect(message.subject).toBe("654321 is your skipwait.me sign-in code");
    expect(parseEmailSignInHash(new URL(linkIn(message.text)).hash)?.plane).toBe("r");
  });

  it("escapes the address in the HTML body", () => {
    const message = signInEmailMessage({ to: "a<b>@gmail.com", code: "111111", seeker: true }, { enabled: true, origin: "https://skipwait.me" });
    expect(message.html).not.toContain("<b>");
  });

  it("tells the sender which plane asked, so the link finishes on the right endpoint", async () => {
    const sendEmail = vi.fn(async () => ({ sent: true, reason: "sent" }));
    const service = createWorkEmailOtpService({ sendEmail, now: () => 1_000_000 });
    expect((await service.sendCode("ana@gmail.com", { seeker: true, ip: "1.2.3.4" })).sent).toBe(true);
    expect(await service.sendCode("ref@acme.com", { ip: "1.2.3.5" })).toEqual({ sent: true, reason: "sent" });
    expect(sendEmail.mock.calls.map(([input]) => [input.to, input.seeker === true, /^\d{6}$/.test(input.code)])).toEqual([
      ["ana@gmail.com", true, true],
      ["ref@acme.com", false, true],
    ]);
  });
});
