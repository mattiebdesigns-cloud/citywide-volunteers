// The Progress page (owner, 2026-11-10; PROJECT.md 5, 12): where each phase
// stands and what is new, from src/data/progress.json, which the coordinator
// updates. The page shows it and never types a figure itself. Pure, so tests
// can check it.

export type PhaseStatus = "done" | "building" | "next" | "later";

export interface ProgressPhase {
  /** Key under progress.phases in the translation files, such as "p4b". */
  id: string;
  /** What the page shows in the marker: "0" to "7", or "4b". */
  number: string;
  status: PhaseStatus;
  /** Whole number 0 to 100, or null for no bar. */
  percent: number | null;
  /** When it began (date), or an estimate (month, late_year or year), or null for no date yet. */
  start?: { date?: string; month?: string; late_year?: string; year?: string; season?: "spring" | "summer" } | null;
}

export interface ProgressNews {
  /** Key under progress.news in the translation files. */
  id: string;
  date?: string;
  from?: string;
  to?: string;
  month?: string;
}

export interface ProgressFile {
  updated: string;
  launch_goal: string;
  phases: ProgressPhase[];
  news: ProgressNews[];
}

const STATUSES: PhaseStatus[] = ["done", "building", "next", "later"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Checks the file, with plain messages, so a typo never shows a wrong figure. */
export function checkProgress(file: ProgressFile): ProgressFile {
  const problems: string[] = [];
  if (!DAY.test(String(file?.updated))) problems.push('"updated" must be a date, YYYY-MM-DD');
  if (!DAY.test(String(file?.launch_goal))) problems.push('"launch_goal" must be a date, YYYY-MM-DD');
  if (!Array.isArray(file?.phases) || file.phases.length === 0) problems.push('"phases" must list the phases');
  else {
    const seen = new Set<string>();
    for (const p of file.phases) {
      if (!/^p[0-9]+b?$/.test(String(p.id)) || seen.has(p.id)) problems.push(`phase id ${JSON.stringify(p.id)} is missing, odd or repeated`);
      seen.add(p.id);
      if (!STATUSES.includes(p.status)) problems.push(`phase ${p.id}: status must be ${STATUSES.join(", ")}`);
      if (p.percent !== null && !(Number.isInteger(p.percent) && p.percent >= 0 && p.percent <= 100)) {
        problems.push(`phase ${p.id}: percent must be a whole number from 0 to 100, or null`);
      }
      const st = p.start;
      if (st !== undefined && st !== null) {
        const ok =
          (st.date && DAY.test(st.date)) ||
          (st.month && /^\d{4}-\d{2}$/.test(st.month)) ||
          (st.late_year && /^\d{4}$/.test(st.late_year)) ||
          (st.year && /^\d{4}$/.test(st.year) && (st.season === undefined || st.season === "spring" || st.season === "summer"));
        if (!ok) problems.push(`phase ${p.id}: start must be {"date"}, {"month"}, {"late_year"} or {"year"}, or null`);
      }
    }
  }
  if (!Array.isArray(file?.news)) problems.push('"news" must be a list');
  else {
    for (const n of file.news) {
      const ok = (n.date && DAY.test(n.date)) || (n.from && n.to && DAY.test(n.from) && DAY.test(n.to)) || (n.month && /^\d{4}-\d{2}$/.test(n.month));
      if (!ok) problems.push(`news ${n.id}: give "date", or "from" and "to", or "month"`);
    }
  }
  if (problems.length) throw new Error(`src/data/progress.json cannot be used:\n  - ${problems.join("\n  - ")}`);
  return file;
}

const utc = (d: string) => new Date(`${d}T12:00:00Z`);

/**
 * A news item's date in words: "November 10, 2026", "November 5 to November 8, 2026"
 * or "October 2026". A range uses `rangeTemplate` from the translation files
 * ("{from} to {to}" / "del {from} al {to}"), never a dash, which screen readers
 * may skip or read oddly (accessibility gate). The year is said once when both
 * ends share it.
 */
export function newsDate(n: ProgressNews, lang: string, rangeTemplate = "{from} – {to}"): string {
  const full = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  if (n.date) return full.format(utc(n.date));
  if (n.from && n.to) {
    const sameYear = n.from.slice(0, 4) === n.to.slice(0, 4);
    const from = sameYear ? new Intl.DateTimeFormat(lang, { month: "long", day: "numeric", timeZone: "UTC" }).format(utc(n.from)) : full.format(utc(n.from));
    return rangeTemplate.replace("{from}", from).replace("{to}", full.format(utc(n.to)));
  }
  return new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", timeZone: "UTC" }).format(utc(`${n.month}-15`));
}

/** The words a phase's start date needs, from the translation files. */
export interface StartWords {
  started: string;
  estimated: string;
  lateYear: string;
  /** "spring {year}" and "summer {year}" (owner, 2026-11-10). */
  spring: string;
  summer: string;
  noDate: string;
}

/**
 * A phase's start in words, beside its heading (owner, 2026-11-10): "Started
 * October 11, 2026.", "Estimated start: December 2026.", "Estimated start: spring
 * 2027.", "Estimated start: late 2027.", "Estimated start: 2028." or "No date yet." Never a dash.
 */
export function phaseStart(p: Pick<ProgressPhase, "start">, lang: string, w: StartWords): string {
  const st = p.start;
  if (!st) return w.noDate;
  if (st.date) {
    const date = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(utc(st.date));
    return w.started.replace("{date}", date);
  }
  let date = "";
  if (st.month) date = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", timeZone: "UTC" }).format(utc(`${st.month}-15`));
  else if (st.late_year) date = w.lateYear.replace("{year}", st.late_year);
  else if (st.season && st.year) date = (st.season === "spring" ? w.spring : w.summer).replace("{year}", st.year);
  else if (st.year) date = st.year;
  return w.estimated.replace("{date}", date);
}
