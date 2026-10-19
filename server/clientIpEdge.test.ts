import { describe, expect, it } from "vitest";
import { withEdgeClientIp } from "../shared/clientIp";

const req = (headers: Record<string, string>) => new Request("https://skipwait.me/api/x", { method: "POST", body: "{}", headers });

describe("withEdgeClientIp", () => {
  it("replaces a client-supplied X-Forwarded-For with the Cloudflare connecting IP", () => {
    const out = withEdgeClientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "cf-connecting-ip": "203.0.113.9" }));
    expect(out.headers.get("x-forwarded-for")).toBe("203.0.113.9");
  });
  it("rotating the spoofed header never changes the forwarded IP", () => {
    const seen = new Set(["1.1.1.1", "2.2.2.2", "9.9.9.9"].map((ip) => withEdgeClientIp(req({ "x-forwarded-for": ip, "cf-connecting-ip": "203.0.113.9" })).headers.get("x-forwarded-for")));
    expect([...seen]).toEqual(["203.0.113.9"]);
  });
  it("drops other client-supplied forwarding headers", () => {
    const out = withEdgeClientIp(req({ "x-real-ip": "1.1.1.1", forwarded: "for=1.1.1.1", "true-client-ip": "1.1.1.1", "x-client-ip": "1.1.1.1", "cf-connecting-ip": "203.0.113.9" }));
    for (const h of ["x-real-ip", "forwarded", "true-client-ip", "x-client-ip"]) expect(out.headers.has(h)).toBe(false);
  });
  it("sends no forwarding header when CF-Connecting-IP is missing or invalid (fail to the shared bucket)", () => {
    expect(withEdgeClientIp(req({ "x-forwarded-for": "1.2.3.4" })).headers.has("x-forwarded-for")).toBe(false);
    expect(withEdgeClientIp(req({ "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "not-an-ip" })).headers.has("x-forwarded-for")).toBe(false);
    expect(withEdgeClientIp(req({ "cf-connecting-ip": "1.1.1.1, 2.2.2.2" })).headers.has("x-forwarded-for")).toBe(false);
  });
  it("normalizes IPv4-mapped IPv6 and keeps IPv6", () => {
    expect(withEdgeClientIp(req({ "cf-connecting-ip": "::ffff:203.0.113.9" })).headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(withEdgeClientIp(req({ "cf-connecting-ip": "2001:db8::1" })).headers.get("x-forwarded-for")).toBe("2001:db8::1");
  });
  it("keeps method, URL and body", async () => {
    const out = withEdgeClientIp(req({ "cf-connecting-ip": "203.0.113.9" }));
    expect(out.method).toBe("POST");
    expect(out.url).toBe("https://skipwait.me/api/x");
    expect(await out.text()).toBe("{}");
  });
});

import express from "express";
import { createServer } from "node:http";

describe("edge contract end to end with the API's trust proxy setting", () => {
  it("req.ip is the Cloudflare IP no matter what X-Forwarded-For the caller sent", async () => {
    const app = express();
    app.set("trust proxy", true);
    app.get("/ip", (r, res) => { res.json({ ip: r.ip }); });
    const server = createServer(app);
    await new Promise<void>((ok) => server.listen(0, ok));
    const port = (server.address() as { port: number }).port;
    try {
      for (const spoof of ["1.1.1.1", "2.2.2.2, 3.3.3.3"]) {
        const fwd = withEdgeClientIp(req({ "x-forwarded-for": spoof, "cf-connecting-ip": "203.0.113.9" }));
        const r = await fetch(`http://127.0.0.1:${port}/ip`, { headers: { "x-forwarded-for": fwd.headers.get("x-forwarded-for") ?? "" } });
        expect(((await r.json()) as { ip: string }).ip).toBe("203.0.113.9");
      }
    } finally { server.close(); }
  });
});
