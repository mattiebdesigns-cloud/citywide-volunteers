// A picture of one card for Instagram (decision 0027), drawn on the device
// with <canvas>. It is never uploaded: it goes to the device's share sheet,
// or downloads. Portrait, 1080 x 1920, the size of an Instagram Story.
// Words stay out of the top and bottom ~250 px that Instagram covers.
// The picture has its own fixed colours (PICTURE_COLORS, the site's light
// set), so it looks the same whether the phone is in light or dark mode
// (pv-design, 2026-11-10). Fonts are the site's own system fonts, so nothing
// loads from anywhere.
import { fitText, placePicture } from "../lib/share.ts";

export interface PictureCard {
  title: string;
  /** Date and time as the card shows them, or "Flexible". */
  when: string;
  /** "River Wards · Kensington", or "" when unknown. */
  place: string;
  /** "Hosted by Example Pantry", already filled in. */
  host: string;
  siteName: string;
  /** "volunteer.example.org": the site's address without https://. */
  siteAddress: string;
}

/** The picture's fixed colours: the light set in styles/tokens.css, never the dark one. */
export const PICTURE_COLORS = {
  page: "#f8fafd",
  band: "#15294a",
  onBand: "#ffffff",
  onBandMuted: "#d5deeb",
  primary: "#1f4e8c",
  coral: "#f08a6c",
  ink: "#17202e",
} as const;

export const PICTURE_WIDTH = 1080;
export const PICTURE_HEIGHT = 1920;

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Draws the card and returns it as a PNG file. */
export async function drawCardPicture(card: PictureCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PICTURE_WIDTH;
  canvas.height = PICTURE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  const fontFamily = token("--font-body", 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif');
  const colors = PICTURE_COLORS;
  const font = (size: number, weight = 400) => `${weight} ${size}px ${fontFamily}`;
  const measureAt = (weight: number) => (s: string, size: number) => {
    ctx.font = font(size, weight);
    return ctx.measureText(s).width;
  };

  const margin = 90;
  const pad = 72;
  const inner = PICTURE_WIDTH - 2 * margin - 2 * pad;

  // Work out every line first, so the card is exactly as tall as its words.
  // If the card is too tall for the area Instagram leaves free, try smaller text.
  const gap = 36;
  const lineHeight = (size: number) => Math.round(size * 1.25);
  const layout = (scale: number) => {
    const sizes = (list: number[]) => list.map((n) => Math.round(n * scale));
    const title = fitText(card.title, inner, 6, sizes([104, 92, 80, 70, 62]), measureAt(800));
    const small = (text: string, size: number, maxLines: number) =>
      text ? fitText(text, inner, maxLines, sizes([size, size - 6, size - 12]), measureAt(500)) : { size, lines: [] as string[] };
    const blocks = [
      { ...title, weight: 800, color: colors.onBand },
      { ...small(card.when, 52, 3), weight: 600, color: colors.onBand },
      { ...small(card.place, 48, 2), weight: 500, color: colors.onBandMuted },
      { ...small(card.host, 48, 3), weight: 500, color: colors.onBandMuted },
    ].filter((b) => b.lines.length > 0);
    const bodyHeight =
      blocks.reduce((h, b) => h + b.lines.length * lineHeight(b.size), 0) + gap * (blocks.length - 1);
    const cardHeight = bodyHeight + 2 * pad + 28; // 28: the coral bar at the top of the card
    return { blocks, cardHeight, place: placePicture(cardHeight) };
  };
  let plan = layout(1);
  for (const scale of [0.9, 0.8, 0.7, 0.6]) {
    if (plan.place.fits) break;
    plan = layout(scale);
  }
  const { blocks, cardHeight, place } = plan;

  // Page.
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, PICTURE_WIDTH, PICTURE_HEIGHT);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Site name at the top of the area Instagram leaves free.
  ctx.fillStyle = colors.primary;
  const topName = fitText(card.siteName, PICTURE_WIDTH - 2 * margin, 1, [64, 56, 48], measureAt(800));
  ctx.font = font(topName.size, 800);
  ctx.fillText(topName.lines[0] ?? "", margin, place.nameY);

  // The card: a dark band with a coral bar.
  const top = place.cardTop;
  const radius = 40;
  ctx.fillStyle = colors.band;
  ctx.beginPath();
  ctx.roundRect(margin, top, PICTURE_WIDTH - 2 * margin, cardHeight, radius);
  ctx.fill();
  ctx.fillStyle = colors.coral;
  ctx.beginPath();
  ctx.roundRect(margin + pad, top + pad, 160, 16, 8);
  ctx.fill();

  let y = top + pad + 28 + 20;
  for (const block of blocks) {
    ctx.font = font(block.size, block.weight);
    ctx.fillStyle = block.color;
    for (const line of block.lines) {
      ctx.fillText(line, margin + pad, y);
      y += lineHeight(block.size);
    }
    y += gap;
  }

  // Site name and address a little under the card, still inside the free area.
  const bottomWidth = PICTURE_WIDTH - 2 * margin;
  ctx.fillStyle = colors.ink;
  const footName = fitText(card.siteName, bottomWidth, 1, [52, 46, 40], measureAt(800));
  ctx.font = font(footName.size, 800);
  ctx.fillText(footName.lines[0] ?? "", margin, place.footerY);
  ctx.fillStyle = colors.primary;
  const address = fitText(card.siteAddress, bottomWidth, 1, [44, 38, 32], measureAt(600));
  ctx.font = font(address.size, 600);
  ctx.fillText(address.lines[0] ?? "", margin, place.footerY + 60);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no picture"))), "image/png"),
  );
}
