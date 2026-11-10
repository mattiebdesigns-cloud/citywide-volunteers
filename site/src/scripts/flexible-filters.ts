// Filters on the Flexible opportunities page (decision 0018) and the
// Volunteer Teams page (decision 0020). Browser only: nothing here sends a
// request. See components/FlexibleFilterPanel.astro.
import {
  EMPTY_FLEXIBLE_FILTERS,
  flexibleActiveCount,
  flexibleMatches,
  type FlexibleFacts,
  type FlexibleFilterState,
} from "../lib/filter-logic.ts";
import { FLEXIBLE_FILTERS_KEY, readFilters, writeFilters } from "./device.ts";
import { searchMatches } from "../lib/search.ts";
import { setupSearch } from "./search.ts";

const panel = document.getElementById("filter-panel");
const toggle = document.getElementById("filters-toggle") as HTMLButtonElement | null;
const list = document.getElementById("listing-list");
const countEl = document.getElementById("results-count");
const noneEl = document.getElementById("results-none");

if (panel && toggle && list && countEl) {
  const storageKey = panel.dataset.storageKey || FLEXIBLE_FILTERS_KEY;
  const cards = [...list.querySelectorAll<HTMLElement>("li[data-id]")].map((li): [HTMLElement, FlexibleFacts] => [
    li,
    { section: li.dataset.section ?? "", cause: li.dataset.cause ?? "", join: li.dataset.join ?? "", date: li.dataset.date ?? "", group: li.dataset.group ?? "" },
  ]);
  const selects = [...panel.querySelectorAll<HTMLSelectElement>("select[data-filter]")];
  const countBadge = toggle.querySelector<HTMLElement>("[data-filters-count]");
  const lang = document.documentElement.lang;
  const pluralRules = new Intl.PluralRules(lang);
  const number = new Intl.NumberFormat(lang);

  let state: FlexibleFilterState = readFilters(EMPTY_FLEXIBLE_FILTERS, storageKey);
  // The search box: its words stay in memory only, never in the stored filters.
  const search = setupSearch(() => apply());

  function showState(): void {
    for (const field of selects) {
      const key = field.dataset.filter as keyof FlexibleFilterState;
      const value = String(state[key] ?? "");
      field.value = value;
      // A saved choice that no longer exists falls back to "any".
      if (field.value !== value) {
        field.value = "";
        state[key] = "";
      }
    }
  }

  function plural(el: HTMLElement, count: number): string {
    const text = el.dataset[`count${pluralRules.select(count) === "one" ? "One" : "Other"}`] ?? "";
    return text.replace("{count}", number.format(count));
  }

  function apply(): void {
    let shown = 0;
    const query = search?.query() ?? "";
    const now = Date.now();
    for (const [li, facts] of cards) {
      // A dated shift that ended after the page was built is hidden, as on the home page.
      const over = Number(li.dataset.overAt ?? Infinity) < now;
      const visible = !over && flexibleMatches(facts, state) && searchMatches(li.dataset.search ?? "", query);
      li.hidden = !visible;
      if (visible) shown += 1;
    }
    countEl!.textContent = plural(countEl!, shown);
    if (noneEl) {
      noneEl.hidden = shown > 0;
      // Words typed and nothing matches: say it is the search.
      const searching = query.trim() !== "";
      const main = noneEl.querySelector<HTMLElement>("[data-none-main]");
      const hint = noneEl.querySelector<HTMLElement>("[data-none-hint]");
      if (main) main.textContent = (searching ? noneEl.dataset.searchNone : noneEl.dataset.match) ?? main.textContent;
      if (hint) hint.textContent = (searching ? noneEl.dataset.searchHint : noneEl.dataset.hint) ?? hint.textContent;
    }
    const active = flexibleActiveCount(state);
    if (countBadge) {
      countBadge.hidden = active === 0;
      const num = countBadge.querySelector<HTMLElement>("[data-filters-number]");
      const words = countBadge.querySelector<HTMLElement>("[data-filters-words]");
      if (num) num.textContent = active ? number.format(active) : "";
      if (words) words.textContent = active ? `, ${plural(countBadge, active)}` : "";
    }
    writeFilters(state, storageKey);
    // The page's map (decision 0035), if on, shows what the list now shows.
    document.dispatchEvent(new CustomEvent("pv:listupdated"));
  }

  function open(isOpen: boolean, returnFocus = true): void {
    panel!.hidden = !isOpen;
    toggle!.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) panel!.querySelector<HTMLElement>("select, button")?.focus();
    else if (returnFocus) toggle!.focus();
  }

  for (const field of selects) {
    field.addEventListener("change", () => {
      state[field.dataset.filter as keyof FlexibleFilterState] = field.value;
      apply();
    });
  }
  panel.querySelector("[data-filters-apply]")?.addEventListener("click", () => {
    open(false, false);
    document.getElementById("results-heading")?.focus();
  });
  panel.querySelector("[data-filters-clear]")?.addEventListener("click", () => {
    state = { ...EMPTY_FLEXIBLE_FILTERS };
    showState();
    apply();
  });
  panel.querySelector("[data-filters-close]")?.addEventListener("click", () => open(false));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") open(false);
  });
  toggle.addEventListener("click", () => open(panel.hidden));

  document.addEventListener("pv:mapchange", () => apply());

  toggle.hidden = false;
  showState();
  apply();
}
