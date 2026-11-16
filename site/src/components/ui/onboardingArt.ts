// The onboarding drawings (decision 0064 and its amendment; PROJECT.md 2, 5, 6).
// Drawn for this project and released with it (MIT), in the same style and
// with the same classes as the cause drawings (causeArt.ts). Never a photo,
// never an organization's image, never people's faces in detail: people are
// plain shapes (a round head, a rounded body). No words in the drawings except
// the letters of the "all-set-love" sign; the card's own text says everything,
// so every drawing is decorative (aria-hidden).
//
// Each entry is the inside of a 320 x 150 drawing, like causeArt.ts. The cause
// sides of the interest cards reuse causeArt.ts ids; onboardingSvg() draws
// either kind.
//
// Two ways to use them:
//   1. A whole <svg> string, with its own tile behind it, that works with no
//      page CSS (colours fall back to the light values written in below):
//        <div class="ob-art" set:html={onboardingSvg("outdoors")} />
//   2. The bare drawing (onboardingArt[id]) inside your own <svg viewBox="0 0
//      320 150">, painted with the same classes as SvgSprite.astro.
//
// Light and dark mode: every drawing sits on its own pale tile (a cause tile
// colour from styles/tokens.css), and the drawing keeps the light colours in
// both themes, exactly like the cause drawings on the calendar cards. Navy and
// ink shapes carry the picture. A coral shape that matters (the people, the
// box, the curtains, the calendar card, the stars on the list) has an ink
// outline (the same shape again with class "l") or sits on navy; coral with no
// outline is only a small accent (sun, confetti, little hearts and stars).
// tests/onboarding-art.test.ts checks the outlined ones.
//
// The "All set!" screen: a city chooses its drawing in config/site.yml
// (onboarding.all_set_art). allSetArtId() turns that setting into an id here,
// and an empty or unknown setting gets the plain "all-set-default" drawing
// (decision 0064 amendment; rule 14). "all-set-love" is Philadelphia's: our own
// LOVE-style heart sign, approved by the owner. Never a photo of the sculpture.
//
// Classes used inside the drawings (the same as causeArt.ts):
//   a = main colour (navy), b = second colour (coral), c = white,
//   l = ink outline, no fill; cl = white with ink outline;
//   w = white line, no fill; s = soft white shape for depth.

import { art as causeArt } from "./causeArt.ts";

export const onboardingIds = [
  "outdoors",
  "indoors",
  "on-your-feet",
  "sitting",
  "set-time",
  "flexible",
  "come-solo",
  "bring-group",
  "kitchen",
  "welcome",
  "recommended",
  "filters",
  "privacy",
  "all-set-love",
  "all-set-default",
] as const;
export type OnboardingArtId = (typeof onboardingIds)[number];

// The drawings that can stand on the "All set!" screen.
export const allSetIds = ["all-set-love", "all-set-default"] as const;

// ---- Small shared shapes ----

// A five-point star centred on (x, y); s = size (1 is about 32 across).
const star = (x: number, y: number, s: number, cls: string): string =>
  `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0-16l5 10 11 1.5-8 7.5 2 11-10-5-10 5 2-11-8-7.5 11-1.5z"/>`;

// A plain person: a round head and a rounded body, no face. (x, y) is the
// middle of the shoulders; s = size (1 is about 64 tall).
// A coral person also gets an ink outline, so it stands out in dark mode.
const personShape = `<circle cy="-30" r="12"/><path d="M-20 22v-18a20 20 0 0 1 40 0v18z"/>`;
// smile = true adds two white eyes and a smile to the head (nothing more).
const smileShape = `<circle class="c" cx="-4" cy="-33" r="2"/><circle class="c" cx="4" cy="-33" r="2"/><path class="c" d="M-5-28a5 5 0 0 0 10 0z"/>`;
const person = (x: number, y: number, s: number, cls: string, smile = false): string =>
  `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})">${personShape}${smile ? smileShape : ""}</g>` +
  (cls === "b" ? `<g class="l" transform="translate(${x} ${y}) scale(${s})">${personShape}</g>` : "");

// A small heart centred on (x, y); s = size (1 is about 24 across).
const heart = (x: number, y: number, s: number, cls: string): string =>
  `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0 10S-12 3-12-4a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 7-12 14-12 14z"/>`;

