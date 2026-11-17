// Answer matching: silent auto-correct for small typos, never between confusable names.
import { norm } from './text.mjs';

// Damerau-Levenshtein (optimal string alignment): swaps of two letters count as one typo.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Typos allowed by length: 0 up to 4 letters, 1 for 5-8, 2 for longer.
export const tolerance = s => (s.length <= 4 ? 0 : s.length <= 8 ? 1 : 2);

// entities: [{ id, name, aliases: [...] }] of ONE type (all countries, all capitals...).
// Returns the entity the player meant, or null. An exact match on any real name always wins, so typing
// "Nigeria" when the answer is Niger is simply Nigeria (wrong), never auto-corrected.
export function resolve(input, entities) {
  const q = norm(input);
  if (!q) return null;
  for (const e of entities) if ([e.name, ...e.aliases].some(n => norm(n) === q)) return e;
  let bestD = Infinity;
  let near = new Map(); // entities at the best distance -> does one of their closest names start with the same letter?
  for (const e of entities) {
    for (const n of [e.name, ...e.aliases]) {
      const k = norm(n), dd = distance(q, k);
      if (dd > tolerance(k) || dd > bestD) continue;
      if (dd < bestD) { bestD = dd; near = new Map(); }
      near.set(e, near.get(e) || k[0] === q[0]);
    }
  }
  if (near.size <= 1) return near.keys().next().value ?? null;
  // Equally close to two names: people rarely get the first letter wrong, so a single name that shares it wins
  // ("Nambia" is Namibia, not Gambia or Zambia). Otherwise it is too ambiguous to auto-correct ("Seria").
  const sameStart = [...near].filter(([, s]) => s);
  return sameStart.length === 1 ? sameStart[0][0] : null;
}

// The entity a typed answer to ONE question means; `right` holds the ids that count. Entities may be of several types
// (a language or a country). In order:
// 1. An exact name, a right one first (Tonga is a country and a language). A right entity's context names count as
//    its names: "Congo" alone is the Republic of the Congo, but it counts when DR Congo is the answer.
// 2. The usual typo correction (resolve), which may well find a wrong answer ("Slovkia" is Slovakia, also when the
//    answer is Slovenia).
// 3. When that finds nothing (too far, or between two names), a near miss for a right answer counts: one typo more
//    than usual, the same first letter, and no other name closer. "Ngera" is Nigeria when Nigeria is the answer;
//    "Seria" is Serbia when Serbia is the answer and Syria when Syria is. Names up to 4 letters stay exact (Iran, Iraq).
export function resolveFor(input, entities, right) {
  const q = norm(input);
  if (!q) return null;
  const ok = new Set(right);
  const named = entities.map(e => (ok.has(e.id) && e.context?.length ? { ...e, aliases: [...e.aliases, ...e.context] } : e));
  const back = new Map(named.map((e, i) => [e, entities[i]]));
  const exact = e => [e.name, ...e.aliases].some(n => norm(n) === q);
  const hit = named.find(e => ok.has(e.id) && exact(e)) ?? named.find(exact) ?? resolve(input, named);
  if (hit) return back.get(hit);
  let best = null, bestD = Infinity, otherD = Infinity;
  for (const e of named) {
    for (const n of [e.name, ...e.aliases]) {
      const k = norm(n), d = distance(q, k);
      if (!ok.has(e.id)) otherD = Math.min(otherD, d);
      else if (k.length > 4 && q.length >= 4 && k[0] === q[0] && d <= tolerance(k) + 1 && d < bestD) { best = e; bestD = d; }
    }
  }
  return best && bestD <= otherD ? back.get(best) : null;
}
