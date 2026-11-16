// Decisions 0062 (volunteer time notes) and 0063 (published tips), with the
// place id from decision 0063 (PROJECT.md 2, 8.1, 11.1). The two public
// functions are read with a mocked fetch, and for the built pages from a
// local test server, so no test reaches the real database.
// Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { astroBuildAsync, buildFolder, removeFolder } from "./build-helper.ts";
import { addressNorm, placeId } from "../src/lib/ids.ts";
import { NO_NOTES, fetchPublicNotes, isPublicKey, parseTimeNotes, parseTips, publicApi, timeNoteFor, tipsFor } from "../src/lib/public-notes.ts";
import { prepareListings } from "../src/lib/prepare.ts";
import { createI18n } from "../src/i18n/index.ts";
import type { EventsFile, SiteSettings } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const settings: SiteSettings = JSON.parse(readFileSync(join(site, "settings.example.json"), "utf8"));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));
const i18n = createI18n(settings, Object.fromEntries(["en", "es"].map((c) => [c, JSON.parse(readFileSync(join(site, `src/i18n/${c}.json`), "utf8"))])));
const tr = { en: i18n.translator("en"), es: i18n.translator("es") } as Record<string, ReturnType<typeof i18n.translator>>;
const TZ = settings.site.timezone;
const MY = "https://my.example.org";

// Fake keys for tests only: they open nothing.
const jwt = (payload: object) => ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "c2ln"].join(".");
const ANON = jwt({ role: "anon", iss: "test" });
const SERVICE = jwt({ role: "service_role", iss: "test" });
const on = (extra: Record<string, string> = {}) => ({ ...settings, accounts: { url: MY, public_api_url: "https://api.example.org", public_api_key: ANON, ...extra } });

const hex = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const orgId = (name: string) => `o-${hex(`org ${name}`)}`;
const seriesId = (id: string) => `s-${hex(`series ${id}`)}`;

test("place_id matches the reference recipe (schema/listing_ids.py, private repo)", () => {
  // Vectors computed with schema/listing_ids.py on 2026-11-16.
  const org = "o-f110292c53942785";
  assert.equal(placeId(org, "123 Main St, Springfield"), "p-54101fe2e82647ab");
  assert.equal(placeId(org, "  Café Ñandú & Straße 5B "), "p-076f7bfe384596d7");
  assert.equal(placeId(org, "ﬁfth Ave #2"), "p-8e0b476c28e3d563");
  assert.equal(addressNorm("  Café Ñandú & Straße 5B "), "cafe nandu and strasse 5b");
  assert.equal(placeId(org, ""), null);
  assert.equal(placeId(org, null), null);
  assert.equal(placeId(null, "1 Main"), null);
  assert.equal(placeId("o-bad", "1 Main"), null);
});

test("public API: off unless accounts and both settings are set; only a public key; https only (localhost for tests)", () => {
  assert.equal(publicApi(settings), null);
  assert.equal(publicApi({ accounts: { url: "", public_api_url: "https://api.example.org", public_api_key: ANON } }), null);
  assert.equal(publicApi({ accounts: { url: MY, public_api_url: "", public_api_key: ANON } }), null);
  assert.equal(publicApi({ accounts: { url: MY, public_api_url: "https://api.example.org", public_api_key: "" } }), null);
  assert.deepEqual(publicApi(on()), { url: "https://api.example.org", key: ANON });
  assert.ok(publicApi(on({ public_api_url: "http://127.0.0.1:5432" })));
  for (const bad of ["http://api.example.org", "https://api.example.org/", "https://api.example.org/rest", "javascript:x"]) {
    assert.throws(() => publicApi(on({ public_api_url: bad })), /public_api_url/, bad);
  }
  // A service or secret key stops the build, and the message never repeats the key.
  for (const bad of [SERVICE, "sb_secret_abc123", "not-a-key"]) {
    assert.throws(
      () => publicApi(on({ public_api_key: bad })),
      (err: Error) => /public_api_key/.test(err.message) && !err.message.includes(bad),
    );
  }
  assert.ok(isPublicKey(ANON) && isPublicKey("sb_publishable_abc_123") && !isPublicKey(SERVICE));
});

