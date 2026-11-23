// A name on The Gordian Knot's board (About), the same rule in the browser and on the server (worker/): trimmed, inner
// spaces single, 1 to 20 characters of letters, digits, spaces and . - _ ' ; no web addresses. Null when it won't do.
export const NAME_MAX = 20;

export function cleanName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!t || [...t].length > NAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} ._'-]+$/u.test(t)) return null;
  if (/https?|www\.|\.(com|net|org|io|gg|tv|be|nl|uk)\b/i.test(t)) return null;
  return t;
}

/** Two names are the same name when they differ only in case. */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en');
