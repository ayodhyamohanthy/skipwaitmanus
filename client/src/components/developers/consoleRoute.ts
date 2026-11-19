// The developer console keeps its view in the URL query (/developer-console?app=1),
// so browser back, reload and deep links reopen the same screen. Pure helpers.

export type ConsoleView =
  | { readonly kind: "list" }
  | { readonly kind: "new"; readonly fromId: number | null }
  | { readonly kind: "app"; readonly id: number; readonly details: boolean };

export const CONSOLE_PATH = "/developer-console";

function parseId(value: string | null): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Reads the view from a query string ("?app=1", "app=1&details=1", "new=1&from=3"). Unknown or malformed input is the list. */
export function readConsoleView(search: string): ConsoleView {
  const query = new URLSearchParams(search);
  const app = parseId(query.get("app"));
  if (app !== null) return { kind: "app", id: app, details: query.get("details") === "1" };
  if (query.get("new") === "1") return { kind: "new", fromId: parseId(query.get("from")) };
  return { kind: "list" };
}

export function consoleHref(view: ConsoleView): string {
  switch (view.kind) {
    case "list":
      return CONSOLE_PATH;
    case "new":
      return view.fromId === null ? `${CONSOLE_PATH}?new=1` : `${CONSOLE_PATH}?new=1&from=${view.fromId}`;
    case "app":
      return view.details ? `${CONSOLE_PATH}?app=${view.id}&details=1` : `${CONSOLE_PATH}?app=${view.id}`;
  }
}
