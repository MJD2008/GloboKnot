// Question templates: each turns approved facts about one subject into a question. Nothing here is a fact itself;
// facts only come from the knowledge base. Prompts are short, plain sentences ("What is the capital of France?"),
// two small tags say what is given and what is asked (MAP, then COUNTRY), and every question has one clue: a map, a flag,
// a text or a name, never two.
import type { Country, Knowledge, Language, Peak, River } from './kb';

export type Cat = 'locations' | 'capitals' | 'flags' | 'languages' | 'mountains' | 'rivers';
/** What a question shows (given) and what it asks for, as the two tags on the card. */
export type Tag = 'Map' | 'Country' | 'Capital' | 'Flag' | 'Text' | 'Language' | 'Highest point' | 'Mountain' | 'River' | 'Neighbour';
export type Pool = 'country' | 'city' | 'language' | 'peak' | 'river';
export type LatLng = [number, number];
export type Media =
  | { kind: 'map'; country?: string; dot?: LatLng; peak?: LatLng; river?: string }
  | { kind: 'flag'; country: string }
  | { kind: 'text'; text: string; lang: string }
  | { kind: 'none' };

export interface Choice { id: string; label: string; flag?: string }
export interface Question {
  key: string;                 // template + subject: used to avoid repeats
  kind: string;                // template id
  subject: string;             // what the question is about (a country, language, peak or river id)
  cat: Cat;
  given: Tag;
  asked: Tag;
  format: Format;
  prompt: string;
  clue: string;                // what was asked, short, for the answers list ("Flag", "Map", "Capital of France")
  media: Media;
  pools: Pool[];               // which names a typed answer is matched against
  accept: string[];            // entity ids that count as right
  answer: string;              // the right answer as shown
  choices?: Choice[];
  reveal?: string[];           // countries lit up on the map once answered
  countries: string[];         // countries the question is about: none of them comes up twice in a round
  ask: Ask;                    // how it was asked (a challenge link carries it)
  level?: Level;               // the Daily only: the level this question comes from
}

/** Typed, or picked from four options. */
export type Format = 'type' | 'choice';
/** How a round is answered: typed (Type), picked from four options (Choose), or each question its own way (Both). */
export type Answers = 'type' | 'choose' | 'both';
/** How tempting the wrong options are: 0 far apart and familiar (Easy), 1 some near and some far, 2 next door. */
export type Tempt = 0 | 1 | 2;
/** How well known a subject is: 2 famous (nearly everyone knows it), 1 well known, 0 the rest. */
export type Fame = 0 | 1 | 2;
/** How a question is asked; a challenge link carries it, so a friend gets the same options. */
export interface Ask { answers: Answers; tempt: Tempt }

type Rng = () => number;
type Made = Omit<Question, 'cat' | 'given' | 'asked' | 'subject' | 'ask' | 'level'>;
interface Template {
  id: string;
  code: string;                // one letter, for challenge links: never change it once links are out
  cat: Cat;
  label: string;               // in the menu: what you see → what you answer
  given: Tag;
  asked: Tag;
  natural: Format;             // its form when the round leaves it free (Both)
  typable: boolean;            // "Which is the flag of X?" can't be typed: its answer is a picture
  subjects(kb: Knowledge, inPlace: (country: string) => boolean): string[];
  fame(kb: Knowledge, id: string): Fame;
  // `cat`, `given`, `asked`, `subject` and `ask` are filled in by makeQuestion. The answers never depend on what is selected
  // under Where: a question about France accepts every neighbour of France, also when only France is selected.
  make(kb: Knowledge, id: string, rng: Rng, form: { format: Format; tempt: Tempt }): Made | null;
}

export const CATS: { id: Cat; label: string }[] = [
  { id: 'locations', label: 'Locations' },
  { id: 'capitals', label: 'Capitals' },
  { id: 'flags', label: 'Flags' },
  { id: 'languages', label: 'Languages' },
  { id: 'mountains', label: 'Mountains' },
  { id: 'rivers', label: 'Rivers' },
];

