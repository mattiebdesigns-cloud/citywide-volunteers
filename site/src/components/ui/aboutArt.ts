// The About page drawings (decision 0025; PROJECT.md 2 and 5).
// Drawn for this project and released with it (MIT), in the same style as the
// cause drawings (causeArt.ts) and the link-preview map (scripts/og/template.svg).
// No photos, no people being served, no outside images or fonts, and no words
// in the drawings (Q36): the page's own text says everything.
//
// Each entry is a whole <svg> string, decorative (aria-hidden), 480 x 300,
// that scales to the width of its box. Use it with set:html:
//
//   import { aboutArt } from "../components/ui/aboutArt";
//   <div class="about-art" set:html={aboutArt.shifts} />
//
// Contrast (on the page background #f8fafd, see docs/design.md):
// every shape that carries meaning is navy (8.0:1), ink (15.7:1), or has an
// ink outline. Coral (2.4:1) and the pale fills are never the only edge.
// The soft tinted blobs behind each drawing are decoration only.
// Dark mode: the first shape in each drawing is a rounded tile in
// --art-backdrop (transparent on the light page, a soft blue-grey on the dark
// page), so the same colours keep the same contrast (navy 5.5:1 on the tile).

export type AboutArtId =
  | "shifts"
  | "near-you"
  | "everyone"
  | "private"
  | "more"
  | "rewards"
  | "why"
  | "support"
  | "contact";

// Classes used inside the drawings (turned into inline styles below, so the
// drawings work without any page CSS; colours come from styles/tokens.css,
// with the same colours written in as a fallback):
//   a  = navy fill              b  = coral fill, ink outline
//   c  = white fill             cl = white fill, ink outline
//   l  = ink line, no fill      w  = white line, no fill
//   n  = navy line, no fill     t  = soft blue blob (decoration)
//   t2 = soft coral blob (decoration)
//   m1, m2, m3 = the map's pale blues, ink outline   r = river line
const navy = "var(--art-fill,#1f4e8c)";
const coral = "var(--art-fill-2,#f08a6c)";
const white = "var(--art-fill-3,#ffffff)";
const ink = "var(--art-line,#17202e)";
const round = "stroke-linecap:round;stroke-linejoin:round";
const styles: Record<string, string> = {
  a: `fill:${navy}`,
  b: `fill:${coral};stroke:${ink};stroke-width:4;${round}`,
  c: `fill:${white}`,
  cl: `fill:${white};stroke:${ink};stroke-width:4;${round}`,
  l: `fill:none;stroke:${ink};stroke-width:4;${round}`,
  w: `fill:none;stroke:${white};stroke-width:6;${round}`,
  n: `fill:none;stroke:${navy};stroke-width:8;${round}`,
  t: "fill:var(--art-tint,#e4ecf7)",
  t2: "fill:var(--art-tint-2,#fde6dd)",
  m1: `fill:#9dbbe3;stroke:${ink};stroke-width:7;${round}`,
  m2: `fill:#d5e3f4;stroke:${ink};stroke-width:7;${round}`,
  m3: `fill:#eef3fa;stroke:${ink};stroke-width:7;${round}`,
  r: `fill:none;stroke:var(--art-water,#3a6aa8);stroke-width:7;${round}`,
};
// A shape may add its own style after the class (for example a thicker line);
// the two are joined, and the shape's own part wins.
const paint = (drawing: string): string =>
  drawing.replace(/class="(\w+)"(?:\s+style="([^"]*)")?/g, (whole, name: string, own?: string) =>
    styles[name] ? `style="${styles[name]}${own ? `;${own}` : ""}"` : whole,
  );
