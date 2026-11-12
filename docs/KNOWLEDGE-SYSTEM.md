# Knowledge system: proposal for discussion

Draft, 11 Nov 2026. Nothing here is final until James agrees.

## 1. Three building blocks

| Block | What it is | Example |
|---|---|---|
| **Entity** | One real thing, with a stable id | Belgium, Brussels, Rhine, Dutch, Ardennes |
| **Fact** | One approved link between two entities (or an entity and a value) | Belgium -capital-> Brussels |
| **Template** | A question pattern that reads facts of one relation | "What is the capital of {country}?" |

Questions are never stored. They're built on the fly from approved facts and templates, so you check a fact once and it feeds every question that uses it.

### Entity
- `id`: the Wikidata id (Belgium = Q31). It's a stable anchor and makes imports easy.
- `type`: country, province, city, river, mountain range, mountain, lake, language, landmark, ...
- `name`: the English name, plus `aliases` that are also accepted (Czechia / Czech Republic).
- Optional: coordinates or a shape (for map questions), an image with its licence, continent, and a **tier** (core / standard / niche / expert).

### Relation (defined ONCE, in a registry)
This is the most important part. Every relation has a strict written definition that settles the ambiguous cases up front.

```yaml
official_language:
  from: country
  to: language
  definition: "Official at national level per the constitution or national law. Regional/minority status does not count."
  many: true            # a country can have several
  complete: true        # we list ALL of them per country (makes "which is NOT..." safe)
  forward: "Which languages are official in {country}?"
  reverse: "In which country is {language} an official language?"   # only if it has exactly one
flows_through:
  from: river
  to: country
  definition: "The main river channel crosses or forms part of the country's territory. Tributaries and basin do not count."
```

### Fact
`subject, relation, object, qualifier, source, status, checked_on`
e.g. `Q31, capital, Q239, -, wikidata+mledoze, approved, 2026-11-20`

Status is `draft -> approved` (or `rejected`). Only approved facts reach the site.

## 2. Storage: plain files, not a database server
- One folder per subject module: `data/countries/`, `data/rivers/`, `data/languages/` ... each with entity and fact files (CSV or YAML, both spreadsheet-friendly).
- A build script checks everything (unknown ids, type mismatches, missing sources, duplicates) and compiles it into small JSON files for the site.
- Kept in git, so every change is visible and can be undone.
- **Adding a subject = a new folder + its relation definitions + templates.** Nothing else changes.

## 3. Importing reliable data
| Facts | Source |
|---|---|
| Capitals, borders, codes, aliases | Wikidata (P36, P47) cross-checked with mledoze/countries |
| Official languages | Wikidata P37, cross-checked against the CIA World Factbook text |
| Language families | Glottolog |
| Rivers/lakes/mountains + shapes | Natural Earth + Wikidata (P17 country, P2043 length, P2044 elevation) |
| Cities, landmarks in a place | Wikidata P131 (located in) |
| World Heritage sites | UNESCO's official list |
| Images | Wikimedia Commons (licence + author stored with the image) |

Imports always arrive as **draft**, with the source attached. The importer only ever proposes facts; it never approves them.

## 4. Verifying efficiently
- **Two-source auto-approval:** when two independent sources agree (e.g. Wikidata and mledoze both say Brussels), the fact is approved automatically and logged.
- **Review queue for the rest:** a small local page shows the fact, both sources and the definition, with one key each to approve, reject or edit. It works one relation at a time, so you're in the same mindset throughout.
- **Re-imports only reopen what changed:** facts that already match stay approved.
- Rough size of the core: ~250 countries x (capital + ~3 languages + ~2.5 borders + continent) = about 2,000 facts, and most of them should auto-approve. Human time goes to the disagreements and the niche material.

## 5. Names, spellings, multiple answers
- Per entity: canonical name + accepted aliases + "close but not accepted" names (e.g. Holland -> "Not quite: the country is the Netherlands").
- Normalise before comparing: case, accents, "the", punctuation, "St"/"Saint", "&"/"and".
- Typo tolerance scaled by length: 0 typos up to 4 letters, 1 for 5 to 8, 2 for longer names.
- **Confusable guard:** never accept a typo that is closer to another real entity of the same type (Niger/Nigeria, Austria/Australia, Iran/Iraq, Slovenia/Slovakia).
- **Ties:** when a typo is equally close to two names, the one that starts with the same letter wins ("Nambia" is Namibia, not Gambia or Zambia), because people rarely get the first letter wrong. If that doesn't settle it ("Seria": Serbia or Syria), it is not corrected.
- **Silent auto-correct (James, 11 Nov):** a typo within the tolerance is simply accepted and the answer is logged under its correct name (type "Usbekistan", the log shows "Uzbekistan"). No "Did you mean?" prompt, no message. Anything further off is wrong. Look-alike names (Niger/Nigeria) are never corrected: typing a real other name counts as that name.
- **Minimal text everywhere (James, 11 Nov):** the player should understand what happened instantly without reading. Feedback is colour, a short animation and sound (green tick and the correct name in the log, red shake), not sentences. Questions are as short as possible, ideally a few words plus the image or highlighted map.
- Several correct answers: the template says "Name one ..." (any approved one counts) or "Name all ..." (a typing list that ticks off answers).

