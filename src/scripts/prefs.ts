// What the player chose, kept in this browser: the quiz selection and the settings. Everything works without
// storage (private windows): the defaults are used and nothing is saved.
import { EXPERIMENTS } from './experiments';
import { ropeOf } from './rope';
import { ALL_KINDS, ANSWERS, LEVELS, TEMPLATES, canAsk, type Cat, type Level, type Selection } from './questions';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

// ---------- the quiz selection
/** Presets: Fibonacci numbers, each the two before it added up (8 + 13 = 21), about 1.6 times the last. Any other
 *  number can be typed in, and 0 means all. */
export const SIZES = [8, 13, 21, 34] as const;
export const DEFAULT_SIZE = 13;
export const MAX_SIZE = 9999;
export const clampSize = (n: number) => (n === 0 ? 0 : Math.min(MAX_SIZE, Math.max(1, Math.round(n) || DEFAULT_SIZE)));
const SEL_KEY = 'gk-selection';
type Saved = Omit<Partial<Selection>, 'level'> & { v?: number; level?: string; first?: boolean };
const saved: Saved = load<Saved>(SEL_KEY, {});
// A new visitor starts on Overhand (id easy: the levels kept their ids when they were named after knots on 14 Nov 2026).
// Up to v4 there were three levels; each moved one up when the new Easy came in below
// them (the old Easy is now Medium, with languages added to its own question types). A selection from before the
// levels (v3) was played as the old Medium, now Hard.
const OLD_EASY = ['loc.map', 'nb.name', 'cap.name', 'cap.map', 'cap.reverse', 'flag.name', 'flag.pick'];
const MOVED: Record<string, Level> = { easy: 'medium', medium: 'hard', hard: 'impossible' };
const v = saved.v ?? 0;
const level: Level = v >= 5 && saved.level && saved.level in LEVELS ? saved.level as Level
  : v < 5 && saved.level && saved.level in MOVED ? MOVED[saved.level] : Array.isArray(saved.kinds) ? 'hard' : 'easy';
let kinds = Array.isArray(saved.kinds) ? saved.kinds.filter(k => TEMPLATES.some(t => t.id === k)) : [];
// Before v3, neighbours were a category of their own and off by default; now they belong to Locations.
if (!v && kinds.includes('loc.map') && !kinds.includes('nb.name')) kinds.push('nb.name');
if (v < 5 && saved.level === 'easy' && kinds.length === OLD_EASY.length && OLD_EASY.every(k => kinds.includes(k))) kinds = [...LEVELS.medium.kinds];
// Until v6 the presets were 10, 20 and 50: each becomes the Fibonacci preset closest to it (a typed number stays).
const OLD_SIZES: Record<number, number> = { 10: 13, 20: 21, 50: 34 };
// Atlas (id impossible) is always typed (since 14 Nov 2026): a flag to pick, or Choose or Both, saved with it before, goes.
kinds = kinds.filter(k => canAsk(level, k));
export const selection: Selection & { level: Level } = {
  kinds: kinds.length && level !== 'impossible' ? kinds : [...LEVELS[level].kinds],
  places: Array.isArray(saved.places) && level !== 'impossible' ? saved.places : [],
  size: clampSize(v < 6 && saved.size && saved.size in OLD_SIZES ? OLD_SIZES[saved.size] : saved.size ?? DEFAULT_SIZE),
  level,
  ...(!LEVELS[level].typedOnly && ANSWERS.some(a => a.id === saved.answers) ? { answers: saved.answers } : {}),
};
// While a new player's first round is still to come, its count of 8 is the game's, not theirs: 13 is saved, with
// `first` so a reload keeps the 8.
export const saveSelection = () => save(SEL_KEY, { ...selection, ...(trial ? { size: DEFAULT_SIZE, first: true } : {}), v: 6 });
/** A level picks its own question types and answers (anything the player had changed is replaced). Atlas is all of
 *  it: every question type it asks, about the whole world, typed; only the count can change (James, 16 Nov 2026). All
 *  stays All from one level to another: under Atlas it is The Gordian Knot (22 Nov 2026). */
export function setLevel(l: Level) {
  selection.level = l;
  selection.kinds = [...LEVELS[l].kinds];
  delete selection.answers;
  if (l === 'impossible') selection.places = [];
}

