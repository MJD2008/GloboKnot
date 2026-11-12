# Globoknot (geography quiz site): build plan

Agreed 11 Nov 2026. Scope: launch with BOTH the daily chain and the quiz builder (plus hub pages), 4 to 6 weeks part-time (estimate).

## Product
- One comprehensive, curated and connected site (not a pile of separate quizzes).
- Front door: a fixed 5-round daily chained puzzle, same for everyone, share card, local streak.
- Quiz builder: Where (continent > country > province) x What (capitals, rivers, cities, mountains, languages, locations...) toggles. Live question count, setup saved in the URL, preset URLs as SEO pages. Right-side panel on desktop, bottom sheet on mobile.
- Provinces worldwide (e.g. Moldova's districts) as an optional subsection: shapes, capitals, rivers only.
- Hub pages per country, language and subject.
- Interactions (changed 11 Nov): typing, image identification, multiple choice. Map questions = highlighted place, type its name. No painting, no dragging. Knowledge system: see KNOWLEDGE-SYSTEM.md.
- Clean, minimal UI. No accounts at launch.

## Game modes (James, 11 Nov)
Positioning: the one end-all geography site, unique in its connections and dedication (curated, complete, reliable), not in gimmick mechanics.
- **Daily:** the fixed 5-step chain, same for everyone, shareable.
- **Quick play:** pick Where x What in the builder and go; short rounds on the fly.
- **Complete it (infinite):** every question in the chosen set (e.g. all 46 capitals of Europe, all 195 countries on the map), with a running timer. Get them all right and you earn that set's badge plus your time. Badges and best times live in the browser at launch; optional accounts later (agreed) to keep them across devices.
- **Basics speedrun:** one fixed set of the essentials (every country on the map, its capital and its flag, ~600 answers), one timer, a best time to beat and a leaderboard later. The same set for everyone, so times compare fairly.
- **The Complete:** the "impossible" challenge: every approved fact and link in the database, each asked once. ONE continuous run with a timer that never stops: the ultimate challenge for fanatics to stream or be proud of. The run state autosaves only so a crash or refresh doesn't lose it; the clock keeps running. Shows % complete. Post-launch, niche. Because the database grows, completion is tied to a dated edition ("Complete, 2026 edition"); new facts open a new edition and earlier badges stay.
- **Versus:** at launch, challenge links (same questions for both, compare score and time, no server needed). Live head-to-head needs a server and comes after launch.
- **Explore (optional):** the "next link" walk through connected facts is its own mode or a "continue from here" button, never forced on every question.

## Stack
- Astro static site (one pre-built page per country/language/preset; quiz parts are interactive islands).
- d3-geo map from Natural Earth TopoJSON; zoom + list helper for tiny countries.
- Cloudflare Pages hosting (free) + Cloudflare Web Analytics (cookie-free).
- GitHub repo (James creates it; Claude attaches and pushes).

## Data pipeline
1. Fetch: Natural Earth (admin-0, admin-1, rivers, lakes, peaks), Wikidata SPARQL (capitals, official languages, river -> countries), Glottolog (language families, CC BY), mledoze/countries (codes, aliases).
2. Normalise into entities (countries, provinces, cities, rivers, mountains, languages) + a links table, each link with a "checked" flag.
3. Review links in a spreadsheet; only checked links ship. Facts are checked once; questions are generated from templates x entities.
4. Build splits data per continent for fast loading. Credits page states sources and data date.

## Steps
1. Countries module end to end (import, auto-approve, review queue, build) + prototype: highlighted-map typing, capital typing, multiple choice. Test with the 4 playtesters.
2. Data v1: countries, capitals, provinces (shapes + capitals), rivers, mountains, languages.
3. Quiz builder (Where x What, URL config, presets).
4. Daily chain + share card + streak.
5. Hub pages; credits, privacy, about.
6. Launch: Reddit, daily-game directories. AdSense (with Google's free EU consent banner) about a month after launch.

## James's to-dos
- Pick a name, buy the domain (~EUR 10/yr, Cloudflare Registrar at cost).
- Free Cloudflare account; empty GitHub repo.
- Later: AdSense account; spot-check facts.