const pickOne = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];
export function shuffle<T>(xs: T[], rng: Rng = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Keys in a random order in which each comes early with a chance in proportion to its weight (0: last). */
function weightedOrder(weights: Map<string, number>, rng: Rng): string[] {
  return [...weights]
    .map(([id, w]) => ({ id, k: w > 0 ? Math.pow(rng(), 1 / w) : -rng() }))
    .sort((a, b) => b.k - a.k)
    .map(x => x.id);
}
/** n distinct keys, each drawn with a chance in proportion to its weight. */
const weightedSample = (weights: Map<string, number>, n: number, rng: Rng) => weightedOrder(weights, rng).slice(0, n);
const list = (names: string[], max = 3) => (names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max}` : names.join(' / '));
const country = (kb: Knowledge, id: string) => kb.country(id)!;
// Names that take "the" in a sentence: "the capital of the Netherlands".
const THE = new Set(['ARE', 'BHS', 'CAF', 'CIV', 'COG', 'COM', 'DOM', 'GBR', 'GMB', 'MDV', 'MHL', 'NLD', 'PHL', 'SLB', 'USA']);
export const theName = (kb: Knowledge, id: string) => `${THE.has(id) ? 'the ' : ''}${country(kb, id).name}`;
const upper = (s: string) => s[0].toUpperCase() + s.slice(1);
const countriesIn = (kb: Knowledge, inPlace: (c: string) => boolean) => kb.countries.filter(c => inPlace(c.id)).map(c => c.id);
/** Great-circle distance in km between two [lat, lng] points. */
const km = ([la1, lo1]: [number, number], [la2, lo2]: [number, number]) => {
  const r = Math.PI / 180, h = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ---- how well known: countries by their tier (data/countries/tiers.csv), the rest through the countries they belong to
const tierFame = (kb: Knowledge, id: string): Fame => { const t = kb.country(id)?.tier; return t === 'famous' ? 2 : t === 'core' ? 1 : 0; };
const mostFamous = (kb: Knowledge, countries: string[]): Fame => Math.max(0, ...countries.map(c => tierFame(kb, c))) as Fame;
const TOP_RIVERS = new Set(['nile', 'amazon', 'yangtze', 'mississippi', 'danube', 'rhine', 'ganges', 'volga', 'mekong', 'congo', 'tigris',
  'euphrates', 'colorado', 'zambezi']);
const KNOWN_RIVERS = new Set(['rhine', 'danube', 'elbe', 'loire', 'tagus', 'vistula', 'dnieper', 'ganges', 'indus', 'tigris', 'euphrates',
  'zambezi', 'orange', 'limpopo', 'rio-grande', 'colorado', 'saint-lawrence', 'murray', 'senegal', 'gambia']);
/** In a well-known country with several official languages, the ones most people there speak: only these take the
 *  country's fame. Irish, Māori, Romansh or Zulu are official in famous countries, but few players would know them. */
const MAIN_LANGUAGES: Record<string, string[]> = {
  BEL: ['nld', 'fra'], CAN: ['eng', 'fra'], CHE: ['deu', 'fra', 'ita'], FIN: ['fin'], IND: ['hin', 'eng'], IRL: ['eng'],
  KEN: ['swa', 'eng'], MAR: ['ara'], NZL: ['eng'], ZAF: ['eng'], AFG: ['prs'], DZA: ['ara'], IRQ: ['ara'], KAZ: ['kaz', 'rus'],
  LKA: ['sin'], LUX: ['deu', 'fra'], MDG: ['mlg'], PAK: ['urd'], PER: ['spa'], PHL: ['fil'], SGP: ['eng', 'zho'],
};
const mainLanguages = (kb: Knowledge, c: string) => MAIN_LANGUAGES[c] ?? kb.languagesOf(c);
const languageFame = (kb: Knowledge, l: string): Fame =>
  mostFamous(kb, kb.whereSpoken(l, false).filter(c => mainLanguages(kb, c).includes(l)));
const riverFame = (kb: Knowledge, id: string): Fame =>
  TOP_RIVERS.has(id) ? 2 : (kb.get<River>(id)?.km ?? 0) >= 2500 || KNOWN_RIVERS.has(id) ? 1 : 0;

// ---- wrong options
/** How much a wrong option tempts, by where it is: [next door, same continent, elsewhere]. Hard asks for near ones,
 *  Easy for far ones. */
const NEAR: Record<Tempt, [number, number, number]> = { 0: [0.02, 0.15, 1], 1: [2, 1, 0.5], 2: [6, 2, 0.1] };
function nearWeights(kb: Knowledge, c: string, [next, sameContinent, far]: [number, number, number]) {
  const n = new Set(kb.neighbours(c)), continent = kb.continent(c);
  return (other: string) => (n.has(other) ? next : kb.continent(other) === continent ? sameContinent : far);
}
/** On Easy the options are names everyone knows: lesser-known countries hardly ever come up as wrong options. */
const familiar = (kb: Knowledge, id: string, tempt: Tempt) => (tempt > 0 ? 1 : [0.03, 0.5, 1][tierFame(kb, id)]);
/** n wrong countries for a question about country c; never one of `not` (the right answers). `close` ones count as
 *  next door too (the neighbours' neighbours, when the question is which country borders c). */
function wrongCountries(kb: Knowledge, c: string, n: number, rng: Rng, tempt: Tempt, not: string[] = [], w = NEAR[tempt],
  close?: Set<string>): string[] {
  const near = nearWeights(kb, c, w), skip = new Set([c, ...not]);
  const weight = (o: string) => (close?.has(o) ? w[0] : near(o)) * familiar(kb, o, tempt);
  return weightedSample(new Map(kb.countries.filter(o => !skip.has(o.id)).map(o => [o.id, weight(o.id)])), n, rng);
}
/** Wrong options for a flag question. On Hard and Impossible two of them are flags that look like the right one (the
 *  closer, the likelier: scripts/flags-alike.mjs), the rest from nearby, so the eye has to look closely. On Easy none
 *  of them does (no Poland or Monaco next to Indonesia): the options are easy to tell apart. */
function wrongFlags(kb: Knowledge, c: string, n: number, rng: Rng, tempt: Tempt, w = NEAR[tempt]): string[] {
  const like = kb.flagsLike(c);
  const alike = tempt < 2 ? [] : weightedSample(new Map(like.filter(([, d]) => d < 0.7).map(([o, d]) => [o, (0.75 - d) ** 2])), Math.min(2, n), rng);
  const unlike = tempt === 0 ? like.filter(([, d]) => d < 0.45).map(([o]) => o) : [];
  return [...alike, ...wrongCountries(kb, c, n - alike.length, rng, tempt, [...alike, ...unlike], w)];
}
/** The first n of `ids` with names unlike each other's and unlike those of `not` (two rivers can share a name). */
function distinctNames(kb: Knowledge, ids: string[], n: number, not: string[]): string[] {
  const names = new Set(not.map(x => kb.name(x))), out: string[] = [];
  for (const id of ids) {
    if (out.length === n) break;
    if (names.has(kb.name(id))) continue;
    names.add(kb.name(id));
    out.push(id);
  }
  return out;
}
/** n capitals of other countries, never one of `not` (the right answers). */
const wrongCapitals = (kb: Knowledge, c: string, n: number, rng: Rng, tempt: Tempt, not: string[]) =>
  distinctNames(kb, wrongCountries(kb, c, n + 6, rng, tempt).map(o => kb.mainCapitals(o)[0]).filter(Boolean), n, not);
/** n wrong languages, official near the countries `around`. Never a sign language: "New Zealand Sign Language"
 *  gives itself away, and is no real option for anywhere else. */
function wrongLanguages(kb: Knowledge, around: string[], n: number, rng: Rng, tempt: Tempt, not: string[]): string[] {
  const nears = around.map(c => nearWeights(kb, c, NEAR[tempt]));
  const weight = new Map<string, number>();
  for (const o of kb.countries) {
    const w = Math.max(nears.length ? 0 : 1, ...nears.map(f => f(o.id))) * familiar(kb, o.id, tempt);
    for (const l of kb.languagesOf(o.id)) if (!not.includes(l) && !/sign language/i.test(kb.name(l))) weight.set(l, (weight.get(l) ?? 0) + w);
  }
  return weightedSample(weight, n, rng);
}
/** n other rivers with other names: through the same or nearby countries when they should tempt. */
function wrongRivers(kb: Knowledge, id: string, n: number, rng: Rng, tempt: Tempt): string[] {
  const where = kb.riverCountries(id);
  const nears = where.map(c => nearWeights(kb, c, NEAR[tempt]));
  const weight = new Map<string, number>();
  for (const r of kb.rivers) {
    if (r.id === id) continue;
    const through = kb.riverCountries(r.id);
    const w = through.some(c => where.includes(c)) ? NEAR[tempt][0] : Math.max(0, ...through.flatMap(c => nears.map(f => f(c))));
    weight.set(r.id, w * (tempt === 0 ? [0.05, 0.4, 1][riverFame(kb, r.id)] : 1));
  }
  return distinctNames(kb, weightedOrder(weight, rng), n, [id]);
}
/** The options in a seeded order. */
const options = (kb: Knowledge, ids: string[], rng: Rng): Choice[] => shuffle(ids, rng).map(id => ({ id, label: kb.name(id) }));

// Language tags for the text samples, so each script gets the right font (Japanese vs Chinese forms of the same
// character) and right-to-left scripts run the right way.
const BCP47: Record<string, string> = {
  ara: 'ar', heb: 'he', fas: 'fa', urd: 'ur', div: 'dv', zho: 'zh-Hans', jpn: 'ja', kor: 'ko', tha: 'th', lao: 'lo', khm: 'km',
  mya: 'my', dzo: 'dz', amh: 'am', tir: 'ti', hye: 'hy', kat: 'ka', ber: 'tzm-Tfng', hin: 'hi', nep: 'ne', ben: 'bn', tam: 'ta',
  rus: 'ru', ukr: 'uk', bel: 'be', bul: 'bg', mkd: 'mk', srp: 'sr', kaz: 'kk', kir: 'ky', tgk: 'tg', mon: 'mn', ell: 'el',
};

// ---------------------------------------------------------------- templates
type Base = Omit<Made, 'answer' | 'choices'>;
/** A question in the form asked for. Typed: `answer` shows every right answer. Choice: the right option among three
 *  wrong ones (null when there aren't three). */
function inForm(kb: Knowledge, rng: Rng, q: Base, answer: string, right: () => string, wrong: (right: string) => string[]): Made | null {
  if (q.format === 'type') return { ...q, answer };
  const r = right(), w = wrong(r);
  return w.length < 3 ? null : { ...q, answer: kb.name(r), choices: options(kb, [r, ...w], rng) };
}
const spoken = (kb: Knowledge, l: string) => !/sign language/i.test(kb.name(l));

export const TEMPLATES: Template[] = [
  {
    id: 'loc.map', code: 'L', cat: 'locations', label: 'Map → country', given: 'Map', asked: 'Country', natural: 'type', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => inForm(kb, rng,
      { key: `map:${id}`, kind: 'loc.map', format, prompt: 'Which country is this?', clue: 'Map', media: { kind: 'map', country: id },
        pools: ['country'], accept: [id], countries: [id] },
      country(kb, id).name, () => id, () => wrongCountries(kb, id, 3, rng, tempt)),
  },
  {
    // Neighbours are a question type under Locations, not a category of their own.
    id: 'nb.name', code: 'N', cat: 'locations', label: 'Country → neighbour', given: 'Country', asked: 'Neighbour', natural: 'type', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.neighbours(c).length),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      const next = kb.neighbours(id); // all of them, whatever is selected under Where
      const prompt = format === 'type' ? `Name a country that borders ${theName(kb, id)}.` : `Which country borders ${theName(kb, id)}?`;
      return inForm(kb, rng,
        { key: `neighbour:${id}`, kind: 'nb.name', format, prompt, clue: `${upper(theName(kb, id))} borders`, media: { kind: 'none' },
          pools: ['country'], accept: next, countries: [id] },
        list(next.map(c => kb.name(c))), () => pickOne(next, rng),
        // One neighbour and three countries that aren't; when they should tempt, the neighbours' neighbours.
        () => {
          const twoAway = new Set(next.flatMap(n => kb.neighbours(n)));
          return wrongCountries(kb, id, 3, rng, tempt, next, NEAR[tempt], twoAway);
        });
    },
  },
  {
    id: 'cap.name', code: 'C', cat: 'capitals', label: 'Country → capital', given: 'Country', asked: 'Capital', natural: 'type', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      const main = kb.mainCapitals(id);
      return inForm(kb, rng,
        { key: `capital:${id}`, kind: 'cap.name', format, prompt: `What is ${main.length === 1 ? 'the' : 'a'} capital of ${theName(kb, id)}?`,
          clue: `Capital of ${theName(kb, id)}`, media: { kind: 'none' }, pools: ['city'], accept: kb.capitals(id), countries: [id] },
        main.map(x => kb.name(x)).join(' / '), () => pickOne(main, rng), () => wrongCapitals(kb, id, 3, rng, tempt, kb.capitals(id)));
    },
  },
  {
    id: 'cap.map', code: 'M', cat: 'capitals', label: 'Map → capital', given: 'Map', asked: 'Capital', natural: 'type', typable: true,
    // One capital with a checked position: the dot marks it.
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => { const m = kb.mainCapitals(c); return m.length === 1 && kb.cities.find(x => x.id === m[0])?.ll; }),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      const city = kb.cities.find(x => x.id === kb.mainCapitals(id)[0])!;
      return inForm(kb, rng,
        { key: `capital-map:${id}`, kind: 'cap.map', format, prompt: 'What is the capital of this country?', clue: `Map: ${country(kb, id).name}`,
          media: { kind: 'map', country: id, dot: city.ll }, pools: ['city'], accept: kb.capitals(id), countries: [id] },
        city.name, () => city.id, () => wrongCapitals(kb, id, 3, rng, tempt, kb.capitals(id)));
    },
  },
  {
    id: 'cap.reverse', code: 'R', cat: 'capitals', label: 'Capital → country', given: 'Capital', asked: 'Country', natural: 'type', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.mainCapitals(c).length === 1),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      const city = kb.name(kb.mainCapitals(id)[0]);
      return inForm(kb, rng,
        { key: `capital-of:${id}`, kind: 'cap.reverse', format, prompt: `${city} is the capital of which country?`,
          clue: `${city} is the capital of`, media: { kind: 'none' }, pools: ['country'], accept: [id], countries: [id] },
        country(kb, id).name, () => id, () => wrongCountries(kb, id, 3, rng, tempt));
    },
  },
  {
    id: 'flag.name', code: 'F', cat: 'flags', label: 'Flag → country', given: 'Flag', asked: 'Country', natural: 'type', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => inForm(kb, rng,
      { key: `flag:${id}`, kind: 'flag.name', format, prompt: 'Which country’s flag is this?', clue: 'Flag',
        media: { kind: 'flag', country: id }, pools: ['country'], accept: [id], countries: [id] },
      country(kb, id).name, () => id, () => wrongFlags(kb, id, 3, rng, tempt)),
  },
  {
    // Its answer is a picture, so it is always four flags to pick from.
    id: 'flag.pick', code: 'P', cat: 'flags', label: 'Country → flag', given: 'Country', asked: 'Flag', natural: 'choice', typable: false,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace),
    fame: tierFame,
    make: (kb, id, rng, { tempt }) => {
      const wrong = wrongFlags(kb, id, 3, rng, tempt, tempt === 2 ? [8, 3, 0.3] : NEAR[tempt]);
      return { key: `flag-pick:${id}`, kind: 'flag.pick', format: 'choice', prompt: `Which is the flag of ${theName(kb, id)}?`,
        clue: `Flag of ${theName(kb, id)}`, media: { kind: 'none' }, pools: ['country'], accept: [id], answer: country(kb, id).name, countries: [id],
        choices: shuffle([id, ...wrong], rng).map(x => ({ id: x, label: kb.name(x), flag: country(kb, x).flag })) };
    },
  },
  {
    id: 'lang.text', code: 'T', cat: 'languages', label: 'Text → language or country', given: 'Text', asked: 'Language', natural: 'type', typable: true,
    // Spoken in a selected country (officially or by many people).
    subjects: (kb, inPlace) => kb.languages.filter(l => l.sample && kb.cluster(l.id).some(x => kb.whereSpoken(x).some(inPlace))).map(l => l.id),
    fame: languageFame,
    make: (kb, id, rng, { format, tempt }) => {
      const l = kb.get<Language>(id)!;
      const family = kb.cluster(id); // Serbian, Croatian and Bosnian read the same: each counts, and none is a wrong option
      const where = [...new Set(family.flatMap(x => kb.whereSpoken(x)))];
      return inForm(kb, rng,
        { key: `text:${id}`, kind: 'lang.text', format, prompt: 'Which language is this?', clue: `“${l.sample}”`,
          media: { kind: 'text', text: l.sample!, lang: BCP47[id] ?? id }, pools: ['language', 'country'], accept: [...family, ...where], countries: [] },
        l.name, () => id, () => wrongLanguages(kb, kb.whereSpoken(id), 3, rng, tempt, family));
    },
  },
  {
    id: 'lang.official', code: 'O', cat: 'languages', label: 'Country → official language', given: 'Country', asked: 'Language', natural: 'choice', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.languagesOf(c).length),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      // official_language is "complete": a language not listed for this country is not official here. Sign languages
      // count when typed, but are never an option (see wrongLanguages).
      const official = kb.languagesOf(id);
      const shown = official.some(l => spoken(kb, l)) ? official.filter(l => spoken(kb, l)) : official;
      // Picked: below Hard, the right option is a language most people there speak (German for Switzerland, not Romansh).
      const main = shown.filter(l => mainLanguages(kb, id).includes(l));
      const rightOnes = tempt < 2 && main.length ? main : shown;
      return inForm(kb, rng,
        { key: `language:${id}`, kind: 'lang.official', format, prompt: `What is ${official.length > 1 ? 'an' : 'the'} official language of ${theName(kb, id)}?`,
          clue: `Official language of ${theName(kb, id)}`, media: { kind: 'none' }, pools: ['language'], accept: official, countries: [id] },
        list(shown.map(l => kb.name(l))), () => pickOne(rightOnes, rng), () => wrongLanguages(kb, [id], 3, rng, tempt, official));
    },
  },
  {
    id: 'peak.name', code: 'H', cat: 'mountains', label: 'Country → highest point', given: 'Country', asked: 'Highest point', natural: 'choice', typable: true,
    subjects: (kb, inPlace) => countriesIn(kb, inPlace).filter(c => kb.highestPoint(c)),
    fame: tierFame,
    make: (kb, id, rng, { format, tempt }) => {
      const right = kb.highestPoint(id)!;
      return inForm(kb, rng,
        { key: `peak:${id}`, kind: 'peak.name', format, prompt: `What is the highest point of ${theName(kb, id)}?`,
          clue: `Highest point of ${theName(kb, id)}`, media: { kind: 'none' }, pools: ['peak'], accept: [right], countries: [id] },
        kb.name(right), () => right, () => {
          const near = nearWeights(kb, id, NEAR[tempt]);
          const weight = new Map<string, number>();
          for (const p of kb.peaks) if (p.id !== right) weight.set(p.id, Math.max(0, ...kb.peakCountries(p.id).map(o => near(o) * familiar(kb, o, tempt))));
          return distinctNames(kb, weightedOrder(weight, rng), 3, [right]);
        });
    },
  },
  {
    id: 'peak.map', code: 'K', cat: 'mountains', label: 'Highest point → country', given: 'Mountain', asked: 'Country', natural: 'type', typable: true,
    subjects: (kb, inPlace) => kb.peaks.filter(p => kb.peakCountries(p.id).some(inPlace)).map(p => p.id),
    fame: (kb, id) => Math.max(mostFamous(kb, kb.peakCountries(id)), (kb.get<Peak>(id)?.m ?? 0) >= 5000 ? 1 : 0) as Fame,
    make: (kb, id, rng, { format, tempt }) => {
      const p = kb.get<Peak>(id)!, where = kb.peakCountries(id);
      // Two countries' highest points can be a few km apart (Rysy and Gerlachovsky stit are 3 km apart): one
      // triangle can't tell them apart, so the neighbour whose highest point is that close counts as right too.
      const near = kb.peaks.filter(o => o.id !== id && km(o.ll, p.ll) < 25).flatMap(o => kb.peakCountries(o.id));
      const accept = [...new Set([...where, ...near])];
      return inForm(kb, rng,
        { key: `peak-map:${id}`, kind: 'peak.map', format, prompt: 'Which country has its highest point here?', clue: `${p.name} is the highest point of`,
          media: { kind: 'map', peak: p.ll }, pools: ['country'], accept, reveal: where, countries: where },
        where.map(c => kb.name(c)).join(' / '), () => pickOne(where, rng), r => wrongCountries(kb, r, 3, rng, tempt, accept));
    },
  },
  {
    id: 'river.name', code: 'V', cat: 'rivers', label: 'River → name', given: 'Map', asked: 'River', natural: 'type', typable: true,
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    fame: riverFame,
    make: (kb, id, rng, { format, tempt }) => {
      const r = kb.get<River>(id)!;
      return inForm(kb, rng,
        { key: `river:${id}`, kind: 'river.name', format, prompt: 'Which river is this?', clue: `River in ${list(kb.riverCountries(id).map(c => kb.name(c)), 2)}`,
          media: { kind: 'map', river: id }, pools: ['river'], accept: kb.rivers.filter(x => x.name === r.name).map(x => x.id), countries: [] },
        r.name, () => id, () => wrongRivers(kb, id, 3, rng, tempt));
    },
  },
  {
    id: 'river.map', code: 'W', cat: 'rivers', label: 'River → country', given: 'River', asked: 'Country', natural: 'type', typable: true,
    subjects: (kb, inPlace) => kb.rivers.filter(r => kb.riverCountries(r.id).some(inPlace)).map(r => r.id),
    fame: riverFame,
    make: (kb, id, rng, { format, tempt }) => {
      const shown = kb.riverCountries(id), accept = kb.riverCountries(id, true);
      return inForm(kb, rng,
        { key: `river-map:${id}`, kind: 'river.map', format,
          prompt: format === 'type' ? 'Name a country this river flows through.' : 'Which country does this river flow through?',
          clue: `${kb.name(id)} flows through`, media: { kind: 'map', river: id }, pools: ['country'], accept, reveal: shown, countries: [] },
        list(shown.map(c => kb.name(c))), () => pickOne(shown, rng), r => wrongCountries(kb, r, 3, rng, tempt, accept));
    },
  },
];

// ---------------------------------------------------------------- what to play
export type Level = 'easy' | 'medium' | 'hard' | 'impossible';
/** size 0 means every question the selection can ask: under Impossible, that is The Gordian Knot. `answers` is only
 *  set when the player changed what the level picks. */
export interface Selection { kinds: string[]; places: string[]; size: number; level?: Level; answers?: Answers }
export const ALL_KINDS = TEMPLATES.map(t => t.id);
const kindsIn = (...cats: Cat[]) => TEMPLATES.filter(t => cats.includes(t.cat)).map(t => t.id);
interface LevelDef {
  label: string;
  kinds: string[];             // the question types it ticks; the player can still change them ("Easy + custom")
  answers: Answers;
  tempt: Tempt;
  strict?: Fame;               // only subjects at least this well known, for as long as there are any (Easy, Medium)
  share?: number;              // or: about this share of well-known subjects, the rest lesser known (Hard, Impossible)
  who: string;
  what: string;
}
/** Four levels. Easy asks about the famous countries only (data/countries/tiers.csv) and shows four options far
 *  apart; Medium asks about the well-known ones, typed or picked; Hard and Impossible ask everything, typed, with
 *  tempting options where there are options at all. */
export const LEVELS: Record<Level, LevelDef> = {
  easy: { label: 'Easy', kinds: kindsIn('capitals', 'flags'), answers: 'choose', tempt: 0, strict: 2, who: 'Famous countries', what: 'Capitals and flags' },
  medium: { label: 'Medium', kinds: kindsIn('locations', 'capitals', 'flags', 'languages'), answers: 'both', tempt: 1, strict: 1,
    who: 'Well-known countries', what: 'No mountains or rivers' },
  hard: { label: 'Hard', kinds: ALL_KINDS, answers: 'type', tempt: 2, share: 0.6, who: 'Mostly well-known places', what: 'Every category' },
  impossible: { label: 'Impossible', kinds: ALL_KINDS, answers: 'type', tempt: 2, share: 0.2, who: 'Mostly lesser-known places', what: 'Every category' },
};
export const LEVEL_IDS = Object.keys(LEVELS) as Level[];
export const ANSWERS: { id: Answers; label: string }[] = [{ id: 'choose', label: 'Choose' }, { id: 'both', label: 'Both' }, { id: 'type', label: 'Type' }];
export const levelOf = (sel: Selection): Level => sel.level ?? 'hard';
export const answersOf = (sel: Selection): Answers => sel.answers ?? LEVELS[levelOf(sel)].answers;
/** How a level asks, as the level picks it. */
export const levelAsk = (l: Level): Ask => ({ answers: LEVELS[l].answers, tempt: LEVELS[l].tempt });
/** How a selection asks: The Gordian Knot (size 0) is always typed, with the tempting options of Impossible. */
export const askOf = (sel: Selection): Ask => (sel.size <= 0 ? { answers: 'type', tempt: 2 } : { answers: answersOf(sel), tempt: LEVELS[levelOf(sel)].tempt });
/** The form a question type takes: Both leaves each its own (a flag to name is typed, a flag to find is picked). */
export const formatFor = (t: Template, answers: Answers): Format =>
  answers === 'both' ? t.natural : answers === 'choose' || !t.typable ? 'choice' : 'type';
/** Has the player changed the question types or the answers the level picked? */
export function isCustom(sel: Selection): boolean {
  const l = LEVELS[levelOf(sel)];
  return sel.kinds.length !== l.kinds.length || !l.kinds.every(k => sel.kinds.includes(k)) || answersOf(sel) !== l.answers;
}
/** The Gordian Knot: All under Impossible. Every question in the game, typed, whatever else was picked. */
export const GORDIAN: Selection = { kinds: ALL_KINDS, places: [], size: 0, level: 'impossible', answers: 'type' };
/** The Daily climbs: two questions from each level, Easy first and Impossible last, each asked the way its level
 *  asks (picked from four far-apart options at the start, typed at the end). Everyone gets a few; the best are still
 *  tested. Built by dailyRound; as a selection it is every category in the whole world. */
export const DAILY_LEVELS: Level[] = ['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'impossible', 'impossible'];
export const DAILY: Selection = { kinds: ALL_KINDS, places: [], size: DAILY_LEVELS.length };

const placeTest = (sel: Selection) => {
  if (!sel.places.length) return () => true;
  const set = new Set(sel.places);
  return (c: string) => set.has(c);
};

/** How many different questions the selection can ask. */
export function available(kb: Knowledge, sel: Selection): number {
  const inPlace = placeTest(sel);
  return TEMPLATES.filter(t => sel.kinds.includes(t.id)).reduce((n, t) => n + t.subjects(kb, inPlace).length, 0);
}

const RECENT_KEY = 'gk-recent';
function recent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
export function remember(keys: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([...keys, ...recent()].slice(0, 120))); } catch { /* private mode */ }
}

/** One question, made the same way every time for the same seed and ask (its options are drawn and shuffled by that
 *  seed), so a challenge link can carry just the subjects. */
function makeQuestion(kb: Knowledge, t: Template, id: string, seed: string, ask: Ask): Question | null {
  const made = t.make(kb, id, seeded(`${seed}|${t.id}|${id}`), { format: formatFor(t, ask.answers), tempt: ask.tempt });
  return made && { ...made, cat: t.cat, given: t.given, asked: t.asked, subject: id, ask };
}

/** What a question uses up for the rest of a round: its countries, and its subject within its category, so that a
 *  river isn't asked about twice (once for its name, once for its countries: the first answer gives the second away). */
const uses = (q: Question) => [...q.countries, `${q.cat}:${q.subject}`];

/** A round of `size` questions (0: all of them). Categories take turns. Easy and Medium ask about famous or
 *  well-known subjects only, for as long as there are any; Hard and Impossible mix in lesser-known ones (Hard: about
 *  40%). No country and no river comes up twice (except when playing everything), and questions seen recently rest
 *  unless there aren't enough others (`fresh`: ignore that). `seed` fixes each question's options. `used`: what
 *  earlier parts of the same round already asked about (the Daily is built a question at a time). */
export function buildRound(kb: Knowledge, sel: Selection, rng: Rng = Math.random, fresh = false, seed = String(rng()),
  used = new Set<string>()): Question[] {
  const all = sel.size <= 0;
  const size = all ? Infinity : sel.size;
  if (all) fresh = true;
  const level = LEVELS[levelOf(sel)];
  const strict = all ? 0 : level.strict ?? 0;
  const share = all ? 0.6 : level.share ?? 1;
  const ask = askOf(sel);
  const inPlace = placeTest(sel);
  const templates = TEMPLATES.filter(t => sel.kinds.includes(t.id));
  const queues = new Map<Template, string[]>();
  const fame = new Map<Template, Map<string, number>>(); // as far as the level cares: min(fame, strict)
  for (const t of templates) {
    const subjects = shuffle(t.subjects(kb, inPlace), rng);
    const f = new Map(subjects.map(id => [id, t.fame(kb, id) as number]));
    if (strict) {
      for (const [id, x] of f) f.set(id, Math.min(x, strict));
      queues.set(t, subjects.sort((a, b) => f.get(b)! - f.get(a)!)); // stable: shuffled within each tier
    } else {
      const known = subjects.filter(id => f.get(id)! >= 1), other = subjects.filter(id => f.get(id)! < 1);
      const order: string[] = [];
      while (known.length || other.length) order.push(((known.length && (!other.length || rng() < share)) ? known : other).shift()!);
      queues.set(t, order);
      for (const id of subjects) f.set(id, 0);
    }
    fame.set(t, f);
  }
  const cats = shuffle([...new Set(templates.map(t => t.cat))], rng);
  const seen = new Set(fresh ? [] : recent());
  const round: Question[] = [];
  const keys = new Set<string>();
  // Each pass first rests the questions seen recently, then fills up with them. Easy and Medium go through those two
  // with their famous or well-known subjects alone first (a famous question seen yesterday is better than an obscure
  // new one), and only ask about the others when a round can't be filled without them: a long round, a small region.
  const passes: { rest: boolean; min: number }[] = [];
  for (let min = strict; min >= 0; min--) passes.push({ rest: true, min }, { rest: false, min });
  for (const pass of passes) {
    let stuck = 0;
    for (let i = 0; round.length < size && stuck < cats.length; i++) {
      const cat = cats[i % cats.length];
      let q: Question | null = null;
      for (const t of shuffle(templates.filter(t => t.cat === cat), rng)) {
        const queue = queues.get(t)!, f = fame.get(t)!;
        for (let j = 0; j < queue.length && !q; j++) {
          const id = queue[j];
          if (f.get(id)! < pass.min) break; // the queue is sorted, most famous first
          const cand = makeQuestion(kb, t, id, seed, ask);
          if (!cand || keys.has(cand.key) || (!all && uses(cand).some(c => used.has(c))) || (pass.rest && seen.has(cand.key))) continue;
          queue.splice(j, 1);
          q = cand;
        }
        if (q) break;
      }
      if (!q) { stuck++; continue; }
      stuck = 0;
      round.push(q);
      keys.add(q.key);
      uses(q).forEach(c => used.add(c));
    }
  }
  return round;
}

/** The Daily of a day (its seed): the same eight questions for everyone, two from each level in DAILY_LEVELS. Every
 *  category comes up at least once and none more than twice, and a category that comes back does so as another
 *  question type where it can. Built without resting recent questions, so everyone gets the same. */
export function dailyRound(kb: Knowledge, seed: string): Question[] {
  const rng = seeded(seed);
  const catsOf = (l: Level) => CATS.map(c => c.id).filter(c => TEMPLATES.some(t => t.cat === c && LEVELS[l].kinds.includes(t.id)));
  // First which category each question is from: drawn again until every category is in and none comes three times.
  let plan: Cat[] = [];
  for (let n = 0; n < 1000; n++) {
    plan = DAILY_LEVELS.map(l => pickOne(catsOf(l), rng));
    const count = new Map<Cat, number>();
    for (const c of plan) count.set(c, (count.get(c) ?? 0) + 1);
    if (count.size === CATS.length && Math.max(...count.values()) <= 2) break;
  }
  const used = new Set<string>(), kinds = new Set<string>();
  const round: Question[] = [];
  DAILY_LEVELS.forEach((level, i) => {
    const own = LEVELS[level].kinds.filter(k => TEMPLATES.some(t => t.id === k && t.cat === plan[i]));
    const other = own.filter(k => !kinds.has(k));
    const [q] = buildRound(kb, { kinds: other.length ? other : own, places: [], size: 1, level }, rng, true, seed, used);
    if (!q) return;
    kinds.add(q.kind);
    round.push({ ...q, level });
  });
  return round;
}

/** The same questions again, from their codes and subjects (a challenge link), each asked the same way (`asks`, one
 *  per item; a Daily also gives each question its level). Subjects the data no longer has are left out. */
export function rebuildRound(kb: Knowledge, items: { code: string; subject: string }[], seed: string, asks: Ask[], levels?: Level[]): Question[] {
  const out: Question[] = [];
  items.forEach((it, i) => {
    const t = TEMPLATES.find(x => x.code === it.code);
    if (!t) return;
    try {
      const q = makeQuestion(kb, t, it.subject, seed, asks[i] ?? asks[0]);
      if (q) out.push(levels?.[i] ? { ...q, level: levels[i] } : q);
    } catch { /* gone from the data */ }
  });
  return out;
}
export const codeOf = (kind: string) => TEMPLATES.find(t => t.id === kind)?.code ?? '';

/** How Practice asks: typed or picked, as the player chose, with some near and some far options (as on Medium). */
export const practiceAsk = (answers: Answers, kind: string): Ask =>
  ({ answers: answers === 'type' && TEMPLATES.find(t => t.id === kind)?.typable ? 'type' : 'choose', tempt: 1 });
/** Practice: every question of one type about the places given (none: the whole world), in the same order every
 *  time. The seed fixes the order and each question's options, so a run can be repeated, learned and timed. */
export function practiceRound(kb: Knowledge, kind: string, places: string[], answers: Answers, seed: string): Question[] {
  const t = TEMPLATES.find(x => x.id === kind);
  if (!t) return [];
  const ask = practiceAsk(answers, kind);
  return shuffle(t.subjects(kb, placeTest({ kinds: [kind], places, size: 0 })), seeded(seed))
    .map(id => makeQuestion(kb, t, id, seed, ask))
    .filter((q): q is Question => !!q);
}

/** A seeded random generator (mulberry32), for the Daily, Practice and challenge links. */
export function seeded(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