// ---------- rewards (James, 22 Nov 2026). Each appears in its own place once earned and never before (no greyed-out
// options), stays for good, and earning one never opens another. Atlas keeps its own flag (stats.atlas).
//   music        Sound Collector, a round in each part of the day: which music plays, in Settings
//   crimson      The Gordian Knot begun: a crimson colour
//   effects      The Gordian Knot ended with a quarter of all its questions right: its effects, anywhere
//   multicolour  The Gordian Knot untied, every question right: a multicolour theme (and the leaderboard)
export type Reward = 'music' | 'crimson' | 'effects' | 'multicolour';
const REWARDS_KEY = 'gk-rewards';
const rewards = load<Partial<Record<Reward, string>>>(REWARDS_KEY, {});
export const earned = (r: Reward) => !!rewards[r];
/** Earns a reward: true the first time only. */
export function earn(r: Reward): boolean {
  if (rewards[r]) return false;
  rewards[r] = today();
  save(REWARDS_KEY, rewards);
  return true;
}
/** Sound Collector: notes the part of the day a round was played in; true when that completes all four, once. */
export function collectPart(part: string): boolean {
  const parts = new Set(stats.parts ?? []);
  if (!parts.has(part)) { parts.add(part); stats.parts = [...parts].sort(); saveStats(); }
  return parts.size >= 4 && earn('music');
}

// ---------- settings
export const ACCENTS = {
  coral: { label: 'Coral', light: '#ff6b3d', deep: '#e8542a', dark: '#ff7447' },
  saffron: { label: 'Saffron', light: '#f29d0a', deep: '#d98a00', dark: '#ffb02e' },
  cobalt: { label: 'Cobalt', light: '#2f63ff', deep: '#1f4fe0', dark: '#6b8fff' },
  violet: { label: 'Violet', light: '#7a4dff', deep: '#6236f0', dark: '#a184ff' },
  lagoon: { label: 'Lagoon', light: '#0aa3a3', deep: '#088a8a', dark: '#2cc7c7' },
  // Earned in The Gordian Knot: crimson for trying it, plain; multicolour for untying it, its hue always turning
  // (--hue, global.css). Only in Settings once earned, and never picked at random.
  crimson: { label: 'Crimson', light: '#b5121e', deep: '#920e17', dark: '#e2303a' }, // darker, no pink (23 Nov 2026)
  multicolour: { label: 'Multicolour', light: 'hsl(var(--hue) 78% 48%)', deep: 'hsl(var(--hue) 80% 40%)', dark: 'hsl(var(--hue) 92% 66%)' },
} as const;
export type Accent = keyof typeof ACCENTS;
/** The colours that are earned, and by what. */
export const ACCENT_REWARD: Partial<Record<Accent, Reward>> = { crimson: 'crimson', multicolour: 'multicolour' };
/** The colours to pick from: the five, and the earned ones once earned. */
export const accentsOpen = () => (Object.keys(ACCENTS) as Accent[]).filter(a => !ACCENT_REWARD[a] || earned(ACCENT_REWARD[a]!));
export type Theme = 'light' | 'dark';
/** Seconds per question, the same for everyone: 20 since James's notes of 14 Nov 2026 (it was 15). (A choice of time may
 *  come back as an option for multiplayer rooms.) */
export const TIME = 20;
/** Each theme has its own colour: blue in Light, orange in Dark, unless the player picks another. (A first visit gets
 *  one of the five at random instead: see below.) */
export const PRESETS: Record<Theme, Accent> = { light: 'cobalt', dark: 'coral' };
export interface Settings {
  theme: Theme;      // on a first visit, the device's own (light or dark); after that, the page never switches by itself
  accents: Record<Theme, Accent>;
  auto: boolean;     // send a typed answer as soon as it is exactly right
  /** The Gordian Knot's effects anywhere, once earned (a quarter of it right): its texture (embers), the logo on fire
   *  and Play charged, in the colour picked. On from the moment they are earned; one switch turns them all off (James,
   *  24 Nov 2026: "put them into one toggle; effects"; until then texture and animation had a switch each). */
  fx?: boolean;
}
const SET_KEY = 'gk-settings';
// time: a setting until v3 C; fx as { texture, animation } until 24 Nov 2026
type SavedSettings = Omit<Partial<Settings>, 'fx'> & { theme?: string; accent?: Accent; time?: number; fx?: boolean | { texture?: boolean; animation?: boolean } };
const savedSettings = load<SavedSettings>(SET_KEY, {});
/** A first visit (nothing saved yet): the colour is one of the five at random, the same in both themes, and the theme
 *  is the device's own, so a phone in dark mode gets Dark in Settings too (James, 22 Nov 2026). Both are saved at once,
 *  so the colour stays the same on the next visit. */
const firstVisit = (() => { try { return localStorage.getItem(SET_KEY) === null; } catch { return true; } })();
function randomAccent(): Accent {
  const all = (Object.keys(ACCENTS) as Accent[]).filter(a => !ACCENT_REWARD[a]);
  return all[Math.floor(Math.random() * all.length)];
}
function deviceDark(): boolean {
  try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}
