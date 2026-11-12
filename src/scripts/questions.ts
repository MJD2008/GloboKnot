// Question templates: each turns approved facts about one country into a question.
// Nothing here is a fact itself; facts only come from the knowledge base.
import type { Country, Knowledge } from './kb';

export type Mode = 'mixed' | 'map' | 'capitals' | 'flags' | 'languages';
export type Media = { kind: 'map'; country: string } | { kind: 'flag'; country: string } | { kind: 'none' };
export type Pool = 'country' | 'city' | 'language';

export interface Question {
  key: string;                 // template + entity: used to avoid repeats
  format: 'type' | 'choice';
  prompt: string;
  media: Media;
  pool: Pool;                  // which names a typed answer is matched against
  accept: string[];            // entity ids that count as right
  answer: string;              // the right answer as the log shows it
  choices?: { id: string; label: string }[];
}

type Template = (kb: Knowledge, c: Country) => Question | null;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
export function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const mapName: Template = (_kb, c) => ({
  key: `map:${c.id}`, format: 'type', prompt: 'Which country?', media: { kind: 'map', country: c.id },
  pool: 'country', accept: [c.id], answer: c.name,
});

const flagName: Template = (_kb, c) => ({
  key: `flag:${c.id}`, format: 'type', prompt: 'Whose flag?', media: { kind: 'flag', country: c.id },
  pool: 'country', accept: [c.id], answer: c.name,
});

const capitalOf: Template = (kb, c) => {
  const all = kb.capitals(c.id), main = kb.mainCapitals(c.id);
  if (!all.length || !main.length) return null;
  return {
    key: `capital:${c.id}`, format: 'type', prompt: kb.wording('capital', 'forward', { s: c.name }),
    media: { kind: 'map', country: c.id }, pool: 'city', accept: all, answer: main.map(id => kb.name(id)).join(' / '),
  };
};

const capitalReverse: Template = (kb, c) => {
  const main = kb.mainCapitals(c.id);
  if (main.length !== 1) return null; // split capitals only work in the forward direction
  return {
    key: `capital-of:${main[0]}`, format: 'type', prompt: kb.wording('capital', 'reverse', { o: kb.name(main[0]) }),
    media: { kind: 'none' }, pool: 'country', accept: [c.id], answer: c.name,
  };
};

const languageChoice: Template = (kb, c) => {
  const official = kb.languagesOf(c.id);
  if (!official.length) return null;
  const right = pick(official);
  // Wrong options should be tempting: languages official next door count most, then the same continent, then
  // anywhere, so widely used languages come up more than rare ones. official_language is "complete", so a
  // language not listed for this country is guaranteed not to be official here.
  const continent = kb.continent(c.id);
  const next = new Set(kb.neighbours(c.id));
  const weight = new Map<string, number>();
  for (const other of kb.countries) {
    if (other.id === c.id) continue;
    const w = next.has(other.id) ? 6 : kb.continent(other.id) === continent ? 2 : 0.1;
    for (const l of kb.languagesOf(other.id)) if (!official.includes(l)) weight.set(l, (weight.get(l) ?? 0) + w);
  }
  const wrong = weightedSample(weight, 3);
  if (wrong.length < 3) return null;
  return {
    key: `language:${c.id}`, format: 'choice', prompt: kb.wording('official_language', 'forward', { s: c.name }),
    media: { kind: 'map', country: c.id }, pool: 'language', accept: official, answer: kb.name(right),
    choices: shuffle([right, ...wrong]).map(id => ({ id, label: kb.name(id) })),
  };
};

/** n distinct keys, each drawn with a chance in proportion to its weight. */
function weightedSample(weights: Map<string, number>, n: number): string[] {
  return [...weights]
    .map(([id, w]) => ({ id, k: Math.pow(Math.random(), 1 / w) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map(x => x.id);
}

const TEMPLATES: Record<Exclude<Mode, 'mixed'>, Template[]> = {
  map: [mapName],
  flags: [flagName],
  capitals: [capitalOf, capitalOf, capitalReverse],
  languages: [languageChoice],
};

const RECENT_KEY = 'gk-recent';
function recent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
export function remember(keys: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([...keys, ...recent()].slice(0, 80))); } catch { /* private mode */ }
}

/** A round of `size` questions: no country twice, about 60% well-known countries, recently seen questions rested. */
export function buildRound(kb: Knowledge, mode: Mode, size = 10): Question[] {
  const templates = mode === 'mixed' ? Object.values(TEMPLATES).flat() : TEMPLATES[mode];
  const seen = new Set(recent());
  const core = shuffle(kb.countries.filter(c => c.tier === 'core'));
  const other = shuffle(kb.countries.filter(c => c.tier !== 'core'));
  const order: Country[] = [];
  while (core.length || other.length) {
    const fromCore = core.length && (!other.length || Math.random() < 0.6);
    order.push((fromCore ? core : other).shift()!);
  }
  const round: Question[] = [];
  for (const pass of [true, false]) { // first pass skips recently seen questions, second fills up if needed
    for (const c of order) {
      if (round.length >= size) break;
      if (round.some(q => q.accept.includes(c.id) || q.key.endsWith(`:${c.id}`))) continue;
      for (const t of shuffle(templates)) {
        const q = t(kb, c);
        if (!q || (pass && seen.has(q.key)) || round.some(r => r.key === q.key)) continue;
        round.push(q);
        break;
      }
    }
  }
  return round;
}
