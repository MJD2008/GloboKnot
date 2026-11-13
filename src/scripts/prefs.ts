// What the player chose, kept in this browser: the quiz selection and the settings. Everything works without
// storage (private windows): the defaults are used and nothing is saved.
import { LEVELS, TEMPLATES, type Level, type Selection } from './questions';

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
export const SIZES = [10, 20, 50] as const; // presets; any other number can be typed in, and 0 means all
export const MAX_SIZE = 9999;
export const clampSize = (n: number) => (n === 0 ? 0 : Math.min(MAX_SIZE, Math.max(1, Math.round(n) || 10)));
const SEL_KEY = 'gk-selection';
type Saved = Partial<Selection> & { v?: number };
const saved: Saved = load<Saved>(SEL_KEY, {});
// A new visitor starts on Easy. A selection kept from before the levels (v 3) was played as what is now Medium.
const level: Level = saved.level && saved.level in LEVELS ? saved.level : Array.isArray(saved.kinds) ? 'medium' : 'easy';
const kinds = Array.isArray(saved.kinds) ? saved.kinds.filter(k => TEMPLATES.some(t => t.id === k)) : [];
// Before v3, neighbours were a category of their own and off by default; now they belong to Locations.
if (!saved.v && kinds.includes('loc.map') && !kinds.includes('nb.name')) kinds.push('nb.name');
export const selection: Selection & { level: Level } = {
  kinds: kinds.length ? kinds : [...LEVELS[level].kinds],
  places: Array.isArray(saved.places) ? saved.places : [],
  size: clampSize(saved.size ?? 10),
  level,
};
export const saveSelection = () => save(SEL_KEY, { ...selection, v: 4 });
/** A level ticks its own question types (anything the player had changed is replaced). */
export function setLevel(l: Level) {
  selection.level = l;
  selection.kinds = [...LEVELS[l].kinds];
}

// ---------- settings
export const ACCENTS = {
  coral: { label: 'Coral', light: '#ff6b3d', deep: '#e8542a', dark: '#ff7447' },
  saffron: { label: 'Saffron', light: '#f29d0a', deep: '#d98a00', dark: '#ffb02e' },
  cobalt: { label: 'Cobalt', light: '#2f63ff', deep: '#1f4fe0', dark: '#6b8fff' },
  violet: { label: 'Violet', light: '#7a4dff', deep: '#6236f0', dark: '#a184ff' },
  lagoon: { label: 'Lagoon', light: '#0aa3a3', deep: '#088a8a', dark: '#2cc7c7' },
} as const;
export type Accent = keyof typeof ACCENTS;
export type Theme = 'light' | 'dark';
/** Seconds per question, the same for everyone. (A choice of time may come back as an option for multiplayer rooms.) */
export const TIME = 15;
/** Each theme has its own colour: blue in Light, orange in Dark, unless the player picks another. */
export const PRESETS: Record<Theme, Accent> = { light: 'cobalt', dark: 'coral' };
export interface Settings {
  theme: Theme;      // Light by default; the page never switches by itself
  accents: Record<Theme, Accent>;
  auto: boolean;     // send a typed answer as soon as it is exactly right
}
const SET_KEY = 'gk-settings';
type SavedSettings = Partial<Settings> & { theme?: string; accent?: Accent; time?: number }; // time: a setting until v3 C
const savedSettings = load<SavedSettings>(SET_KEY, {});
export const settings: Settings = {
  theme: savedSettings.theme === 'dark' ? 'dark' : 'light', // 'auto' (before v3) becomes Light
  accents: { ...PRESETS, ...savedSettings.accents },
  auto: savedSettings.auto ?? true,
};
// Before v3 there was one colour for both themes, coral by default: a colour picked on purpose is kept for both.
if (!savedSettings.accents && savedSettings.accent && savedSettings.accent !== 'coral' && savedSettings.accent in ACCENTS) {
  settings.accents = { light: savedSettings.accent, dark: savedSettings.accent };
}
for (const t of ['light', 'dark'] as const) if (!(settings.accents[t] in ACCENTS)) settings.accents[t] = PRESETS[t];

export function saveSettings() {
  save(SET_KEY, settings);
  applySettings();
}

/** Theme and accent colour on the page. The stylesheet picks the light or dark shade of the accent per theme (the
 *  home screen is always a night sky, so it uses the dark shades). */
export function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  const a = ACCENTS[settings.accents[settings.theme]];
  root.style.setProperty('--a-light', a.light);
  root.style.setProperty('--a-deep', a.deep);
  root.style.setProperty('--a-dark', a.dark);
}

// ---------- progress: rounds played, and the best results in The Gordian Knot (every question at once), which
// shows itself after a few rounds.
export const UNLOCK_ROUNDS = 3;
export interface Stats { rounds: number; gordianSeen: boolean; gordian: Record<string, { pct: number; ms: number }> }
const STATS_KEY = 'gk-stats';
export const stats: Stats = load<Stats>(STATS_KEY, { rounds: 0, gordianSeen: false, gordian: {} });
export const saveStats = () => save(STATS_KEY, stats);
export const gordianOpen = () => stats.rounds >= UNLOCK_ROUNDS;
if (!gordianOpen() && selection.size === 0) selection.size = 10;
/** One key per configuration, for personal bests. */
export const configKey = (sel: Selection) => `${[...sel.kinds].sort().join(',')}|${[...sel.places].sort().join(',')}`;

// ---------- the Daily: one result per day
export const today = () => new Date().toISOString().slice(0, 10);
export function dailyResult(day = today()): number | null {
  try { const v = localStorage.getItem(`gk-daily-${day}`); return v === null ? null : Number(v); } catch { return null; }
}
export function saveDaily(share: number, day = today()) {
  try { if (localStorage.getItem(`gk-daily-${day}`) === null) localStorage.setItem(`gk-daily-${day}`, String(share)); } catch { /* private mode */ }
}
