// Search on the home, Flexible and Teams pages (owner, 2026-11-08).
// Browser only: what people type is never sent, stored or put in the
// address. Pure, so tests can check matching without a page.

/** Lower case, no accents, single spaces: "Café  Árbol" → "cafe arbol". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when every word typed appears somewhere in the card's search text. Empty search matches all. */
export function searchMatches(haystack: string, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeSearch(haystack);
  return words.every((word) => text.includes(word));
}

/** The one line a card is searched by: built at build time, in the page's language. */
export function searchText(parts: Array<string | null | undefined>): string {
  return normalizeSearch(parts.filter(Boolean).join(" "));
}