const firstAccent = firstVisit ? randomAccent() : null;
export const settings: Settings = {
  theme: savedSettings.theme === 'dark' || (firstVisit && deviceDark()) ? 'dark' : 'light', // 'auto' (before v3) becomes Light
  accents: firstAccent ? { light: firstAccent, dark: firstAccent } : { ...PRESETS, ...savedSettings.accents },
  auto: savedSettings.auto ?? true,
  // the two old switches: the effects stay on if either was
  ...(savedSettings.fx === undefined ? {} : { fx: typeof savedSettings.fx === 'boolean' ? savedSettings.fx : savedSettings.fx.texture !== false || savedSettings.fx.animation !== false }),
};
// Before v3 there was one colour for both themes, coral by default: a colour picked on purpose is kept for both.
if (!savedSettings.accents && savedSettings.accent && savedSettings.accent !== 'coral' && savedSettings.accent in ACCENTS) {
  settings.accents = { light: savedSettings.accent, dark: savedSettings.accent };
}
for (const t of ['light', 'dark'] as const) if (!accentsOpen().includes(settings.accents[t])) settings.accents[t] = PRESETS[t];
if (firstVisit) save(SET_KEY, settings);

export function saveSettings() {
  save(SET_KEY, settings);
  applySettings();
}

/** Theme and accent colour on the page. The stylesheet picks the light or dark shade of the accent per theme (the
 *  home screen is always a night sky, so it uses the dark shades). */
export function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  const id = settings.accents[settings.theme], a = ACCENTS[id];
  root.style.setProperty('--a-light', a.light);
  root.style.setProperty('--a-deep', a.deep);
  root.style.setProperty('--a-dark', a.dark);
  root.classList.toggle('multicolour', id === 'multicolour');
  root.classList.toggle('fx', fxOn());
}
/** The Gordian Knot's effects, earned and switched on. */
export const fxOn = () => earned('effects') && (settings.fx ?? true);

// ---------- progress: rounds played, Atlas (the hidden fourth level, with The Gordian Knot under it) and the record
// in The Gordian Knot (every question in the game at once).
/** Atlas opens after a round of a level's own questions scored this well, whatever its count (James, 23 Nov 2026; it was
 *  75% on Monkey's fist until then): half of a Monkey's fist round, or a whole Bowline round. */
export const ATLAS_AT: Partial<Record<Level, number>> = { hard: 50, medium: 100 };
export interface Best { pct: number; ms: number }
/** `practice`: the best run per practice (question type, region and answers: see practice.ts). `atlas`: Atlas is open.
 *  `untied`: The Gordian Knot at 100%, every question right the first time (a badge of its own: Better than Alexander,
 *  who only cut it). `v` 2 since Atlas opens by a score rather than after three rounds. `low`: poor rounds in a row on
 *  one level, which offer the level below after two. */
export interface Stats {
  rounds: number; gordianSeen: boolean; record?: Best; practice?: Record<string, Best>; gordian?: Record<string, Best>;
  atlas?: boolean; untied?: { ms: number; day: string }; v?: number; low?: { level: Level; n: number };
  /** Sound Collector: the parts of the day (morning, afternoon, evening, night) a round has been played in. */
  parts?: string[];
}
const STATS_KEY = 'gk-stats';
export const stats: Stats = load<Stats>(STATS_KEY, { rounds: 0, gordianSeen: false });
export const saveStats = () => save(STATS_KEY, stats);
export const atlasOpen = () => !!stats.atlas;
// Until 14 Nov 2026 the fourth level (then Impossible) opened after three rounds: whoever had it open keeps it.
if (!stats.v) {
  if (stats.rounds >= 3 || selection.level === 'impossible') stats.atlas = true;
  stats.v = 2;
  if (stats.rounds) saveStats();
}
// Until v5 The Gordian Knot kept a best per configuration; now it is one fixed challenge, and the best for everything
// in the whole world is its record. Its key listed every question type of the time, River → country among them.
if (stats.gordian) {
  const all = stats.gordian[`${[...ALL_KINDS, 'river.map'].sort().join(',')}|`];
  if (all && !stats.record) stats.record = all;
  delete stats.gordian;
  saveStats();
}
if (selection.size === 0 && selection.level === 'impossible' && !atlasOpen()) selection.size = DEFAULT_SIZE;

// ---------- a first round that lands (experiment, 14 Nov 2026): a new player's first round is short, so it ends
// before it can drag: 8 questions instead of 13.
export const FIRST_SIZE = 8;
/** The count is still the first round's, not one the player picked: true for someone new until a round is played,
 *  through reloads (saved with `first` meanwhile). */