test("fetch: POSTs to both public functions with the public key; a failure or bad data shows nothing and never throws", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; method: string }> = [];
  const rows: Record<string, unknown> = {
    public_tips: [
      { tip_key: "s-0123456789abcdef", text: " Bring gloves. ", language: "en" },
      { tip_key: "p-0123456789abcdef", text: "Busque la puerta roja.", language: "es" },
      { tip_key: "nope", text: "bad key", language: "en" },
      { tip_key: "s-0123456789abcdef", text: "x".repeat(501), language: "en" },
      { tip_key: "s-0123456789abcdef", text: "wrong language", language: "fr" },
      { tip_key: "s-0123456789abcdef", text: "", language: "en" },
      null,
    ],
    public_time_notes: [
      { target_id: "s-0123456789abcdef", start_time: "18:30:00" },
      { target_id: "abc123", start_time: "9:00" },
      { target_id: "Bad_Id", start_time: "10:00" },
      { target_id: "def456", start_time: "07:15" },
    ],
  };
  const ok = async (url: string, init: { method: string; headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers, method: init.method });
    return { ok: true, status: 200, json: async () => rows[url.split("/").pop()!] };
  };
  const notes = await fetchPublicNotes(on(), ok);
  assert.deepEqual(calls.map((c) => c.url).sort(), ["https://api.example.org/rest/v1/rpc/public_time_notes", "https://api.example.org/rest/v1/rpc/public_tips"]);
  for (const c of calls) {
    assert.equal(c.method, "POST");
    assert.equal(c.headers.apikey, ANON);
    assert.equal(c.headers.Authorization, `Bearer ${ANON}`);
  }
  assert.deepEqual(notes.tips.get("s-0123456789abcdef"), [{ text: "Bring gloves.", language: "en" }]);
  assert.deepEqual(notes.tips.get("p-0123456789abcdef"), [{ text: "Busque la puerta roja.", language: "es" }]);
  assert.equal(notes.tips.size, 2);
  assert.deepEqual([...notes.timeNotes], [["s-0123456789abcdef", "18:30"], ["def456", "07:15"]]);

  // Accounts off: no request at all.
  calls.length = 0;
  assert.equal(await fetchPublicNotes(settings, ok), NO_NOTES);
  assert.equal(calls.length, 0);
  // Network error, error status, or not a list: empty, no throw.
  const failures = [
    async () => {
      throw new Error("offline");
    },
    async () => ({ ok: false, status: 500, json: async () => [] }),
    async () => ({ ok: true, status: 200, json: async () => ({ message: "not a list" }) }),
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }),
  ];
  for (const f of failures) {
    const n = await fetchPublicNotes(on(), f);
    assert.equal(n.tips.size + n.timeNotes.size, 0);
  }
  assert.equal(parseTips([{ tip_key: "s-0123456789abcdef", text: "ok", language: "en" }], ["es"]).size, 0);
  assert.equal(parseTimeNotes([{ target_id: "a", start_time: "24:00" }]).size, 0);
});

test("which tips and which time note a listing gets", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const events = structuredClone(sample);
  for (const e of events.events) e.org_id = orgId(e.org_name);
  const rec = events.events.find((e) => e.recurring)!;
  rec.series_id = seriesId(rec.id);
  const prepared = prepareListings(events, settings, { now });
  const byId = (id: string) => prepared.find((e) => e.id === id)!;
  const recurring = byId(rec.id);
  const sensitive = prepared.find((e) => e.sensitive)!;
  const place = placeId(recurring.org_id, recurring.address)!;
  const notes = {
    tips: new Map([
      [recurring.series_id!, [{ text: "Bring gloves.", language: "en" }]],
      [place, [{ text: "Bring gloves.", language: "en" }, { text: "Park on the side street.", language: "en" }]],
    ]),
    timeNotes: new Map([
      [recurring.series_id!, "18:30"],
      [sensitive.id, "20:00"],
      [byId("5a8e2c71d4b09f36").id, "14:00"],
    ]),
  };
  // Series and place tips, each once.
  assert.deepEqual(tipsFor(notes, recurring).map((t) => t.text), ["Bring gloves.", "Park on the side street."]);
  assert.deepEqual(tipsFor(NO_NOTES, recurring), []);
  // Time note: by series; same local date, 30 minutes after the host's 6:00 PM.
  assert.equal(timeNoteFor(notes, recurring, TZ)!.getTime(), Date.parse(recurring.start) + 30 * 60_000);
  // Never on a sensitive listing; none when it matches the host's own time.
  assert.equal(timeNoteFor(notes, sensitive, TZ), null);
  assert.equal(timeNoteFor(notes, byId("5a8e2c71d4b09f36"), TZ), null);
});

// ---- Built pages, read from a local test server ----

/** Text as Astro writes it into a page (it encodes these five characters). */
const enc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const shift = (iso: string) => iso.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);

function htmlFiles(out: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) found.push(p);
    }
  };
  walk(out);
  return found;
}

