// Medicaid hours calculator (decision 0022; PROJECT.md 2, 5, 9).
// Pure maths, used by the page at build time and by the browser script.
// Nothing here stores, sends or logs anything.

/**
 * Every figure the calculator uses, in one place. Source:
 * docs/research/2026-11-medicaid-work-requirements.md (private repo), from
 * the federal rule 42 CFR 435.552 and PA DHS letter CM 710. Re-check against
 * Pennsylvania DHS before launch and whenever DHS publishes guidance, then
 * change `lastChecked`.
 */
export const MEDICAID = {
  /** When these figures were last checked against the sources. */
  lastChecked: "2026-11-07",
  /** Pennsylvania starts the rule on this date. */
  startDate: "2027-01-01",
  /** Federal minimum wage, dollars an hour. The rule uses the federal figure only. */
  minimumWage: 7.25,
  /** Hours needed in one month. */
  hoursNeeded: 80,
  /** Monthly income that meets the rule on its own: minimumWage × hoursNeeded. */
  incomeNeeded: 580,
  /** School below half-time: credit hours × this × weeksPerMonth. */
  hoursPerCredit: 3,
  weeksPerMonth: 4.33,
  /** Links out (decision 0022 point 7). */
  links: {
    dhs: "https://www.pa.gov/agencies/dhs/resources/medicaid/medicaid-changes",
    compass: "https://www.compass.dhs.pa.gov/",
    // Needs a human check before public launch: our link check could not open it (robots.txt refused).
    panavigate: "https://www.panavigate.org",
    benephilly: "https://www.phila.gov/programs/benephilly/",
    // Needs a human check before public launch: our link check could not open it (timed out).
    phlp: "https://www.phlp.org",
    cls: "https://clsphila.org",
  },
  /** Phone numbers, as dialled. */
  phones: {
    dhs: "877-395-8930",
    dhsPhiladelphia: "215-560-7226",
    hr1Faq: "1-877-883-6383",
    phlp: "1-800-274-3258",
    cls: "215-227-2400",
    benephilly: "800-994-5537",
  },
} as const;

export type SchoolChoice = "none" | "half_time" | "credits";

export interface MedicaidInput {
  /** "hours": paid work hours were given; "income": monthly income before taxes was given. */
  workMode: "hours" | "income";
  workHours: number;
  income: number;
  volunteerHours: number;
  programHours: number;
  school: SchoolChoice;
  credits: number;
}

export interface MedicaidResult {
  /** Hours from each activity, rounded down to the quarter hour (owner, 2026-11-08). */
  work: number;
  volunteer: number;
  program: number;
  school: number;
  /** Sum of the above; a quarter-hour figure. */
  total: number;
  /** 80 minus the total; 0 when reached. Always a quarter-hour figure. */
  stillNeeded: number;
  /** Total reached 80 hours. */
  hoursReached: boolean;
  /** Income was given and is at least $580. */
  incomeAlone: boolean;
  /** School at least half-time counts for the whole month on its own. */
  schoolAlone: boolean;
  /** Typed hour fields that were cut down to the quarter hour (for a note next to each). */
  roundedInputs: Array<"work" | "volunteer" | "program">;
}

/**
 * Rounds down to the quarter hour (15 minutes), never up, so nobody thinks
 * they have more hours than they do: 12.6 → 12.5, 51.96 → 51.75.
 */
export function quarterDown(n: number): number {
  return Math.floor(n * 4 + 1e-9) / 4;
}

export interface DurationWords {
  /** "{hours} hour" and "{hours} hours" (medicaid.duration.hours.one / .other). */
  hoursOne: string;
  hoursOther: string;
  /** "{minutes} minutes" (medicaid.duration.minutes). */
  minutes: string;
  /** "{hours} {minutes}" (medicaid.duration.both). */
  both: string;
}

/**
 * A quarter-hour amount in words: "12 hours 45 minutes", "12 hours",
 * "45 minutes", "1 hour", "0 hours". No decimals. `plural` picks one/other
 * for the language; `format` writes the whole number.
 */
export function formatDuration(
  n: number,
  words: DurationWords,
  plural: (count: number) => string,
  format: (count: number) => string = String,
): string {
  const quarters = Math.round(quarterDown(n) * 4);
  const hours = Math.floor(quarters / 4);
  const minutes = (quarters % 4) * 15;
  const h = (plural(hours) === "one" ? words.hoursOne : words.hoursOther).replace("{hours}", format(hours));
  const m = words.minutes.replace("{minutes}", format(minutes));
  if (minutes === 0) return h;
  if (hours === 0) return m;
  return words.both.replace("{hours}", h).replace("{minutes}", m);
}

/**
 * Reads what a person typed: "12", "12.5" or "12,5". Empty is 0. Anything
 * else, or a negative number, is null. A mark followed by exactly three
 * digits ("1,200", "1.200") is null too: it could be a thousands mark or a
 * decimal mark, and guessing wrong would change the result a thousandfold.
 */
export function readAmount(text: string): number | null {
  const t = text.trim().replace(/\s+/g, "").replace(/^\$/, "");
  if (t === "") return 0;
  // One decimal mark, comma or point; thousands marks are not accepted, to avoid misreading.
  if (!/^\d+([.,]\d+)?$/.test(t)) return null;
  if (/[.,]\d{3}$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

/**
 * Adds up the hours for one month (42 CFR 435.552). Every amount is rounded
 * down to the quarter hour: typed hours, income ÷ $7.25, and credits × 3 ×
 * 4.33. Quarters add up to quarters, so the total and the hours still needed
 * are quarter-hour figures too.
 */
export function computeHours(input: MedicaidInput): MedicaidResult {
  const m = MEDICAID;
  const roundedInputs: MedicaidResult["roundedInputs"] = [];
  const typed = (name: "work" | "volunteer" | "program", value: number) => {
    const q = quarterDown(value);
    if (q !== value) roundedInputs.push(name);
    return q;
  };
  const work = input.workMode === "income" ? quarterDown(input.income / m.minimumWage) : typed("work", input.workHours);
  const volunteer = typed("volunteer", input.volunteerHours);
  const program = typed("program", input.programHours);
  // Half-time or more counts on its own, so its hours are not added. Less than half-time: credits × 3 × 4.33.
  const school = input.school === "credits" ? quarterDown(input.credits * m.hoursPerCredit * m.weeksPerMonth) : 0;
  const total = work + volunteer + program + school;
  return {
    work,
    volunteer,
    program,
    school,
    total,
    stillNeeded: Math.max(0, m.hoursNeeded - total),
    hoursReached: total >= m.hoursNeeded,
    incomeAlone: input.workMode === "income" && input.income >= m.incomeNeeded,
    schoolAlone: input.school === "half_time",
    roundedInputs,
  };
}

/** The checklist as plain text, for copying into a phone note. */
export function checklistText(heading: string, items: string[]): string {
  return [heading, ...items.map((item) => `- ${item}`)].join("\n");
}

/**
 * Pennsylvania's start date in words for one language, with no weekday:
 * "January 1, 2027" / "1 de enero de 2027". From MEDICAID.startDate, never typed.
 */
export function startDateText(lang: string): string {
  return new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${MEDICAID.startDate}T12:00:00Z`),
  );
}
