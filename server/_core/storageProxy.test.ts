import { describe, expect, it } from "vitest";
import { normalizeStorageKey } from "./storageProxy";

describe("normalizeStorageKey", () => {
  it("canonicalizes public keys", () => {
    expect(normalizeStorageKey("skipwait/share-cards/abc.png")).toBe("skipwait/share-cards/abc.png");
    expect(normalizeStorageKey("//skipwait/./share-cards/abc.png")).toBe("skipwait/share-cards/abc.png");
  });

  it("rejects private referral documents however the path is written", () => {
    expect(normalizeStorageKey("skipwait/private-referrals/user/resume.pdf")).toBeNull();
    expect(normalizeStorageKey(".//skipwait/private-referrals/user/resume.pdf")).toBeNull();
    expect(normalizeStorageKey("skipwait//private-referrals/user/resume.pdf")).toBeNull();
    expect(normalizeStorageKey("public/../skipwait/private-referrals/user/resume.pdf")).toBeNull();
  });

  it("rejects traversal, empty, and control-character keys", () => {
    expect(normalizeStorageKey("")).toBeNull();
    expect(normalizeStorageKey("/")).toBeNull();
    expect(normalizeStorageKey("a/../../etc/passwd")).toBeNull();
    expect(normalizeStorageKey("skipwait\\private-referrals\\resume.pdf")).toBeNull();
    expect(normalizeStorageKey("skipwait/share-cards/a\0b.png")).toBeNull();
  });
});