test("built pages: tips closed by default only where published, escaped; time note beside the time, never on a sensitive listing; a failing read still builds", async () => {
  const events = structuredClone(sample);
  for (const e of events.events) {
    e.start = shift(e.start);
    if (e.end) e.end = shift(e.end);
    e.org_id = orgId(e.org_name);
  }
  const rec = events.events.find((e) => e.recurring)!;
  rec.series_id = seriesId(rec.id);
  const sens = events.events.find((e) => e.sensitive)!;
  sens.address = "1 Sample Way";
  const xss = events.events.find((e) => e.id === "b74d0e2a19c6f851")!;
  const same = events.events.find((e) => e.id === "5a8e2c71d4b09f36")!;
  let mode: "ok" | "fail" = "ok";
  let hits = 0;
  let badKey = 0;
  const server = createServer((req, res) => {
    hits += 1;
    if (req.method !== "POST" || req.headers.apikey !== ANON || req.headers.authorization !== `Bearer ${ANON}`) badKey += 1;
    if (mode === "fail") {
      res.writeHead(500).end("{}");
      return;
    }
    const body =
      req.url === "/rest/v1/rpc/public_tips"
        ? [
            { tip_key: rec.series_id, text: "Bring gloves.", language: "en" },
            { tip_key: placeId(sens.org_id, sens.address), text: "Look for the red door.", language: "en" },
            { tip_key: placeId(xss.org_id, xss.address), text: "<script>alert(1)</script>", language: "en" },
          ]
        : req.url === "/rest/v1/rpc/public_time_notes"
          ? [
              { target_id: rec.series_id, start_time: "18:30:00" },
              { target_id: sens.id, start_time: "19:30:00" },
              { target_id: same.id, start_time: "14:00:00" },
            ]
          : null;
    res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" }).end(JSON.stringify(body ?? {}));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dir = buildFolder();
  try {
    const write = (accounts: string) => {
      writeFileSync(join(dir, "events.json"), JSON.stringify(events));
      writeFileSync(join(dir, "settings.json"), JSON.stringify({ ...settings, accounts: { url: accounts, public_api_url: api, public_api_key: ANON } }));
      return { PV_EVENTS: join(dir, "events.json"), PV_SETTINGS: join(dir, "settings.json") };
    };
    const out = await astroBuildAsync(join(dir), write(MY));
    assert.equal(badKey, 0, "every request used POST and the public key");
    assert.equal(hits, 2, "each function read once per build");
    const page = (lang: string, id: string) => readFileSync(join(out, lang, "listing", id, "index.html"), "utf8");
    for (const lang of ["en", "es"]) {
      const t = tr[lang];
      // Recurring: series tip, closed by default; time note beside the host's time.
      const r = page(lang, rec.id);
      const details = r.match(/<details[^>]*data-tips[^>]*>/)!;
      assert.ok(details, `${lang}: tips section`);
      assert.doesNotMatch(details[0], /\sopen/, `${lang}: closed by default`);
      assert.ok(r.includes(`>${enc(t.t("tips.summary"))}</summary>`), `${lang}: summary words`);
      assert.ok(r.includes(enc(t.t("tips.about"))), `${lang}: what a tip is and is not`);
      assert.match(r, /<span lang="en"[^>]*>Bring gloves\.<\/span>/);
      const when = r.slice(r.indexOf(`<time datetime="${rec.start}"`), r.indexOf("</dd>", r.indexOf(`<time datetime="${rec.start}"`)));
      const at = t.formatTime(new Date(Date.parse(rec.start) + 30 * 60_000));
      assert.ok(when.includes("data-time-note"), `${lang}: time note beside the time`);
      assert.ok(when.includes(enc(t.t("listing.time_note", { time: at }))), `${lang}: note says ${at}`);
      // Sensitive: its place tip shows (a tip names no one); its time note never does.
      const s = page(lang, sens.id);
      assert.ok(s.includes("Look for the red door."), `${lang}: sensitive listing's tip`);
      assert.ok(!s.includes("data-time-note"), `${lang}: no time note on a sensitive listing`);
      // A tip is text, never markup.
      const x = page(lang, xss.id);
      assert.ok(x.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !x.includes("<script>alert(1)"), `${lang}: escaped`);
      // A note equal to the host's time, and a listing with nothing published: neither part.
      const p = page(lang, same.id);
      assert.ok(!p.includes("data-time-note") && !p.includes("data-tips"), `${lang}: nothing for ${same.id}`);
      assert.ok(!page(lang, "8c21e5d94f0a7b33").includes("data-tips"));
    }

    // The read fails: the build still passes, with no tips and no notes anywhere.
    mode = "fail";
    removeFolder(join(dir, "dist"));
    const out2 = await astroBuildAsync(dir, write(MY));
    for (const f of htmlFiles(out2)) assert.doesNotMatch(readFileSync(f, "utf8"), /data-tips|data-time-note/, f);

    // Accounts off: nothing is read at all.
    hits = 0;
    removeFolder(join(dir, "dist"));
    const out3 = await astroBuildAsync(dir, write(""));
    assert.equal(hits, 0, "no request with accounts off");
    for (const f of htmlFiles(out3)) assert.doesNotMatch(readFileSync(f, "utf8"), /data-tips|data-time-note/, f);
  } finally {
    server.close();
    removeFolder(dir);
  }
});
