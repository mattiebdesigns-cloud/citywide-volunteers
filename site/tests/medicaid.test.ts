// Medicaid hours calculator (decision 0022). Run from site/: npm test
// The maths, then the built page: privacy (no network, no storage, no form),
// printing, copying, links and figures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { astroBuild, buildFolder, removeFolder, site } from "./build-helper.ts";
import { MEDICAID, computeHours, formatDuration, quarterDown, readAmount, type MedicaidInput } from "../src/lib/medicaid.ts";

const none: MedicaidInput = {
  workMode: "hours",
  workHours: 0,
  income: 0,
  volunteerHours: 0,
  programHours: 0,
  school: "none",
  credits: 0,
};

// ---- Maths (42 CFR 435.552) ----

test("figures: $580 is the federal minimum wage times 80 hours", () => {
  assert.equal(MEDICAID.minimumWage * MEDICAID.hoursNeeded, MEDICAID.incomeNeeded);
  assert.equal(MEDICAID.startDate, "2027-01-01");
  assert.match(MEDICAID.lastChecked, /^\d{4}-\d{2}-\d{2}$/);
});

test("school below half-time: credits x 3 x 4.33, rounded down to the quarter hour (4 credits = 51.96 → 51 h 45 min)", () => {
  const r = computeHours({ ...none, school: "credits", credits: 4 });
  assert.equal(r.school, 51.75);
  assert.equal(r.total, 51.75);
  assert.equal(r.stillNeeded, 28.25);
  assert.equal(r.hoursReached, false);
  assert.equal(computeHours({ ...none, school: "credits", credits: 1 }).school, 12.75);
});

test("Philadelphia's example: $290 earned (40 h) + 10 volunteer + 30 work program = 80", () => {
  const r = computeHours({ ...none, workMode: "income", income: 290, volunteerHours: 10, programHours: 30 });
  assert.equal(r.work, 40);
  assert.equal(r.total, 80);
  assert.equal(r.stillNeeded, 0);
  assert.equal(r.hoursReached, true);
  assert.equal(r.incomeAlone, false);
});

test("everything rounds DOWN to the quarter hour; still needed is 80 minus that", () => {
  // 79.99 typed counts as 79 h 45 min, so 15 minutes are still needed.
  const short = computeHours({ ...none, workHours: 79.99 });
  assert.equal(short.work, 79.75);
  assert.equal(short.total, 79.75);
  assert.equal(short.stillNeeded, 0.25);
  assert.equal(short.hoursReached, false);
  assert.deepEqual(short.roundedInputs, ["work"]);
  // A typed 12.6 becomes 12.5, with a note; 12.5 itself is left alone.
  const typed = computeHours({ ...none, volunteerHours: 12.6, programHours: 12.5 });
  assert.equal(typed.volunteer, 12.5);
  assert.deepEqual(typed.roundedInputs, ["volunteer"]);
  // Income ÷ $7.25: $380 = 52.41 hours → 52 h 15 min.
  assert.equal(computeHours({ ...none, workMode: "income", income: 380 }).work, 52.25);
  assert.deepEqual(computeHours({ ...none, workMode: "income", income: 380 }).roundedInputs, []);
  assert.equal(quarterDown(0.24), 0);
  assert.equal(quarterDown(0.25), 0.25);
  assert.equal(quarterDown(79.999), 79.75);
  // Every amount is a whole number of quarter hours.
  for (const x of [0.1, 3.3, 12.99, 51.96, 79.99]) assert.equal((quarterDown(x) * 4) % 1, 0);
  const mixed = computeHours({ ...none, workHours: 40, volunteerHours: 20.25, programHours: 19.25 });
  assert.equal(mixed.total, 79.5);
  assert.equal(mixed.stillNeeded, 0.5);
});

