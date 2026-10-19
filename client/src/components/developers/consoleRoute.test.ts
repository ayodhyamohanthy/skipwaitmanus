import { describe, expect, it } from "vitest";
import { consoleHref, readConsoleView, type ConsoleView } from "./consoleRoute";

describe("developer console URL view", () => {
  it("round-trips every view through its href", () => {
    const views: ConsoleView[] = [
      { kind: "list" },
      { kind: "new", fromId: null },
      { kind: "new", fromId: 3 },
      { kind: "app", id: 1, details: false },
      { kind: "app", id: 42, details: true },
    ];
    for (const view of views) {
      const href = consoleHref(view);
      expect(href.startsWith("/developer-console")).toBe(true);
      expect(readConsoleView(href.split("?")[1] ?? "")).toEqual(view);
    }
  });

  it("falls back to the list for malformed or unknown queries", () => {
    for (const search of ["", "app=0", "app=-1", "app=1.5", "app=abc", "app=1e3", "new=0", "foo=bar"]) {
      expect(readConsoleView(search)).toEqual({ kind: "list" });
    }
  });

  it("ignores a malformed source app on the new-app form", () => {
    expect(readConsoleView("new=1&from=x")).toEqual({ kind: "new", fromId: null });
    expect(readConsoleView("?app=7&details=yes")).toEqual({ kind: "app", id: 7, details: false });
  });
});
