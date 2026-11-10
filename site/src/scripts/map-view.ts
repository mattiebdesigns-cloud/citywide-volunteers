// The "List | Map" switch, the day picker and the details panel
// (decision 0035; components/MapView.astro). Small, and loaded with the
// page; the map itself (map-engine.ts, with MapLibre) loads only when the
// person first chooses Map.
//
// Talks to the filter scripts through two events on document:
//   pv:mapchange   (sent here)  the map was turned on or off, or its day changed;
//                               the filters read data-map-on and data-map-day
//                               from the map section and show the list again.
//   pv:listupdated (sent by filters.ts and flexible-filters.ts) the list changed;
//                               the map shows the cards that are now visible.
//
// Privacy: nothing here sends a request about a listing, stores anything,
// or changes the address. The day and the map's on/off state live in this
// page's memory only. "Near me" asks for the location only when tapped.
import { localParts } from "../lib/time.ts";
import {
  clampDay,
  dayInWords,
  dayRange,
  directionsUrl,
  isApple,
  joinParts,
  MAP_HASH,
  stepDay,
  templateParts,
  type Place,
} from "../lib/map.ts";
import type { MapConfig } from "../lib/map-build.ts";
import type { Engine, EngineItem } from "./map-engine.ts";

const root = document.querySelector<HTMLElement>("[data-map-root]");
const switcher = document.querySelector<HTMLElement>("[data-map-switch]");
const list = document.getElementById("listing-list");

interface Item extends EngineItem {
  title: string;
  titleLang: string;
  when: string;
  place: string;
  href: string;
  address: string | null;
  /** The title is a machine translation (decision 0036). */
  translated: boolean;
}

