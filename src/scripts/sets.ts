// Practice sets: one per category, each on one screen (James, 16 Nov 2026: "similar to a fill it all in at once
// system"). Every country of a region on its map, every capital and highest point on it too, every flag, language
// sample or river. Since his finishing notes the same evening, one item at a time is asked, picked out in green; once
// answered, the next comes up by itself (nextItem), and any other can be picked. No time limit (his ask the same day);
// the time is only told at the end. Pure, with no page: fill.ts shows a set, the tests check them.
// Imported with their extensions, so the tests (Node, which reads TypeScript) can load this file as it is.
import { CONTINENTS, type Knowledge, type Language, type Peak, type River } from './kb.ts';
import { BCP47, TEMPLATES, codeOf, seeded, shuffle, type Cat, type Pool } from './questions.ts';
import { norm } from '../../scripts/lib/text.mjs';

export type Region = 'world' | (typeof CONTINENTS)[number];
export const REGIONS: Region[] = ['world', ...CONTINENTS];
export const regionLabel = (r: Region) => (r === 'world' ? 'World' : r);
const REGION_CODE: Record<Region, string> = { world: 'w', Africa: 'af', Asia: 'as', Europe: 'eu', 'North America': 'na', 'South America': 'sa', Oceania: 'oc' };

export type SetId = 'countries' | 'capitals' | 'flags' | 'languages' | 'peaks' | 'rivers';
/** How a set is shown: its places on a map (countries, with their capitals or highest points marked; rivers), or cards
 *  of flags or text samples with a blank under each. */
export type Layout = 'map' | 'rivers' | 'flags' | 'texts';
/** `mark`: on the map, each country's capital (a dot) or highest point (a peak), and what is asked about it (`ask`);
 *  `world`: only ever the whole world, in one mixed order (flags: James, "they should not be organised by continent"). */
export interface PracticeSet {
  id: SetId; cat: Cat; kind: string; label: string; layout: Layout; pool: Pool; type: string;
  mark?: 'dot' | 'peak'; ask?: (country: string) => string; world?: boolean;
}
/** The question type each set is made of (its subjects), and what is typed. */
export const SETS: PracticeSet[] = [
  { id: 'countries', cat: 'locations', kind: 'loc.map', label: 'Countries', layout: 'map', pool: 'country', type: 'Type a country' },
  { id: 'capitals', cat: 'capitals', kind: 'cap.name', label: 'Capitals', layout: 'map', pool: 'city', type: 'Type a capital', mark: 'dot', ask: c => `Capital of ${c}` },
  { id: 'flags', cat: 'flags', kind: 'flag.name', label: 'Flags', layout: 'flags', pool: 'country', type: 'Type a country', world: true },
  { id: 'languages', cat: 'languages', kind: 'lang.text', label: 'Languages', layout: 'texts', pool: 'language', type: 'Type a language' },
  { id: 'peaks', cat: 'mountains', kind: 'peak.name', label: 'Highest points', layout: 'map', pool: 'peak', type: 'Type a mountain', mark: 'peak', ask: c => `Highest point of ${c}` },
  { id: 'rivers', cat: 'rivers', kind: 'river.name', label: 'Rivers', layout: 'rivers', pool: 'river', type: 'Type a river' },
];
export const setOf = (id: string) => SETS.find(s => s.id === id);

export interface Practice { set: SetId; region: Region }
/** "C-eu-f": capitals of Europe, filled in. The best of each is kept under it: never change one. (Before 16 Nov 2026,
 *  Practice asked one question at a time; its records, "C-eu-t" and "C-eu-c", are left as they were.) */
export const practiceKey = (p: Practice) => `${codeOf(setOf(p.set)!.kind)}-${REGION_CODE[p.region]}-f`;
export const practiceLabel = (p: Practice) => `${setOf(p.set)!.label} · ${regionLabel(p.region)}`;
export const practicePlaces = (kb: Knowledge, r: Region) => (r === 'world' ? [] : kb.countries.filter(c => kb.continent(c.id) === r).map(c => c.id));
/** The region a set is played in: flags are always the whole world. */
export const regionFor = (set: SetId, r: Region): Region => (setOf(set)?.world ? 'world' : r);

/** One thing to find: what shows (a flag, a text sample, a place on the map) and the answers that find it. */
export interface Item {
  key: string;                    // the subject: a country, language or river id
  answer: string;                 // shown once found, or once given up
  accept: string[];               // the ids of the answers that find it
  clue?: string;                  // capitals, highest points: the country asked about
  flag?: string;                  // flags: the flag's file name
  text?: string; lang?: string;   // languages: the sample and its language tag
  num?: string;                   // countries, capitals, highest points: the country's shape on the map
  ll?: [number, number];          // on a map: where it is [lat, lng] (a country's capital, or its middle; a river's middle)
  marks?: [number, number][];     // capitals, highest points: the capital(s) or the peak, [lat, lng]
  cont?: string;                  // on a map: its continent, to finish one before going on to the next
  river?: string;                 // rivers: the course on the map
}

