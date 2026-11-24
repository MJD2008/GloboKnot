// The Gordian Knot's board (James, 22 Nov 2026): "name, completion time, date ... one entry per persistent player;
// renaming never creates entries", with "a standardised challenge, every question correct, time and date recorded,
// edition-associated, no duplicates". One Durable Object holds it, in SQLite:
// - runs: a Gordian Knot begun (who, when by the server's clock, which edition of the data). A run can end on the
//   board once.
// - entries: one per player (the SHA-256 of their key): name, time, date, edition. A faster run of the same edition
//   replaces the time; a run of a newer edition replaces an older edition's; a new name only renames.
// A run goes on the board only if it answered every question of the edition's Gordian Knot, each once, right (checked
// against the answer key built with the site, scripts/build-answers.mjs), in no less time than the server's clock
// says passed since it began, and no faster than anyone could type.
import { DurableObject } from 'cloudflare:workers';
import KEY from './gen/answers.json';
import { cleanName, sameName } from '../src/scripts/board-name';
import { allRight } from './check';
import type { Env } from './index';

const RIGHT = KEY.answers as Record<string, string[]>;
const MIN_MS = 700;               // ms a question at the very least: faster than anyone could read and type (env.MIN_MS in tests)
const SLACK = 2 * 60_000;         // ms of give between the player's clock and the server's
const RUN_LIFE = 30 * 86_400_000; // a run begun more than 30 days ago can't end on the board
const RUNS_A_DAY = 30;            // Gordian Knots begun by one player in a day, at most
const NEW_A_DAY = 50;             // new places on the board in a day, at most: a 100% run is rare, so only a flood of
                                  // made-up runs comes near it, and then it stays small

export interface Entry { id: string; name: string; ms: number; day: string; edition: string }
export type Result<T = object> = (T & { ok: true }) | { error: string };
interface RunRow extends Record<string, SqlStorageValue> { id: string; player: string; started: number; edition: string; used: number }
interface EntryRow extends Record<string, SqlStorageValue> { player: string; name: string; ms: number; day: string; edition: string; run: string }

const idOf = (player: string) => player.slice(0, 12);

export class Board extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player TEXT NOT NULL, started INTEGER NOT NULL,
      edition TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS entries (player TEXT PRIMARY KEY, name TEXT NOT NULL, ms INTEGER NOT NULL,
      day TEXT NOT NULL, edition TEXT NOT NULL, run TEXT NOT NULL, at INTEGER NOT NULL)`);
  }

  /** The board: this edition's places, fastest first, then earlier editions'. */
  list(): { edition: string; n: number; entries: Entry[] } {
    const rows = this.sql.exec<EntryRow>('SELECT player, name, ms, day, edition FROM entries ORDER BY (edition = ?) DESC, edition DESC, ms ASC LIMIT 200', KEY.edition).toArray();
    return { edition: KEY.edition, n: KEY.n, entries: rows.map(r => ({ id: idOf(r.player), name: r.name, ms: r.ms, day: r.day, edition: r.edition })) };
  }

  /** A Gordian Knot begins: `at` ms ago, by the player's clock (the run may have begun before it could reach us). */
  start(player: string, at: number): Result<{ run: string }> {
    const now = Date.now();
    this.sql.exec('DELETE FROM runs WHERE started < ?', now - RUN_LIFE);
    const recent = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM runs WHERE player = ? AND started > ?', player, now - 86_400_000).one().n;
    if (recent >= RUNS_A_DAY) return { error: 'busy' };
    const run = crypto.randomUUID().replace(/-/g, '');
    this.sql.exec('INSERT INTO runs (id, player, started, edition) VALUES (?, ?, ?, ?)', run, player, now - at, KEY.edition);
    return { ok: true, run };
  }

  /** A Gordian Knot untied: on the board if it holds up. Sent again after a lost answer, it says the same. */
  end(f: { player: string; run: string; name: unknown; ms: number; answers: [string, string][] }): Result<{ place: number; id: string }> {
    const run = this.sql.exec<RunRow>('SELECT id, player, started, edition, used FROM runs WHERE id = ?', f.run).toArray()[0];
    if (!run || run.player !== f.player) return { error: 'run' };
    const mine = this.entry(f.player);
    if (run.used) return mine?.run === run.id ? { ok: true, ...this.placeOf(f.player) } : { error: 'used' };
    if (run.edition !== KEY.edition) return { error: 'edition' };
    const name = cleanName(f.name);
    if (!name) return { error: 'name' };
    // every question of this edition's Gordian Knot, each once, answered right
    if (!allRight(f.answers, RIGHT, KEY.n)) return { error: 'answers' };
    // no quicker than the server's clock allows, nor than anyone could answer
    const now = Date.now();
    const least = this.env.MIN_MS !== undefined ? Number(this.env.MIN_MS) : MIN_MS;
    if (!(f.ms >= KEY.n * least) || f.ms > now - run.started + SLACK) return { error: 'time' };
    if (this.taken(name, f.player)) return { error: 'taken' };
    if (!mine && this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE at > ?', now - 86_400_000).one().n >= NEW_A_DAY) return { error: 'busy' };
    const ms = Math.round(f.ms), day = new Date(now).toISOString().slice(0, 10);
    this.sql.exec('UPDATE runs SET used = 1 WHERE id = ?', run.id);
    if (!mine || mine.edition !== KEY.edition || ms < mine.ms) {
      this.sql.exec(`INSERT INTO entries (player, name, ms, day, edition, run, at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player) DO UPDATE SET name = excluded.name, ms = excluded.ms, day = excluded.day,
        edition = excluded.edition, run = excluded.run, at = excluded.at`, f.player, name, ms, day, KEY.edition, run.id, now);
    } else {
      this.sql.exec('UPDATE entries SET name = ?, run = ? WHERE player = ?', name, run.id, f.player);
    }
    return { ok: true, ...this.placeOf(f.player) };
  }

  /** A new name for a place on the board (there is only ever one place per player). */
  rename(player: string, raw: unknown): Result<{ name: string }> {
    if (!this.entry(player)) return { error: 'none' };
    const name = cleanName(raw);
    if (!name) return { error: 'name' };
    if (this.taken(name, player)) return { error: 'taken' };
    this.sql.exec('UPDATE entries SET name = ? WHERE player = ?', name, player);
    return { ok: true, name };
  }

  /** Takes a place off the board (moderation). */
  remove(id: string): { removed: number } {
    const before = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM entries').one().n;
    this.sql.exec('DELETE FROM entries WHERE substr(player, 1, 12) = ?', id);
    return { removed: before - this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM entries').one().n };
  }

  private entry(player: string): EntryRow | undefined {
    return this.sql.exec<EntryRow>('SELECT player, name, ms, day, edition, run FROM entries WHERE player = ?', player).toArray()[0];
  }
  private taken(name: string, player: string): boolean {
    return this.sql.exec<{ player: string; name: string }>('SELECT player, name FROM entries').toArray().some(r => r.player !== player && sameName(r.name, name));
  }
  /** Where a player stands among this edition's places (1: the fastest). */
  private placeOf(player: string): { place: number; id: string } {
    const me = this.entry(player)!;
    const ahead = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE edition = ? AND ms < ?', me.edition, me.ms).one().n;
    return { place: ahead + 1, id: idOf(player) };
  }
}
