// @vitest-environment jsdom
// goalPageContract fixtures: one render that passes, and one failing render
// per rule - two h1s, a wrong goal line, two black commits, a black commit
// outside the next-step block, a kit.css class (D-167 (3): tests first).
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { assertGoalPage } from "./goalPageContract";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalButton } from "@/components/goal/GoalButton";

const GOAL_PAGE = { goalLine: "Get referred." };

function Pass() {
  return (
    <div>
      <h1>Get referred.</h1>
      <GoalNextStep reason="One focused ask beats ten applications.">
        <GoalButton variant="primary">Ask for a referral</GoalButton>
      </GoalNextStep>
    </div>
  );
}

describe("assertGoalPage", () => {
  it("passes a conforming page", () => {
    const { container } = render(<Pass />);
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
  });

  it("fails when the page has two h1s", () => {
    const { container } = render(<div><h1>Get referred.</h1><h1>Again.</h1><GoalNextStep><GoalButton variant="primary">Go</GoalButton></GoalNextStep></div>);
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/exactly one h1/);
  });

  it("fails when the h1 is not the goal line", () => {
    const { container } = render(<div><h1>Something else.</h1><GoalNextStep><GoalButton variant="primary">Go</GoalButton></GoalNextStep></div>);
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/goal line/);
  });

  it("fails when two black commits render", () => {
    const { container } = render(
      <div><h1>Get referred.</h1><GoalNextStep><GoalButton variant="primary">One</GoalButton><GoalButton variant="primary">Two</GoalButton></GoalNextStep></div>,
    );
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/exactly one black commit/);
  });

  it("fails when the black commit sits outside the next-step block", () => {
    const { container } = render(
      <div><h1>Get referred.</h1><GoalNextStep reason="No commit inside.">{null}</GoalNextStep><GoalButton variant="primary">Outside</GoalButton></div>,
    );
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/inside the "Your next step" block/);
  });

  it("fails when no next-step block renders", () => {
    const { container } = render(<div><h1>Get referred.</h1><GoalButton variant="primary">Go</GoalButton></div>);
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/exactly one "Your next step" block/);
  });

  it("fails when an element carries a class defined in kit.css", () => {
    const { container } = render(
      <div><h1>Get referred.</h1><GoalNextStep><GoalButton variant="primary">Go</GoalButton></GoalNextStep><p className="ask-card">3</p></div>,
    );
    expect(() => assertGoalPage(container, GOAL_PAGE)).toThrow(/kit\.css classes present: p\.ask-card/);
  });
});
