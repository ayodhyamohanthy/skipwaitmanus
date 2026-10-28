// The executable half of "moved" (D-167 (3), GOAL_UI_COVERAGE.md section 1.7):
// a moved page exports GOAL_PAGE = { goalLine } and its test calls
// assertGoalPage(container, GOAL_PAGE). The contract fails unless the render
// has exactly one h1 with the goal line, exactly one next-step region holding
// the page's single black commit, and no class defined in styles/kit.css.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GOAL_NEXT_STEP_HEADING_ID } from "@/components/goal/GoalNextStep";

export interface GoalPageContract {
  goalLine: string;
}

const NEXT_STEP_SELECTOR = `section[aria-labelledby="${GOAL_NEXT_STEP_HEADING_ID}"]`;

// Kit classes share no prefix (.credit-..., .plan-..., .work-...), so the set
// is read from the stylesheet itself at test time instead of being guessed.
function kitClassNames(): Set<string> {
  const css = readFileSync(join(__dirname, "..", "styles", "kit.css"), "utf8");
  const names = new Set<string>();
  for (const match of Array.from(css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g))) names.add(match[1]);
  return names;
}

export function assertGoalPage(container: HTMLElement, contract: GoalPageContract): void {
  const h1s = Array.from(container.querySelectorAll("h1"));
  if (h1s.length !== 1) throw new Error(`goal page: expected exactly one h1, found ${h1s.length}`);
  const actualLine = (h1s[0].textContent ?? "").trim();
  if (actualLine !== contract.goalLine) {
    throw new Error(`goal page: h1 is "${actualLine}", expected the goal line "${contract.goalLine}"`);
  }

  const regions = Array.from(container.querySelectorAll(NEXT_STEP_SELECTOR));
  if (regions.length !== 1) throw new Error(`goal page: expected exactly one "Your next step" block, found ${regions.length}`);

  const primaries = Array.from(container.querySelectorAll("[data-g-primary]"));
  if (primaries.length !== 1) throw new Error(`goal page: expected exactly one black commit (data-g-primary), found ${primaries.length}`);
  if (!regions[0].contains(primaries[0])) {
    throw new Error('goal page: the black commit must sit inside the "Your next step" block');
  }

  const kit = kitClassNames();
  const offenders: string[] = [];
  for (const el of Array.from(container.querySelectorAll("*"))) {
    for (const cls of Array.from(el.classList)) {
      if (kit.has(cls)) { offenders.push(`${el.tagName.toLowerCase()}.${cls}`); break; }
    }
  }
  if (offenders.length > 0) {
    throw new Error(`goal page: kit.css classes present: ${offenders.slice(0, 5).join(", ")}${offenders.length > 5 ? ` and ${offenders.length - 5} more` : ""}`);
  }
}
