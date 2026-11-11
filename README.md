# Globoknot

A geography and world-knowledge quiz site built on one verified, linked knowledge base.
Facts are checked once; questions are generated from them by templates.

Plan: [docs/PLAN.md](docs/PLAN.md) · Knowledge system: [docs/KNOWLEDGE-SYSTEM.md](docs/KNOWLEDGE-SYSTEM.md) · Sources and licences: [CREDITS.md](CREDITS.md)

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
build/data/countries.json compact output for the site (generated, approved facts only)
```

## How a fact gets in

1. `npm run fetch` downloads the sources into `sources/cache/` and records the date in `sources/manifest.json`.
2. `npm run import` turns them into facts. If two independent sources agree, the fact is approved
   automatically. Anything else is a **draft** and lands in `review/countries.md`.
3. You decide each draft with one line in `data/countries/decisions.csv` (`approved` or `rejected`,
   optional qualifier and note). Re-run the import. Decisions survive every re-import.
4. `npm run check` refuses to continue on any problem: wrong entity types, missing sources, disputed
   places, two places sharing an accepted answer, and more.
5. `npm run build` writes `build/data/countries.json` with approved facts only.

`npm run data` runs steps 2 to 5. `npm test` tests the answer matcher (silent typo correction).

## Adding a subject later

New folder under `data/` (e.g. `data/rivers/`), its relations in `relations.yaml`, an importer script.
Nothing else changes.
