# Header logo options (archive)

**Chosen: A4 (owner, 2026-11-10).** It is now `site/src/components/ui/logo.svg`, in the header; see docs/design.md "Header logo". This folder keeps every option and preview. It is outside `public/`, so none of it is published. Paths below that say `site/public/brand/` now mean this folder.

PROJECT.md sections 2 and 5 (look and feel). Made by pv-design on 2026-11-10 at the owner's request:
combine the map from the link-preview picture (`site/scripts/og/template.svg`) with the words
"Philly Volunteers" in a fun font. **None of these is on the site yet.** The owner picks one first.

Look at the pictures: `preview-a-light.png`, `preview-a-dark.png`, and the same for `b` and `c`.
Each shows the logo at 64, 48 and 32 px tall, the stacked version, the mark alone, and a 360 px phone header.

| Option | Idea | Font (lettering) |
|---|---|---|
| A, "Neighborhood map" | The preview's map itself: eight sections in soft blues, coral Center City, three coral pins (Northeast, Northwest, South; owner 2026-11-10). Rounded, friendly letters. | Fredoka, bold (weight 650, width 108) |
| B, "Big pin" | One big coral map pin with the city's outline inside its head. Warm, retro, mural-painting letters. | Shrikhand |
| C, "Street sign" | The preview picture in miniature: navy rounded tile, the map and pins inside, a white sign border. Blocky signage capitals. | Bungee |

## Option A2 (owner's pick, 2026-11-10)

Option A's map with three pins, lettered in Shrikhand (Option B's font). "Philly" sits on top and
"Volunteers" is centred below it. "Vol" starts beside South Philly and the word runs on under Northeast Philly.
Pictures: `preview-a2-light.png` and `preview-a2-dark.png`.

- Layout 1, `option-a2-tuck.svg` and `option-a2-tuck-dark.svg`: the map at its normal size, with the words tucked under its lower edge.
- Layout 2, `option-a2-overlap.svg` and `option-a2-overlap-dark.svg`: a larger map, with the words laid over its lower edge.

Where the letters cross the map, a thin outline in the background colour runs around them, so they always
sit on the plain background colour. Colours: light page, "Philly" navy #1f4e8c 7.9:1 and "Volunteers" ink #17202e 15.7:1.
Navy band, "Philly" coral 5.9:1 and "Volunteers" white 14.5:1. All pass 4.5:1.
Size: use it 64 px tall in the header. At that height layout 1 is 125 px wide and layout 2 is 109 px wide, which fits a 360 px phone header.
At 48 px "Volunteers" gets small, so 64 px is the smallest height to use. The header row grows from 48 to about 80 px tall.

## Option A3 (owner feedback on A2, 2026-11-10)

Option A's map with three pins. Beside it, "Philly" sits over "Volunteers" in Shrikhand. The two lines are centred
with each other, and the pair is centred up and down against the map. The words sit close to the map but never
touch or cross it, so they need no outline. Files: `option-a3.svg` (light page) and `option-a3-dark.svg` (navy band).
Pictures: `preview-a3-light.png` and `preview-a3-dark.png`.

| Background | "Philly" | "Volunteers" |
|---|---|---|
| Light page #f8fafd | navy #1f4e8c, 7.95:1 | rust #a8432b, 5.73:1 |
| Navy band #15294a | white #ffffff, 14.50:1 | coral #f08a6c, 5.91:1 |

Size: 159 px wide at 64 px tall, which fits a 360 px phone header beside "About" and "Español". At 48 px it is
119 px wide; "Volunteers" is still clear, but 64 px reads best at arm's length.

## Option A4 (owner feedback on A3, 2026-11-10)

Option A3 with a bigger "Volunteers": its capital letters are now 89% as tall as those in "Philly" (they were 69%),
so the word is wider than "Philly", as in Option B's stacked layout. Everything else is the same as A3: the
colours and contrast in the table above, the pair centred against the map, no overlap, the lines centred with
each other, and three pins. Files: `option-a4.svg` and `option-a4-dark.svg`. Pictures: `preview-a4-light.png` and `preview-a4-dark.png`.
Size: 171 px wide at 64 px tall (128 px at 48 px), which fits a 360 px phone header beside "About" and "Español".

