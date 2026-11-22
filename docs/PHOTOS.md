# Globoknot photos: a few per country

Tap a country on the home globe and its sheet opens: photos at the top, then a map and the facts. There are up to
three photos per country, to swipe through (or the arrows on a computer), with a dot for each. Under the one in view:
what it shows and who took it, under which licence, linked to the photo's page on Wikimedia Commons, where its full
licence and history are. A country without a photo shows its sheet without one (the private preview shows a dashed
box with the file name where the photo goes). Photos after the first load only when swiped to.

The code is `src/scripts/sheet.ts`; the list is made in `src/pages/index.astro` from the files in `public/photos`.

## Where they come from (22 Nov 2026)

James asked for a few photos per country, and for the finding, licensing and renaming to be done for him. They are
free photos from Wikimedia Commons, found through Wikidata, so each one was already picked by Wikipedia's editors to
show that place:

1. For each country, the photos Wikidata gives the country itself (its image, panoramic and aerial views), its capital
   and its highest point (`scripts/photos/fetch_photos.py`); for a country left short, its regions' photos
   (`scripts/photos/topup.py`).
2. Only free licences (CC0, public domain, CC BY, CC BY-SA), never "fair use"; landscape, at least 800 x 450.
3. Every one looked at on contact sheets. Out went satellite and space photos, maps and relief renders, a flag, a
   stamp collage, close-ups of people, soldiers and military vehicles, and hazy or dull shots (124 in all;
   `scripts/photos/skip.json` lists them).
4. The first three left for each country, its own photos first, then its regions'. That makes 540 photos for 191
   countries (44 MB). Jamaica, Namibia and the Solomon Islands have none yet (Namibia has no Wikidata link in
   `countries.csv`); their sheets open without one.
5. `scripts/photos/make_photos.py` crops each to 16:9 from the middle, 960 x 540, as WebP at quality 68 (about 85 KB),
   and writes `credits.json`.

The scripts ran from a scratch folder, with the downloads in `out/raw`; `scripts/photos/plan.json` is the list they
made (each photo's Commons file, what it shows, author and licence). To make the photos again: `fetch_photos.py <repo>
out`, `topup.py <repo> out`, then `make_photos.py out/plan.json <repo> scripts/photos/skip.json`. To drop a photo, add
its plan key (`fra-2`: France's second candidate in the plan, not the second file) to `skip.json` and run
`make_photos.py` again; the next candidate moves up.

## The files

- **Name:** the country's three-letter code in lower case, then `-1`, `-2`, `-3` for the order on the sheet
  (`fra-1.webp`, `fra-2.webp`). A single `fra.jpg` works too. `.jpg`, `.webp`, `.png` and `.avif` are all fine.
- **Shape:** 16:9, landscape; other shapes are cropped to 16:9 from the middle. 960 x 540 is sharp on the sheet,
  phones with dense screens included.
- **Your own photo:** drop it in as `fra-1.jpg` (the others move along if renamed `-2`, `-3`) and add a line for it in
  `credits.json`, or none.

## credits.json

One entry per file, by its name without the extension. Either a line of text, or what it shows, the credit and a link:

```json
{
  "fra-1": { "place": "Paris from the Arc de Triomphe", "credit": "Pierre Blaché, CC0", "link": "https://commons.wikimedia.org/wiki/File:..." },
  "fra-2": "Mont Saint-Michel. Photo: James"
}
```

A CC BY or CC BY-SA photo must keep its credit: the author, the licence, and a link to where both are written.

