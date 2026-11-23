# Globoknot photos: a few per country

Tap a country on the home globe and its sheet opens: photos at the top, then a line about the country, a map, one
interesting fact and the facts. There are up to five photos per country, with a dot for each: they glide on by
themselves every few seconds, and a click, a tap or a swipe brings the next. Under the one in view:
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

## Landmarks, culture, nature and food (23 Nov 2026)

James then asked for fewer city shots and more of what a country is known for ("Día de Muertos for Mexico, or the
Grand Canyon for the US"), and for a nature photo where there wasn't one, food, and people. So a sheet now shows up to
five photos, in this order:

1. a landmark,
2. a custom or festival (these show the people),
3. another landmark,
4. a nature photo, only when neither landmark is one already,
5. a dish.

The earlier photos only fill a country up to three, after these.

- `scripts/photos/subjects.py` lists the subjects per country by their English Wikipedia titles: `SUBJECTS` (landmarks
  and customs), `EAT` (dishes) and `WILD` (nature).
- `scripts/photos/fetch_culture.py <repo> <out> [culture-skip.json]` takes each subject's own image from Wikidata, or
  else the photo from its Commons category that its English article shows or Commons marks as a featured, quality or
  valued image. A photo of a custom or dish found outside the country's own subcategory must name the country. Same
  rules as before: free licences only, landscape, at least 1000 px wide, no paintings, maps or old photos. It
  downloads the picks at 960 px for review and writes `culture.json`.
- Every pick was looked at on contact sheets. Out went another country's dish filed in the same category (Korean
  nurungji under Iran's tahdig), brand logos, signboards, museum displays, festival photos taken abroad, black and
  white photos, unappetising food, close-ups of people, dark cave interiors, and hazy or mostly-sky shots. A subject
  whose photos were all of that left the list (tahdig, palusami and halwa show other countries' dishes; Jeita Grotto
  and Kow Ata are too dark inside). `scripts/photos/culture-skip.json` lists them, as
  `CODE:Commons file name`, a file name alone (for every country), or `CODE:~words` (every file of that country whose
  name holds the words). Run `fetch_culture.py` again after adding to it and the next best moves up.
- `scripts/photos/make_culture.py <culture.json> <repo> scripts/photos/culture-skip.json` makes the WebP files and
  `credits.json` as before. Run it on the earlier photos (`git checkout 44426ca -- public/photos` first), never on its
  own output.

`scripts/photos/culture.json` is the list it made: each photo's Commons file, what it shows, its author and licence.

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

