// Published tips (decision 0063) and volunteer time notes (decision 0062), read
// once per build from the account database's two public functions,
// public_tips() and public_time_notes(), with the public (anon) key only.
// PROJECT.md 2, 8.1, 11.1. Nothing here is city-specific (rule 14).
//
// Off, and the build still passes, when: accounts are off (accounts.url empty),
// the public API address or key is not in the settings, or a fetch fails or
// returns something unexpected. Then no tips section and no time note appear.
// A service key is refused outright: the build stops and names no key.
import { accountsUrl, favoriteIds } from "./accounts.ts";
import { PLACE_ID, SERIES_ID, placeId } from "./ids.ts";
import { isSensitive } from "./prepare.ts";
import { localParts } from "./time.ts";
import type { Listing, Opportunity, PreparedListing, SiteSettings } from "./types.ts";

export interface Tip {
  text: string;
  /** The language the tip is written in (one of languages.available). */
  language: string;
}

export interface PublicNotes {
  /** Published tips by tip_key (a series_id or a place_id). */
  tips: Map<string, Tip[]>;
  /** Accepted start times, "HH:MM", by target_id (a series_id, else a listing id). */
  timeNotes: Map<string, string>;
}

export const NO_NOTES: PublicNotes = { tips: new Map(), timeNotes: new Map() };

/** The longest tip shown (decision 0063: 500 characters). Longer rows are left out, not cut. */
export const TIP_MAX_CHARS = 500;
const MAX_ROWS = 50_000;
const TIMEOUT_MS = 10_000;
const TARGET_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * The public API address and key from the settings (accounts.public_api_url,
 * accounts.public_api_key), or null when either is empty or accounts are off.
 * The address is https with no path; plain http only for this computer
 * (localhost or 127.0.0.1), which the tests use.
 */
export function publicApi(settings: Pick<SiteSettings, "accounts">): { url: string; key: string } | null {
  if (!accountsUrl(settings)) return null;
  const url = String(settings.accounts?.public_api_url ?? "").trim();
  const key = String(settings.accounts?.public_api_key ?? "").trim();
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) {
    throw new Error("settings accounts.public_api_url must be an https:// address with no path or trailing slash, or empty");
  }
  if (!isPublicKey(key)) {
    throw new Error("settings accounts.public_api_key is not a public (anon or publishable) key. Never put a service key in the settings.");
  }
  return { url, key };
}

/**
 * True for a public key: a publishable key (sb_publishable_...), or a JWT whose
 * role is "anon". Anything else, a service or secret key included, is refused.
 */
export function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "anon";
  } catch {
    return false;
  }
}

async function rpc(api: { url: string; key: string }, name: string, fetchFn: FetchFn): Promise<unknown[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(`${api.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: api.key, Authorization: `Bearer ${api.key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[public notes] ${name} answered ${res.status}; the build shows none.`);
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
      console.warn(`[public notes] ${name} did not return a list the calendar can use; the build shows none.`);
      return null;
    }
    return rows;
  } catch {
    console.warn(`[public notes] ${name} could not be read; the build shows none.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Published tips by key. Rows with an unknown key shape, empty or over-long text, or another language are left out. */
export function parseTips(rows: unknown[], languages: string[]): Map<string, Tip[]> {
  const out = new Map<string, Tip[]>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { tip_key, text, language } = r as Record<string, unknown>;
    if (typeof tip_key !== "string" || !(SERIES_ID.test(tip_key) || PLACE_ID.test(tip_key))) continue;
    if (typeof text !== "string" || typeof language !== "string" || !languages.includes(language)) continue;
    const clean = text.trim();
    if (!clean || [...clean].length > TIP_MAX_CHARS) continue;
    const list = out.get(tip_key) ?? [];
    list.push({ text: clean, language });
    out.set(tip_key, list);
  }
  return out;
}

/** Time notes by target. start_time comes as "HH:MM" or "HH:MM:SS"; kept as "HH:MM". */
export function parseTimeNotes(rows: unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { target_id, start_time } = r as Record<string, unknown>;
    if (typeof target_id !== "string" || !TARGET_ID.test(target_id) || typeof start_time !== "string") continue;
    const m = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d(\.\d+)?)?$/.exec(start_time);
    if (m) out.set(target_id, `${m[1]}:${m[2]}`);
  }
  return out;
}

/** Reads both functions. Never throws for a network or data problem: that part is simply empty. */
export async function fetchPublicNotes(settings: SiteSettings, fetchFn: FetchFn = fetch as unknown as FetchFn): Promise<PublicNotes> {
  const api = publicApi(settings);
  if (!api) return NO_NOTES;
  const [tips, notes] = await Promise.all([rpc(api, "public_tips", fetchFn), rpc(api, "public_time_notes", fetchFn)]);
  return {
    tips: tips ? parseTips(tips, settings.languages.available) : new Map(),
    timeNotes: notes ? parseTimeNotes(notes) : new Map(),
  };
}

/**
 * The published tips for one listing: those for its series and those for its
 * place, each once. Sensitive listings included (decision 0063: a tip names no one).
 */
export function tipsFor(notes: PublicNotes, e: Listing | Opportunity): Tip[] {
  const ids = favoriteIds(e as Listing);
  const keys = [ids.series_id, placeId(ids.org_id, e.address)].filter((k): k is string => k !== null);
  const seen = new Set<string>();
  const out: Tip[] = [];
  for (const k of keys) {
    for (const tip of notes.tips.get(k) ?? []) {
      const id = `${tip.language}\u001f${tip.text}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(tip);
    }
  }
  return out;
}

/**
 * The volunteer time note for a dated listing, as the instant it names (same
 * local date as the host's start), or null. Never on a sensitive listing
 * (decision 0062, 8.1). Keyed by the series, else the listing; left out when it
 * matches the host's own time.
 */
export function timeNoteFor(notes: PublicNotes, e: PreparedListing, timeZone: string): Date | null {
  if (isSensitive(e)) return null;
  const target = favoriteIds(e).series_id ?? e.id;
  const note = notes.timeNotes.get(target);
  if (!note) return null;
  const [h, m] = note.split(":").map(Number);
  const noteMinutes = h * 60 + m;
  const hostMinutes = localParts(e.start, timeZone).minutes;
  if (noteMinutes === hostMinutes) return null;
  return new Date(Date.parse(e.start) + (noteMinutes - hostMinutes) * 60_000);
}

let cached: Promise<PublicNotes> | null = null;

/** Once per build, shared by every listing page. */
export function publicNotes(settings: SiteSettings): Promise<PublicNotes> {
  cached ??= fetchPublicNotes(settings);
  return cached;
}
