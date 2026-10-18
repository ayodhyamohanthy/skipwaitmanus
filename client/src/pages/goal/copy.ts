/** "Acme’s", but "Northwind Labs’": a name that already ends in s takes a bare apostrophe. */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}’` : `${name.trim()}’s`;
}