test("hours in words: 12 hours 45 minutes, 12 hours, 45 minutes, 1 hour; no decimals", () => {
  const words = {
    hoursOne: "{hours} hour",
    hoursOther: "{hours} hours",
    minutes: "{minutes} minutes",
    both: "{hours} {minutes}",
  };
  const en = new Intl.PluralRules("en");
  const f = (n: number) => formatDuration(n, words, (c) => en.select(c));
  assert.equal(f(12.75), "12 hours 45 minutes");
  assert.equal(f(12), "12 hours");
  assert.equal(f(0.75), "45 minutes");
  assert.equal(f(1), "1 hour");
  assert.equal(f(1.5), "1 hour 30 minutes");
  assert.equal(f(0), "0 hours");
  assert.equal(f(12.99), "12 hours 45 minutes", "never rounded up");
  const es = new Intl.PluralRules("es");
  const esWords = { hoursOne: "{hours} hora", hoursOther: "{hours} horas", minutes: "{minutes} minutos", both: "{hours} {minutes}" };
  assert.equal(formatDuration(12.75, esWords, (c) => es.select(c)), "12 horas 45 minutos");
  assert.equal(formatDuration(1.25, esWords, (c) => es.select(c)), "1 hora 15 minutos");
});

test("income of $580 or more counts on its own; $579.99 does not", () => {
  assert.equal(computeHours({ ...none, workMode: "income", income: 580 }).incomeAlone, true);
  assert.equal(computeHours({ ...none, workMode: "income", income: 579.99 }).incomeAlone, false);
  // Work hours given instead of income: no income note.
  assert.equal(computeHours({ ...none, workHours: 580 }).incomeAlone, false);
});

test("school half-time or more counts on its own and adds no hours", () => {
  const r = computeHours({ ...none, school: "half_time", credits: 12 });
  assert.equal(r.schoolAlone, true);
  assert.equal(r.school, 0);
  assert.equal(r.total, 0);
});

test("reading what people type: 12, 12.5, 12,5, $40; never a guess", () => {
  assert.equal(readAmount(""), 0);
  assert.equal(readAmount(" 12 "), 12);
  assert.equal(readAmount("12.5"), 12.5);
  assert.equal(readAmount("12,5"), 12.5);
  assert.equal(readAmount("$40"), 40);
  for (const bad of ["-3", "abc", "1,200", "1.200", "12.5.1", "1e3", "12 hours"]) assert.equal(readAmount(bad), null, bad);
});

// ---- The built page ----

const dir = buildFolder();
process.on("exit", () => removeFolder(dir));
const out = astroBuild(dir, {});
const read = (p: string) => readFileSync(join(out, p), "utf8");
const en = JSON.parse(readFileSync(join(site, "src/i18n/en.json"), "utf8"));
const es = JSON.parse(readFileSync(join(site, "src/i18n/es.json"), "utf8"));

/** Every script the page runs: inline ones and each bundled file with the files it imports. */
function scriptsOf(html: string): string {
  const seen = new Set<string>();
  let code = [...html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const queue = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  while (queue.length) {
    const src = queue.shift()!;
    if (seen.has(src)) continue;
    seen.add(src);
    assert.ok(src.startsWith("/_astro/"), `script comes from this site: ${src}`);
    const file = join(out, src);
    assert.ok(existsSync(file), src);
    const text = readFileSync(file, "utf8");
    code += "\n" + text;
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']\.\/([^"']+)["']/g)) queue.push(`/_astro/${m[1]}`);
  }
  return code;
}