if (root && switcher && list) {
  const config = JSON.parse(root.dataset.config ?? "{}") as MapConfig;
  const words = JSON.parse(root.dataset.words ?? "{}") as Record<string, string> & { maplibre: Record<string, string> };
  const lang = document.documentElement.lang;
  const pluralRules = new Intl.PluralRules(lang);
  const number = new Intl.NumberFormat(lang);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);

  const canvas = q<HTMLElement>("[data-map-canvas]")!;
  const message = q<HTMLElement>("[data-map-message]")!;
  const noLocation = q<HTMLElement>("[data-map-nolocation]")!;
  const status = q<HTMLElement>("[data-map-status]");
  const nearStatus = q<HTMLElement>("[data-map-near-status]")!;
  const detail = q<HTMLElement>("[data-map-detail]")!;
  const detailHeading = q<HTMLElement>("[data-map-detail-heading]")!;
  const detailList = q<HTMLElement>("[data-map-detail-list]")!;
  const detailExtra = q<HTMLElement>("[data-map-detail-extra]")!;
  const countEl = document.getElementById("results-count");
  const buttons = [...switcher.querySelectorAll<HTMLButtonElement>("[data-map-view]")];

  const fill = (text: string, vars: Record<string, string | number>) =>
    text.replace(/\{([a-z_]+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
  const plural = (one: string, other: string, count: number, vars: Record<string, string | number> = {}) =>
    fill(pluralRules.select(count) === "one" ? one : other, { ...vars, count: number.format(count) });

  let on = false;
  let day = "";
  let engine: Engine | null = null;
  let loading: Promise<Engine | null> | null = null;
  let lastKey = "";
  let openFrom: HTMLButtonElement | null = null;

  // ---- The day (day map only) ----
  const dayText = q<HTMLElement>("[data-map-day-text]");
  const prev = q<HTMLButtonElement>("[data-map-prev]");
  const next = q<HTMLButtonElement>("[data-map-next]");
  const dayInput = q<HTMLInputElement>("[data-map-day-input]");

  function today(): string {
    return localParts(Date.now(), config.timezone).date;
  }
  function range() {
    const dates = [...list!.querySelectorAll<HTMLElement>("li[data-date]")].map((li) => li.dataset.date ?? "");
    return dayRange(today(), dates);
  }
  function showDay(): void {
    if (config.mode !== "day" || !dayText || !prev || !next) return;
    const r = range();
    day = clampDay(day || r.first, r);
    dayText.textContent = dayInWords(day, lang);
    const before = stepDay(day, -1, r);
    const after = stepDay(day, 1, r);
    // aria-disabled, not disabled, so focus stays on the button at either end.
    prev.setAttribute("aria-disabled", String(before === null));
    next.setAttribute("aria-disabled", String(after === null));
    prev.querySelector("[data-map-prev-words]")!.textContent = fill(words.previous, { date: dayInWords(before ?? day, lang) });
    next.querySelector("[data-map-next-words]")!.textContent = fill(words.next, { date: dayInWords(after ?? day, lang) });
    if (dayInput) {
      dayInput.min = r.first;
      dayInput.max = r.last;
      dayInput.value = day;
    }
    root!.dataset.mapDay = day;
  }
  function changeDay(to: string | null): void {
    if (!to || to === day) return;
    day = to;
    showDay();
    // Focus stays where it is; the new count is announced (accessibility condition 6).
    document.dispatchEvent(new CustomEvent("pv:mapchange"));
  }
  prev?.addEventListener("click", () => changeDay(stepDay(day, -1, range())));
  next?.addEventListener("click", () => changeDay(stepDay(day, 1, range())));
  dayInput?.addEventListener("change", () => {
    if (dayInput.value) changeDay(clampDay(dayInput.value, range()));
  });

  // ---- Turning the map on and off ----
  function setOn(value: boolean): void {
    if (value === on) return;
    on = value;
    root!.hidden = !on;
    root!.dataset.mapOn = String(on);
    for (const b of buttons) b.setAttribute("aria-pressed", String((b.dataset.mapView === "map") === on));
    // On the day map, the map's own announcement says the count and the day, so the list count stays quiet.
    if (config.mode === "day" && countEl) {
      if (on) countEl.setAttribute("aria-live", "off");
      else countEl.removeAttribute("aria-live");
    }
    for (const line of list!.querySelectorAll<HTMLElement>("[data-map-approx-line]")) line.hidden = !on;
    if (on) {
      showDay();
      lastKey = "";
      start();
    } else closeDetail(false);
    document.dispatchEvent(new CustomEvent("pv:mapchange"));
  }
  for (const b of buttons) b.addEventListener("click", () => setOn(b.dataset.mapView === "map"));

  function start(): void {
    if (loading) return;
    message.textContent = words.loading;
    loading = loadStylesheet(config.css)
      .then(() => import("./map-engine.ts"))
      .then(({ createEngine }) =>
        createEngine(canvas, config, lang, words.maplibre, {
          placeName,
          clusterName: (count) => plural(words.clusterOne, words.clusterOther, count),
          onOpen: openDetail,
          onFail: failed,
        }),
      )
      .catch(() => null)
      .then((made) => {
        engine = made;
        if (!made) failed();
        else message.textContent = config.basemap ? "" : words.noStreetMap;
        // The list may have been read before the map existed: draw and fit it now.
        lastKey = "";
        showList();
        return made;
      });
  }
  /** MapLibre's stylesheet, from this site, added once when the map first opens. */
  function loadStylesheet(href: string): Promise<void> {
    return new Promise((done) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.addEventListener("load", () => done());
      link.addEventListener("error", () => done()); // the map still works, a little less tidy
      document.head.append(link);
    });
  }

  function failed(): void {
    message.textContent = words.failed;
    q<HTMLElement>(".map__frame")?.setAttribute("hidden", "");
    q<HTMLElement>(".map__near")?.setAttribute("hidden", "");
  }

  // ---- What the map shows: the cards visible in the list ----
  function visibleItems(): { items: Item[]; missing: number } {
    const items: Item[] = [];
    let missing = 0;
    for (const li of list!.querySelectorAll<HTMLElement>(":scope > li[data-id]")) {
      if (li.hidden) continue;
      const d = li.dataset;
      if (!d.lat || !d.lon) {
        missing += 1;
        continue;
      }
      items.push({
        li,
        id: d.id ?? "",
        lat: Number(d.lat),
        lon: Number(d.lon),
        approximate: d.approx === "true",
        title: d.mapTitle ?? "",
        titleLang: d.mapLang ?? lang,
        when: d.mapWhen ?? "",
        place: d.mapPlace ?? "",
        href: d.mapHref ?? "",
        address: d.mapAddress ?? null,
        translated: d.mapTranslated === "true",
      });
    }
    return { items, missing };
  }

  function showList(): void {
    if (!on) return;
    const { items, missing } = visibleItems();
    const shown = items.length + missing;
    noLocation.hidden = missing === 0;
    noLocation.textContent = missing ? plural(words.noLocationOne, words.noLocationOther, missing) : "";
    const key = items.map((i) => i.id).join(",") + `|${day}`;
    if (status && key !== lastKey) {
      const announce = plural(words.announceOne, words.announceOther, shown, { date: dayInWords(day, lang) });
      status.textContent = missing ? `${announce} ${noLocation.textContent}` : announce;
    }
    // The open details may no longer match the list.
    if (key !== lastKey) closeDetail(false);
    const changed = key !== lastKey;
    lastKey = key;
    engine?.update(items, changed);
  }
  /** Flexible opportunities have no day: with Kind set to Flexible, the home page offers no map (the Flexible page has its own). */
  function syncSwitch(): void {
    switcher!.hidden = config.mode === "day" && list!.dataset.kind === "flexible";
    if (switcher!.hidden && on) setOn(false);
  }
  document.addEventListener("pv:listupdated", () => {
    syncSwitch();
    showList();
  });

  // ---- Names ----
  function placeName(place: Place<EngineItem>): Array<{ text: string; lang?: string }> {
    const items = place.items as Item[];
    let parts: Array<{ text: string; lang?: string }>;
    if (items.length === 1) {
      const it = items[0];
      parts = it.when
        ? templateParts(words.pin, { title: { text: it.title, lang: it.titleLang }, time: { text: it.when } })
        : [{ text: it.title, lang: it.titleLang }];
    } else parts = [{ text: plural(words.placeOne, words.placeOther, items.length) }];
    if (!place.approximate) return parts;
    // "{name}. Approximate area.": the name's pieces keep their own languages.
    const out: Array<{ text: string; lang?: string }> = [];
    for (const piece of templateParts(words.withApprox, { name: { text: "\u0000" } })) {
      if (piece.text === "\u0000") out.push(...parts);
      else out.push(piece);
    }
    return joinParts(out);
  }

  // ---- The details panel ----
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function highlight(items: Item[]): void {
    for (const li of list!.querySelectorAll("li.is-map-selected")) li.classList.remove("is-map-selected");
    for (const it of items) it.li.classList.add("is-map-selected");
  }

  function openDetail(place: Place<EngineItem>, from: HTMLButtonElement): void {
    const items = place.items as Item[];
    openFrom = from;
    detailHeading.replaceChildren();
    if (items.length === 1) {
      const span = el("span", items[0].title);
      span.lang = items[0].titleLang;
      detailHeading.append(span);
    } else detailHeading.textContent = plural(words.placeOne, words.placeOther, items.length);

    const rows: HTMLElement[] = [];
    for (const it of items) {
      const row = el("li", undefined, "map-detail__item");
      const link = el("a", undefined, "map-detail__title");
      link.href = it.href;
      const title = el("span", it.title);
      title.lang = it.titleLang;
      link.append(title);
      row.append(link);
      if (it.translated) row.append(el("p", words.translated, "map-detail__translated"));
      if (it.when) row.append(el("p", it.when));
      if (it.place) row.append(el("p", it.place));
      const show = el("button", words.showInList, "map__text-button");
      show.type = "button";
      show.addEventListener("click", () => {
        it.li.scrollIntoView({ block: "center" });
        (it.li.querySelector<HTMLElement>("a, button") ?? it.li).focus({ preventScroll: true });
      });
      row.append(show);
      rows.push(row);
    }
    const extra: HTMLElement[] = [];
    if (place.approximate) extra.push(el("p", words.approximate, "map-approx-line"));
    // "Get directions": a plain link, opened only by the person's own tap. It carries only the
    // address (or the point), never the title, organization or listing id (owner Q119).
    const address = items.find((i) => i.address)?.address ?? null;
    const url = directionsUrl({ address, lat: place.lat, lon: place.lon, approximate: place.approximate }, isApple(navigator.userAgent));
    if (url) {
      const p = el("p");
      const a = el("a", words.directions, "map-detail__link");
      a.href = url;
      a.rel = "noopener noreferrer";
      a.referrerPolicy = "no-referrer";
      a.setAttribute("aria-describedby", "map-directions-note");
      p.append(a);
      const note = el("p", words.directionsNote, "muted");
      note.id = "map-directions-note";
      extra.push(p, note);
    }
    detailList.replaceChildren(...rows);
    detailExtra.replaceChildren(...extra);
    detail.hidden = false;
    highlight(items);
    detailHeading.focus();
  }

  function closeDetail(returnFocus: boolean): void {
    if (detail.hidden) return;
    detail.hidden = true;
    highlight([]);
    openFrom?.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      if (openFrom?.isConnected) openFrom.focus();
      else engine?.focusCanvas();
    }
    openFrom = null;
  }
  q<HTMLButtonElement>("[data-map-detail-close]")?.addEventListener("click", () => closeDetail(true));
  detail.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail(true);
  });

  // ---- Controls ----
  q<HTMLButtonElement>("[data-map-zoom-in]")?.addEventListener("click", () => engine?.zoomBy(1));
  q<HTMLButtonElement>("[data-map-zoom-out]")?.addEventListener("click", () => engine?.zoomBy(-1));

  // "Skip the map": to the first card in the list.
  q<HTMLAnchorElement>("[data-map-skip]")?.addEventListener("click", (e) => {
    e.preventDefault();
    const first = [...list.querySelectorAll<HTMLElement>(":scope > li[data-id]")].find((li) => !li.hidden);
    const target = first?.querySelector<HTMLElement>("a, button") ?? document.getElementById("results-heading");
    target?.focus();
  });

  // "Near me": only when tapped. The position is used once to center the map at
  // neighborhood level, then dropped: never stored, never sent, never in the address.
  q<HTMLButtonElement>("[data-map-near]")?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      nearStatus.textContent = words.nearUnavailable;
      return;
    }
    nearStatus.textContent = "";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        engine?.centerOn(pos.coords.longitude, pos.coords.latitude);
        nearStatus.textContent = words.nearDone;
      },
      (err) => {
        nearStatus.textContent = err.code === err.PERMISSION_DENIED ? words.nearDenied : words.nearFailed;
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 },
    );
  });

  syncSwitch();
  // "See the map" (About page) links here with the fixed #map: open the map. The address is
  // only read, never written, and holds nothing but this switch.
  if (location.hash === MAP_HASH && !switcher.hidden) {
    setOn(true);
    switcher.scrollIntoView({ block: "start" });
  }
}