const svg = (drawing: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" aria-hidden="true" focusable="false" class="about-art-svg"><rect width="480" height="300" rx="24" style="fill:var(--art-backdrop,transparent)"/>${paint(drawing)}</svg>`;

// A small wall-calendar card, centred on (x, y), turned r degrees.
// head: "a" navy or "b" coral. dots: how many shift dots in its grid.
const card = (x: number, y: number, r: number, head: "a" | "b" = "a", dots = 3): string => {
  const marks = [
    [-24, 4],
    [0, 4],
    [24, 4],
    [-24, 24],
    [0, 24],
    [24, 24],
  ]
    .map(([dx, dy], i) =>
      i < dots ? `<circle class="a" cx="${dx}" cy="${dy}" r="6"/>` : `<circle class="l" cx="${dx}" cy="${dy}" r="5"/>`,
    )
    .join("");
  return `<g transform="translate(${x} ${y}) rotate(${r})">
      <rect class="cl" x="-46" y="-40" width="92" height="84" rx="10"/>
      <path class="${head === "b" ? "b" : "a"}" d="M-46-30a10 10 0 0 1 10-10h72a10 10 0 0 1 10 10v12h-92z"/>
      <path class="l" d="M-22-48v14M22-48v14"/>
      ${marks}
    </g>`;
};

// The city's eight sections, from the link-preview picture (decision 0013).
// Same paths as scripts/og/template.svg, scaled to fit.
const cityMap = `
    <g transform="translate(118 18) scale(.52)">
      <path class="m1" d="M292.5 254.6 L315.0 278.1 L375.0 229.1 L435.0 180.2 L484.5 143.0 L450.0 23.5 L390.0 0.0 L315.0 111.6 L270.0 170.4 L262.5 219.3 Z"/>
      <path class="m1" d="M127.5 262.4 L157.5 229.1 L187.5 189.9 L195.0 131.2 L165.0 121.4 L105.0 86.2 L67.5 121.4 L22.5 170.4 L67.5 219.3 L105.0 248.7 Z"/>
      <path class="m2" d="M142.5 323.1 L187.5 330.9 L195.0 317.2 L247.5 282.0 L292.5 254.6 L262.5 219.3 L270.0 170.4 L225.0 141.0 L195.0 131.2 L187.5 189.9 L157.5 229.1 L127.5 262.4 L135.0 287.9 Z"/>
      <path class="m3" d="M187.5 330.9 L214.5 336.8 L270.0 317.2 L315.0 278.1 L292.5 254.6 L247.5 282.0 L195.0 317.2 Z"/>
      <path class="m3" d="M120.0 395.6 L150.0 370.1 L142.5 323.1 L135.0 287.9 L127.5 262.4 L105.0 248.7 L0.0 317.2 L22.5 356.4 L45.0 385.8 Z"/>
      <path class="m1" d="M120.0 395.6 L45.0 385.8 L37.5 424.9 L22.5 509.1 L67.5 517.0 L120.0 507.2 L112.5 444.5 Z"/>
      <path class="m2" d="M150.0 370.1 L207.0 376.0 L207.0 424.9 L195.0 464.1 L165.0 493.5 L120.0 507.2 L112.5 444.5 L120.0 395.6 Z"/>
      <path class="b" d="M142.5 323.1 L187.5 330.9 L214.5 336.8 L207.0 376.0 L150.0 370.1 Z"/>
      <path class="r" style="stroke-width:12" d="M120.0 507.2 L112.5 444.5 L120.0 395.6 L150.0 370.1 L142.5 323.1 L135.0 287.9 L127.5 262.4 L105.0 248.7 L67.5 219.3 L22.5 170.4"/>
      <path class="r" style="stroke-width:10" transform="translate(12 9)" d="M484.5 143.0 L435.0 180.2 L375.0 229.1 L315.0 278.1 L270.0 317.2 L214.5 336.8 L207.0 376.0 L207.0 424.9 L195.0 464.1 L165.0 493.5 L120.0 507.2"/>
    </g>`;

// A map pin with its point at (x, y).
const pin = (x: number, y: number, s = 1): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path class="b" d="M0 0C-4-10-17-18-17-31a17 17 0 1 1 34 0C17-18 4-10 0 0z"/><circle class="a" cx="0" cy="-31" r="6"/></g>`;

// A five-point star centred on (x, y), outer radius r.
const star = (x: number, y: number, r: number, cls: string): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(x + rad * Math.cos(ang)).toFixed(1)} ${(y + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return `<path class="${cls}" d="M${pts.join("L")}z"/>`;
};

// A simple person: round head and shoulders, centred on x, feet line at y.
const person = (x: number, y: number, cls: string, s = 1): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><circle class="${cls}" cx="0" cy="-92" r="22"/><path class="${cls}" d="M-38 0v-26a38 38 0 0 1 76 0v26z"/></g>`;

// An open hand, palm up, reaching in from the lower left (mirror it for the right).
const hand = `
    <path class="b" d="M18 300l66-74 34 30-46 44z"/>
    <path class="a" d="M92 236c10-26 34-36 62-36h70a14 14 0 0 1 0 28h-8a12 12 0 0 1 0 24h-10a11 11 0 0 1 0 22h-14a10 10 0 0 1 0 20h-46c-26 0-46-12-54-34z"/>
    <path class="a" d="M150 214c4-18 16-30 30-34a10 10 0 0 1 10 16c-10 6-14 14-16 24z"/>
    <path class="w" style="stroke-width:4" d="M206 228h12M196 252h14M184 274h12"/>`;

const drawings: Record<AboutArtId, string> = {
  // Many calendar cards: every shift in one place.
  shifts: `
    <ellipse class="t" cx="240" cy="158" rx="226" ry="132"/>
    <circle class="t2" cx="404" cy="58" r="40"/>
    ${card(110, 96, -8, "a", 2)}
    ${card(240, 84, 3, "a", 4)}
    ${card(370, 98, 7, "a", 3)}
    ${card(150, 206, 5, "a", 5)}
    ${card(330, 208, -5, "a", 1)}
    <g transform="translate(240 190) scale(1.18)">${card(0, 0, 0, "b", 6)}</g>
    ${star(56, 196, 14, "a")}
    ${star(428, 186, 16, "a")}`,

  // The city's sections with pins: find a shift near you.
  "near-you": `
    <circle class="t" cx="244" cy="158" r="142"/>
    <circle class="t2" cx="70" cy="70" r="36"/>
    ${cityMap}
    ${pin(316, 82)}
    ${pin(180, 112)}
    ${pin(228, 138)}
    ${pin(156, 196)}
    ${pin(198, 256)}`,

  // A phone with two speech bubbles (two languages), and an access figure.
  everyone: `
    <ellipse class="t" cx="240" cy="160" rx="210" ry="128"/>
    <rect class="a" x="186" y="34" width="108" height="236" rx="20"/>
    <rect class="cl" x="198" y="58" width="84" height="182" rx="8"/>
    <rect class="c" x="222" y="44" width="36" height="6" rx="3"/>
    <circle class="c" cx="240" cy="256" r="7"/>
    <circle class="a" cx="240" cy="96" r="10"/>
    <path class="n" d="M214 118h52M240 118v34M240 152l-14 26M240 152l14 26"/>
    <path class="l" d="M214 204h52M214 222h34"/>
    <path class="a" d="M46 66a18 18 0 0 1 18-18h92a18 18 0 0 1 18 18v42a18 18 0 0 1-18 18h-34l-4 26-22-26H64a18 18 0 0 1-18-18z"/>
    <path class="w" d="M70 76h80M70 98h52"/>
    <path class="b" d="M306 134a18 18 0 0 1 18-18h92a18 18 0 0 1 18 18v42a18 18 0 0 1-18 18h-34l-4 26-22-26h-32a18 18 0 0 1-18-18z"/>
    <path class="l" d="M330 144h80M330 166h52"/>`,

  // A shield with a lock, in front of a calendar: safe and private.
  private: `
    <ellipse class="t" cx="240" cy="160" rx="200" ry="124"/>
    <circle class="t2" cx="398" cy="70" r="34"/>
    <g transform="translate(-10 0)">
      <rect class="cl" x="96" y="60" width="220" height="190" rx="14"/>
      <path class="a" d="M96 74a14 14 0 0 1 14-14h192a14 14 0 0 1 14 14v26H96z"/>
      <path class="l" d="M140 46v26M272 46v26"/>
      <g class="a">
        <circle class="a" cx="130" cy="130" r="8"/><circle class="a" cx="166" cy="130" r="8"/><circle class="a" cx="202" cy="130" r="8"/>
        <circle class="a" cx="130" cy="166" r="8"/><circle class="a" cx="166" cy="166" r="8"/>
        <circle class="a" cx="130" cy="202" r="8"/><circle class="a" cx="166" cy="202" r="8"/>
      </g>
    </g>
    <path class="cl" style="stroke-width:6" d="M318 92l78 26v54c0 50-34 84-78 102-44-18-78-52-78-102v-54z"/>
    <path class="a" d="M318 106l64 22v44c0 42-28 70-64 86-36-16-64-44-64-86v-44z"/>
    <path class="w" d="M300 166v-16a18 18 0 0 1 36 0v16"/>
    <rect class="c" x="290" y="164" width="56" height="46" rx="8"/>
    <circle class="a" cx="318" cy="182" r="7"/>
    <path class="n" style="stroke-width:6" d="M318 186v12"/>`,

  // A clock (flexible), three people (Volunteer Teams), a calculator.
  more: `
    <ellipse class="t" cx="240" cy="166" rx="230" ry="118"/>
    <circle class="cl" style="stroke-width:6" cx="94" cy="150" r="62"/>
    <circle class="a" cx="94" cy="150" r="48"/>
    <path class="w" d="M94 150V118M94 150l22 14"/>
    <path class="w" style="stroke-width:5" d="M94 108v6M94 186v6M52 150h6M130 150h6"/>
    <circle class="b" cx="94" cy="150" r="7"/>
    ${person(202, 236, "b", 0.82)}
    ${person(278, 236, "b", 0.82)}
    ${person(240, 250, "a", 1)}
    <rect class="a" x="352" y="76" width="96" height="150" rx="14"/>
    <rect class="cl" x="366" y="92" width="68" height="30" rx="5"/>
    <path class="l" d="M392 107h30"/>
    <g>
      <rect class="c" x="366" y="136" width="18" height="16" rx="4"/><rect class="c" x="391" y="136" width="18" height="16" rx="4"/><rect class="b" x="416" y="136" width="18" height="16" rx="4"/>
      <rect class="c" x="366" y="162" width="18" height="16" rx="4"/><rect class="c" x="391" y="162" width="18" height="16" rx="4"/><rect class="b" x="416" y="162" width="18" height="16" rx="4"/>
      <rect class="c" x="366" y="188" width="18" height="16" rx="4"/><rect class="c" x="391" y="188" width="18" height="16" rx="4"/><rect class="b" x="416" y="188" width="18" height="16" rx="4"/>
    </g>`,

  // A medal with a star and a ticket: rewards, coming next.
  rewards: `
    <ellipse class="t" cx="240" cy="160" rx="214" ry="126"/>
    <circle class="t2" cx="84" cy="74" r="34"/>
    <path class="b" d="M150 170l-28 92 30-14 18 28 22-86z"/>
    <path class="b" d="M226 170l28 92-30-14-18 28-22-86z"/>
    <circle class="a" cx="188" cy="138" r="70"/>
    <circle class="w" style="stroke-width:5" cx="188" cy="138" r="56"/>
    ${star(188, 140, 36, "c")}
    <g transform="translate(338 168) rotate(-14)">
      <path class="b" d="M-82-46h164v28a18 18 0 0 0 0 36v28h-164v-28a18 18 0 0 0 0-36z"/>
      <path class="l" style="stroke-dasharray:2 12" d="M-36-38v84"/>
      ${star(24, 0, 22, "a")}
    </g>
    ${star(118, 50, 12, "a")}
    ${star(420, 74, 14, "a")}
    ${star(282, 52, 9, "a")}`,

  // A heart held up by two open hands: why support it.
  why: `
    <ellipse class="t" cx="240" cy="166" rx="214" ry="124"/>
    <circle class="t2" cx="398" cy="66" r="32"/>
    <circle class="t2" cx="86" cy="80" r="22"/>
    <g transform="translate(0 22)">
      <path class="b" style="stroke-width:5" d="M240 176s-74-42-74-94a38 38 0 0 1 74-14 38 38 0 0 1 74 14c0 52-74 94-74 94z"/>
      <path class="w" style="stroke-width:7" d="M196 84a20 20 0 0 1 18-22"/>
    </g>
    ${hand}
    <g transform="translate(480 0) scale(-1 1)">${hand}</g>`,

  // A shop and an organization's building tied together by a ribbon.
  support: `
    <ellipse class="t" cx="240" cy="170" rx="226" ry="118"/>
    <circle class="t2" cx="240" cy="62" r="34"/>
    <rect class="a" x="40" y="128" width="140" height="132"/>
    <path class="b" d="M30 98h160v34a16 16 0 0 1-32 0 16 16 0 0 1-32 0 16 16 0 0 1-32 0 16 16 0 0 1-32 0 16 16 0 0 1-32 0z"/>
    <path class="l" d="M62 98v34M94 98v34M126 98v34M158 98v34"/>
    <rect class="c" x="54" y="168" width="58" height="50" rx="4"/>
    <rect class="c" x="124" y="174" width="42" height="86" rx="4"/>
    <circle class="a" cx="134" cy="218" r="4"/>
    <path class="a" d="M370 66l102 50H268z"/>
    <rect class="a" x="280" y="116" width="180" height="16"/>
    <rect class="c" x="292" y="140" width="18" height="96"/><rect class="c" x="330" y="140" width="18" height="96"/>
    <rect class="c" x="392" y="140" width="18" height="96"/><rect class="c" x="430" y="140" width="18" height="96"/>
    <rect class="a" x="280" y="236" width="180" height="12"/>
    <rect class="a" x="270" y="248" width="200" height="12"/>
    <circle class="c" cx="370" cy="100" r="9"/>
    <path class="b" d="M178 156c20-12 38 10 58 0s38-12 56 0v20c-18-12-36-10-56 0s-38-12-58 0z"/>
    <path class="b" d="M236 170l-20 50 14-6 10 12zM236 170l20 50-14-6-10 12z"/>
    <path class="b" d="M236 166c-24-30-46-24-44-4 2 18 22 22 44 4zM236 166c24-30 46-24 44-4-2 18-22 22-44 4z"/>
    <circle class="b" cx="236" cy="166" r="10"/>`,

  // An envelope with a letter: get in touch.
  contact: `
    <ellipse class="t" cx="240" cy="160" rx="206" ry="126"/>
    <circle class="t2" cx="392" cy="70" r="36"/>
    <rect class="cl" x="160" y="44" width="160" height="150" rx="8" transform="rotate(-6 240 120)"/>
    <path class="l" d="M186 80h104M188 104h96M190 128h70" transform="rotate(-6 240 120)"/>
    <path class="a" d="M114 132h252v126a12 12 0 0 1-12 12H126a12 12 0 0 1-12-12z"/>
    <path class="w" d="M122 140l118 84 118-84M122 262l84-66M358 262l-84-66"/>
    <path class="b" d="M240 224s-20-12-20-26a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 14-20 26-20 26z"/>
    <path class="n" style="stroke-width:6" d="M62 150h32M48 182h46M70 214h24"/>`,
};

/** One finished <svg> string per About page section id. */
export const aboutArt: Record<AboutArtId, string> = Object.fromEntries(
  Object.entries(drawings).map(([id, d]) => [id, svg(d)]),
) as Record<AboutArtId, string>;
