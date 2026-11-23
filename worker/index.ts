// Globoknot's small server (James, 22 Nov 2026), in the same Cloudflare Worker that serves the site. Only /api/ comes
// here (wrangler.jsonc, run_worker_first); every other request is a static file, served without it.
//   GET    /api/live          a WebSocket: players on the site now, by country (live.ts)
//   GET    /api/board         The Gordian Knot's board (board.ts)
//   POST   /api/gordian/start a Gordian Knot begins: the server notes the time   { key, at }      -> { run }
//   POST   /api/gordian/end   it was untied: every answer, checked here           { key, run, name, ms, answers }
//   POST   /api/name          a new name for one's place on the board           { key, name }
//   DELETE /api/board/<id>    takes a place off the board (Authorization: Bearer <ADMIN_KEY>, a secret set in Cloudflare)
// The player's key is a random secret kept in their browser; only its SHA-256 is kept here. Nothing else about a player
// is kept: no addresses, no cookies. Their country (Cloudflare's guess from the connection) is held in memory while
// they are connected, to count players by country, and never written down.
import { Board } from './board';
import { Live } from './live';

export { Board, Live };

export interface Env {
  ASSETS: Fetcher;
  BOARD: DurableObjectNamespace<Board>;
  LIVE: DurableObjectNamespace<Live>;
  ADMIN_KEY?: string;
  /** For tests only (wrangler dev --var MIN_MS:0): ms a question at the very least, instead of 700. */
  MIN_MS?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** The SHA-256 of a player's key, in hex: who they are, here. */
async function hash(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const isKey = (k: unknown): k is string => typeof k === 'string' && /^[0-9a-f]{32}$/.test(k);

/** A JSON body no bigger than `max` bytes, or null. */
async function body(req: Request, max: number): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const path = url.pathname.replace(/\/+$/, '');
    const board = () => env.BOARD.get(env.BOARD.idFromName('board'));
    try {
      if (path === '/api/live') {
        if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket' }, 426);
        const cc = String((req as Request & { cf?: { country?: string } }).cf?.country ?? '');
        const to = new Request(req.url, req);
        to.headers.set('x-country', /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : '');
        return env.LIVE.get(env.LIVE.idFromName('world')).fetch(to);
      }
      if (path === '/api/board' && req.method === 'GET') return json(await board().list());
      if (path === '/api/gordian/start' && req.method === 'POST') {
        const b = await body(req, 1000);
        if (!b || !isKey(b.key)) return json({ error: 'bad' }, 400);
        const at = Math.max(0, Math.min(Number(b.at) || 0, 15 * 60_000)); // ms the run had been going when this left
        const r = await board().start(await hash(b.key), at);
        return json(r, 'error' in r ? 429 : 200);
      }
      if (path === '/api/gordian/end' && req.method === 'POST') {
        const b = await body(req, 400_000);
        if (!b || !isKey(b.key) || typeof b.run !== 'string' || !Array.isArray(b.answers) || typeof b.ms !== 'number') return json({ error: 'bad' }, 400);
        const answers = (b.answers as unknown[]).filter((a): a is [string, string] =>
          Array.isArray(a) && a.length === 2 && typeof a[0] === 'string' && typeof a[1] === 'string' && a[0].length < 60 && a[1].length < 120);
        if (answers.length !== b.answers.length || answers.length > 10_000) return json({ error: 'bad' }, 400);
        const r = await board().end({ player: await hash(b.key), run: b.run, name: b.name, ms: b.ms, answers });
        return json(r, 'error' in r ? (r.error === 'busy' ? 429 : 422) : 200);
      }
      if (path === '/api/name' && req.method === 'POST') {
        const b = await body(req, 1000);
        if (!b || !isKey(b.key)) return json({ error: 'bad' }, 400);
        const r = await board().rename(await hash(b.key), b.name);
        return json(r, 'error' in r ? 422 : 200);
      }
      const m = path.match(/^\/api\/board\/([0-9a-f]{12})$/);
      if (m && req.method === 'DELETE') {
        if (!env.ADMIN_KEY || req.headers.get('authorization') !== `Bearer ${env.ADMIN_KEY}`) return json({ error: 'forbidden' }, 403);
        return json(await board().remove(m[1]));
      }
      return json({ error: 'not found' }, 404);
    } catch {
      return json({ error: 'server' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
