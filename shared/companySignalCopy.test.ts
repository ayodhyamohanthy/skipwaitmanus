import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANY_SIGNAL_COPY } from "./companySignalCopy";
import { SIGNAL_NOT_ENOUGH } from "./companyResponseSignal";

describe("company signal copy", () => {
  it("matches design/goal-ui/content.json verbatim", () => {
    const content = JSON.parse(readFileSync(join(__dirname, "..", "design", "goal-ui", "content.json"), "utf8"));
    expect(content.companySignal).toEqual(COMPANY_SIGNAL_COPY);
  });
  it("the hidden-state string is the shared constant", () => { expect(COMPANY_SIGNAL_COPY.insufficient).toBe(SIGNAL_NOT_ENOUGH); });
});