test("calculator page: no network, no storage, no address-bar changes, no form", () => {
  for (const lang of ["en", "es"]) {
    const html = read(`${lang}/medicaid-hours/index.html`);
    const code = scriptsOf(html);
    assert.ok(code.includes("mh-calculator"), "the calculator script is on the page");
    for (const banned of [
      "fetch",
      "XMLHttpRequest",
      "sendBeacon",
      "WebSocket",
      "EventSource",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "cookie",
      "pushState",
      "replaceState",
      "location",
    ]) {
      assert.ok(!code.includes(banned), `${lang}: no ${banned} in any script on the page`);
    }
    // No form: pressing Enter can never put numbers in the address bar.
    assert.doesNotMatch(html, /<form/);
    // The frame's storage scripts are left out on this page.
    assert.doesNotMatch(html, /id="live-listings"|data-store-lang="[^"]*"[^>]*>[\s\S]*storeLanguage/);
    // No third-party anything.
    assert.doesNotMatch(html, /<script[^>]*src="https?:/);
    assert.doesNotMatch(html, /<img|<iframe/);
  }
});

test("calculator page: exemptions come first, as information only", () => {
  const html = read("en/medicaid-hours/index.html");
  const exempt = html.slice(html.indexOf('id="mh-exempt"'), html.indexOf('id="mh-calc"'));
  assert.ok(html.indexOf('id="mh-exempt"') < html.indexOf('id="mh-calc"'));
  assert.doesNotMatch(exempt, /<input|<select|<button/);
  const plain = exempt.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'");
  for (const text of Object.values(en.medicaid.exempt) as string[]) {
    assert.ok(plain.includes(text.replace("{term}", en.medicaid.foster_term)), text);
  }
});

test("calculator page: never asks for a name, case number, health, status, immigration or jail history", () => {
  const html = read("en/medicaid-hours/index.html");
  const calc = html.slice(html.indexOf('id="mh-calculator"'), html.indexOf('id="mh-results"'));
  const ids = [...calc.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ["mh-credits", "mh-income", "mh-program", "mh-volunteer", "mh-work"]);
  const radios = [...calc.matchAll(/<input type="radio" name="([^"]+)" value="([^"]+)"/g)].map((m) => `${m[1]}=${m[2]}`);
  assert.deepEqual(radios, [
    "mh-work-mode=hours",
    "mh-work-mode=income",
    "mh-school=none",
    "mh-school=half_time",
    "mh-school=credits",
  ]);
  for (const input of calc.matchAll(/<input[^>]*>/g)) assert.match(input[0], /type="radio"|autocomplete="off"/);
});

test("calculator page: checklist prints alone and copies as plain text, with a spoken confirmation", () => {
  for (const [lang, words] of [["en", en], ["es", es]] as const) {
    const html = read(`${lang}/medicaid-hours/index.html`);
    const checklist = html.slice(html.indexOf('id="mh-checklist"'), html.indexOf("</section>", html.indexOf('id="mh-checklist"')));
    assert.doesNotMatch(checklist.slice(0, checklist.indexOf(">")), /no-print/, "the checklist itself prints");
    const plain = [words.medicaid.checklist_heading, ...Object.values(words.medicaid.checklist).map((i) => `- ${i}`)].join("\n");
    const dataText = checklist.match(/data-text="([^"]*)"/)?.[1].replace(/&#10;/g, "\n").replace(/&#39;/g, "'");
    assert.equal(dataText, plain);
    assert.match(checklist, /id="mh-copy-status"[^>]*role="status"|role="status"[^>]*id="mh-copy-status"/);
    assert.ok(html.includes(`&quot;copied&quot;:&quot;${words.medicaid.copied}`) || html.includes(words.medicaid.copied));
  }
  // The print rule hides everything except the checklist.
  const css = readFileSync(join(site, "src/pages/[lang]/medicaid-hours/index.astro"), "utf8");
  const print = css.slice(css.indexOf("@media print"));
  assert.match(print, /body > \*:not\(main\)/);
  assert.match(print, /\.no-print\s*\{\s*display: none !important/);
  for (const id of ["mh-exempt", "mh-calc", "mh-month", "mh-help"]) {
    const html = read("en/medicaid-hours/index.html");
    const at = html.lastIndexOf("<section", html.indexOf(`id="${id}"`));
    assert.match(html.slice(at, html.indexOf(">", at)), /no-print/, `${id} is hidden in print`);
  }
});

test("calculator page: disclaimers, links, phone numbers and figures from the settings block", () => {
  for (const [lang, words] of [["en", en], ["es", es]] as const) {
    const html = read(`${lang}/medicaid-hours/index.html`).replace(/&#39;/g, "'");
    for (const key of ["private", "only_dhs", "answer_letters", "not_proof"]) assert.ok(html.includes(words.medicaid[key]), key);
    for (const url of Object.values(MEDICAID.links)) assert.ok(html.includes(`href="${url}"`), url);
    // Every number is a tap-to-call link, written with plain hyphens, kept on one line.
    assert.doesNotMatch(html, /\u2011/);
    for (const phone of Object.values(MEDICAID.phones)) {
      const href = `tel:+1${phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")}`;
      assert.match(html, new RegExp(`<a[^>]*href="${href.replace("+", "\\+")}"[^>]*>[\\s\\S]*?${phone}`), `tel link ${phone}`);
    }
    assert.ok(html.includes("$580"), "$580");
    assert.ok(html.includes("$7.25"), "$7.25");
    assert.ok(html.includes("2027"), "start year");
    assert.ok(html.includes(lang === "en" ? "November 7, 2026" : "7 de noviembre de 2026"), "last checked date");
    // Linked from the footer (owner, 2026-11-10: back in the footer).
    const home = read(`${lang}/index.html`);
    assert.match(home.slice(home.indexOf("<footer")), new RegExp(`href="/${lang}/medicaid-hours/"`), "footer link");
  }
});

test("sensitive-events gate: number fields have autocomplete off, spellcheck off and no name", () => {
  for (const lang of ["en", "es"]) {
    const html = read(`${lang}/medicaid-hours/index.html`);
    const fields = [...html.matchAll(/<input(?![^>]*type="radio")[^>]*>/g)].map((m) => m[0]);
    assert.equal(fields.length, 5, `${lang}: five number fields`);
    for (const f of fields) {
      assert.match(f, /autocomplete="off"/, f);
      assert.match(f, /spellcheck="false"/, f);
      assert.doesNotMatch(f, /\sname=/, f);
    }
  }
});

test("sensitive-events gate: the copied checklist never holds a typed figure", () => {
  // The copy button copies only its fixed data-text, built from the language file.
  const script = readFileSync(join(site, "src/scripts/medicaid-calculator.ts"), "utf8");
  const calls = [...script.matchAll(/writeText\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(calls, ['copy.dataset.text ?? ""']);
  assert.doesNotMatch(script, /dataset\.text\s*=|setAttribute\(\s*["']data-text/, "the copy text is never changed in the browser");
  for (const lang of ["en", "es"]) {
    const html = read(`${lang}/medicaid-hours/index.html`);
    const text = html.match(/id="mh-copy"[^>]*data-text="([^"]*)"|data-text="([^"]*)"[^>]*id="mh-copy"/);
    assert.ok(text, `${lang}: copy button text`);
    assert.doesNotMatch(text[1] ?? text[2], /\d/, `${lang}: no numbers at all in the copied text`);
  }
});

test("one decimal mark on the Spanish page, and no decimals except dollars (accessibility gate; owner)", () => {
  const html = read("es/medicaid-hours/index.html");
  const words = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ");
  // No decimals at all in the page's text, apart from dollar amounts.
  assert.doesNotMatch(words.replace(/\$\d+(\.\d+)?/g, ""), /\d[.,]\d/);
  assert.ok(es.medicaid.invalid.includes("12.5") && !es.medicaid.invalid.includes("12,5"), "the example in the error message is 12.5");
  // The results use the same US mark in Spanish.
  assert.match(readFileSync(join(site, "src/scripts/medicaid-calculator.ts"), "utf8"), /new Intl\.NumberFormat\(`\$\{lang\}-US`/);
  assert.equal(new Intl.NumberFormat("es-US", { maximumFractionDigits: 2 }).format(12.99), "12.99");
  // People may still type a comma.
  assert.equal(readAmount("12,5"), 12.5);
});

test("English words on the Spanish page carry lang=en: (foster care)", () => {
  const html = read("es/medicaid-hours/index.html");
  assert.match(html, new RegExp(`\\(<span lang="en"[^>]*>${es.medicaid.foster_term}</span>\\)`));
  assert.ok(!JSON.stringify(es.medicaid.exempt).includes("foster care"), "the English term is only in its own slot");
});