// The letters of the all-set-love sign, each in a 42 x 48 box.
const L = `<path d="M0 0h14v34h28v14H0z"/>`;
const V = `<path d="M0 0h14l7 30 7-30h14L28 48H14z"/>`;
const E = `<path d="M0 0h42v12H14v6h22v12H14v6h28v12H0z"/>`;
const H = `<path d="M21 46S0 33 0 16a11 11 0 0 1 21-6 11 11 0 0 1 21 6c0 17-21 30-21 30z"/>`;
const sign = `<g transform="translate(112 20)">${L}</g><g transform="translate(112 70)">${V}</g><g transform="translate(164 70)">${E}</g>`;
const signHeart = `<g transform="translate(164 18) rotate(16 21 24)">${H}</g>`;

export const onboardingArt: Record<OnboardingArtId, string> = {
  // A sunny park: sun, a cloud, a round tree, a pointed tree and a bird.
  outdoors: `
    <ellipse class="a" cx="160" cy="156" rx="220" ry="44" opacity=".35"/>
    <ellipse class="s" cx="92" cy="34" rx="38" ry="14"/>
    <circle class="b" cx="256" cy="38" r="20"/>
    <path class="l" d="M256 6v6M256 64v6M224 38h6M282 38h6M234 16l4 4M274 56l4 4M234 60l4-4M274 20l4-4"/>
    <rect class="cl" x="112" y="78" width="14" height="48"/>
    <circle class="a" cx="119" cy="64" r="30"/>
    <path class="b" d="M202 58l22 48h-44z"/>
    <path class="l" d="M202 58l22 48h-44zM202 106v20"/>
    <path class="l" d="M52 70q8-8 16 0q8-8 16 0"/>`,
  // A room: a window with curtains, a hanging lamp, a small table with a mug.
  indoors: `
    <circle class="s" cx="40" cy="40" r="34"/>
    <rect class="a" x="70" y="28" width="116" height="90" rx="6"/>
    <rect class="c" x="80" y="38" width="44" height="34"/><rect class="c" x="132" y="38" width="44" height="34"/>
    <rect class="c" x="80" y="78" width="44" height="32"/><rect class="c" x="132" y="78" width="44" height="32"/>
    <path class="b" d="M62 22h22c-4 34-4 66 2 100H62z"/>
    <path class="l" d="M62 22h22c-4 34-4 66 2 100H62z"/>
    <path class="b" d="M194 22h-22c4 34 4 66-2 100h24z"/>
    <path class="l" d="M194 22h-22c4 34 4 66-2 100h24z"/>
    <rect class="a" x="56" y="118" width="144" height="10" rx="4"/>
    <path class="l" d="M248 0v28"/>
    <path class="b" d="M230 28h36l8 22h-52z"/>
    <path class="l" d="M230 28h36l8 22h-52z"/>
    <circle class="cl" cx="248" cy="56" r="6"/>
    <rect class="a" x="216" y="100" width="64" height="9" rx="4"/>
    <path class="l" d="M226 109v28M270 109v28"/>
    <rect class="cl" x="240" y="82" width="16" height="18" rx="3"/>
    <path class="l" d="M36 138h264"/>`,
  // On your feet, maybe lifting: a sneaker, two stacked boxes, an up arrow.
  "on-your-feet": `
    <circle class="s" cx="250" cy="40" r="40"/>
    <path class="a" d="M58 118V88h24l12 14 34 8c10 2 14 8 14 14v4H58z"/>
    <path class="w" d="M84 98l10 6M80 108l10 6"/>
    <rect class="cl" x="54" y="124" width="92" height="10" rx="5"/>
    <rect class="b" x="166" y="70" width="84" height="62" rx="4"/>
    <rect class="l" x="166" y="70" width="84" height="62" rx="4"/>
    <path class="l" d="M166 90h84M208 70v20"/>
    <rect class="a" x="180" y="36" width="58" height="34" rx="3"/>
    <path class="w" d="M194 53h30"/>
    <path class="l" d="M280 120V44M266 58l14-14 14 14"/>`,
  // Sitting down: a chair with a cushion, a table with papers and a mug.
  sitting: `
    <circle class="s" cx="64" cy="44" r="40"/>
    <rect class="a" x="92" y="30" width="16" height="92" rx="6"/>
    <rect class="b" x="106" y="72" width="58" height="14" rx="7"/>
    <rect class="a" x="92" y="84" width="76" height="14" rx="6"/>
    <path class="l" d="M100 98v34M160 98v34"/>
    <rect class="a" x="188" y="76" width="100" height="10" rx="5"/>
    <path class="l" d="M198 86v46M278 86v46"/>
    <rect class="cl" x="206" y="58" width="42" height="18" rx="2"/>
    <path class="l" d="M214 66h26"/>
    <rect class="b" x="258" y="54" width="16" height="22" rx="3"/>
    <path class="l" d="M274 60h4a6 6 0 0 1 0 12h-4"/>
    <path class="l" d="M56 132h248"/>`,
  // A set day and time: a calendar page with one day marked, and a clock.
  "set-time": `
    <circle class="s" cx="50" cy="40" r="36"/>
    <rect class="cl" x="76" y="34" width="100" height="98" rx="8"/>
    <rect class="a" x="76" y="34" width="100" height="24" rx="8"/>
    <rect class="a" x="76" y="46" width="100" height="12"/>
    <path class="l" d="M100 24v18M152 24v18"/>
    <g class="a"><circle cx="98" cy="76" r="5"/><circle cx="126" cy="76" r="5"/><circle cx="154" cy="76" r="5"/><circle cx="98" cy="98" r="5"/><circle cx="154" cy="98" r="5"/><circle cx="98" cy="118" r="5"/><circle cx="126" cy="118" r="5"/></g>
    <circle class="b" cx="126" cy="98" r="11"/>
    <path class="l" d="M120 98l4 4 8-8"/>
    <circle class="a" cx="236" cy="80" r="46"/>
    <circle class="c" cx="236" cy="80" r="36"/>
    <path class="l" d="M236 56v24l16 10"/>
    <circle class="b" cx="236" cy="80" r="5"/>`,
  // Flexible, whenever you like: a clock with a looping arrow, and calendar
  // cards floating loose around it.
  flexible: `
    <circle class="s" cx="262" cy="36" r="36"/>
    <circle class="a" cx="140" cy="80" r="44"/>
    <circle class="c" cx="140" cy="80" r="34"/>
    <path class="l" d="M140 80l-12-16M140 80h18"/>
    <path class="l" d="M87 61a56 56 0 0 1 106 0M195 46l-2 15-12-9"/>
    <g transform="rotate(-12 240 100)"><rect class="b" x="218" y="78" width="44" height="44" rx="5"/><rect class="l" x="218" y="78" width="44" height="44" rx="5"/><rect class="c" x="225" y="91" width="30" height="24" rx="2"/></g>
    <g transform="rotate(14 262 56)"><rect class="a" x="248" y="42" width="30" height="30" rx="4"/><rect class="c" x="252" y="51" width="22" height="17" rx="2"/></g>
    <g transform="rotate(10 52 104)"><rect class="a" x="36" y="88" width="32" height="32" rx="4"/><rect class="c" x="40" y="97" width="24" height="19" rx="2"/></g>`,
  // Come solo, meet people there: one person, a dotted path, and a small
  // group waiting; the one in the middle smiles (two dots and a curve, no
  // other features).
  "come-solo": `
    <circle class="s" cx="246" cy="70" r="54"/>
    ${person(80, 94, 1.3, "a")}
    <path class="l" stroke-dasharray="2 12" d="M118 122c30 10 58 10 86-4"/>
    ${person(222, 100, 0.9, "b")}
    ${person(272, 100, 0.9, "b")}
    ${person(247, 92, 1, "a", true)}`,
  // Bring my group: four people together (the two in the middle smile), and a
  // little flag to gather round.
  "bring-group": `
    <circle class="s" cx="160" cy="66" r="62"/>
    <ellipse class="a" cx="160" cy="146" rx="150" ry="16" opacity=".35"/>
    ${person(106, 102, 1, "b")}
    ${person(214, 102, 1, "b")}
    ${person(140, 94, 1.15, "a", true)}
    ${person(180, 94, 1.15, "a", true)}
    <path class="l" d="M256 132V34"/>
    <path class="b" d="M256 34l40 13-40 13z"/>
    <path class="l" d="M256 34l40 13-40 13z"/>`,
  // In the kitchen: a pot with a lid and steam on the stove, and a ladle and
  // a spatula hanging on a rail.
  kitchen: `
    <circle class="s" cx="60" cy="44" r="38"/>
    <path class="l" d="M140 42c-6-8 6-12 0-20M166 38c-6-8 6-12 0-20M192 42c-6-8 6-12 0-20"/>
    <rect class="b" x="158" y="46" width="16" height="10" rx="4"/>
    <path class="b" d="M114 74a52 20 0 0 1 104 0z"/>
    <path class="l" d="M114 74a52 20 0 0 1 104 0z"/>
    <path class="a" d="M118 74h96v34a10 10 0 0 1-10 10h-76a10 10 0 0 1-10-10z"/>
    <path class="l" d="M118 86h-12M214 86h12"/>
    <path class="w" d="M134 92h30"/>
    <rect class="cl" x="92" y="118" width="148" height="14" rx="4"/>
    <path class="l" d="M248 26h56"/>
    <path class="l" d="M260 26v52"/>
    <path class="a" d="M250 78h20a10 10 0 0 1-20 0z"/>
    <path class="l" d="M290 26v40"/>
    <rect class="b" x="282" y="66" width="16" height="24" rx="3"/>
    <rect class="l" x="282" y="66" width="16" height="24" rx="3"/>`,
  // Welcome: an open door with a heart inside, a mat, and sparkles.
  welcome: `
    <circle class="s" cx="160" cy="72" r="62"/>
    <rect class="a" x="120" y="24" width="80" height="110" rx="4"/>
    <rect class="c" x="128" y="32" width="64" height="102"/>
    ${heart(160, 84, 1.5, "a")}
    <path class="b" d="M128 32l-26 10v102l26-10z"/>
    <path class="l" d="M128 32l-26 10v102l26-10z"/>
    <circle class="cl" cx="112" cy="92" r="4"/>
    <rect class="b" x="112" y="136" width="96" height="8" rx="3"/>
    ${star(78, 40, 0.8, "b")}
    ${star(246, 46, 1, "a")}
    ${star(256, 108, 0.6, "b")}
    ${star(66, 104, 0.5, "a")}`,
  // Your Recommended Shifts: a list; the top two rows have stars.
  recommended: `
    <circle class="s" cx="262" cy="104" r="36"/>
    <rect class="a" x="96" y="12" width="128" height="132" rx="12"/>
    <rect class="cl" x="108" y="24" width="104" height="24" rx="5"/>
    ${star(122, 37, 0.5, "b")}${star(122, 37, 0.5, "l")}
    <path class="l" d="M138 36h60"/>
    <rect class="cl" x="108" y="54" width="104" height="24" rx="5"/>
    ${star(122, 67, 0.5, "b")}${star(122, 67, 0.5, "l")}
    <path class="l" d="M138 66h48"/>
    <rect class="c" x="108" y="84" width="104" height="24" rx="5"/>
    <circle class="a" cx="122" cy="96" r="5"/>
    <path class="l" d="M138 96h56"/>
    <rect class="c" x="108" y="114" width="104" height="24" rx="5"/>
    <circle class="a" cx="122" cy="126" r="5"/>
    <path class="l" d="M138 126h40"/>
    ${star(232, 24, 1.3, "b")}${star(232, 24, 1.3, "l")}`,
  // Filters: a times-of-day dial (sunrise left, sun at the top, quarter moon
  // right, full moon at the bottom, clock hands in the middle) between a
  // calendar and a map pin.
  filters: `
    <circle class="s" cx="160" cy="62" r="56"/>
    <g transform="translate(-24 0)">
      <rect class="cl" x="36" y="50" width="68" height="66" rx="6"/>
      <rect class="a" x="36" y="50" width="68" height="20" rx="6"/>
      <rect class="a" x="36" y="60" width="68" height="10"/>
      <path class="l" d="M54 42v14M86 42v14"/>
      <g class="a"><circle cx="54" cy="86" r="5"/><circle cx="70" cy="86" r="5"/><circle cx="86" cy="86" r="5"/><circle cx="54" cy="102" r="5"/><circle cx="70" cy="102" r="5"/></g>
      <circle class="b" cx="86" cy="102" r="6"/>
    </g>
    <circle class="a" cx="160" cy="75" r="64"/>
    <circle class="c" cx="160" cy="75" r="54"/>
    <g transform="translate(160 40) scale(1.2)">
      <circle class="b" r="7"/>
      <circle class="l" r="7"/>
      <path class="l" d="M0-11v-1M-11 0h-1M11 0h1M-7.8-7.8l-.7-.7M7.8-7.8l.7-.7"/>
    </g>
    <g transform="translate(124 74) scale(1.2)">
      <path class="l" d="M-11 3h22"/>
      <path class="b" d="M-8 3a8 8 0 0 1 16 0z"/>
      <path class="l" d="M-8 3a8 8 0 0 1 16 0z"/>
      <path class="l" d="M0-8v-1M-8-5l-1-1M8-5l1-1"/>
    </g>
    <path class="a" transform="translate(201 77) scale(1.2)" d="M4-11a11 11 0 0 0 0 22a18 18 0 0 1 0-22z"/>
    <g transform="translate(160 110) scale(1.2)">
      <circle class="cl" r="9"/>
      <circle class="a" cx="-3" cy="-2" r="2" opacity=".35"/><circle class="a" cx="3" cy="3" r="1.5" opacity=".35"/>
    </g>
    <rect class="a" x="156.5" y="53" width="7" height="25" rx="3.5" transform="rotate(-55 160 75)"/>
    <rect class="a" x="157" y="38" width="6" height="40" rx="3" transform="rotate(60 160 75)"/>
    <circle class="a" cx="160" cy="75" r="7"/>
    <g transform="translate(18 0)">
      <ellipse class="a" cx="250" cy="134" rx="20" ry="5" opacity=".35"/>
      <path class="b" d="M250 126s-30-36-30-58a30 30 0 0 1 60 0c0 22-30 58-30 58z"/>
      <path class="l" d="M250 126s-30-36-30-58a30 30 0 0 1 60 0c0 22-30 58-30 58z"/>
      <circle class="cl" cx="250" cy="68" r="11"/>
    </g>`,
  // Privacy: a shield with a lock on it.
  privacy: `
    <circle class="s" cx="64" cy="44" r="40"/>
    <circle class="s" cx="260" cy="106" r="30"/>
    <path class="a" d="M160 12l54 18v38c0 36-22 60-54 72-32-12-54-36-54-72V30z"/>
    <path class="w" d="M160 26l40 13v29c0 26-16 44-40 54"/>
    <path class="w" d="M146 66V56a14 14 0 0 1 28 0v10"/>
    <rect class="c" x="134" y="66" width="52" height="40" rx="6"/>
    <circle class="a" cx="160" cy="82" r="6"/>
    <path class="a" d="M156 84h8l2 12h-12z"/>
    ${star(236, 34, 0.6, "b")}
    ${star(84, 104, 0.5, "b")}`,
  // Philadelphia's "All set!": our own LOVE-style sign, the O drawn as a
  // tilted coral heart, on a plinth, with little hearts and confetti.
  "all-set-love": `
    <circle class="s" cx="160" cy="68" r="66"/>
    <ellipse class="a" cx="160" cy="150" rx="170" ry="14" opacity=".35"/>
    <g transform="translate(-24 -10) scale(1.15)">
      <g class="b" transform="translate(5 5)">${sign}</g>
      <g class="a">${sign}</g>
      <g class="a" transform="translate(4 4)">${signHeart}</g>
      <g class="b">${signHeart}</g>
      <g class="l">${signHeart}</g>
    </g>
    <rect class="cl" x="108" y="131" width="110" height="12" rx="3"/>
    ${heart(70, 52, 1.2, "b")}
    ${heart(250, 40, 1, "a")}
    ${heart(262, 96, 0.8, "b")}
    ${heart(60, 108, 0.7, "a")}
    ${star(82, 20, 0.5, "a")}
    ${star(232, 116, 0.5, "b")}
    <g class="b"><rect x="40" y="70" width="8" height="4" rx="2" transform="rotate(30 44 72)"/><rect x="282" y="62" width="8" height="4" rx="2" transform="rotate(-20 286 64)"/></g>
    <g class="a"><rect x="224" y="14" width="8" height="4" rx="2" transform="rotate(-30 228 16)"/><rect x="92" y="128" width="8" height="4" rx="2" transform="rotate(40 96 130)"/></g>`,
  // The plain "All set!" for a city that sets none: a big tick in a circle,
  // with stars and confetti.
  "all-set-default": `
    <circle class="s" cx="160" cy="75" r="64"/>
    <circle class="a" cx="160" cy="75" r="46"/>
    <path class="w" d="M138 76l16 16 30-32"/>
    ${star(82, 40, 0.9, "b")}
    ${star(240, 106, 0.8, "b")}
    ${star(246, 34, 0.6, "a")}
    ${star(88, 112, 0.5, "a")}
    <g class="b"><rect x="52" y="72" width="8" height="4" rx="2" transform="rotate(30 56 74)"/><rect x="270" y="66" width="8" height="4" rx="2" transform="rotate(-20 274 68)"/></g>
    <g class="a"><rect x="210" y="16" width="8" height="4" rx="2" transform="rotate(-30 214 18)"/><rect x="118" y="132" width="8" height="4" rx="2" transform="rotate(40 122 134)"/></g>`,
};

