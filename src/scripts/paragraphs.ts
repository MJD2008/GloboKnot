/** The sentences of a country's description. The texts use no abbreviations with full stops
 *  (data/countries/about.yaml), so a full stop (or ! ? or a closing quote), a space and a capital end a sentence. */
export const sentences = (text: string): string[] => text.trim().split(/(?<=[.!?"])\s+(?=[\p{Lu}"'0-9])/u).filter(Boolean);

/** A description in short paragraphs, for the eye (James, 23 Nov 2026: "2-10 sentences, depending on how much there is
 *  to say about the country"): the first sentence on its own as the lead, then the rest in threes and twos. */
export function paragraphs(text: string): string[] {
  const s = sentences(text);
  if (s.length < 3) return s.length ? [s.join(' ')] : [];
  const rest = s.slice(1), k = Math.ceil(rest.length / 3), out = [s[0]];
  for (let i = 0, at = 0; i < k; i++) {
    const n = Math.ceil((rest.length - at) / (k - i));
    out.push(rest.slice(at, at + n).join(' '));
    at += n;
  }
  return out;
}
