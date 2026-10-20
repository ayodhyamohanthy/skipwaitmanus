// Sync pin: the runtime catalogue (shared/i18n/en.ts) stays verbatim with the
// design source of truth (design/goal-ui/content.json). A mismatch means one
// was edited without the other; fix the drift, never both ways.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goalCopy } from "./en";

const content = JSON.parse(readFileSync(join(__dirname, "..", "..", "design", "goal-ui", "content.json"), "utf8"));
const askDrawer = content.screenA.askDrawer;
const copy = goalCopy.askDrawer;

describe("i18n catalogue sync", () => {
  it("ask-drawer strings match content.json verbatim", () => {
    expect(copy.title).toBe(askDrawer.title);
    expect(copy.verifiedLine).toBe(askDrawer.verifiedLine.text.replace("Kestrel Pay", "{company}"));
    expect(copy.privacyNote).toBe(askDrawer.privacyNote);
    expect(copy.seeOpenRoles).toBe(askDrawer.seeOpenRoles);
    expect(copy.jobLinkLabel).toBe(askDrawer.jobLink.label);
    expect(copy.jobLinkPlaceholder).toBe(askDrawer.jobLink.placeholder);
    expect(copy.matchHint).toBe(askDrawer.jobLink.matchHint.text.replace("Kestrel Pay", "{company}"));
    expect(copy.resumeLabel).toBe(askDrawer.resume.label);
    expect(copy.resumeChange).toBe(askDrawer.resume.action);
    expect(copy.resumeHint).toBe(askDrawer.resume.hint);
    expect(copy.whyMeLabel).toBe(askDrawer.whyMe.label);
    expect(copy.whyMeHelper).toBe(askDrawer.whyMe.helper);
    expect(copy.reasonPlaceholder3).toBe(askDrawer.whyMe.bullets[2].placeholder);
    expect(copy.costDetail).toBe(askDrawer.cost.detail);
    expect(copy.send).toBe(askDrawer.primaryAction.label);
    expect(copy.sending).toBe(askDrawer.primaryAction.busyLabel);
    expect(copy.saveDraft).toBe(askDrawer.secondaryAction.label);
    expect(copy.sendDisabledReason).toBe(askDrawer.sendDisabledReason);
    expect(copy.closedBody).toBe(askDrawer.closed.body);
    expect(copy.closedCta).toBe(askDrawer.closed.cta);
    expect(copy.closedFootnote).toBe(askDrawer.closed.footnote);
    expect(copy.signedOutBody).toBe(askDrawer.signedOut.body);
    expect(copy.signedOutCta).toBe(askDrawer.signedOut.cta);
    for (const [key, value] of Object.entries(copy.errors)) expect(value).toBe((askDrawer.errors as Record<string, string>)[key]);
  });

  it("explore state strings match content.json otherStates verbatim", () => {
    const states = content.otherStates;
    expect(goalCopy.exploreStates.noResultsTitle).toBe(states.directoryNoResults.title);
    expect(goalCopy.exploreStates.noResultsBody).toBe(states.directoryNoResults.body);
    expect(goalCopy.exploreStates.errorTitle).toBe(states.directoryError.title);
    expect(goalCopy.exploreStates.errorCta).toBe(states.directoryError.action);
    expect(goalCopy.exploreStates.slowLoad).toBe(states.slowLoad);
  });
});
