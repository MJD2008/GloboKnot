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
  let best = null, bestD = Infinity, tie = false;
  for (const e of entities) {
    for (const n of [e.name, ...e.aliases]) {
      const k = norm(n), dd = distance(q, k);
      if (dd > tolerance(k)) continue;
      if (dd < bestD) { best = e; bestD = dd; tie = false; } else if (dd === bestD && best !== e) tie = true;
    }
  }
  return tie ? null : best; // two equally close names: too ambiguous to auto-correct
}
