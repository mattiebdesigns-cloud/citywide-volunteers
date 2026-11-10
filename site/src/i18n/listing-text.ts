// Which words a listing shows in a page's language (decision 0036; PROJECT.md 2 and 5).
//
// The pipeline may add `machine_translations` to a listing: the organization's
// own text (title, team task, time asked) translated by machine, by language
// code, for example `{ es: { title: "Turno de voluntariado en la cocina" } }`.
// On a page in that language the translation is shown, marked with its own
// language and labeled "Translated automatically", and the original is shown
// on the listing's own page. Everywhere else, and whenever there is no
// translation, the organization's own words are shown, marked with
// `listing_language`.
//
// The organization's name and the address are never translated: they are not
// listing text here and are always shown as the organization wrote them.
//
// Adding a language needs nothing here: the pipeline translates into every
// language in the settings file, and this helper picks the page's language.

/** The listing fields that may carry a machine translation. */
export type ListingTextField = "title" | "team_task" | "commitment";

/** `machine_translations` in the event format, by language code. */
export type MachineTranslations = Record<string, Partial<Record<ListingTextField, string>>>;

export interface HasListingText {
  listing_language: string;
  title: string;
  team_task?: string | null;
  commitment?: string | null;
  machine_translations?: MachineTranslations | null;
}

export interface ShownText {
  /** What to show. */
  text: string;
  /** Its language, for the `lang` attribute. */
  lang: string;
  /** True when `text` is a machine translation. */
  translated: boolean;
  /** The organization's own words and their language. */
  original: string;
  originalLang: string;
}

function base(code: string): string {
  return code.toLowerCase().split("-")[0];
}

/** The text to show for one field on a page in `lang`, or null when the listing has none. */
export function listingText(item: HasListingText, field: ListingTextField, lang: string): ShownText | null {
  const original = item[field];
  if (typeof original !== "string" || original.trim() === "") return null;
  const originalLang = item.listing_language;
  const translation = base(originalLang) === base(lang) ? undefined : item.machine_translations?.[base(lang)]?.[field];
  if (typeof translation === "string" && translation.trim() !== "") {
    return { text: translation, lang: base(lang), translated: true, original, originalLang };
  }
  return { text: original, lang: originalLang, translated: false, original, originalLang };
}

/** Every field at once, plus whether any of them is a machine translation. */
export function shownListing(item: HasListingText, lang: string) {
  const title = listingText(item, "title", lang)!;
  const team_task = listingText(item, "team_task", lang);
  const commitment = listingText(item, "commitment", lang);
  const translated = [title, team_task, commitment].some((s) => s?.translated);
  return { title, team_task, commitment, translated };
}
