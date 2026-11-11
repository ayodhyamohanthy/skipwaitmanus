// D-048-p3-public-profile: red-first stub. The goal design lands in the next
// commits; this file only exists so the test compiles against the contract.
export const goalLineFor = (name: string) => `See ${name}'s work.`;

export const GOAL_PAGE = { goalLine: goalLineFor("this person") } as const;

export default function GoalPublicProfile() {
  return null;
}