## 6. Which facts suit which format
Each template declares what it needs, and the generator only uses facts that meet it:
- **Typing:** a single answer (or "name one / all"), with aliases present.
- **Multiple choice:** 3 wrong options of the same type, chosen to be plausible (same continent or similar size). For a "which is NOT..." question, the relation must be `complete: true`, so a wrong option is guaranteed wrong.
- **Image identification:** the entity has a licensed image.
- **Map highlight -> type the name:** the entity has a shape or a point (country, province, city, mountain, lake). Rivers show as a highlighted line.
- **Reverse direction:** only when the reverse has exactly one answer ("Which country has Brussels as its capital?" works. "Which country does the Rhine flow through?" doesn't, so it becomes multiple choice with only one correct option shown).

## 7. Variety without repeats
- Question id = template + entity, and the browser remembers which ones you've seen recently.
- Each round mixes relations and formats (never 5 capitals in a row unless you filtered for capitals).
- Difficulty starts from the tier (Wikipedia popularity as a first guess) and is later replaced by real correct-answer rates.
- Questions you missed come back a few rounds later.
- Scale: ~10,000 entities x ~3 relations x 2 directions x 2 to 3 formats gives well over 100,000 distinct questions from facts checked once.

## 8. Niche facts without losing accuracy
- Niche facts come only from relations with a strict definition and an authoritative source (official statistics, UNESCO, national law).
- **One clear answer rule:** if reasonable people could disagree, the fact is rejected, or the question gets a qualifier ("by population, 2024 census").
- A standing **disputed list** that is excluded from scored questions: Kosovo, Taiwan, Western Sahara, Crimea, Jerusalem, Northern Cyprus, Palestine status and similar. Also excluded: "national dish" style claims and contested origins (hummus, baklava).
- Changeable facts (population, highest building, rankings) carry an "as of" date and are avoided in daily puzzles.
- Province data stays limited to name, shape and capital, with each country's official list as the source.

## 9. Two map styles (James, 11 Nov)
Each relation/template declares which map it uses, so the highlighted thing is always easy to spot.
- **Administrative map:** flat, quiet land colours, country borders, capital dots, province lines only when zoomed into a country. Used for countries, provinces, capitals, cities, landmarks.
- **Natural map:** soft terrain tint (green lowlands, tan dry areas, light relief shading), blue rivers and lakes, mountain ranges and peaks; country borders very faint, only for orientation. Used for rivers, lakes, seas, mountains, deserts, islands.
- Both come from Natural Earth (admin layers vs physical layers + a small relief image), so they line up exactly.

## 10. Populations and other changing numbers (James, 11 Nov)
Changing numbers are stored as **snapshots**, never live values:
- One fact = `entity, population, value, as_of, source`. Example: `Belgium, population, 11 900 000, 2025-07-01, UN World Population Prospects 2024`.
- **One source and one date for the whole site** (e.g. UN WPP mid-2025 for every country), so comparisons and rankings are always consistent. The credits page and question show it: "Population (UN estimate, mid-2025)".
- **Rounded for display:** 2 to 3 significant figures (11.9 million, 450 000).
- **Questions that stay right as the real number drifts:**
  - Typing a number: accepted within a band (e.g. +/- 10 %), and scored by closeness.
  - Multiple choice / higher-lower: options must differ by at least ~25 %, so no plausible update flips the answer.
  - Rankings ("most populous in Africa"): only used when the gap to the next one is clear.
- **Refreshed once a year** in one batch: new snapshot, new "as of" date, re-run the checks. Nothing changes mid-year.
- City populations are avoided unless one definition is fixed (city proper per national census), because city vs metro area figures differ hugely.
- The same pattern works for area, height, length and GDP.

## 11. What this changes in the plan
- Interactions: typing, image ID and multiple choice. Map questions show a highlighted place and you type its name. **No painting and no dragging.**
- Step 1 becomes: build this pipeline end to end for one module (countries: capitals, borders, languages, flags, continents), plus a prototype with highlighted-map typing, capital typing and multiple choice. After that, rivers, mountains, landmarks and provinces are each "just another module".