## Option A5 (owner, 2026-11-10)

Option A4's sizes, colours and three pins, with "Philly" and "Volunteers" right-aligned: their right edges line up.
"Volunteers" sits level with South Philly, with its "V" just to the right of it, and "Philly" sits above it.
Neither word touches the map. Contrast is the same as A3 and A4. Files: `option-a5.svg` and `option-a5-dark.svg`.
Pictures: `preview-a5-light.png` and `preview-a5-dark.png`.
Size: 160 px wide at 64 px tall (120 px at 48 px). It fits a 360 px phone header beside "About" and "Español".

## Option A6 (owner, 2026-11-10)

Option A5 with a larger "Philly": its capital letters are 21% taller than in A5. That is the largest size that still
keeps a clear gap from Northeast Philly. Everything else is as in A5: right-aligned edges, the "V" just right of
South Philly, no overlap, the same colours and contrast, the same size of "Volunteers", and three pins.
Files: `option-a6.svg` and `option-a6-dark.svg`. Pictures: `preview-a6-light.png` and `preview-a6-dark.png`.
Size: 160 px wide at 64 px tall (120 px at 48 px). It fits a 360 px phone header.

## Files for each option (x = a, b or c)

- `option-x.svg`: one line, for the light page background. Best for wide screens.
- `option-x-dark.svg`: one line, for the dark navy band (`--color-band`).
- `option-x-stacked.svg` and `option-x-stacked-dark.svg`: two lines, for phones.
- `option-x-mark.svg`: the picture alone. One file works on both light and dark.

Phone fit: at 44 px tall the stacked logos are 159 px (A), 155 px (B) and 189 px (C) wide,
which leaves room for "About" and "Español" in a 360 px header. The one-line logos are 216 to 271 px
wide at 32 px tall, so they suit tablet and desktop widths.

## Contrast (WCAG 2.1 AA)

Colours are the site's own tokens (`site/src/styles/tokens.css`). The site today has only a light
background; "dark" means the navy band, ready for a dark header if one is ever wanted.

| Option | Light page (#f8fafd) | Dark band (#15294a) |
|---|---|---|
| A | "Philly" navy 7.9:1, "Volunteers" ink 15.7:1 | "Philly" coral 5.9:1, "Volunteers" white 14.5:1 |
| B | "Philly" navy 7.9:1, "Volunteers" brick #a8432b 5.7:1 | "Philly" white 14.5:1, "Volunteers" coral 5.9:1 |
| C | "PHILLY" band navy 13.9:1, "VOLUNTEERS" navy 7.9:1 | "PHILLY" white 14.5:1, "VOLUNTEERS" coral 5.9:1 |

All lettering passes 4.5:1. Marks: every shape has a navy edge (13.9:1 on the light page) or
a light fill on the navy band (light blue 7.4:1, coral 5.9:1, white 14.5:1), so each passes 3:1.
Coral is never used as lettering on the light background (only 2.4:1 there).

## Fonts and licences

The letters are converted to shapes (outlines) inside the SVG. No font file ships with the site and
the browser makes no Google Fonts request. Converting letters to artwork is allowed under the SIL Open
Font License 1.1 (owner Q122 allows OFL-1.1 for fonts). Font files came from the google/fonts
repository on GitHub, folder `ofl/`.

| Font | Copyright | Licence |
|---|---|---|
| Fredoka | Copyright 2016 The Fredoka Project Authors (github.com/hafontia/Fredoka-One) | OFL-1.1 |
| Shrikhand | Copyright (c) 2015 Jonny Pinhorn | OFL-1.1 |
| Bungee | Copyright 2023 The Bungee Project Authors (github.com/djrrb/Bungee) | OFL-1.1 |

## The link's name (for when one is wired in)

The SVGs are `aria-hidden` and hold no words for screen readers. The header link keeps its name from
`site.name` in the settings, for example:

```astro
<a href={paths.home(lang)} aria-current={...}>
  <img src="/brand/option-x-stacked.svg" alt={siteName} width="..." height="44">
</a>
```

The lettering spells "Philly Volunteers", so a city that copies the site with another `site.name`
would need its own logo file, or the plain-text name as today. Wiring is pv-calendar-site's work, after
the owner picks.
