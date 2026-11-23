// Players on the site now, by country (James, 22 Nov 2026: "Is there a way to see where someone is from (roughly,
// country) without invading privacy too much? ... highlight that country less or more depending on players currently on
// the website"). Each open page keeps a WebSocket to this one Durable Object; its country is Cloudflare's guess from
// the connection (two letters, set by the Worker), held only on that socket and gone when it closes. Nothing is written
// down. The counts go to every page a few seconds after someone comes or goes (one update for any number of changes),
// and to a page as soon as it connects.
// The sockets hibernate between messages, so a quiet hour costs nothing; a page's "ping" (to keep the line open) is
// answered without waking anything.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

const QUIET = 8000; // ms between two updates of the counts

export class Live extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ cc: req.headers.get('x-country') ?? '' });
    server.send(JSON.stringify({ counts: this.counts() }));
    await this.soon();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage() { /* pages only ping, and that is answered above */ }
  async webSocketClose(ws: WebSocket) {
    try { ws.close(1000); } catch { /* closed already */ }
    await this.soon();
  }
  async webSocketError() { await this.soon(); }

  /** Everyone gets the counts as they are now. */
  async alarm() {
    const msg = JSON.stringify({ counts: this.counts() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* going */ }
    }
  }

  /** Open pages by country: { BE: 3, FR: 1 }. */
  private counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const cc = (ws.deserializeAttachment() as { cc?: string } | null)?.cc;
      if (cc) out[cc] = (out[cc] ?? 0) + 1;
    }
    return out;
  }
  private async soon() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + QUIET);
  }
}
