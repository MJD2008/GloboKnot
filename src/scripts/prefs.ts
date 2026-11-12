// What the player chose, kept in this browser: the quiz selection and the settings. Everything works without
// storage (private windows): the defaults are used and nothing is saved.
import { DEFAULT_KINDS, TEMPLATES, type Selection } from './questions';

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
export const SIZES = [10, 20, 50] as const;
const SEL_KEY = 'gk-selection';
export const selection: Selection = load<Selection>(SEL_KEY, { kinds: DEFAULT_KINDS, places: [], size: 10 });
selection.kinds = selection.kinds.filter(k => TEMPLATES.some(t => t.id === k));
if (!SIZES.includes(selection.size as 10)) selection.size = 10;
export const saveSelection = () => save(SEL_KEY, selection);

// ---------- settings
export const ACCENTS = {
  coral: { label: 'Coral', light: '#ff6b3d', deep: '#e8542a', dark: '#ff7447' },
  saffron: { label: 'Saffron', light: '#f29d0a', deep: '#d98a00', dark: '#ffb02e' },
  cobalt: { label: 'Cobalt', light: '#2f63ff', deep: '#1f4fe0', dark: '#6b8fff' },
  violet: { label: 'Violet', light: '#7a4dff', deep: '#6236f0', dark: '#a184ff' },
  lagoon: { label: 'Lagoon', light: '#0aa3a3', deep: '#088a8a', dark: '#2cc7c7' },
} as const;
export type Accent = keyof typeof ACCENTS;
export const TIMES = [10, 15, 20] as const;
export interface Settings { theme: 'auto' | 'light' | 'dark'; accent: Accent; time: number }
const SET_KEY = 'gk-settings';
export const settings: Settings = load<Settings>(SET_KEY, { theme: 'auto', accent: 'coral', time: 15 });
if (!(settings.accent in ACCENTS)) settings.accent = 'coral';
if (!TIMES.includes(settings.time as 10)) settings.time = 15;

export function saveSettings() {
  save(SET_KEY, settings);
  applySettings();
}

/** Theme and accent colour on the page (CSS tokens). */
export function applySettings() {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = settings.theme;
  const a = ACCENTS[settings.accent];
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.style.setProperty('--accent', dark ? a.dark : a.light);
  root.style.setProperty('--accent-deep', dark ? a.light : a.deep);
  root.style.setProperty('--hl', dark ? a.dark : a.light);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);

// ---------- the Daily: one result per day
export const today = () => new Date().toISOString().slice(0, 10);
export function dailyResult(day = today()): number | null {
  try { const v = localStorage.getItem(`gk-daily-${day}`); return v === null ? null : Number(v); } catch { return null; }
}
export function saveDaily(share: number, day = today()) {
  try { if (localStorage.getItem(`gk-daily-${day}`) === null) localStorage.setItem(`gk-daily-${day}`, String(share)); } catch { /* private mode */ }
}
