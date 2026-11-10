# Design: how the calendar site looks

_PROJECT.md sections 2 and 5; docs/briefs/phase1-home-page.md; decision 0009. Owner of this file: `pv-design`._

**Status:** the owner picked the navy and coral palette on 2026-10-18 (QUESTIONS Q25/Q27). He approved building a dark mode on 2026-11-10 (section "Dark mode"); the dark look still needs his OK on screenshots. He still has to approve a screenshot of the calendar and of a listing page in this palette before launch.

## The feel

Friendly, civic, fast. The site opens straight into this week's shifts: a header, a line about rewards, quick day chips, then one column of cards. Nothing else competes for attention.

- **Phone first.** Everything is designed at 360 px wide, then allowed to widen to one 40rem column.
- **Readable at arm's length.** Body text is 18 px, and no text anywhere is smaller than 16 px (1rem).
- **One thumb.** Every button and filter choice is at least 48 px tall. The Filters button sits at the bottom of the screen, where a thumb reaches.
- **Fast.** System fonts, no web fonts, no images to download: the cause drawings are small inline SVG.
- **Nothing by colour alone.** Every state and category has an icon, a shape or words as well (table below).
- **No photos of people.** No stock photos of people being served, and no pictures of clients, children or protesters. Each listing shows our own drawing for its cause.

## Files

| File | What it is |
|---|---|
| `site/src/styles/tokens.css` | Every colour, size and space, as CSS variables, with a light set and a dark set. A city restyles its copy here. |
| `site/src/styles/base.css` | Light reset, text, links, focus rings, reduced motion, `.sr-only`, `.skip-link`, `.page`, `.stack`, `.muted`. |
| `site/src/styles/forms.css` | Form fields: `.field` (label above a 48 px select or input, our own drop-down arrow), `.field__hint`, `.check` (checkbox or radio row, the whole row is the tap target). |
| `site/src/styles/global.css` | Imports the three above. Import it once, in the main layout. |
| `site/src/components/ui/` | The reusable pieces (below). Each has its own styles inside. |

## Colours

Navy and coral. This table is the light set; the dark set is under "Dark mode" below. All text pairs pass WCAG 2.1 AA (4.5:1), and most pass AAA (7:1). Borders that matter pass 3:1.

| Role | Colour | Contrast |
|---|---|---|
| Page background | `#f8fafd` | |
| Surface (cards, sheets) | `#ffffff` | |
| Text | `#17202e` | 15.7:1 on page, 16.4:1 on white |
| Secondary text | `#4a5568` | 7.2:1 on page, 7.5:1 on white |
| Borders that must be seen | `#7c8799` | 3.5:1 on page, 3.6:1 on white |
| Main colour (buttons, links) | `#1f4e8c` | white on it 8.3:1; it on page 8.0:1 |
| Main colour, hover | `#183e70` | white on it 10.7:1; it on page 10.2:1 |
| Card text band | `#15294a` | white on it 14.5:1; light text `#d5deeb` 10.7:1 |
| Accent ("how to join" pill, focus inside the band) | `#f08a6c` | text on it 6.7:1; on band 5.9:1 |
| Notice (business-led note, test banner) | `#fdece6`, edge `#a8432b` | text on it 14.3:1; edge 5.2:1 |
| "Full" badge | `#17202e` | white on it 16.4:1 |

The accent is used only as a fill behind dark text, never as text, and never as the only edge of anything (it is 2.4:1 on the page).

Each cause has its own pale background (`--art-<cause id>`), used only behind drawings. Text never sits on it. The drawings use navy and coral.

## Type

