// @vitest-environment jsdom
// F-credits: the one balance query's states - ready, loading, error with a
// working retry, signed-out and disabled both null without a fetch (a failed
// load says so and never shows 0, AGENTS.md 0a).
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCreditBalance } from "./useCreditBalance";

const { state } = vi.hoisted(() => ({
  state: {
    signedIn: true,
    query: { data: 9 as number | undefined, isError: false, refetch: vi.fn() },
  },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: state.signedIn, userId: "u1", getToken: async () => "tok" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.query,
}));

describe("useCreditBalance", () => {
  it("returns the ready count for a signed-in seeker", () => {
    const { result } = renderHook(() => useCreditBalance(true));
    expect(result.current).toEqual({ state: "ready", count: 9 });
  });

  it("is loading until the query resolves", () => {
    state.query = { data: undefined, isError: false, refetch: vi.fn() };
    const { result } = renderHook(() => useCreditBalance(true));
    expect(result.current).toEqual({ state: "loading" });
  });

  it("surfaces an error with a working retry, never a 0", () => {
    const refetch = vi.fn();
    state.query = { data: undefined, isError: true, refetch };
    const { result } = renderHook(() => useCreditBalance(true));
    expect(result.current?.state).toBe("error");
    if (result.current?.state === "error") { result.current.onRetry(); expect(refetch).toHaveBeenCalledTimes(1); }
  });

  it("is null while disabled, so the pill never flashes on a referrer surface", () => {
    state.query = { data: 9, isError: false, refetch: vi.fn() };
    const { result } = renderHook(() => useCreditBalance(false));
    expect(result.current).toBeNull();
  });

  it("is null when signed out", () => {
    state.signedIn = false;
    const { result } = renderHook(() => useCreditBalance(true));
    expect(result.current).toBeNull();
    state.signedIn = true;
  });
});
