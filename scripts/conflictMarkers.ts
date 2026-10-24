import { readFileSync } from "node:fs";

// An unresolved-merge marker at the start of a line (allowing leading space).
// `=======` alone would false-positive on markdown rules and ascii art, so it
// only counts when a file already carries a <<<<<<< marker above it.
export function conflictMarkersIn(text: string): number[] {
  const lines = text.split("\n");
  const hits: number[] = [];
  let sawOpen = false;
  lines.forEach((line, i) => {
    if (/^\s*<{7}(?:\s|$)/.test(line)) { sawOpen = true; hits.push(i + 1); return; }
    if (/^\s*>{7}(?:\s|$)/.test(line)) { hits.push(i + 1); return; }
    if (sawOpen && /^\s*={7}\s*$/.test(line)) hits.push(i + 1);
  });
  return hits;
}

export function conflictMarkersInFile(path: string): number[] {
  return conflictMarkersIn(readFileSync(path, "utf8"));
}