System fonts (the phone's own), so there is nothing to download.

| Token | Size | Use |
|---|---|---|
| `--text-min` | 16 px | Smallest anywhere: pills, badges, "last checked", labels |
| `--text-body` | 18 px | Body text |
| `--text-lead` | 20 px | Card titles |
| `--text-h3` / `--text-h2` | 22 / 26 px | Section headings ("This week's picks", "Tonight") |
| `--text-h1` | 30 to 40 px | The listing title on its own page |

Line height 1.55 for body text, 1.25 for headings. Links are always underlined.

## Space and shape

- Space in 4 px steps: `--space-1` (4 px) to `--space-8` (64 px). Cards sit 16 px apart; the page has 16 px at each side on a phone, 24 px from 640 px up.
- `--tap` is 48 px: every button, chip and toggle.
- Corners: cards 14 px, small badges 8 px, pills and buttons fully round.
- Focus: a 3 px dark ring with a thin white ring inside it, so it shows on light and dark backgrounds (in dark mode the reverse: a white ring with a dark inner ring). Inside the dark card band the ring is coral.
- Motion: only short colour fades (150 ms). With "reduce motion" turned on in the device settings, there is none.
- Windows high-contrast mode keeps borders and focus rings.

## Nothing by colour alone

| What | Colour | Also shown by |
|---|---|---|
| How to join | Accent fill | Icon per method (door, clipboard, form, question mark) and the words |
| Listing type | Outline | Square-cornered shape, icon per type (hand and heart, cap, ballot, megaphone) and the words |
| Business-led | Notice (pale coral) | Dashed border, briefcase icon, the words; the full note on the detail page |
| Sensitive | None for now (owner, Q27 part 2 still open) | A protest or action shows its own type pill; a `kind="sensitive"` pill style exists but is not used |
| Full | Dark badge | "No entry" icon and the word; the drawing fades |
| Spots left | White badge | Ticket icon and the words |
| Saved (heart) | Main colour | Heart fills in solid; `aria-pressed` for screen readers |
| Filter chip on | Main colour fill | Check mark appears; `aria-pressed` |
| Links | Main colour | Always underlined |
| Test build | Pale coral strip (dark rust in dark mode) | Striped edge, the 🚧 emoji and the words "Test version" |

## Components

Every word comes in through props or the slot, already translated with `site/src/i18n/`. No component holds text of its own.

### `SvgSprite` (required once per page)
Every icon and cause drawing, drawn once as a hidden SVG that `Icon` and `CauseArt` point to. Put `<SvgSprite />` first inside `<body>` in the main layout. **Without it, icons and drawings do not show.** It keeps a page of 300 cards at about 2.6 KB per card (about 775 KB before compression), where copying each drawing into every card would be several times that.

### `ListingCard`
One listing in the home list: cause drawing on top, a solid dark band of real text over its lower edge (title, when, where, how to join, type, business-led tag), the spots badge at top left, and heart and share at top right. The whole card links to the detail page, and the two buttons work on their own.

```astro
<ListingCard
  id={e.id} href={`/${lang}/l/${e.id}/`} title={e.title} titleLang={e.listing_language}
  when={whenText} datetime={e.start} place={e.neighborhood_or_town ?? ""} cause={e.cause}
  joinMethod={e.join_method} joinLabel={t(`filters.join.${e.join_method}`)}
  type={e.type === "service" ? undefined : e.type}
  typeLabel={e.type === "service" ? undefined : t(`filters.type.${e.type}`)}
  businessLabel={e.host_type === "business-led" ? tr.listName("host_types", "business-led") : undefined}
  spots={spotsFor(e)}
  saveLabel={t("listing.save")} shareLabel={t("listing.share")}
  shareUrl={absoluteUrl} headingLevel={3} />
```

- `saveLabel` and `shareLabel` keep the `{title}` placeholder open (call `t` without the title). The card puts the title in, wrapped in `lang={titleLang}`, so a screen reader reads "Guardar:" in Spanish and the title in the organization's language.
- `spots`: `{ label: t("listing.full"), full: true }` when `full`; `{ label: plural("listing.spots_left", n, { when }) }` when `spots_left` is a number above 0; leave it out otherwise.
- Service is the usual type, so a card may leave its type pill out. Training, campaign and protest-or-action cards show theirs.
- Heart and share have no behaviour built in. The page adds a small script: the heart button has `data-save-id`; toggle its `aria-pressed` and keep saved ids in the visitor's own browser storage. The share button has `data-share-url` and `data-share-title`; use the phone's share sheet (`navigator.share`) where there is one, otherwise copy the link and say so.
- Sensitive listings use the same card. The drawing is our own art, never a photo, so it is allowed (brief).

### `CauseArt`
The drawing for a cause id (needs `SvgSprite` on the page). The drawings live in `causeArt.ts`. One for each id in the settings file's cause list (food, parks and trees, animals, youth, housing, older adults, civic action, education, health, clothing, repair, arts and culture), plus a calendar-and-star drawing for an unknown or missing cause. All drawn for this project and released with it under MIT. Decorative, so screen readers skip it. Use it on its own for the top of the detail page: `<div style="height:11rem"><CauseArt cause={e.cause} /></div>`.

To add a cause for another city: add a drawing to the `art` list in `causeArt.ts` and an `--art-<id>` colour in `tokens.css`. Until then the fallback drawing shows. Never use an organization's image or copied art.

### `Button`
`variant`: `primary` (one main action per screen, such as "Sign up on the organization's page"), `secondary` (outlined, such as "Add to my calendar") or `quiet` (an underlined text link with an icon, such as "Report a problem"). With `href` it is a link, otherwise a button. `external` adds the "opens elsewhere" icon and `rel="noopener"`. `block` makes it full width, which suits phones. 48 px tall.

### `IconButton`
A round 48 px icon button with a label. `label` is required and names the item (QUESTIONS Q24): "Save: Park cleanup", not just "Save". To name a listing, pass the label with `{title}` still open, plus `title` and `titleLang`: `label={t("listing.save")} title={e.title} titleLang={e.listing_language}`. The title is read in its own language. On cards the label is for screen readers only. On the detail page, pass `visibleLabel={t("listing.save_short")}` to show a short word under the icon while screen readers still hear the full label. Pass `pressed` for toggles. `tone="plain"` for use on the page background.

### `Pill`
A small label with an icon. `kind="join"` with `value` = join_method; `kind="type"` with `value` = type; `kind="business"`; `kind="sensitive"`; or a plain tag with any `icon` (for example `check` for "No training needed"). `tone="on-band"` inside a card's dark band. Pills wrap onto more lines rather than overflow.

### `Chip`
A one-tap filter choice ("Evening", "No training needed"). Fills in and shows a check mark when on, with `aria-pressed`. Put day chips in a row that scrolls sideways under the header. For "pick one" groups inside the filter sheet, real radio buttons are better; give their labels the class `chip` and style `:checked` the same way.

### `SpotsBadge`
"Full" (dark, "no entry" icon) or "6 spots left as of last night" (white, ticket icon). `full` picks the look; `label` is the words.

### `BusinessLedNote`
The plain boxed note on a business-led listing's detail page: `heading={tr.listName("host_types","business-led")} text={t("listing.business_led_note")}`.

### `TestBanner`
The "Test version" strip at the top of every page of a test build (decision 0009). Show it only in test builds, for example when the build sets `PV_TEST_BUILD=1`. `text={t("site.test_version")}`. Its icon is the 🚧 construction sign emoji (owner 2026-11-10, in place of a drawn hard hat), the same size as the text, decorative (`aria-hidden`).

### `Icon`
Small line icons drawn for this project, listed in `icons.ts` (needs `SvgSprite` on the page). Always next to words, so they are hidden from screen readers.

## Header logo (owner's pick A4, 2026-11-10)

The header shows the site name as a logo: the link-preview map of the city's eight sections (pale blues, coral Center City, three coral pins in Northeast, Northwest and South Philly), with "Philly" over "Volunteers" beside it. The lines are centred with each other and the pair is centred against the map. The lettering never touches the map.

- **File.** `site/src/components/ui/logo.svg`. `SiteHeader.astro` puts it straight into the page, with its notes stripped. That means no extra download, no image request (the Medicaid page allows none), and no font file.
- **Font.** Shrikhand, SIL Open Font License 1.1, Copyright (c) 2015 Jonny Pinhorn (OFL allowed for fonts, owner Q122). The letters are converted to shapes, so no font is downloaded.
- **Colours** (light page, the header's only background). "Philly" is navy `#1f4e8c`, 7.95:1. "Volunteers" is rust `#a8432b` (the notice border colour), 5.73:1. Bright coral is never used as lettering on paper (2.4:1). The map's shapes all have a navy `#15294a` edge (13.9:1).
- **Navy version, used in dark mode.** "Philly" white, "Volunteers" coral `#f08a6c` (from `site/design/brand-options/option-a4-dark.svg`). The two lettering shapes take their colour from `--logo-philly` and `--logo-volunteers`, so the same inline drawing switches with the page; there is no second file. On the dark page: white 18.0:1, coral 7.3:1, the map's pale blues 9.1:1 or more.
- **Size.** 56 px tall on phones (150 px wide) and 64 px tall from 480 px wide (171 px wide). Sized in rem, so it grows with the reader's text size.
- **Name for screen readers.** The drawing is `aria-hidden`. The link holds the site name from the settings (`site.name`) in visually hidden text, so it is announced as "Philly Volunteers" and goes to the home page in the current language.
- **Other cities.** The lettering spells "Philly Volunteers". A city that copies the site with another `site.name` needs its own `logo.svg`.
- **Options not chosen.** A, B, C, A2, A3, A5 and A6, with previews and a README, are in `site/design/brand-options/`. That folder is outside `public/`, so it is not published. The generator scripts were build-time only and are not kept in the repo.

## Link-preview picture (decision 0014)

`site/public/og/en.png` and `es.png`, 1200 x 630, about 85 KB each: the headline (white, 80 px heavy, 14.5:1) and tagline (coral, 42 px bold, 5.9:1) on the band navy `#15294a`, beside a stylized map of the city's eight sections (pale blues, Center City in coral, the Schuylkill as a gap, the Delaware as a line, five coral pins). No labels on the map: they would be unreadable in a Facebook thumbnail. Words stay inside x 72 to 612, y 70 to 560, away from edge crops. Words come from `og.headline` and `og.tagline`, with `{city}` from the area's name in the settings file. To redraw after a word change: `node scripts/render-og.mjs` in `site/` (template: `site/scripts/og/template.svg`; uses the Mac's Google Chrome, no packages, system fonts). The script shrinks the headline if a language runs long, and stops with an error if the words still do not fit, or if a picture is not 1200 x 630 or is over 300 KB.

## About page drawings (decision 0025)

Nine drawings for the About page, one per section, in `site/src/components/ui/aboutArt.ts`. Each is a finished inline `<svg>` string, 480 x 300, that fills the width of its box; use it with `<div class="about-art" set:html={aboutArt.shifts} />`. They look right from 360 px wide (on a phone) up to about 480 px; do not stretch them wider. Same style as the cause drawings and the link-preview map: navy shapes, coral shapes with an ink outline, white details, and a soft tinted blob behind.

| Id | Section | What it shows |
|---|---|---|
| `shifts` | Every volunteer shift in one place | Six calendar cards, the front one coral |
| `near-you` | Find one near you | The city's eight sections from the link-preview map, with five pins |
| `everyone` | Built for everyone | A phone with an access figure, two speech bubbles (two languages) |
| `private` | Safe and private | A shield with a padlock in front of a calendar |
| `more` | More than one-off shifts | A clock (flexible), three people (Volunteer Teams), a calculator |
| `rewards` | Coming next: Citywide Rewards | A star medal with ribbons, and a ticket |
| `why` | Why support it | A heart held up by two open hands |
| `support` | How to support | A shop and an organization's building tied together with a bow |
| `contact` | Get in touch | An envelope with a letter and a heart seal |

- **Decorative.** Each `<svg>` has `aria-hidden="true"`; the section's heading and text carry the meaning.
- **No words in the drawings** (Q36). Speech bubbles and the letter show lines, not text, so nothing needs translating.
- **Contrast.** Meaningful shapes are navy (8.0:1 on paper, 7.0:1 on the tint), ink (15.7:1), or coral with an ink outline (coral alone is only 2.4:1). The rivers on the map are `--art-water` (5.3:1). The tinted blobs (`--art-tint`, `--art-tint-2`) and the map's pale blues are decoration.
- **No outside files.** No images, fonts or links; colours are written into each shape from the `--art-*` tokens, with the same colours as a fallback, so the drawings show even without the site's CSS.
- **No people being served.** The only figures are plain silhouettes (the volunteer team) and an access symbol.

## Page layout (guidance for pv-calendar-site)

- **Home:** test banner (test builds), header (site name left, language link right, written in its own language with `lang="es"`), the rewards line (white box, coral left edge), a row of day chips, "This week's picks" with a one-line note, then day headings ("Tonight", "Tomorrow", then dates) each with a `.stack` list of cards. The Filters button is fixed to the bottom of the screen; it opens a full-height sheet with the filter groups and a full-width "Show shifts" button at the bottom.
- **Listing page:** back link, cause drawing (11rem tall), title (h1, in the listing's language), "Hosted by", how-to-join pill and spots badge, When and Where with icons, the join hint, the main button to the organization's page with the external note under it, "Add to my calendar", Save and Share, "About this shift" tags, the business-led note when it applies, "Last checked", and "Report a problem".
- Wrap the page in `.page`. Put the skip link first in `<body>`.

## Words needed (for pv-languages)

These keys do not exist yet. Proposed English below; pv-languages owns the files and the Spanish.

| Key | English |
|---|---|
| `site.test_version` | Test version. Listings may be wrong or out of date. |
| `home.picks_heading` | This week's picks |
| `home.picks_note` | Shifts with room, chosen by our team. Never paid for. |
| `home.tonight` | Tonight |
| `home.tomorrow` | Tomorrow |
| `listing.save` | Save: {title} |
| `listing.share` | Share: {title} |
| `listing.save_short` | Save |
| `listing.share_short` | Share |
| `listing.saved_note` | Saved on this device only. |
| `listing.link_copied` | Link copied. |
| `listing.full` | Full |
| `listing.spots_left.one` | {count} spot left as of {when} |
| `listing.spots_left.other` | {count} spots left as of {when} |
| `listing.as_of_last_night` | last night |

## Open questions for the owner

- **Sensitive mark** (Q27 part 2): no mark for now. If the owner wants one, the dashed shield pill is ready; it needs agreed words.

## Dark mode (owner, 2026-11-10)

Phones and computers set to dark mode get our own dark colours. Before this, the page said `color-scheme: light`, and Samsung Internet darkened it by itself, which looked wrong (owner's Samsung S25).

- **How it works.** `tokens.css` has the light set, then `@media screen and (prefers-color-scheme: dark)` redefines every colour token. `base.css` says `color-scheme: light dark`, and every page has `<meta name="color-scheme" content="light dark">`, so browsers use our colours instead of their own. "screen" means printing always uses the light set.
- **One rule for components.** No component writes a colour of its own; each uses tokens. A build test (`site/tests/dark-theme.test.ts`) checks that every light colour token has a dark value, that no colour is written straight into a style (print excepted), that each page has the meta tag, and the key contrast pairs in both sets.
- **No switch on the site.** It follows the device setting. A switch would be a new control; ask the owner first if one is wanted.

### Dark colours and contrast

| Role | Token | Dark | Contrast |
|---|---|---|---|
| Page | `--color-paper` | `#0f1724` | |
| Surface (sheets, fields, panels) | `--color-surface` | `#18233a` | |
| Text | `--color-ink` | `#eef2f8` | 16.0:1 on page, 14.0:1 on surface |
| Secondary text | `--color-ink-muted` | `#b8c3d3` | 10.1:1 on page, 8.8:1 on surface |
| Borders that must be seen | `--color-line` | `#8391a8` | 5.6:1 on page, 4.9:1 on surface, 4.5:1 on the notice |
| Dividers only | `--color-line-soft` | `#2c3a50` | decoration |
| Main colour (links, buttons) | `--color-primary` | `#8ab4f0` light blue | 8.5:1 on page, 7.4:1 on surface, 5.7:1 on the band; dark text on it 8.5:1 |
| Main colour, hover | `--color-primary-hover` | `#b3cff7` | 11.3:1 on page; dark text on it 11.3:1 |
| Words on the main colour | `--color-on-primary` | `#0f1724` | (above) |
| Coral accent | `--color-accent` | `#f08a6c` (same) | dark text on it 6.7:1; 7.3:1 on page, 5.0:1 on band |
| Card band | `--color-band` | `#1d3560` | white 12.1:1, light text `#d5deeb` 8.9:1 |
| "Full" badge | `--color-full-bg` / `-text` | `#eef2f8` / `#0f1724` | 16.0:1 |
| "Spots left" badge | `--color-spots-bg` / `-text` | `#0f1724` / `#eef2f8` | 16.0:1 |
| Notice (test strip, business-led) | `--color-notice-bg` | `#3a2420` dark rust | text 12.9:1; stripes: coral 5.9:1, light 12.9:1 |
| Notice edge | `--color-notice-border` | `#f0937a` | 6.3:1 on the notice |
| Focus ring / inner ring | `--color-focus` / `--color-focus-inner` | `#ffffff` / `#0f1724` | ring 18.0:1 on page, 15.7:1 on surface, 12.1:1 on band; inner ring 8.5:1 on a main-colour button |
| Focus inside the band | `--color-focus-on-dark` | `#f08a6c` | 5.0:1 on band |
| Panel backdrop | `--color-backdrop` | black at 65% | decoration |
| Card and panel shadow | `--shadow` | adds a 1 px `#34507e` ring | decoration: cards are told apart by the drawing and the band |
| Select arrow | `--select-arrow` | drawn in `#eef2f8` | 14.0:1 on the field |

### Drawings in dark mode

- **Cause drawings** keep their colours (navy, coral, ink, white). Their tiles are the light colours a little softer (x 0.85), so a card does not glare: navy shapes 4.2:1 to 4.7:1 on every tile, ink 8.3:1 or more. The soft white circles use `--art-fill-3`, not a written-in white.
- **About drawings** keep their colours and sit on a rounded tile, `--art-backdrop` `#cbd2db` (transparent on the light page): navy 5.5:1, ink 10.8:1, rivers 3.6:1. The tile is the first shape inside each drawing, so nothing else on the page changes.
- **Instagram picture** keeps its own fixed design in both modes: `PICTURE_COLORS` in `scripts/share-picture.ts`, the light set.
- **Link-preview picture** is a PNG for other sites; unchanged.

### Map in dark mode

- **Street map:** Protomaps' "dark" colours from the same pinned `@protomaps/basemaps` 5.7.2, drawn from the same street map file, letters and road-sign sprite (the "light" sprite already in `/map/`). No new file, no new request. `lib/map-style.ts` picks dark when the device asks for it (`dark` option, for tests). The labels are lightened to 4.5:1 or more on their halos: street names `#949494`/`#9a9a9a` (5.4:1/5.9:1), places `#a3a3a3` (6.5:1), water names `#8f9fd0` (6.3:1).
- **Behind the map while it loads:** `--map-earth`, the street map's own land colour (`#e2dfda` light, `#1f1f1f` dark).
- **Pins** (`--map-pin-ring`, `--map-pin-edge`, `--map-area-fill`): in dark, a light-blue dot with a dark ring and a white edge. White edge 16.5:1 on land, 9.3:1 on the brightest road, 12.3:1 on water; dot on ring 8.5:1. The "approximate area" ring is dashed light blue on a dark fill: 7.7:1 on land, 4.4:1 on the brightest road, 5.8:1 on water. Number circles: white on the band, 12.1:1. An open pin has a white, dark, white triple ring (light mode: ink, white, ink).
- **Two-finger hint:** white on black at 85% in both modes, 11.7:1 or more.
- **Switching mode while a map is open** changes the pins and frame at once; the street map's colours change the next time the map opens.

## Not in this round

A print style, and the filter sheet's own component. Each can follow once the look is approved.
