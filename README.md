# Globoknot

A geography and world-knowledge quiz site built on one verified, linked knowledge base.
Facts are checked once; questions are generated from them by templates.

Plan: [docs/PLAN.md](docs/PLAN.md) · Knowledge system: [docs/KNOWLEDGE-SYSTEM.md](docs/KNOWLEDGE-SYSTEM.md) · Putting it online: [docs/DEPLOY.md](docs/DEPLOY.md) · Sources and licences: [CREDITS.md](CREDITS.md)

## The site

Astro, built to plain static files. One page. The home screen shows the levels, and under them one grey line with the
rest of the configuration: the categories as icons (half lit when only some of their question types are picked), where
and how many, and the answers when they aren't the level's own ("World · 13 questions · Type"). The line opens the
configuration: level, answers, what (capitals, flags, languages, mountains, rivers...), where (whole world, continents
or single countries) and how many questions (8, 13, 21 or 34, or any number). Then play, and see every answer at the
end. Every question has 20 seconds (15 until 14 Nov), the same for everyone, and the last five count down in tenths
(4.9, 4.8...); a wrong typed answer is not revealed, so the player can try again until the time runs out. Next to Play:
the Daily (below) and Practice (below that).

The counts are Fibonacci numbers, each the two before it added up (8 + 13 = 21), so each is about 1.6 times the last;
13 to start with (8 for a new player's first round: see Experiments). Counts saved before them move to the closest one (10 to 13, 20 to 21, 50 to 34).

Four levels, named after real knots (James, 14 Nov): Overhand, Bowline and Monkey's fist on the home screen, and Atlas,
the hidden fourth. Each has its colour wherever it shows (home, configuration, the knots of a round, the results, a challenge):
green, gold, orange and crimson, with a knot drawn beside its name. A level picks a set of question types and a way
to answer, which the player can still change in the configuration, and decides how well known the places asked about
are. Atlas is everything, typed: every question type it asks, about the whole world, and only the count can change
(James, 16 Nov: "Atlas mode is locked in with everything, and in type mode"). Atlas is not on the home screen: it waits in the configuration
behind a padlock until a Monkey's fist round of the level's own questions, 8 or more, scores 75% or more (whoever played
three rounds before 14 Nov keeps it open). The ids stay `easy`, `medium`, `hard` and `impossible`: saved selections
and links use them.

| Level | Question types | Answers | Places |
|---|---|---|---|
| Overhand (easy; new visitors) | Capitals, flags | Choose: four options, far apart | Famous countries only, while there are enough |
| Bowline (medium) | Locations, capitals, flags, languages | Both | Well-known only, while there are enough |
| Monkey's fist (hard) | Every category | Type | About 60% well-known |
| Atlas (impossible) | Every category, but no flag to pick | Always typed | About 20% well-known, never famous unless nothing else is left |

Answers: Choose (four options), Type, or Both (each question its own way: a flag to name is typed, a flag to find is
picked). Every question type has both forms, except the flag to find, which is always picked: its answer is a picture.
Atlas has no options at all: Choose and Both can't be picked there, and it never asks for a flag to find (James,
14 Nov: "Impossible should have no multiple choice"). On Overhand the wrong options are far apart and familiar; on
Monkey's fist they are the tempting ones (neighbours, nearby rivers, and flags that look alike: Chad's among Romania's
and Andorra's), and on Overhand no flag among the options looks like the right one (no Poland or Monaco next to
Indonesia).
Which flags look alike is worked out once by `scripts/flags-alike.mjs`, which draws every flag small and compares them
colour by colour and by layout, also mirrored (`data/countries/flags-alike.json`).

How well known: countries by `data/countries/tiers.csv` (37 famous, 37 well known, the rest); languages through the
countries where most people speak them (not Irish or Romansh); rivers of 2,500 km and more plus a list of famous ones;
peaks of 5,000 m and more. A highest point asked for its country is as well known as the best-known country that
counts as right, and at least well known from 5,000 m.

