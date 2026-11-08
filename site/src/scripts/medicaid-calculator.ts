// Medicaid hours calculator in the browser (decision 0022).
// Privacy: this file only reads the fields and writes to the page. It makes
// no network request, uses no browser storage and never changes the address
// bar. tests/built-pages.test.ts checks the built script for all of these.
import { computeHours, formatDuration, readAmount, type MedicaidInput, type SchoolChoice } from "../lib/medicaid.ts";

const root = document.getElementById("mh-calculator");

if (root) {
  const words = JSON.parse(root.dataset.words ?? "{}") as Record<string, string>;
  const lang = document.documentElement.lang;
  // Whole numbers only: hours are shown as "12 hours 45 minutes".
  const number = new Intl.NumberFormat(`${lang}-US`, { maximumFractionDigits: 0 });
  const plural = new Intl.PluralRules(lang);
  const results = document.getElementById("mh-results")!;
  const heading = document.getElementById("mh-results-heading")!;
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  const inputs = {
    work: field("mh-work"),
    income: field("mh-income"),
    volunteer: field("mh-volunteer"),
    program: field("mh-program"),
    credits: field("mh-credits"),
  };
  const radios = (name: string) => [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  const chosen = (name: string) => radios(name).find((r) => r.checked)?.value ?? "";
  const box = (input: HTMLInputElement) => root.querySelector<HTMLElement>(`[data-field="${input.id}"]`)!;

  const duration = (n: number) =>
    formatDuration(
      n,
      { hoursOne: words.hoursOne, hoursOther: words.hoursOther, minutes: words.minutes, both: words.both },
      (count) => plural.select(count),
      (count) => number.format(count),
    );

  function showFields(): void {
    const income = chosen("mh-work-mode") === "income";
    box(inputs.work).hidden = income;
    box(inputs.income).hidden = !income;
    box(inputs.credits).hidden = chosen("mh-school") !== "credits";
  }

  /** Reads one visible field; marks it when it is not a number. */
  function read(input: HTMLInputElement): number | null {
    const error = document.getElementById(`${input.id}-error`)!;
    if (box(input).hidden) return 0;
    const value = readAmount(input.value);
    const bad = value === null;
    input.setAttribute("aria-invalid", String(bad));
    error.hidden = !bad;
    error.textContent = bad ? words.invalid : "";
    return value;
  }

  function addUp(moveFocus: boolean): void {
    const values = Object.fromEntries(Object.entries(inputs).map(([k, input]) => [k, read(input)]));
    const firstBad = Object.entries(inputs).find(([k]) => values[k] === null);
    if (firstBad) {
      results.hidden = true;
      if (moveFocus) firstBad[1].focus();
      return;
    }
    const input: MedicaidInput = {
      workMode: chosen("mh-work-mode") === "income" ? "income" : "hours",
      workHours: values.work ?? 0,
      income: values.income ?? 0,
      volunteerHours: values.volunteer ?? 0,
      programHours: values.program ?? 0,
      school: (chosen("mh-school") || "none") as SchoolChoice,
      credits: values.credits ?? 0,
    };
    const r = computeHours(input);
    const out = (name: string) => results.querySelector<HTMLElement>(`[data-out="${name}"]`)!;
    for (const name of ["work", "volunteer", "program", "school", "total"] as const) {
      out(name).textContent = duration(r[name]);
    }
    // A note under each typed hour field that was rounded down to the quarter hour.
    const typedFields = { work: inputs.work, volunteer: inputs.volunteer, program: inputs.program };
    for (const [name, input] of Object.entries(typedFields)) {
      const note = document.getElementById(`${input.id}-note`)!;
      const rounded = r.roundedInputs.includes(name as "work" | "volunteer" | "program") && !box(input).hidden;
      note.hidden = !rounded;
      note.textContent = rounded ? words.roundedInput.replace("{time}", duration(r[name as "work"])) : "";
    }
    const workLabel = results.querySelector<HTMLElement>('[data-row="work"] dt')!;
    workLabel.textContent = (input.workMode === "income" ? workLabel.dataset.labelIncome : workLabel.dataset.labelHours) ?? "";
    results.querySelector<HTMLElement>('[data-row="school"]')!.hidden = input.school !== "credits";
    out("needed").textContent = r.hoursReached ? words.reached : words.needed.replace("{time}", duration(r.stillNeeded));
    results.querySelector<HTMLElement>('[data-note="income"]')!.hidden = !r.incomeAlone;
    results.querySelector<HTMLElement>('[data-note="school"]')!.hidden = !r.schoolAlone;
    results.hidden = false;
    if (moveFocus) heading.focus();
  }

  for (const r of [...radios("mh-work-mode"), ...radios("mh-school")]) {
    r.addEventListener("change", () => {
      showFields();
      if (!results.hidden) addUp(false);
    });
  }
  for (const input of Object.values(inputs)) {
    input.addEventListener("input", () => {
      if (!results.hidden) addUp(false);
    });
    // Enter adds up, the way a form would, without a form.
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addUp(true);
      }
    });
  }
  document.getElementById("mh-add")!.addEventListener("click", () => addUp(true));
  document.getElementById("mh-clear")!.addEventListener("click", () => {
    for (const input of Object.values(inputs)) {
      input.value = "";
      input.removeAttribute("aria-invalid");
      document.getElementById(`${input.id}-error`)!.hidden = true;
      const note = document.getElementById(`${input.id}-note`);
      if (note) note.hidden = true;
    }
    radios("mh-work-mode")[0].checked = true;
    radios("mh-school")[0].checked = true;
    showFields();
    results.hidden = true;
    inputs.work.focus();
  });

  // Checklist: print, or copy as plain text for a phone note.
  const actions = document.querySelector<HTMLElement>("[data-checklist-actions]");
  const status = document.getElementById("mh-copy-status")!;
  const copy = document.getElementById("mh-copy") as HTMLButtonElement | null;
  document.getElementById("mh-print")?.addEventListener("click", () => window.print());
  copy?.addEventListener("click", async () => {
    status.textContent = "";
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      // Some browsers never answer; after 2 seconds, treat it as not copied.
      await Promise.race([
        navigator.clipboard.writeText(copy.dataset.text ?? ""),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
      status.textContent = words.copied;
    } catch {
      // Select the list, so the person can copy it with their own phone's menu.
      const list = document.querySelector("#mh-checklist ul");
      const selection = window.getSelection();
      if (list && selection) {
        const range = document.createRange();
        range.selectNodeContents(list);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      status.textContent = words.copyFailed;
    }
  });
  if (actions) actions.hidden = false;

  showFields();
  root.hidden = false;
}
