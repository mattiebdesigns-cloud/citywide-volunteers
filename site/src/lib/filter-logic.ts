// Which listings match the visitor's filters (PROJECT.md 2). Runs in the
// browser only. Pure, so it can be tested without a page.
import { addDays } from "./time.ts";

/** What the page knows about one card, from its data attributes. */
export interface CardFacts {
  id: string;
  /** Local start date YYYY-MM-DD and weekday (0 = Sunday). */
  date: string;
  weekday: number;
  time: string;
  area: string;
  cause: string;
  type: string;
  join: string;
  /** "true", "false" or "" (unknown). */
  training: string;
  /** "true", "false" or "unknown". */
  spanish: string;
  host: string;
  faith: string;
  activities: string[];
  /** "true" when the listing needs a Volunteer Team (decision 0020). */
  team: string;
  /** "dated" for a calendar listing, "flexible" for a flexible opportunity (decision 0018). */
  kind: string;
}

export interface FilterState {
  day: string;
  date: string;
  time: string;
  area: string;
  cause: string;
  type: string;
  join: string;
  /** "", "only:<id>" or "hide:<id>" */
  host: string;
  faith: string;
  /** "", "only:<id>" or "hide:<id>" */
  activity: string;
  /**
   * What the list shows (owner, 2026-11-08): "" dated shifts (the default),
   * "flexible" flexible opportunities, "teams" everything that needs a
   * Volunteer Team, dated or flexible.
   */
  kind: string;
  no_training: boolean;
  spanish: boolean;
  saved: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  day: "",
  date: "",
  time: "",
  area: "",
  cause: "",
  type: "",
  join: "",
  host: "",
  faith: "",
  activity: "",
  kind: "",
  no_training: false,
  spanish: false,
  saved: false,
};

/**
 * How many filters are on, for the count next to the Filters button.
 * Kind always counts as one, Dated shifts included, so the button says
 * "1" even before anyone chooses: people can see the list shows only dated
 * shifts (owner, 2026-11-10).
 */
export function activeCount(state: FilterState): number {
  let n = 1; // Kind: Dated shifts, Flexible shifts or Team shifts
  for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof FilterState>) {
    if (key === "date" || key === "kind") continue; // date is part of the day filter; kind is counted above
    if (key === "day" && state.day === "pick_date" && !state.date) continue;
    // Flexible opportunities have no day or time, so those filters are off and not counted.
    if ((key === "day" || key === "time") && state.kind === "flexible") continue;
    if (state[key]) n += 1;
  }
  return n;
}

function dayMatches(card: CardFacts, state: FilterState, today: string): boolean {
  switch (state.day) {
    case "":
      return true;
    case "today":
      return card.date === today;
    case "tomorrow":
      return card.date === addDays(today, 1);
    case "this_week": // today and the next six days
      return card.date >= today && card.date <= addDays(today, 6);
    case "this_weekend": // the coming Saturday and Sunday, or the rest of this one
      return card.date >= today && card.date <= addDays(today, 6) && (card.weekday === 6 || card.weekday === 0);
    case "pick_date":
      return !state.date || card.date === state.date;
    default:
      return true;
  }
}

function tagMatches(choice: string, values: string[]): boolean {
  if (!choice) return true;
  const [mode, id] = choice.split(":");
  if (mode === "only") return values.includes(id);
  if (mode === "hide") return !values.includes(id);
  return true;
}

function kindMatches(card: CardFacts, kind: string): boolean {
  if (kind === "flexible") return card.kind === "flexible";
  if (kind === "teams") return card.team === "true";
  return card.kind !== "flexible"; // the default: dated shifts
}

/**
 * True when the card passes every filter that is on.
 * `today` is the local date in the city's time zone; `saved` is the set of
 * ids saved on this device.
 */
export function matches(card: CardFacts, state: FilterState, today: string, saved: ReadonlySet<string>): boolean {
  const flexible = card.kind === "flexible";
  return (
    kindMatches(card, state.kind) &&
    // Day and time apply only to dated shifts.
    (flexible || dayMatches(card, state, today)) &&
    (flexible || !state.time || card.time === state.time) &&
    (!state.area || card.area === state.area) &&
    (!state.cause || card.cause === state.cause) &&
    (!state.type || card.type === state.type) &&
    (!state.join || card.join === state.join) &&
    tagMatches(state.host, card.host ? [card.host] : []) &&
    (!state.faith || card.faith === state.faith) &&
    tagMatches(state.activity, card.activities) &&
    (!state.no_training || card.training === "false") &&
    (!state.spanish || card.spanish === "true") &&
    (!state.saved || saved.has(card.id))
  );
}

// ---- Flexible opportunities (decision 0018): section, cause, how to join ----

export interface FlexibleFacts {
  section: string;
  cause: string;
  join: string;
  /** Local date YYYY-MM-DD, for the Martin Luther King Jr. Day page's Day filter (decision 0041); "" elsewhere. */
  date?: string;
  /** "true" when the listing is good for groups (group_friendly, or it needs a team). */
  group?: string;
}

export interface FlexibleFilterState {
  section: string;
  cause: string;
  join: string;
  /** Only on the Martin Luther King Jr. Day page: one day of the weekend, or "". */
  day?: string;
  /** Only on the Martin Luther King Jr. Day page: "only" = good for groups only. */
  group?: string;
}

export const EMPTY_FLEXIBLE_FILTERS: FlexibleFilterState = { section: "", cause: "", join: "", day: "", group: "" };

/** How many of the filters are on. */
export function flexibleActiveCount(state: FlexibleFilterState): number {
  return (["section", "cause", "join", "day", "group"] as const).filter((key) => Boolean(state[key])).length;
}

/** True when the card passes every filter that is on. */
export function flexibleMatches(card: FlexibleFacts, state: FlexibleFilterState): boolean {
  return (
    (!state.section || card.section === state.section) &&
    (!state.cause || card.cause === state.cause) &&
    (!state.join || card.join === state.join) &&
    (!state.day || card.date === state.day) &&
    (state.group !== "only" || card.group === "true")
  );
}
