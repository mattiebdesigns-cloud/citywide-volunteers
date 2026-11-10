// The Martin Luther King Jr. Day of Service page (decision 0041; PROJECT.md 2, 5, 12).
// Which listings it shows and when the home page links to it, from
// src/data/mlk-day.json. Pure, so tests can check it.
import data from "../data/mlk-day.json" with { type: "json" };
import { localParts } from "./time.ts";

export interface MlkDays {
  /** First and last local day of the weekend, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Home page link shown from this day ... */
  promote_from: string;
  /** ... to this day, inclusive. */
  promote_until: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The settings, checked: four dates in order. */
export function mlkDays(file: unknown = data): MlkDays {
  const f = file as Partial<MlkDays>;
  for (const k of ["from", "to", "promote_from", "promote_until"] as const) {
    if (!DAY.test(String(f?.[k]))) throw new Error(`src/data/mlk-day.json: "${k}" must be a date, YYYY-MM-DD`);
  }
  if (f.from! > f.to!) throw new Error('src/data/mlk-day.json: "from" must not be after "to"');
  if (f.promote_from! > f.promote_until!) throw new Error('src/data/mlk-day.json: "promote_from" must not be after "promote_until"');
  return f as MlkDays;
}

/** True when a listing's local start date falls on the weekend (both ends included). */
export function inWeekend(localDate: string, days: Pick<MlkDays, "from" | "to">): boolean {
  return localDate >= days.from && localDate <= days.to;
}

/** Every day of the weekend, for the Day filter. */
export function weekendDays(days: Pick<MlkDays, "from" | "to">): string[] {
  const out: string[] = [];
  for (let d = new Date(`${days.from}T12:00:00Z`); d.toISOString().slice(0, 10) <= days.to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** True when the home page shows its link: the build's local date is in the promotion window. */
export function promoteNow(builtAt: Date, timeZone: string, days: Pick<MlkDays, "promote_from" | "promote_until">): boolean {
  const today = localParts(builtAt.getTime(), timeZone).date;
  return today >= days.promote_from && today <= days.promote_until;
}

/** Good for groups (the existing group_friendly field), or the listing needs a team. */
export function goodForGroups(e: { group_friendly?: boolean | null; team_required?: boolean }): boolean {
  return e.group_friendly === true || e.team_required === true;
}
