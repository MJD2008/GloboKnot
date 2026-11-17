// Short text samples for "which language is this?" questions: the opening of Article 1 of the Universal
// Declaration of Human Rights in each language ("All human beings are born free and equal in dignity and rights").
// Source: the UDHR in Unicode collection (OHCHR translations) as packaged in NLTK's udhr2 corpus.
// Writes data/languages/samples.csv. Run: node scripts/import-samples.mjs
import fs from 'node:fs/promises';
import { parseCsv, toCsv } from './lib/csv.mjs';

const root = new URL('..', import.meta.url).pathname;
const dir = root + 'sources/cache/udhr2/udhr2/';
const languages = parseCsv(await fs.readFile(root + 'data/countries/languages.csv', 'utf8'));

// Our ids are ISO 639-3 (macro)languages; the corpus files name a specific variety or script.
// null: no usable file (the corpus's "ckb" is Kurmanji in Latin script, used for Kurdish; its Pashto file is empty).
const FILE = {
  ara: 'arb', aym: 'ayr', aze: 'azj_latn', ber: 'tzm_tfng', bos: 'bos_latn', ckb: null, ell: 'ell_monotonic', fas: 'pes_1',
  fil: 'tgl', grn: 'gug', hat: 'hat_kreyol', kon: 'kng', kur: 'ckb', mlg: 'plt', mon: 'khk', msa: 'mly_latn', nob: null, nor: 'nob',
  nya: 'nya_chechewa', por: 'por_PT', pus: null, que: 'quz', smi: 'sme', sqi: 'als', srp: 'srp_cyrl', swa: 'swh', tso: 'tso_MZ',
  tuk: 'tuk_latn', uzb: 'uzn_latn', zho: 'cmn_hans',
};
// Obvious typos in the source text.
const FIX = { ell: [["'Ολοι", 'Όλοι']], hrv: [['raćaju', 'rađaju']] };
// Scripts written without spaces between words: cut by characters instead of words.
const NO_SPACES = new Set(['zho', 'jpn', 'tha', 'lao', 'khm', 'mya', 'dzo']);
const MAX_WORDS = 12, MAX_CHARS = 30;

