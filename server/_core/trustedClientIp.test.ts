import { describe, expect, it, afterEach } from "vitest";
import { resolveTrustedClientIp } from "./trustedClientIp";
function request(headers: Record<string,string>={}, remoteAddress="203.0.113.9") { return { header:(name:string)=>headers[name.toLowerCase()], socket:{remoteAddress} } as never; }
afterEach(()=>{ delete process.env.TRUST_CLOUDFLARE_CONNECTING_IP; });
describe("trusted OTP client IP",()=>{
 it("ignores forwarded headers by default",()=>expect(resolveTrustedClientIp(request({"x-forwarded-for":"1.2.3.4","cf-connecting-ip":"5.6.7.8"}))).toBe("203.0.113.9"));
 it("uses a single valid Cloudflare value only after explicit edge hardening",()=>{process.env.TRUST_CLOUDFLARE_CONNECTING_IP="true";expect(resolveTrustedClientIp(request({"cf-connecting-ip":"5.6.7.8"}))).toBe("5.6.7.8");expect(resolveTrustedClientIp(request({"cf-connecting-ip":"5.6.7.8, 1.2.3.4"}))).toBe("203.0.113.9");});
 it("normalizes mapped IPv4 and rejects malformed addresses",()=>{expect(resolveTrustedClientIp(request({},"::ffff:192.0.2.8"))).toBe("192.0.2.8");expect(resolveTrustedClientIp(request({},"bad"))).toBe("unknown");});
});