// The pale tile behind each drawing: one of the cause tile colours already in
// styles/tokens.css (--art-<name>), so dark mode softens them the same way.
export const onboardingTile: Record<OnboardingArtId, string> = {
  outdoors: "parks-and-trees",
  indoors: "housing",
  "on-your-feet": "repair",
  sitting: "elders",
  "set-time": "youth",
  flexible: "civic-action",
  "come-solo": "health",
  "bring-group": "arts",
  kitchen: "food",
  welcome: "default",
  recommended: "civic-action",
  filters: "youth",
  privacy: "education",
  "all-set-love": "health",
  "all-set-default": "default",
};

// The light-mode tile colours, written in as a fallback for pages that do not
// load styles/tokens.css (keep in step with it).
const tileFallback: Record<string, string> = {
  food: "#f6dcc0",
  "parks-and-trees": "#cfe5c8",
  animals: "#f1e1c6",
  youth: "#cfe0f2",
  housing: "#f2d2c6",
  elders: "#e6d9ef",
  "civic-action": "#f7e2a8",
  education: "#d5e7e4",
  health: "#f4d6da",
  clothing: "#dcdcef",
  repair: "#dde3e6",
  arts: "#ecd5ea",
  default: "#e9e4d6",
};

const navy = "var(--art-fill,#1f4e8c)";
const coral = "var(--art-fill-2,#f08a6c)";
const white = "var(--art-fill-3,#ffffff)";
const ink = "var(--art-line,#17202e)";
const round = "stroke-linecap:round;stroke-linejoin:round";
// The same paint as SvgSprite.astro, with the light colours as a fallback.
const styles: Record<string, string> = {
  a: `fill:${navy}`,
  b: `fill:${coral}`,
  c: `fill:${white}`,
  s: `fill:${white};opacity:.55`,
  l: `fill:none;stroke:${ink};stroke-width:4;${round}`,
  cl: `fill:${white};stroke:${ink};stroke-width:3`,
  w: `fill:none;stroke:${white};stroke-width:6;${round}`,
};
// A <g class="b"> passes its colour down to the shapes inside it.
export const paint = (drawing: string): string =>
  drawing.replace(/class="(\w+)"/g, (whole, name: string) => (styles[name] ? `style="${styles[name]}"` : whole));

/** True for an id this file or causeArt.ts can draw. */
export function hasArt(id: string): boolean {
  return id in onboardingArt || id in causeArt;
}

/**
 * A whole decorative <svg> (320 x 150, aria-hidden) for an onboarding id or a
 * cause id, on its pale tile, with inline colours. Unknown ids draw nothing
 * (an empty string), so a typo shows up as a missing picture, not a wrong one.
 */
export function onboardingSvg(id: string): string {
  const own = (onboardingArt as Record<string, string>)[id];
  const body = own ?? causeArt[id];
  if (body === undefined) return "";
  const tile = own !== undefined ? onboardingTile[id as OnboardingArtId] : id;
  const bg = `var(--art-${tile},${tileFallback[tile] ?? tileFallback.default})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" class="onboarding-art-svg" data-art="${id}"><rect width="320" height="150" style="fill:${bg}"/>${paint(body)}</svg>`;
}

/**
 * The "All set!" drawing id for a city's setting (onboarding.all_set_art in
 * config/site.yml). Empty, missing or unknown gives the plain default.
 */
export function allSetArtId(setting: string | null | undefined): string {
  return setting && (allSetIds as readonly string[]).includes(setting) ? setting : "all-set-default";
}