A river is asked by sight: the river on the map, which one is it? Which country a river flows through is no longer
asked (James, 14 Nov: it "feels very similar to simply identifying a country on the map, just with an extra step").
A highest point is asked by its name, without a map while it is asked ("Mount Kilimanjaro is the highest point of
which country?"): the triangle would show the country. The answers afterwards show it on the map. Mount Kenya, Mount
Cameroon, Pico de São Tomé and Morne Seychellois are not asked for their country: their names give it away. Pico
Bolívar is: it is Venezuela's, and Bolivia tempts.

The Daily climbs: eight questions, the same for everyone on a day, two from each level, from Overhand to Atlas, each
asked the way its level asks (picked from four far-apart options at the start, typed at the end). Everyone gets a few
right, and the best are still tested. Every category comes up at least once and none more than twice. Its knots grow
with the levels on the way, and the shared result shows them in four steps ("●● ●○ ●· ··"); a link to it brings back
the same eight, each asked its level's way (`eemmhhii` in the link). New round after it starts a round of one's own.

Typing forgives: an exact name first, then the usual typo correction (one typo in names of 5 to 8 letters, two in
longer ones, never between two real names such as Niger and Nigeria), and then a near miss for the right answer, with one
typo more, when no other name is as close ("Ngera" for Nigeria). Some names count only for the right answer ("Congo"
for DR Congo, "Korea" for South Korea: `context_aliases` in `data/countries/names.csv`). Other names count too,
old ones and those in the place's own language (James, 16 Nov: "Denali / Mount McKinley"): Persia, Ceylon, Zaire,
Deutschland, Suomi; Peking, Nur-Sultan, Wien; Sagarmatha, Mount McKinley, Monte Bianco; the Yellow River, the Ganga,
the Oxus (`data/countries/names.csv` for countries and capitals, `data/geo/names.csv` for peaks and rivers). "Mt." is
"Mount", "Mount" may be left out (Everest, Kilimanjaro; not where the rest is a country, as Mount Kenya), and "River"
before or after a river's name is ignored ("the River Nile", "Mississippi River").

On screens from 1240 px wide, the round so far hangs down the left side of the quiz as a rope, one knot per answer. The
right side is left free: an advertisement can go there later (`.rail.right`, commented out in `index.astro`), away from
the answer box and the buttons.

Scoring is a rope of knots: right the first time ties a solid knot (1 point), right after a retry an open one (half a
point), and a miss frays the rope (the code still calls them tight and loose). The score ring shows the rope, and the
rank is a knot (Loose end to Endless knot). Under it, three numbers: the best run of right answers, the fastest right
answer and the time. After 90% or more on a level's own questions, the next level is offered, one tap away ("Too
easy? Try Bowline"); Monkey's fist offers Atlas once it is open. Two rounds under 40% in a row offer the level below
("Too hard? Try Overhand"; on Atlas, "Too heavy?"). The round that opens Atlas says so,
with a button to try it. A round's knots, its ring and its title on the results take the level's colour. Share
sends the score with a challenge link (`#c=...`: the question codes and subjects plus a seed and the level, so a friend
gets the same questions, asked the same way, at the same level, and a score to beat); the share icon at the top shares
the site. Stopping a round shows the answers so far, without a score. Leaving a round asks first ("Leave this round?",
James, 16 Nov): Esc, the X or the logo opens the question, and a second Esc or Leave goes, while Enter or Resume
goes back; meanwhile the question's time stands still and the question is blurred behind the card.

Tapping an answer opens it again: the map of the country it was about with the countries around it named (for a highest
point, the peak with its country), and a card with
its flag, capital, languages, highest point, rivers and neighbours (a river, a language or a mountain gets its own card).
Names on the map are sized for the width the map is shown at, and left out where they would cover each other.
The maps (`npm run build:map`) keep one shape per country (a reef with Australia's code once replaced its mainland, so
Australia's map showed the Timor Sea), and countries under 5,000 km² keep every point, so Malta, Singapore and the
island nations show inside their ring instead of vanishing (16 Nov). A capital's dot is always well inside the view
(Kuala Lumpur, west of Malaysian Borneo). `test/map.test.mjs` checks all three for every country.

Practice (simplified on 16 Nov, at James's ask, into a whole set on one screen): one set per category, Countries,
Capitals, Flags, Languages, Highest points or Rivers, in the whole world or one continent (flags are always the whole
world, mixed anew each time). One item at a time is asked, picked out in green (James's finishing notes, 16 Nov): on a
map a country, its capital, its highest point or a river; otherwise a flag or a text sample. Once it is answered the
next comes up by itself (on a map the nearest still to find, a continent at a time; on cards the next along, and after
the last the earliest still to find); a tap on any other asks that one instead, and Skip (or → in an empty box) leaves
it for later. A name that may be the start of a longer one waits a moment ("Niger" on the way to "Nigeria"), Enter
forgives a typo, and a wrong answer that names another one of the set shows where that one is, for a moment.
Countries, capitals and highest points are on a map of the region (the smallest countries as dots), rivers on a map of
their own, flags and text samples on cards. The maps zoom and turn with one finger; the world is a globe to turn. No
time limit and no clock while playing (James: "could practice questions not be timed?"): the time shows at the end,
next to the best (score, then time; kept per set and region, as `C-eu-f`). Give up shows what was missed, in red.
Practice doesn't tie countries or count as a round. (`sets.ts` makes the sets, `fill.ts` the screen.)

The logo is the world in a loop of rope whose ends cross below it, as in a knot; the globe on the home screen sits in the
same loop. Tapping the logo goes back to the home screen from anywhere (a round in progress is dropped, unscored). The
home globe turns by itself or by dragging. Zooming in (the + and − buttons beside it, a pinch, the scroll wheel or a
double tap) grows the globe itself (James, 16 Nov: "so you can cover the screen with your globe if you so wish"): it
leaves its rope for a layer over the whole screen and grows round its own place, behind the menu, which stays where it
is and can still be used ("could the menu still stay visible when earth is zoomed into?"); only the rope fades. It
covers the screen and goes on to four times that size, with + and − still beside it. Grown,
it stops turning by itself and draws the countries' borders: the detailed 1:50m map (`world.json`) at rest, the 1:110m
one while it moves, and only the land in view. ↺, − all the way, Esc or the logo bring it back into its rope, and so
does leaving the home screen. Day and night are as they are at that moment ("With night and day and lights too?"):
`sun.ts` works out where the sun stands overhead (the U.S. Naval Observatory's approximate solar coordinates), the
night side darkens through a soft twilight, the day side a little away from the sun, and the lights of 6,099 towns and
cities (Natural Earth's populated places of 10,000 people or more, `lights.json`, `npm run build:lights`) come on
across the night side, bigger and brighter for bigger places.

Tapping a country on the home globe opens its sheet beside the globe (James, 16 Nov; a double tap zooms instead, so
a tap waits 0.3 s for a second one) and picks the country out in green: its photo (James's own, in `public/photos`, see [docs/PHOTOS.md](docs/PHOTOS.md); until there is one, the
private preview shows where it goes), a map with the capital, the major rivers and the notable peaks named and the
neighbours around it, and the capital, languages, highest point, peaks, rivers and neighbours. A neighbour, by its name
or its shape on the map, opens its own sheet without closing the first: a wide screen shows the last two side by side
and slides the menu over, a narrower one shows one at a time with a tab for each open sheet (up to six). × or Esc
closes the one in front; leaving the home screen closes them all. The rivers and peaks come from
`public/data/sheets.json` (`npm run build:sheets`, loaded with the first sheet): the knowledge base's rivers and highest
points, Natural Earth's rivers (one counts where at least 25 km of it, and a third of its longest stretch in any
country, lie inside; six at most) and peaks of 1,000 m or more, and a few famous peaks Natural Earth leaves out
(`data/geo/notable-peaks.csv`: Kangchenjunga, the Jungfrau, the Eiger, Mont Ventoux...). The sheets are to look at:
the questions still ask approved facts only.

A few words are only shown when asked for, behind an ⓘ (what the levels mean, what Practice is, what
Auto-submit does). About opens with the numbers (194 countries, 1,417 checked facts...), counted from the facts as they
load, then how a fact gets in, how to play, and the sources. Settings has three volumes (Volume, Effects, Music); the
sounds and music go in named slots, listed in [docs/AUDIO.md](docs/AUDIO.md).
Under Atlas, once it is open, is All: The Gordian Knot, every question in the game that can be typed (1,828 of 2,022:
each flag is asked to be named, not to be found), in crimson, with one record (best score, then fastest). Untying it,
100% with every answer right the first time, earns a badge like no other: Better than Alexander ("He cut the Gordian
Knot. You untied it."), a gold medal with a laurel wreath round a globe, the best time under All in the
configuration, and the ropes round the home globe and the logo turn gold for good.

Every button gives way when pressed (James, 14 Nov: "so you really feel like it's clicked"): Play, the answers and the
other big buttons sit on an edge, like keys, and go down onto it; the small ones shrink. They go in at once and spring
back up, a little past where they were; the press holds a moment at least, so the quickest tap shows it, and the keys
that answer (1 to 4, Enter) press their buttons too. On a phone that can, a click also gives the lightest buzz (10 ms),
unless Effects is off (`press.ts`, and "a press you can feel" in `global.css`).

### Experiments for the second playtest

Three experiments from the plan "Globoknot: a reason to come back" (14 Nov), each answering one question. Each can be
switched off in `src/scripts/experiments.ts`, and the game is then as it was.

- **Tie the world** (do ordinary rounds feel like they count?): a country answered right the first time is tied, in
  the category it was asked in (`gk-tied`: a letter per category). Tied countries light up on the home globe, gold once
  right in three categories, and the results say what the round tied (a count beside the globe, from 15 Nov, was
  taken off on 16 Nov: James found it out of place on the home screen) ("+5 tied · 1 turned gold · 23 of 194"). The countries tied in the round just played pulse
  when the home screen comes back, and the globe turns to face them. A question ties the country it is about; a river
  or a language text ties none. The globe lights countries from `globe.json` (Natural Earth 1:110m countries); the 29
  too small for it get a dot, and zoomed in they take the detailed shapes.
- **The Daily rope** (does a streak bring people back the next day?): the days the Daily was played in a row ride on
  the Daily button as a knot and a number, only an outline while today's is still to play. One missed day between
  two played ones is forgiven, once a week; two in a row cut it (`rope.ts`). Once today's is played, the button says
  when the next one comes ("in 5 h", midnight UTC), and so do the results.
- **A first round that lands** (does a quick win lead to a second round?): a new player's first round is 8 questions
  instead of 13 (through reloads, until a round is played); a count they pick is kept. Two rounds in a row under 40%
  on a level's own questions offer the level below.

```
npm install
npm run dev       # http://localhost:4321, reloads as you edit
npm run build     # the finished site in dist/
```

```
src/pages/index.astro     the quiz page: start screen, question card, results
src/layouts/Base.astro    page frame: header, fonts, PREVIEW switch (noindex and badge)
src/styles/global.css     all styles; colours are tokens with light and dark values (blue and orange presets)
src/scripts/app.ts        the quiz screens, keys and timing
src/scripts/menu.ts       the configuration: level, answers, what, where, how many
src/scripts/practice.ts   the Practice sheet: which set, where, and the best so far
src/scripts/sets.ts       Practice sets: one per category, every item of a region, and the names that find them
src/scripts/fill.ts       Practice played: one set filled in at once, on a map or in cards, untimed
src/scripts/prefs.ts      what the browser remembers: the selection, settings (auto-submit, theme, colour), the Daily, stats, the countries tied
src/scripts/experiments.ts  the three experiments for the second playtest, each on or off
src/scripts/rope.ts       the Daily rope: days in a row, one missed day a week forgiven, and the time to the next Daily
src/scripts/press.ts      a press you can feel: the press on every button, held a moment, and a tiny buzz
src/scripts/questions.ts  question templates (12 kinds, one clue each, given/asked tags), the levels and the round builder: approved facts in, questions out
src/scripts/kb.ts         the knowledge base as the site reads it
src/scripts/map.ts        the map: a globe turned and zoomed to the asked country, capital, peak or river
src/scripts/sheet.ts      a country's sheet, opened from the home globe: photo, map, facts, neighbours side by side
src/scripts/globe.ts      the globe on the start screen: turns by itself, can be dragged, grows over the screen when zoomed, names the country under the pointer, lights the countries tied, shows day, night and city lights
src/scripts/sun.ts        where the sun stands overhead at a moment, for day and night on the globe
src/scripts/sky.ts        the night sky behind the start screen: stars that light up and tie together when touched
src/scripts/sound.ts      sounds and music in named slots (docs/AUDIO.md): a file in public/audio per slot, else a
                          small synthesised placeholder; the three volumes in Settings
public/data/              countries.json (npm run build:data), rivers.json (npm run import), world.json (1:50m) and globe.json (1:110m countries; npm run build:map), lights.json (npm run build:lights), sheets.json (npm run build:sheets)
public/photos/            James's photos for the country sheets, one per country (docs/PHOTOS.md)
public/flags/             flags from flag-icons (npm run build:flags)
```

## The knowledge base

```
data/
  relations.yaml          every kind of fact, defined once (definition, direction, question wording)
  disputed.json           places and facts that never appear in scored questions
  countries/              the countries module
    countries.csv         194 countries (UN members + Vatican City): names, accepted answers, codes
    cities.csv            capitals
    languages.csv         languages (ISO 639-3 ids)
    facts.csv             every fact with its sources and status (approved / rejected / excluded)
    decisions.csv         human decisions; these always win over the sources
    names.csv             preferred names, extra accepted answers (other and former names), removed ambiguous ones
    positions.csv         capitals' positions where the sources disagree
  geo/                    highest points and rivers
    peaks.csv, rivers.csv entities (generated by scripts/import-geo.mjs)
    facts.csv             highest_point and flows_through facts with their sources and status
    decisions.csv         human decisions on peaks and crossings
    names.csv             other names of peaks and rivers (Sagarmatha, Mount McKinley, Yellow River), wrong ones removed
    notable-peaks.csv     famous peaks Natural Earth leaves out, for the country sheets only (no facts, no questions)
  languages/
    samples.csv           a short text in each language (UDHR Article 1, generated by scripts/import-samples.mjs)
    clusters.csv          languages written so alike that they count for one another
review/countries.md       what still needs a decision (generated)
review/geo.md             the same for peaks and rivers
data/countries/tiers.csv  which countries count as famous or well known (a play-balance setting, not a fact)
public/data/countries.json compact output for the site (generated, approved facts only)
```

## How a fact gets in

1. `npm run fetch` downloads the sources into `sources/cache/` and records the date in `sources/manifest.json`.
2. `npm run import` turns them into facts. If two independent sources agree, the fact is approved
   automatically. Anything else is a **draft** and lands in `review/countries.md`.
3. You decide each draft with one line in `data/countries/decisions.csv` (`approved` or `rejected`,
   optional qualifier and note). Re-run the import. Decisions survive every re-import.
4. `npm run check` refuses to continue on any problem: wrong entity types, missing sources, disputed
   places, two places sharing an accepted answer, and more.
5. `npm run build:data` writes `public/data/countries.json` with approved facts only.

`npm run data` runs steps 2 to 5, copies the flags and builds the country sheets' rivers and peaks. `npm test` tests the answer matcher (silent typo correction, near misses, context names), the names people type (old names and names in their own language too), and the round builder: the levels, both answer forms of every question type, challenge links, and no country or river twice in a round (this one needs Node 22.18 or newer; older versions skip it).

## Adding a subject later

New folder under `data/` (as `data/geo/` did for peaks and rivers), its relations in `relations.yaml`, an importer
script, question templates in `src/scripts/questions.ts` (plus a category in `CATS` and its icon in
`src/scripts/menu.ts` if it is a new kind of question). The menu lists it from there.