/** Every item of a set in a region. Lists go by the name shown; flags and samples in an order of their own, the same
 *  every time, so a set can be learnt. */
export function setItems(kb: Knowledge, p: Practice): Item[] {
  const s = setOf(p.set)!, t = TEMPLATES.find(x => x.id === s.kind)!;
  const places = new Set(practicePlaces(kb, p.region));
  const subjects = t.subjects(kb, places.size ? (c: string) => places.has(c) : () => true);
  const name = (id: string) => kb.name(id);
  const capitalsAt = (c: string) => kb.mainCapitals(c).map(m => kb.cities.find(x => x.id === m)?.ll).filter((ll): ll is [number, number] => !!ll);
  const capitalAt = (c: string) => { const m = capitalsAt(c); return m.length === 1 ? m[0] : undefined; };
  const items: Item[] = subjects.map(id => {
    switch (s.id) {
      case 'countries': { const c = kb.country(id)!; return { key: id, answer: c.name, accept: [id], num: c.num, ll: capitalAt(id) ?? c.ll, cont: kb.continent(id) }; }
      case 'capitals': {
        const c = kb.country(id)!, at = capitalsAt(id);
        return { key: id, clue: c.name, answer: kb.mainCapitals(id).map(name).join(' / '), accept: kb.capitals(id), num: c.num, ll: at[0] ?? c.ll, marks: at, cont: kb.continent(id) };
      }
      case 'flags': { const c = kb.country(id)!; return { key: id, answer: c.name, accept: [id], flag: c.flag }; }
      case 'languages': { const l = kb.get<Language>(id)!; return { key: id, answer: l.name, accept: [id], text: l.sample, lang: BCP47[id] ?? id }; }
      case 'peaks': {
        const c = kb.country(id)!, peak = kb.get<Peak>(kb.highestPoint(id)!)!;
        return { key: id, clue: c.name, answer: peak.name, accept: [peak.id], num: c.num, ll: peak.ll, marks: [peak.ll], cont: kb.continent(id) };
      }
      case 'rivers': {
        const r = kb.get<River>(id)!;
        return { key: id, answer: r.name, accept: kb.rivers.filter(x => x.name === r.name).map(x => x.id), river: id, cont: kb.continent(kb.riverCountries(id)[0] ?? '') };
      }
    }
  });
  // On a map, by name (the order they are asked in is the walk of nextItem); cards in a mixed order of their own.
  if (s.layout === 'map' || s.layout === 'rivers') return items.sort((a, b) => (a.clue ?? a.answer).localeCompare(b.clue ?? b.answer));
  return shuffle(items, seeded(`p-${practiceKey(p)}`));
}

/** Degrees between two places [lat, lng] on the globe. */
export function arc(a: [number, number], b: [number, number]): number {
  const R = Math.PI / 180, s1 = Math.sin(((b[0] - a[0]) * R) / 2), s2 = Math.sin(((b[1] - a[1]) * R) / 2);
  const h = s1 * s1 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * s2 * s2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / R;
}

/**
 * The item to ask after item `j` (just answered, skipped or picked), or -1 once all are found (James's notes, 16 Nov
 * 2026). Cards (flags, text samples): the next one still to find after it, and after the last one the earliest still
 * to find ("rather than restarting from the beginning"). On a map: the nearest one still to find, in the same
 * continent first, so a continent is done before the next; the ones skipped come last, in the order they were
 * skipped. `j` itself only when it is the last one left.
 */
export function nextItem(items: Item[], found: boolean[], j: number, skipped: number[] = []): number {
  const open = (i: number) => !found[i] && i !== j;
  if (!items.some((_, i) => open(i))) return j >= 0 && !found[j] ? j : -1;
  const at = items[j]?.ll;
  if (!at) {
    for (let k = 1; k <= items.length; k++) { const i = (((j + k) % items.length) + items.length) % items.length; if (open(i)) return i; }
    return -1;
  }
  let pool = items.map((_, i) => i).filter(i => open(i) && !skipped.includes(i) && items[i].ll);
  if (!pool.length) return skipped.find(open) ?? items.findIndex((_, i) => open(i));
  const same = pool.filter(i => items[i].cont === items[j].cont);
  if (same.length) pool = same;
  let best = pool[0], bestD = Infinity;
  for (const i of pool) {
    const d = arc(at, items[i].ll!);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
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
