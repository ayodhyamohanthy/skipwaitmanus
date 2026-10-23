export function queueGateViolation() {
  return "This branch matches no queue row. Nothing merges to main outside the queue (D-166). Ask the CEO for a row in docs/plans/assignments.json, or work on the row's own branch.";
}

export function ownerDirectWarning() {
  return null;
}
