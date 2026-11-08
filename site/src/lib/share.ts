// Share panel (decision 0027): plain share links, built in the browser.
// No SDK, no outside script, nothing sent to us. Pure, so tests can check
// every address without a browser.

export type ShareTarget = "sms" | "whatsapp" | "facebook" | "x" | "bluesky" | "email";

/** The order the panel shows them in, before Copy link and Instagram. */
export const SHARE_TARGETS: ShareTarget[] = ["sms", "whatsapp", "facebook", "x", "bluesky", "email"];

export interface ShareInput {
  /** Full address of what is shared (our listing page, or the organization's page for a flexible card). */
  url: string;
  /** Short message: the title and when ("Food pantry shift, Tuesday, October 20, 6:00 PM"). */
  message: string;
  /** Email subject. Never the title: a sensitive event's name never goes in a subject line (PROJECT.md 8.1 rule 7). */
  subject: string;
}

const enc = encodeURIComponent;

/** One plain link per service. */
export function shareLinks({ url, message, subject }: ShareInput): Record<ShareTarget, string> {
  const both = `${message} ${url}`;
  return {
    // "sms:?&body=" is read by both iPhone and Android messaging apps.
    sms: `sms:?&body=${enc(both)}`,
    whatsapp: `https://wa.me/?text=${enc(both)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    x: `https://x.com/intent/tweet?text=${enc(message)}&url=${enc(url)}`,
    bluesky: `https://bsky.app/intent/compose?text=${enc(both)}`,
    email: `mailto:?subject=${enc(subject)}&body=${enc(`${message}\n\n${url}`)}`,
  };
}

/**
 * Splits text into lines no wider than `maxWidth`, using `measure` for the
 * width of a piece of text. A word longer than a whole line is broken
 * inside, so nothing ever runs off the picture.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const tryLine = line ? `${line} ${word}` : word;
    if (measure(tryLine) <= maxWidth) {
      line = tryLine;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the line: break it by letters.
    let rest = word;
    while (measure(rest) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Picks the largest font size from `sizes` at which the text fits in
 * `maxLines`; at the smallest size, extra lines end with "…".
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxLines: number,
  sizes: number[],
  measureAt: (s: string, size: number) => number,
): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrapLines(text, maxWidth, (s) => measureAt(s, size));
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const lines = wrapLines(text, maxWidth, (s) => measureAt(s, size)).slice(0, maxLines);
  let last = lines[maxLines - 1] ?? "";
  while (last && measureAt(`${last}…`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
  lines[maxLines - 1] = `${last}…`;
  return { size, lines };
}

/**
 * Instagram covers about the top and bottom 250 px of a Story with its own
 * buttons and names. The picture keeps all its words between these lines.
 */
export const STORY_SAFE_TOP = 270;
export const STORY_SAFE_BOTTOM = 1650;

/**
 * Where the parts of the 1080 x 1920 picture go: the site name at the top
 * of the safe area, then the card, then the site name and address a little
 * under the card, all as one group centred in the space left. `fits` is
 * false when the card is too tall; draw it again with smaller text.
 */
export function placePicture(cardHeight: number): { nameY: number; cardTop: number; footerY: number; fits: boolean } {
  const nameHeight = 80; // site name line at the top, with its space
  const underCard = 56; // "a little space under the card"
  const footerHeight = 52 + 8 + 56; // site name, gap, one line of address
  const group = cardHeight + underCard + footerHeight;
  const areaTop = STORY_SAFE_TOP + nameHeight;
  const room = STORY_SAFE_BOTTOM - areaTop;
  const cardTop = areaTop + Math.max(0, Math.round((room - group) / 2));
  return { nameY: STORY_SAFE_TOP, cardTop, footerY: cardTop + cardHeight + underCard, fits: group <= room };
}
