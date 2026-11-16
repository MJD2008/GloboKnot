// Practice sets: one per category, each filled in at once on one screen (James, 16 Nov 2026: "similar to a fill it all
// in at once system"). Every country of a region on its map, every capital, flag, language sample, highest point or
// river: answers are typed in any order, and each one typed finds its place at once. No time limit (his ask the same
// day); the time is only told at the end. Pure, with no page: fill.ts shows a set, the tests check them.
// Imported with their extensions, so the tests (Node, which reads TypeScript) can load this file as it is.
import { CONTINENTS, type Knowledge, type Language, type River } from './kb.ts';
import { BCP47, TEMPLATES, codeOf, seeded, shuffle, type Cat, type Pool } from './questions.ts';
import { norm } from '../../scripts/lib/text.mjs';

export type Region = 'world' | (typeof CONTINENTS)[number];
export const REGIONS: Region[] = ['world', ...CONTINENTS];
export const regionLabel = (r: Region) => (r === 'world' ? 'World' : r);
const REGION_CODE: Record<Region, string> = { world: 'w', Africa: 'af', Asia: 'as', Europe: 'eu', 'North America': 'na', 'South America': 'sa', Oceania: 'oc' };

export type SetId = 'countries' | 'capitals' | 'flags' | 'languages' | 'peaks' | 'rivers';
/** How a set is shown: its places on a map (countries, rivers), a list of names with a blank beside each (capitals,
 *  highest points), or cards of flags or text samples with a blank under each. */
export type Layout = 'map' | 'rivers' | 'list' | 'flags' | 'texts';
export interface PracticeSet { id: SetId; cat: Cat; kind: string; label: string; layout: Layout; pool: Pool; type: string }
/** The question type each set is made of (its subjects), and what is typed. */
export const SETS: PracticeSet[] = [
  { id: 'countries', cat: 'locations', kind: 'loc.map', label: 'Countries', layout: 'map', pool: 'country', type: 'Type a country' },
  { id: 'capitals', cat: 'capitals', kind: 'cap.name', label: 'Capitals', layout: 'list', pool: 'city', type: 'Type a capital' },
  { id: 'flags', cat: 'flags', kind: 'flag.name', label: 'Flags', layout: 'flags', pool: 'country', type: 'Type a country' },
  { id: 'languages', cat: 'languages', kind: 'lang.text', label: 'Languages', layout: 'texts', pool: 'language', type: 'Type a language' },
  { id: 'peaks', cat: 'mountains', kind: 'peak.name', label: 'Highest points', layout: 'list', pool: 'peak', type: 'Type a mountain' },
  { id: 'rivers', cat: 'rivers', kind: 'river.name', label: 'Rivers', layout: 'rivers', pool: 'river', type: 'Type a river' },
];
export const setOf = (id: string) => SETS.find(s => s.id === id);

export interface Practice { set: SetId; region: Region }
/** "C-eu-f": capitals of Europe, filled in. The best of each is kept under it: never change one. (Before 16 Nov 2026,
 *  Practice asked one question at a time; its records, "C-eu-t" and "C-eu-c", are left as they were.) */
export const practiceKey = (p: Practice) => `${codeOf(setOf(p.set)!.kind)}-${REGION_CODE[p.region]}-f`;
export const practiceLabel = (p: Practice) => `${setOf(p.set)!.label} · ${regionLabel(p.region)}`;
export const practicePlaces = (kb: Knowledge, r: Region) => (r === 'world' ? [] : kb.countries.filter(c => kb.continent(c.id) === r).map(c => c.id));

/** One thing to find: what shows (a country's name, a flag, a text sample, a place on the map) and the answers that
 *  find it. One answer can find several (Mont Blanc is the highest point of France and of Italy). */
export interface Item {
  key: string;                    // the subject: a country, language or river id
  answer: string;                 // shown once found, or once given up
  accept: string[];               // the ids of the answers that find it
  clue?: string;                  // list: the name beside the blank (a country)
  flag?: string;                  // flags: the flag's file name
  text?: string; lang?: string;   // languages: the sample and its language tag
  num?: string; ll?: [number, number]; // countries: the shape on the map, and where it is (its capital, or its middle)
  river?: string;                 // rivers: the course on the map
}

/** Every item of a set in a region. Lists go by the name shown; flags and samples in an order of their own, the same
 *  every time, so a set can be learnt. */
export function setItems(kb: Knowledge, p: Practice): Item[] {
  const s = setOf(p.set)!, t = TEMPLATES.find(x => x.id === s.kind)!;
  const places = new Set(practicePlaces(kb, p.region));
  const subjects = t.subjects(kb, places.size ? (c: string) => places.has(c) : () => true);
  const name = (id: string) => kb.name(id);
  const capitalAt = (c: string) => { const m = kb.mainCapitals(c); return m.length === 1 ? kb.cities.find(x => x.id === m[0])?.ll : undefined; };
  const items: Item[] = subjects.map(id => {
    switch (s.id) {
      case 'countries': { const c = kb.country(id)!; return { key: id, answer: c.name, accept: [id], num: c.num, ll: capitalAt(id) ?? c.ll }; }
      case 'capitals': return { key: id, clue: name(id), answer: kb.mainCapitals(id).map(name).join(' / '), accept: kb.capitals(id) };
      case 'flags': { const c = kb.country(id)!; return { key: id, answer: c.name, accept: [id], flag: c.flag }; }
      case 'languages': { const l = kb.get<Language>(id)!; return { key: id, answer: l.name, accept: [id], text: l.sample, lang: BCP47[id] ?? id }; }
      case 'peaks': { const peak = kb.highestPoint(id)!; return { key: id, clue: name(id), answer: name(peak), accept: [peak] }; }
      case 'rivers': { const r = kb.get<River>(id)!; return { key: id, answer: r.name, accept: kb.rivers.filter(x => x.name === r.name).map(x => x.id), river: id }; }
    }
  });
  if (s.layout === 'list') return items.sort((a, b) => a.clue!.localeCompare(b.clue!));
  return shuffle(items, seeded(`p-${practiceKey(p)}`));
}

/** The answers' names (and other names: "Holland", "Burma") to the items they find, for finding them as they are typed. */
export function nameIndex(items: Item[], entities: { id: string; name: string; aliases: string[] }[]): Map<string, number[]> {
  const byId = new Map(entities.map(e => [e.id, e]));
  const index = new Map<string, number[]>();
  items.forEach((it, j) => {
    for (const id of it.accept) {
      const e = byId.get(id);
      if (!e) continue;
      for (const n of [e.name, ...e.aliases]) {
        const k = norm(n);
        if (!k) continue;
        const list = index.get(k) ?? [];
        if (!list.includes(j)) list.push(j);
        index.set(k, list);
      }
    }
  });
  return index;
}
