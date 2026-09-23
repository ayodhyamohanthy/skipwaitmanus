import { describe, expect, it } from "vitest";
import { likeSearchPattern } from "./db";

describe("likeSearchPattern", () => {
  it("wraps plain queries in wildcards", () => {
    expect(likeSearchPattern("avery")).toBe("%avery%");
  });

  it("escapes LIKE wildcards so % cannot dump the directory", () => {
    expect(likeSearchPattern("%")).toBe("%\\%%");
    expect(likeSearchPattern("a%b_c\\d")).toBe("%a\\%b\\_c\\\\d%");
  });
});