// The 30 article headings are short lines that share a word ("Artikel 1", "1. cikk", "Нэгдүгээр зүйл", "第１条"),
// or are Roman numerals alone (Latin). Of the families found, the one with the most headings numbered 1 to 30 wins.
// Article 1 is the paragraph after heading 1, or before heading 2 when the first is spelled out ("Article premier").
function article1(lines, noSpaces) {
  // A few files hold Article 1 alone.
  if (lines.length <= 3) {
    const text = lines.reduce((a, b) => ([...b].length > [...a].length ? b : a), '');
    return [...text].length >= 40 && !text.includes('[??]') ? text : null;
  }
  const words = t => t.replace(/\p{Nd}+/gu, ' ').replace(/[\p{P}\p{S}]+/gu, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const keyers = [
    t => words(t)[0], t => words(t).at(-1),
    t => (noSpaces || !/\s/.test(t) ? [...t][0] : undefined),
    t => (roman(t) ? 'roman' : undefined),
  ];
  const families = [];
  for (const keyOf of keyers) {
    const groups = new Map();
    lines.forEach((t, i) => {
      if ([...t].length > 40) return;
      const k = keyOf(t);
      if (k) (groups.get(k) || groups.set(k, []).get(k)).push(i);
    });
    for (const g of groups.values()) if (g.length >= 25 && g.length <= 40) families.push(g);
  }
  const numbered = g => g.filter(i => { const n = numberIn(lines[i]); return n >= 1 && n <= 30; }).length;
  families.sort((a, b) => numbered(b) - numbered(a) || b.length - a.length);
  const best = families[0];
  if (!best) return null;
  const one = best.find(i => numberIn(lines[i]) === 1), two = best.find(i => numberIn(lines[i]) === 2);
  const at = one !== undefined ? one + 1 : two !== undefined ? two - 1 : best[0] + 1;
  const text = lines[at];
  return text && [...text].length >= 20 ? text : null;
}
/** A line that is only a Roman numeral, maybe after one word ("XII", "Art. IV"): its value. */
function roman(t) {
  const m = t.match(/^(?:\p{L}+\.?\s+)?([IVXL]+)\.?$/u);
  if (!m) return null;
  const v = { I: 1, V: 5, X: 10, L: 50 };
  let n = 0;
  [...m[1]].forEach((c, i, a) => { n += v[c] < (v[a[i + 1]] || 0) ? -v[c] : v[c]; });
  return n;
}
/** The first number in a line, in any script's digits (Arabic-Indic, Devanagari, Thai...), or a Roman numeral. */
function numberIn(t) {
  const m = t.match(/\p{Nd}+/u);
  if (!m) return roman(t);
  let n = 0;
  for (const ch of m[0]) {
    let cp = ch.codePointAt(0), zero = cp;
    while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero--;
    n = n * 10 + (cp - zero);
  }
  return n;
}

// Sentence ends in the scripts we have, and clause breaks to cut a long sentence at.
const STOP = /(?<=[.!?。．۔।॥።։။།؟])\s*/u;
const CLAUSE = /[,;:،؛、，；፣፤]/u;
/** Words and the separators after them; Ethiopic separates words with "፡". */
const tokens = t => t.match(/[^\s፡]+[\s፡]*/gu) || [];

function sample(article, id) {
  let t = article.replace(/፡፡/g, '።').replace(/\s+([,.])(?=\s|$)/g, '$1')
    .replace(/(\p{Ll})\. (?=\p{Ll})/gu, '$1 '); // Hungarian's source has a stray full stop: "Minden. emberi lény"
  for (const [a, b] of FIX[id] || []) t = t.replace(a, b);
  // The first sentence, at least four words long.
  let first = '';
  for (const s of t.split(STOP)) {
    first = first ? `${first} ${s}` : s;
    if (NO_SPACES.has(id) || tokens(first).length >= 4) break;
  }
  first = first.trim();
  if (NO_SPACES.has(id)) {
    const chars = [...first];
    if (chars.length <= MAX_CHARS) return first;
    const head = chars.slice(0, MAX_CHARS).join('');
    // Cut at the last clause mark or space inside the limit, if that keeps at least half.
    const cut = Math.max(...[...head].map((c, i) => (CLAUSE.test(c) || /\s/.test(c) ? i : -1)));
    return (cut >= MAX_CHARS / 2 ? [...head].slice(0, cut).join('') : head).trim() + '…';
  }
  const tk = tokens(first);
  if (tk.length <= MAX_WORDS) return first;
  // Cut at the last clause break inside the limit if that keeps five words or more, else after MAX_WORDS words.
  for (let n = MAX_WORDS; n >= 5; n--) if (CLAUSE.test(tk[n - 1].trim().slice(-1))) return tk.slice(0, n).join('').trim().replace(/[,;:،؛、，；፣፤]$/u, '') + ' …';
  return tk.slice(0, MAX_WORDS).join('').trim().replace(/[,;:،؛、，；፣፤]$/u, '') + ' …';
}

const have = new Set((await fs.readdir(dir)).map(f => f.replace(/\.txt$/, '')));
const rows = [];
for (const l of languages) {
  const file = l.id in FILE ? FILE[l.id] : have.has(l.id) ? l.id : null;
  if (!file || !have.has(file)) continue;
  const lines = (await fs.readFile(dir + file + '.txt', 'utf8')).split('\n').map(s => s.trim()).filter(Boolean);
  const article = article1(lines, NO_SPACES.has(l.id));
  if (!article) { console.log('Article 1 not found:', l.id, file); continue; }
  rows.push({ id: l.id, name: l.name, file, text: sample(article, l.id) });
}
await fs.mkdir(root + 'data/languages', { recursive: true });
await fs.writeFile(root + 'data/languages/samples.csv', toCsv(rows, ['id', 'name', 'file', 'text']));
console.log(`samples: ${rows.length} of ${languages.length} languages`);
