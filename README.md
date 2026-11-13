# Globoknot

A geography and world-knowledge quiz site built on one verified, linked knowledge base.
Facts are checked once; questions are generated from them by templates.

Plan: [docs/PLAN.md](docs/PLAN.md) · Knowledge system: [docs/KNOWLEDGE-SYSTEM.md](docs/KNOWLEDGE-SYSTEM.md) · Putting it online: [docs/DEPLOY.md](docs/DEPLOY.md) · Sources and licences: [CREDITS.md](CREDITS.md)

## The site

Astro, built to plain static files. One page: open the configuration (≡), pick a level, what (capitals, flags,
languages, mountains, rivers...) and where (whole world, continents or single countries) and how many questions (10, 20,
50 or any number), play, and see every answer at the end. Every question has 15 seconds, the same for everyone; a wrong
typed answer is not revealed, so the player can try again until the time runs out. There is also a Daily: the same 10
questions for everyone.

Four levels, shown under Play ("Easy", "Easy + custom", "Hard · Europe"). A level picks a set of question types and a way
to answer, which the player can still change (that is the "+ custom"), and decides how well known the places asked
about are. Impossible shows itself after three rounds.

| Level | Question types | Answers | Places |
|---|---|---|---|
| Easy (new visitors) | Capitals, flags | Choose: four options, far apart | Famous countries only, while there are enough |
| Medium | Locations, capitals, flags, languages | Both | Well-known only, while there are enough |
| Hard | Every category | Type | About 60% well-known |
| Impossible | Every category | Type | About 20% well-known |

Answers: Choose (four options), Type, or Both (each question its own way: a flag to name is typed, a flag to find is
picked). Every question type has both forms. On Easy the wrong options are far apart and familiar; on Hard and
Impossible they are the tempting ones (neighbours, nearby rivers).

How well known: countries by `data/countries/tiers.csv` (37 famous, 37 well known, the rest); languages through the
countries where most people speak them (not Irish or Romansh); rivers of 2,500 km and more plus a list of famous ones;
peaks of 5,000 m and more. The Daily is Medium with every category, the same for everyone.

Typing forgives: an exact name first, then the usual typo correction (one typo in names of 5 to 8 letters, two in
longer ones, never between two real names such as Niger and Nigeria), and then a near miss for the right answer, with one
typo more, when no other name is as close ("Ngera" for Nigeria). Some names count only for the right answer ("Congo"
for DR Congo, "Korea" for South Korea: `context_aliases` in `data/countries/names.csv`).

On screens from 1240 px wide, the round so far hangs down the left side of the quiz as a rope, one knot per answer. The
right side is left free: an advertisement can go there later (`.rail.right`, commented out in `index.astro`), away from
the answer box and the buttons.

Scoring is a rope of knots: right first time ties a tight knot (1 point), right after a retry a loose one (half a point),
and a miss frays the rope. The score ring shows the rope, and the rank is a knot (Loose end to Endless knot). Share
sends the score with a challenge link (`#c=...`: the question codes and subjects plus a seed, so a friend gets the same
questions, asked the same way, and a score to beat). Stopping a round shows the answers so far, without a score.
After three rounds Impossible appears, and under it All: The Gordian Knot, every question in the game (2,109), typed,
in crimson, with one record (best score, then fastest).

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
src/scripts/prefs.ts      what the browser remembers: the selection, settings (sound, auto-submit, theme, colour), the Daily, stats
src/scripts/questions.ts  question templates (13 kinds, one clue each, given/asked tags), the levels and the round builder: approved facts in, questions out
src/scripts/kb.ts         the knowledge base as the site reads it
src/scripts/map.ts        the map: a globe turned and zoomed to the asked country, capital, peak or river
src/scripts/globe.ts      the globe on the start screen: turns by itself, can be dragged, names the country under the pointer
src/scripts/sky.ts        the night sky behind the start screen: stars that light up and tie together when touched
src/scripts/sound.ts      small synthesised placeholder sounds (no audio files yet)
public/data/              countries.json (npm run build:data), rivers.json (npm run import), world.json and globe.json (npm run build:map)
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
    names.csv             preferred names, extra accepted answers, removed ambiguous ones
    positions.csv         capitals' positions where the sources disagree
  geo/                    highest points and rivers
    peaks.csv, rivers.csv entities (generated by scripts/import-geo.mjs)
    facts.csv             highest_point and flows_through facts with their sources and status
    decisions.csv         human decisions on peaks and crossings
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

`npm run data` runs steps 2 to 5 and copies the flags. `npm test` tests the answer matcher (silent typo correction, near misses, context names), the names people type, and the round builder: the levels, both answer forms of every question type, challenge links, and no country or river twice in a round (this one needs Node 22.18 or newer; older versions skip it).

## Adding a subject later

New folder under `data/` (as `data/geo/` did for peaks and rivers), its relations in `relations.yaml`, an importer
script, question templates in `src/scripts/questions.ts` (plus a category in `CATS` and its icon in
`src/scripts/menu.ts` if it is a new kind of question). The menu lists it from there.
