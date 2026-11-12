# Globoknot

A geography and world-knowledge quiz site built on one verified, linked knowledge base.
Facts are checked once; questions are generated from them by templates.

Plan: [docs/PLAN.md](docs/PLAN.md) · Knowledge system: [docs/KNOWLEDGE-SYSTEM.md](docs/KNOWLEDGE-SYSTEM.md) · Putting it online: [docs/DEPLOY.md](docs/DEPLOY.md) · Sources and licences: [CREDITS.md](CREDITS.md)

## The site

Astro, built to plain static files. One page for now: pick a mode, answer 10 questions, see your result.

```
npm install
npm run dev       # http://localhost:4321, reloads as you edit
npm run build     # the finished site in dist/
```

```
src/pages/index.astro     the quiz page: start screen, question card, results
src/layouts/Base.astro    page frame: header, footer with the data credits, PREVIEW switch
src/styles/global.css     all styles; colours are tokens with light and dark values
src/scripts/app.ts        the quiz screens, keys and timing
src/scripts/questions.ts  question templates: approved facts in, questions out
src/scripts/kb.ts         the knowledge base as the site reads it
src/scripts/map.ts        the map: a globe turned and zoomed to the asked country
src/scripts/globe.ts      the turning globe on the start screen
src/scripts/sound.ts      small synthesised sounds (no audio files)
public/data/              countries.json (npm run build:data), world.json and globe.json (npm run build:map)
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
review/countries.md       what still needs a decision (generated)
data/countries/tiers.csv  which countries count as well known (a play-balance setting, not a fact)
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

`npm run data` runs steps 2 to 5 and copies the flags. `npm test` tests the answer matcher (silent typo correction).

## Adding a subject later

New folder under `data/` (e.g. `data/rivers/`), its relations in `relations.yaml`, an importer script.
Nothing else changes.
