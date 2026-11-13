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
end. Every question has 15 seconds, the same for everyone; a wrong typed answer is not revealed, so the player can try
again until the time runs out. Next to Play: the Daily (below) and Practice (below that).

The counts are Fibonacci numbers, each the two before it added up (8 + 13 = 21), so each is about 1.6 times the last;
13 to start with. Counts saved before them move to the closest one (10 to 13, 20 to 21, 50 to 34).

Four levels. A level picks a set of question types and a way to answer, which the player can still change in the
configuration, and decides how well known the places asked about are. Impossible shows itself after three rounds.

| Level | Question types | Answers | Places |
|---|---|---|---|
| Easy (new visitors) | Capitals, flags | Choose: four options, far apart | Famous countries only, while there are enough |
| Medium | Locations, capitals, flags, languages | Both | Well-known only, while there are enough |
| Hard | Every category | Type | About 60% well-known |
| Impossible | Every category | Type | About 20% well-known |

Answers: Choose (four options), Type, or Both (each question its own way: a flag to name is typed, a flag to find is
picked). Every question type has both forms. On Easy the wrong options are far apart and familiar; on Hard and
Impossible they are the tempting ones (neighbours, nearby rivers, and flags that look alike: Chad's among Romania's
and Andorra's), and on Easy no flag among the options looks like the right one (no Poland or Monaco next to
Indonesia). Which flags look alike is worked out once by `scripts/flags-alike.mjs`, which draws every flag small and
compares them colour by colour and by layout, also mirrored (`data/countries/flags-alike.json`).

How well known: countries by `data/countries/tiers.csv` (37 famous, 37 well known, the rest); languages through the
countries where most people speak them (not Irish or Romansh); rivers of 2,500 km and more plus a list of famous ones;
peaks of 5,000 m and more.

The Daily climbs: eight questions, the same for everyone on a day, two from each level, from Easy to Impossible, each
asked the way its level asks (picked from four far-apart options at the start, typed at the end). Everyone gets a few
right, and the best are still tested. Every category comes up at least once and none more than twice. Its knots grow
with the levels on the way, and the shared result shows them in four steps ("●● ●○ ●· ··"); a link to it brings back
the same eight, each asked its level's way (`eemmhhii` in the link). New round after it starts a round of one's own.

Typing forgives: an exact name first, then the usual typo correction (one typo in names of 5 to 8 letters, two in
longer ones, never between two real names such as Niger and Nigeria), and then a near miss for the right answer, with one
typo more, when no other name is as close ("Ngera" for Nigeria). Some names count only for the right answer ("Congo"
for DR Congo, "Korea" for South Korea: `context_aliases` in `data/countries/names.csv`).

On screens from 1240 px wide, the round so far hangs down the left side of the quiz as a rope, one knot per answer. The
right side is left free: an advertisement can go there later (`.rail.right`, commented out in `index.astro`), away from
the answer box and the buttons.

Scoring is a rope of knots: right first time ties a tight knot (1 point), right after a retry a loose one (half a point),
and a miss frays the rope. The score ring shows the rope, and the rank is a knot (Loose end to Endless knot). Under it,
three numbers: the best run of right answers, the fastest right answer and the time. After 90% or more on a level's own
questions, the next level is offered ("Too easy? Try Medium"). Share
sends the score with a challenge link (`#c=...`: the question codes and subjects plus a seed, so a friend gets the same
questions, asked the same way, and a score to beat); the share icon at the top shares the site. Stopping a round shows
the answers so far, without a score.

Tapping an answer opens it again: the map of the country it was about with the countries around it named, and a card with
its flag, capital, languages, highest point, rivers and neighbours (a river, a language or a mountain gets its own card).
Names on the map are sized for the width the map is shown at, and left out where they would cover each other.

Practice: one question type (Country → capital, Flag → country...) in the whole world or one continent, every question
there is, in the same order every time (the order and the options come from a seed named after the practice, such as
`p-C-eu-t`: capitals of Europe, typed). Typed or picked from four. Each practice keeps its best run (score, then time).
For learning a set until it sticks, and for speedruns.

The logo is the world in a loop of rope whose ends cross below it, as in a knot; the globe on the home screen sits in the
same loop. A few words are only shown when asked for, behind an ⓘ (what the levels mean, what Practice is, what
Auto-submit does). About opens with the numbers (194 countries, 1,417 checked facts...), counted from the facts as they
load, then how a fact gets in, how to play, and the sources. Settings has three volumes (Volume, Effects, Music); the
sounds and music go in named slots, listed in [docs/AUDIO.md](docs/AUDIO.md).
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
src/scripts/practice.ts   Practice: one question type in one region, in a fixed order, with a best run each
src/scripts/prefs.ts      what the browser remembers: the selection, settings (auto-submit, theme, colour), the Daily, stats
src/scripts/questions.ts  question templates (13 kinds, one clue each, given/asked tags), the levels and the round builder: approved facts in, questions out
src/scripts/kb.ts         the knowledge base as the site reads it
src/scripts/map.ts        the map: a globe turned and zoomed to the asked country, capital, peak or river
src/scripts/globe.ts      the globe on the start screen: turns by itself, can be dragged, names the country under the pointer
src/scripts/sky.ts        the night sky behind the start screen: stars that light up and tie together when touched
src/scripts/sound.ts      sounds and music in named slots (docs/AUDIO.md): a file in public/audio per slot, else a
                          small synthesised placeholder; the three volumes in Settings
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
