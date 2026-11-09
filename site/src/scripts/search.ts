// The search box (components/SearchBox.astro), shared by the home page's and
// the Flexible and Teams pages' filter scripts (owner, 2026-11-08).
// Privacy: the words live only in this page's memory. They are never sent,
// never stored (no localStorage, no sessionStorage, not in the filters'
// memory) and never put in the address.

export interface Search {
  /** What is typed now. */
  query(): string;
  /** The label and placeholder follow the Kind filter on the home page. */
  setKind(kind: string): void;
}

/** Wires the search box; `changed` runs after typing pauses, and at once on clear. */
export function setupSearch(changed: () => void): Search | null {
  const box = document.querySelector<HTMLElement>("[data-search]");
  const input = document.getElementById("results-search") as HTMLInputElement | null;
  if (!box || !input) return null;
  const clear = box.querySelector<HTMLButtonElement>("[data-search-clear]");
  const label = box.querySelector<HTMLElement>("[data-search-label]");
  let timer: number | undefined;

  const showClear = () => {
    if (clear) clear.hidden = input.value === "";
  };
  const reset = () => {
    input.value = "";
    showClear();
    window.clearTimeout(timer);
    changed();
  };

  input.addEventListener("input", () => {
    showClear();
    window.clearTimeout(timer);
    timer = window.setTimeout(changed, 250); // a short pause, so the count is not read out at every letter
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value !== "") {
      event.preventDefault();
      event.stopPropagation(); // Escape here clears the search; it does not close anything else
      reset();
    }
    if (event.key === "Enter") event.preventDefault(); // nothing to submit
  });
  // The browser's own clear (some browsers draw one) also counts.
  input.addEventListener("search", () => {
    if (input.value === "") reset();
  });
  clear?.addEventListener("click", () => {
    reset();
    input.focus();
  });

  box.hidden = false;
  return {
    query: () => input.value,
    setKind(kind: string) {
      if (input.dataset.fixedKind) return;
      const name = kind === "flexible" ? "labelFlexible" : kind === "teams" ? "labelTeams" : "labelDated";
      const words = input.dataset[name] ?? "";
      if (label) label.textContent = words;
      input.placeholder = words;
    },
  };
}