let trial = EXPERIMENTS.firstRound && !stats.rounds && (!Object.keys(saved).length || saved.first === true);
if (trial) selection.size = FIRST_SIZE;
/** The trial ends with the first round played (back to 13) or a count picked in the configuration (`keep` it). */
export function endTrial(keep = false) {
  if (!trial) return;
  trial = false;
  if (!keep) selection.size = DEFAULT_SIZE;
}
/** Is `b` a better result than `a`: a higher score, or the same score faster? */
export const better = (b: Best, a?: Best) => !a || b.pct > a.pct || (b.pct === a.pct && b.ms < a.ms);

// ---------- the Daily: one result per day
export const today = () => new Date().toISOString().slice(0, 10);
export function dailyResult(day = today()): number | null {
  try { const v = localStorage.getItem(`gk-daily-${day}`); return v === null ? null : Number(v); } catch { return null; }
}
export function saveDaily(share: number, day = today()) {
  try { if (localStorage.getItem(`gk-daily-${day}`) === null) localStorage.setItem(`gk-daily-${day}`, String(share)); } catch { /* private mode */ }
}
/** The Daily rope so far: see rope.ts. */
export const dailyRope = (day = today()) => ropeOf(d => dailyResult(d) !== null, day);
export { nextDailyIn } from './rope';

// ---------- Tie the world (experiment, 14 Nov 2026): the countries answered right the first time, each with the
// categories it was right in, a letter each. One lights it up on the home globe; three turn it gold.
const TIED_KEY = 'gk-tied';
const CAT_LETTER: Record<Cat, string> = { locations: 'l', capitals: 'c', flags: 'f', languages: 'g', mountains: 'm', rivers: 'r' };
export const GOLD_AT = 3;
export const tied: Record<string, string> = load<Record<string, string>>(TIED_KEY, {});
/** Ties a country in a category: 'new' the first time, 'gold' when it reaches three categories, else null. */
export function tie(country: string, cat: Cat): 'new' | 'gold' | null {
  const had = tied[country] ?? '', l = CAT_LETTER[cat];
  if (had.includes(l)) return null;
  tied[country] = had + l;
  return !had ? 'new' : tied[country].length === GOLD_AT ? 'gold' : null;
}
export const saveTied = () => save(TIED_KEY, tied);

// ---------- new unlocks (James, 23 Nov 2026): what was unlocked is highlighted where it lives (Settings, or the
// configuration for Atlas) the first time it is seen there (unlocks.ts). `gk-seen`: what has been seen, by day.
export type Unlock = Reward | 'atlas';
export const UNLOCK_IDS: Unlock[] = ['atlas', 'music', 'crimson', 'effects', 'multicolour'];
export const unlocked = (u: Unlock) => (u === 'atlas' ? atlasOpen() : earned(u));
const SEEN_KEY = 'gk-seen';
const seenSaved = (() => { try { return localStorage.getItem(SEEN_KEY) !== null; } catch { return false; } })();
const seen = load<Partial<Record<Unlock, string>>>(SEEN_KEY, {});
// Before 23 Nov 2026 nothing was highlighted: whatever was open by then counts as seen.
if (!seenSaved) { for (const u of UNLOCK_IDS) if (unlocked(u)) seen[u] = today(); save(SEEN_KEY, seen); }
/** Unlocked and not yet seen where it lives. */
export const isNew = (u: Unlock) => unlocked(u) && !seen[u];
export function markSeen(us: Unlock[]) {
  const fresh = us.filter(u => !seen[u]);
  for (const u of fresh) seen[u] = today();
  if (fresh.length) save(SEEN_KEY, seen);
}
/** Unlocks one at once (the preview's tools): true when it was still locked. */
export function unlockNow(u: Unlock): boolean {
  if (u !== 'atlas') return earn(u);
  if (stats.atlas) return false;
  stats.atlas = true;
  saveStats();
  return true;
}
/** Locks one again (the preview's tools), new once more when it comes back. A colour no longer open goes back to the
 *  theme's own; a locked Atlas hands the level back to Monkey's fist. */
export function relock(u: Unlock) {
  if (u === 'atlas') {
    stats.atlas = false;
    saveStats();
    if (selection.level === 'impossible') { setLevel('hard'); if (selection.size === 0) selection.size = DEFAULT_SIZE; saveSelection(); }
  } else {
    delete rewards[u];
    save(REWARDS_KEY, rewards);
    for (const t of ['light', 'dark'] as const) if (!accentsOpen().includes(settings.accents[t])) settings.accents[t] = PRESETS[t];
    save(SET_KEY, settings);
  }
  delete seen[u];
  save(SEEN_KEY, seen);
}
