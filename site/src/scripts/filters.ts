// The filter panel on the home page (PROJECT.md 2). Browser only: nothing
// here sends a request. See components/FilterPanel.astro.
import { EMPTY_FILTERS, activeCount, matches, type CardFacts, type FilterState } from "../lib/filter-logic.ts";
import { localParts } from "../lib/time.ts";
import { readFilters, readSaved, writeFilters } from "./device.ts";
import { searchMatches } from "../lib/search.ts";
import { setupSearch } from "./search.ts";

const panel = document.getElementById("filter-panel");
const toggle = document.getElementById("filters-toggle") as HTMLButtonElement | null;
const list = document.getElementById("listing-list");
const countEl = document.getElementById("results-count");
const noneEl = document.getElementById("results-none");

if (panel && toggle && list && countEl) {
  const timeZone = panel.dataset.timezone ?? "UTC";
  const items = [...list.querySelectorAll<HTMLElement>("li[data-id]")];
  const cards = items.map((li): [HTMLElement, CardFacts] => {
    const d = li.dataset;
    return [
      li,
      {
        id: d.id ?? "",
        date: d.date ?? "",
        weekday: Number(d.weekday),
        time: d.time ?? "",
        area: d.area ?? "",
        cause: d.cause ?? "",
        type: d.type ?? "",
        join: d.join ?? "",
        training: d.training ?? "",
        spanish: d.spanish ?? "",
        host: d.host ?? "",
        faith: d.faith ?? "",
        activities: (d.activity ?? "").split(" ").filter(Boolean),
        team: d.team ?? "",
        kind: d.kind ?? "dated",
      },
    ];
  });
  const overAt = new Map(items.map((li) => [li, Number(li.dataset.overAt)]));

  const selects = [...panel.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-filter]")];
  const chips = [...panel.querySelectorAll<HTMLButtonElement>("[data-filter-toggle]")];
  const dateField = panel.querySelector<HTMLElement>("[data-date-field]");
  const datedOnly = [...panel.querySelectorAll<HTMLElement>("[data-dated-only]")];
  const kindNote = document.getElementById("kind-note");
  const applyButton = panel.querySelector<HTMLElement>("[data-filters-apply]");
  const externalNote = document.getElementById("external-note");
  const translatedNote = document.getElementById("translated-note");
  // How many items of each kind the page holds, for the "none yet" message.
  const kindTotals = {
    "": cards.filter(([, f]) => f.kind !== "flexible").length,
    flexible: cards.filter(([, f]) => f.kind === "flexible").length,
    teams: cards.filter(([, f]) => f.team === "true").length,
  };
  const countBadge = toggle.querySelector<HTMLElement>("[data-filters-count]");
  const pluralRules = new Intl.PluralRules(document.documentElement.lang);

  let state: FilterState = readFilters(EMPTY_FILTERS);
  // The day map (decision 0035, components/MapView.astro): while it is on, its own
  // day replaces the Day filter and flexible cards (which have no day) leave the list.
  // The stored filters never change because of the map.
  const mapRoot = document.querySelector<HTMLElement>("[data-map-root]");
  const dayField = panel.querySelector<HTMLElement>("[data-day-field]");
  const mapDay = (): string => (mapRoot?.dataset.mapOn === "true" ? (mapRoot.dataset.mapDay ?? "") : "");
  // The search box: its words stay in memory only, never in the stored filters.
  const search = setupSearch(() => apply());

  function showState(): void {
    for (const field of selects) {
      const key = field.dataset.filter as keyof FilterState;
      const value = String(state[key] ?? "");
      // A saved choice that no longer exists (the listing went away) falls back to "any".
      field.value = value;
      if (field.value !== value) {
        field.value = "";
        (state as unknown as Record<string, unknown>)[key] = "";
      }
    }
    for (const chip of chips) {
      const key = chip.dataset.filterToggle as keyof FilterState;
      chip.setAttribute("aria-pressed", String(Boolean(state[key])));
    }
    // Flexible opportunities have no day or time: hide those fields and say why.
    const flexible = state.kind === "flexible";
    const onMap = mapDay() !== "";
    for (const field of datedOnly) if (field !== dateField) field.hidden = flexible || (onMap && field === dayField);
    if (dateField) dateField.hidden = flexible || onMap || state.day !== "pick_date";
    search?.setKind(state.kind);
    // "Show shifts" / "Show opportunities" / "Show team activities".
    if (applyButton) {
      const label = flexible ? applyButton.dataset.labelFlexible : state.kind === "teams" ? applyButton.dataset.labelTeams : applyButton.dataset.labelDated;
      const words = applyButton.querySelector("span") ?? applyButton;
      if (label) words.textContent = label;
    }
    if (kindNote) {
      const note = state.kind === "flexible" ? kindNote.dataset.noteFlexible : state.kind === "teams" ? kindNote.dataset.noteTeams : "";
      // Never hidden: an empty live region stays on the page so changes are announced.
      if (kindNote.textContent !== (note ?? "")) kindNote.textContent = note ?? "";
    }
  }

  function plural(el: HTMLElement, count: number, prefix = "count"): string {
    const text = el.dataset[`${prefix}${pluralRules.select(count) === "one" ? "One" : "Other"}`] ?? "";
    return text.replace("{count}", new Intl.NumberFormat(document.documentElement.lang).format(count));
  }

  function apply(): void {
    const today = localParts(Date.now(), timeZone).date;
    const saved = readSaved();
    const now = Date.now();
    let shown = 0;
    const query = search?.query() ?? "";
    const day = mapDay();
    const effective: FilterState = day ? { ...state, day: "pick_date", date: day } : state;
    for (const [li, facts] of cards) {
      const over = (overAt.get(li) ?? Infinity) < now; // built yesterday, already over today
      const visible =
        !over &&
        !(day && facts.kind === "flexible") &&
        matches(facts, effective, today, saved) &&
        searchMatches(li.dataset.search ?? "", query);
      li.hidden = !visible;
      if (visible) shown += 1;
    }
    // Count words for what is shown: "shifts", "opportunities" or "team activities".
    const prefix = state.kind === "flexible" ? "countFlexible" : state.kind === "teams" ? "countTeams" : "count";
    countEl!.textContent = plural(countEl!, shown, prefix);
    if (noneEl) {
      noneEl.hidden = shown > 0;
      // None of this kind at all: "No flexible opportunities yet." Otherwise: none match these filters.
      const kind = (state.kind || "") as keyof typeof kindTotals;
      const empty = (kindTotals[kind] ?? 0) === 0;
      const name = kind === "flexible" ? "Flexible" : kind === "teams" ? "Teams" : "Dated";
      const main = noneEl.querySelector<HTMLElement>("[data-none-main]");
      const hint = noneEl.querySelector<HTMLElement>("[data-none-hint]");
      // Words were typed and nothing matches them: say it is the search.
      const searching = !empty && query.trim() !== "";
      if (main) main.textContent = (searching ? noneEl.dataset.searchNone : noneEl.dataset[`${empty ? "empty" : "match"}${name}`]) ?? "";
      if (hint) {
        hint.textContent = (searching ? noneEl.dataset.searchHint : noneEl.dataset[`hint${name}`]) ?? "";
        hint.hidden = empty;
      }
    }
    // The "sign-up happens on the organization's website" note, when flexible cards can show.
    if (externalNote) externalNote.hidden = state.kind !== "flexible" && state.kind !== "teams";
    if (translatedNote) translatedNote.hidden = state.kind !== "flexible" && state.kind !== "teams";
    // On the day map the Day filter is off (the map's day picker sets the day), so it is not counted.
    const active = activeCount(day ? { ...state, day: "", date: "" } : state);
    if (countBadge) {
      // Sighted people see the number in a badge; screen readers hear ", 2 filters on".
      countBadge.hidden = active === 0;
      const number = countBadge.querySelector<HTMLElement>("[data-filters-number]");
      const words = countBadge.querySelector<HTMLElement>("[data-filters-words]");
      if (number) number.textContent = active ? new Intl.NumberFormat(document.documentElement.lang).format(active) : "";
      if (words) words.textContent = active ? `, ${plural(countBadge, active)}` : "";
    }
    writeFilters(state);
    // The map (if on) shows what the list now shows.
    list!.dataset.kind = state.kind;
    document.dispatchEvent(new CustomEvent("pv:listupdated"));
  }

  function open(isOpen: boolean, returnFocus = true): void {
    panel!.hidden = !isOpen;
    toggle!.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) panel!.querySelector<HTMLElement>("select, input, button")?.focus();
    else if (returnFocus) toggle!.focus();
  }

  for (const field of selects) {
    field.addEventListener("change", () => {
      (state as unknown as Record<string, unknown>)[field.dataset.filter!] = field.value;
      if (field.dataset.filter === "day" && field.value !== "pick_date") state.date = "";
      showState();
      apply();
    });
  }
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const key = chip.dataset.filterToggle as "no_training" | "spanish" | "saved";
      state[key] = !state[key];
      showState();
      apply();
    });
  }
  panel.querySelector("[data-filters-apply]")?.addEventListener("click", () => {
    open(false, false);
    document.getElementById("results-heading")?.focus();
  });
  panel.querySelector("[data-filters-clear]")?.addEventListener("click", () => {
    state = { ...EMPTY_FILTERS };
    showState();
    apply();
  });
  panel.querySelector("[data-filters-close]")?.addEventListener("click", () => open(false));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") open(false);
  });
  toggle.addEventListener("click", () => open(panel.hidden));
  // A heart tapped while "Only shifts I saved" is on does not hide its card
  // at once, so keyboard focus is not lost; the list updates on the next change.

  document.addEventListener("pv:mapchange", () => {
    showState();
    apply();
  });

  toggle.hidden = false;
  showState();
  apply();
}
