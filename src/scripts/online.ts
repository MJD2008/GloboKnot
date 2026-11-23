// The site's own small server (worker/, James, 22 Nov 2026): players on the site now, by country, and The Gordian
// Knot's board. Both stay quiet where there is no server (a copy of the site, the preview): no glow, and the board says
// it can't be reached.
// Who a player is, for the board: a random key made in their browser the first time they begin a Gordian Knot (kept in
// gk-player). The server keeps only its SHA-256, so the key is their place: one place per key, whatever the name.
import { cleanName } from './board-name';

const api = (p: string) => new URL(`api/${p}`, document.baseURI).href;
/** Sample data for the preview, which has no server (set by the preview's own build, never on the site). */
const sample = (window as unknown as { __gkSample?: { live?: Record<string, number>; board?: Entry[] } }).__gkSample;

// ---- the player's key
const KEY = 'gk-player';
export function playerKey(): string {
  let k = '';
  try { k = localStorage.getItem(KEY) ?? ''; } catch { /* private mode */ }
  if (!/^[0-9a-f]{32}$/.test(k)) {
    k = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(KEY, k); } catch { /* private mode: a key for this visit only */ }
  }
  return k;
}
/** The player's place on the board is listed under this id (the start of their key's SHA-256), if they have one. */
export async function myId(): Promise<string | null> {
  let k = '';
  try { k = localStorage.getItem(KEY) ?? ''; } catch { return null; }
  if (!k) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

async function call<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const r = await fetch(api(path), body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!(r.headers.get('content-type') ?? '').includes('application/json')) return null; // no server here
    return await r.json() as T;
  } catch { return null; }
}

// ---- players now
/** Keeps a line open to the server while the page is in view (and two minutes after it goes out of view), and passes
 *  on the counts by country (two-letter codes) whenever they change. Gives up quietly where there is no server. */
export function initLive(onCounts: (counts: Record<string, number>) => void) {
  if (sample?.live) { const c = sample.live; setTimeout(() => onCounts(c), 600); return; }
  if (!('WebSocket' in window)) return;
  let ws: WebSocket | null = null, wait = 4000, failed = 0, ping = 0, away = 0;
  const connect = () => {
    if (ws || document.hidden || failed >= 3) return;
    const url = api('live').replace(/^http/, 'ws');
    let opened = false;
    try { ws = new WebSocket(url); } catch { failed = 3; return; }
    ws.onopen = () => { opened = true; failed = 0; wait = 4000; ping = window.setInterval(() => ws?.readyState === 1 && ws.send('ping'), 45_000); };
    ws.onmessage = e => {
      if (e.data === 'pong') return;
      try { const d = JSON.parse(String(e.data)); if (d && typeof d.counts === 'object') onCounts(d.counts); } catch { /* not for us */ }
    };
    ws.onclose = () => {
      clearInterval(ping);
      ws = null;
      if (!opened) failed++;
      onCounts({});
      if (!document.hidden && failed < 3) { setTimeout(connect, wait); wait = Math.min(wait * 3, 300_000); }
    };
  };
  document.addEventListener('visibilitychange', () => {
    clearTimeout(away);
    if (document.hidden) away = window.setTimeout(() => ws?.close(1000), 120_000);
    else connect();
  });
  connect();
}

// ---- The Gordian Knot's board
export interface Entry { id: string; name: string; ms: number; day: string; edition: string }
export interface Board { edition: string; n: number; entries: Entry[]; sample?: boolean }
export const board = async (): Promise<Board | null> =>
  sample?.board ? { edition: '', n: 0, entries: sample.board, sample: true } : call<Board>('board');

/** A Gordian Knot begins (`at`: ms ago): the server notes the time, and gives the run its id. Null without a server. */
export async function gordianStart(at = 0): Promise<string | null> {
  const r = await call<{ run?: string }>('gordian/start', { key: playerKey(), at: Math.round(at) });
  return r?.run ?? null;
}

/** An untied run waiting for its name (kept, so a closed page doesn't lose it): its id, time and answers. */
export interface Untied { run: string; ms: number; answers: [string, string][]; edition: string }
const UNTIED = 'gk-untied';
export function keepUntied(u: Untied | null) {
  try { if (u) localStorage.setItem(UNTIED, JSON.stringify(u)); else localStorage.removeItem(UNTIED); } catch { /* private mode */ }
}
export function untied(): Untied | null {
  try { const u = JSON.parse(localStorage.getItem(UNTIED) || 'null'); return u && typeof u.run === 'string' && Array.isArray(u.answers) ? u : null; } catch { return null; }
}

export type Outcome = { ok: true; place: number; id: string } | { ok: false; why: 'name' | 'taken' | 'offline' | 'refused' };
/** Puts an untied run on the board under a name. */
export async function gordianEnd(u: Untied, name: string): Promise<Outcome> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, why: 'name' };
  const r = await call<{ ok?: boolean; place?: number; id?: string; error?: string }>('gordian/end', { key: playerKey(), run: u.run, name: clean, ms: u.ms, answers: u.answers });
  if (!r) return { ok: false, why: 'offline' };
  if (r.ok && r.place && r.id) return { ok: true, place: r.place, id: r.id };
  if (r.error === 'name' || r.error === 'taken') return { ok: false, why: r.error };
  return { ok: false, why: r.error === 'server' || r.error === 'busy' ? 'offline' : 'refused' }; // busy: kept for later
}

/** A new name for the player's place. */
export async function rename(name: string): Promise<{ ok: true; name: string } | { ok: false; why: 'name' | 'taken' | 'offline' | 'refused' }> {
  const clean = cleanName(name);
  if (!clean) return { ok: false, why: 'name' };
  const r = await call<{ ok?: boolean; name?: string; error?: string }>('name', { key: playerKey(), name: clean });
  if (!r) return { ok: false, why: 'offline' };
  if (r.ok && r.name) return { ok: true, name: r.name };
  return { ok: false, why: r.error === 'name' || r.error === 'taken' ? r.error : r.error === 'server' ? 'offline' : 'refused' };
}
