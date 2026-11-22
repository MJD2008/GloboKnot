// Practice (James, 16 Nov 2026): one set (sets.ts) on one screen. Since his finishing notes that evening, one item at a
// time is asked, picked out in green: on a map a country, its capital, its highest point or a river; otherwise a flag
// or a text sample. Once it is answered the next comes up by itself: on a map the nearest one still to find, a
// continent at a time; on cards the next one along, and after the last one the earliest still to find (nextItem).
// Tapping any other one asks that one instead, and Skip (or → in an empty box) moves on, leaving it for later. Enter
// forgives a typo; a wrong answer that names another one of the set shows where that one is, for a moment. No time
// limit, and no clock while playing: the time is only told at the end, beside the best. Give up shows what was missed,
// in red.
import { geoCentroid, geoOrthographic } from 'd3-geo';
import { resolveFor } from '../../scripts/lib/match.mjs';
import { norm } from '../../scripts/lib/text.mjs';
import type { Entity, Knowledge } from './kb';
import type { MapSet, WorldMap } from './map';
import { clockOf } from './menu';
import { better, saveStats, stats, type Best } from './prefs';
import { shuffle, type Pool } from './questions';
import { nameIndex, nextItem, practiceKey, practiceLabel, setItems, setOf, type Item, type Practice } from './sets';
import { sound } from './sound';
import { zoomable, type Zoom } from './zoom';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const RAD = 180 / Math.PI;
const FLASH = 1400; // ms a place named wrongly shows where it is
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const bestLabel = (b: Best) => `${b.pct}% in ${clockOf(b.ms)}`;
export const practiceBest = (p: Practice): Best | undefined => stats.practice?.[practiceKey(p)];

export interface FillDeps {
  kb: Knowledge;
  world: WorldMap;
  pools: Record<Pool, Entity[]>;
  url: (path: string) => string;
  loadRivers: () => Promise<void>;
  /** Leaving with answers found asks first (the same card as a round); `then` leaves. */
  askLeave: (then: () => void) => void;
  home: () => void;
  /** A Practice ended (all found, or given up). */
  done?: () => void;
}

export function initFill(root: HTMLElement, d: FillDeps) {
  const ui = {
    title: $(root, '#fill-title'),
    count: $(root, '#fill-count'),
    form: $<HTMLFormElement>(root, '#fill-form'),
    input: $<HTMLInputElement>(root, '#fill-input'),
    bar: $(root, '.fill-progress i'),
    last: $(root, '#fill-last'),
    skip: $<HTMLButtonElement>(root, '#fill-skip'),
    give: $<HTMLButtonElement>(root, '#fill-give'),
    end: $(root, '#fill-end'),
    score: $(root, '#fill-score'),
    time: $(root, '#fill-time'),
    best: $(root, '#fill-best'),
    board: $(root, '#fill-board'),
    top: $(root, '.fill-top'),
  };
  let p: Practice | null = null, items: Item[] = [], found: boolean[] = [], index = new Map<string, number[]>();
  /** The item asked now; on a map, the ones skipped, in the order they were (they come back once the rest is done). */
  let cur = -1, skipped: number[] = [];
  let started = 0, done = false, streak = 0, wait = 0, clearing = 0, flashing = 0;
  let mapSet: MapSet | null = null, svg: SVGSVGElement | null = null, zoom: Zoom | null = null, cards: HTMLElement[] = [];

  const left = () => found.filter(f => !f).length;
  const paintCount = () => {
    const n = items.length - left();
    ui.count.textContent = `${n} / ${items.length}`;
    ui.bar.style.setProperty('--done', String(items.length ? n / items.length : 0));
  };
  const keyOf = (it: Item) => it.num ?? it.river ?? it.key;

  async function start(practice: Practice) {
    p = practice;
    const set = setOf(p.set)!;
    if (set.layout === 'rivers') await d.loadRivers();
    items = setItems(d.kb, p);
    // Cards come in a new mixed order every time (flags: "a completely mixed, worldwide order").
    if (set.layout === 'flags' || set.layout === 'texts') items = shuffle(items);
    if (set.layout === 'rivers') for (const it of items) it.ll ??= middleOf(d.world.rivers[it.river!]);
    found = items.map(() => false);
    skipped = [];
    cur = -1;
    index = nameIndex(items, d.pools[set.pool]);
    done = false;
    streak = 0;
    clearTimeout(wait);
    clearTimeout(flashing);
    ui.title.textContent = practiceLabel(p);
    ui.input.value = '';
    ui.input.classList.remove('wrong');
    ui.form.hidden = ui.give.hidden = ui.skip.hidden = false;
    ui.end.hidden = true;
    ui.last.textContent = '';
    ui.last.className = 'fill-last';
    root.dataset.layout = set.layout;
    root.classList.remove('all-found');
    paintCount();
    board();
    ask(firstItem());
    started = performance.now();
    ui.input.focus({ preventScroll: true });
  }

  /** Where it starts: on cards, the first; on a map, a well-known one in view (France, Brazil...), else any in view. */
  function firstItem(): number {
    if (!mapSet) return 0;
    const inView = items.map((it, j) => j).filter(j => items[j].ll && d.world.inView([items[j].ll![1], items[j].ll![0]], 40));
    const famous = inView.filter(j => d.kb.country(items[j].key)?.tier === 'famous');
    const from = famous.length ? famous : inView.length ? inView : items.map((_, j) => j);
    return from[Math.floor(Math.random() * from.length)];
  }

  // ---------------------------------------------------------------- the board: a map, or cards
  function board() {
    const set = setOf(p!.set)!;
    ui.board.innerHTML = '';
    cards = [];
    mapSet = null;
    if (set.layout === 'map' || set.layout === 'rivers') {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('map', 'fill-map');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', set.layout === 'map' ? 'Map of the countries to find' : 'Map of the rivers to find');
      ui.board.append(svg);
      zoom = zoomable(svg, d.world, { drag: true });
      listenMap(svg);
      const names = new Map(items.map(it => [keyOf(it), it.answer]));
      mapSet = set.layout === 'map'
        ? {
          countries: new Map(items.map(it => [it.num!, it.ll!])), found: new Set(), missed: new Set(), names,
          ...(set.mark ? { mark: set.mark, marks: new Map(items.map(it => [it.num!, it.marks ?? []])) } : {}),
        }
        : { rivers: items.map(it => it.river!), found: new Set(), missed: new Set(), names };
      drawMap();
      return;
    }
    const list = document.createElement('ol');
    list.className = `fill-cards ${set.layout}`;
    items.forEach((it, j) => {
      const li = document.createElement('li');
      li.className = 'fill-card';
      li.dataset.j = String(j);
      if (it.flag) li.innerHTML = `<img alt="A flag" loading="lazy" src="${d.url(`flags/${it.flag}.svg`)}" /><span class="slot"></span>`;
      else li.innerHTML = `<blockquote dir="auto" lang="${esc(it.lang ?? '')}">${esc(it.text ?? '')}</blockquote><span class="slot"></span>`;
      list.append(li);
      cards.push(li);
    });
    // A card tapped is asked next. The answer box keeps the focus (and a phone its keyboard); a finger that scrolls
    // the cards picks nothing.
    list.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('.fill-card')) e.preventDefault(); });
    list.addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.fill-card');
      if (card && !done) pick(Number(card.dataset.j));
    });
    ui.board.append(list);
  }

  /** On the map, a tap (not a drag) on a country, a dot, a peak or a river asks that one. */
  function listenMap(el: SVGSVGElement) {
    let down: { x: number; y: number; k: string } | null = null;
    el.addEventListener('pointerdown', e => {
      const k = (e.target as Element).closest<SVGElement>('[data-k]')?.dataset.k ?? '';
      down = { x: e.clientX, y: e.clientY, k };
      e.preventDefault(); // the answer box keeps the focus (and a phone its keyboard)
    });
    el.addEventListener('pointerup', e => {
      const t = down;
      down = null;
      if (!t?.k || done || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 6) return;
      const j = items.findIndex(it => keyOf(it) === t.k);
      if (j >= 0) pick(j);
    });
  }

  /** The view of the region: its countries (their capitals) filling the frame, wide or tall. Rivers get the same
   *  view: one that runs on far away (a Russian river into Siberia) is a drag away. The world is a globe to turn. */
  function view([W, H]: [number, number]): { center: [number, number]; radius: number } {
    if (p!.region === 'world') return { center: [12, 20], radius: 65 };
    const pts = setItems(d.kb, { set: 'countries', region: p!.region }).map(it => [it.ll![1], it.ll![0]] as [number, number]);
    let center = geoCentroid({ type: 'MultiPoint', coordinates: pts }) as [number, number];
    const seen = () => {
      const proj = geoOrthographic().rotate([-center[0], -center[1]]).scale(1).translate([0, 0]);
      const xy = pts.map(q => proj(q)).filter((q): q is [number, number] => !!q);
      return { proj, xs: xy.map(q => q[0]), ys: xy.map(q => q[1]) };
    };
    // Centred on the middle of what is seen, not on the average of where the countries are.
    for (let k = 0; k < 2; k++) {
      const { proj, xs, ys } = seen();
      center = (proj.invert?.([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]) as [number, number]) ?? center;
    }
    const { xs, ys } = seen(), m = Math.min(W, H);
    const reach = Math.max(Math.max(...xs.map(Math.abs)) * m / W, Math.max(...ys.map(Math.abs)) * m / H) * 1.1 + 0.03;
    return { center, radius: Math.min(90, Math.max(5, Math.asin(Math.min(1, reach)) * RAD)) };
  }

  function drawMap(keepView = false) {
    if (!svg || !mapSet) return;
    if (keepView && d.world.drawnIn(svg)) { d.world.redraw(); return; }
    // The frame takes the shape of the space it has (tall on a phone), 640 map units wide.
    const r = ui.board.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? Math.min(1.8, Math.max(0.62, r.width / r.height)) : 1.6;
    const size: [number, number] = [640, Math.round(640 / aspect)];
    svg.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`);
    d.world.render(svg, { set: mapSet, view: view(size), size });
    zoom?.reset();
  }
  let resized = 0;
  addEventListener('resize', () => {
    clearTimeout(resized);
    resized = window.setTimeout(() => { if (!root.hidden && svg) drawMap(); }, 200);
  });

  // ---------------------------------------------------------------- the one asked now
  /** Asks item j: green on the map (turned into view if it is out of sight), or the card picked out and scrolled to. */
  function ask(j: number) {
    cur = j;
    skipped = skipped.filter(i => i !== j);
    const it = items[j], set = setOf(p!.set)!;
    root.dataset.cur = it ? it.key : '';
    ui.input.placeholder = it?.clue && set.ask ? set.ask(it.clue) : set.type;
    if (mapSet) {
      mapSet.current = it ? keyOf(it) : undefined;
      drawMap(true);
      if (it?.ll && !d.world.inView([it.ll[1], it.ll[0]])) {
        zoom?.reset();
        d.world.turnTo([it.ll[1], it.ll[0]]);
      }
    } else {
      cards.forEach((c, i) => c.classList.toggle('cur', i === j));
      if (cards[j]) bring(cards[j]);
    }
  }

  /** Scrolls a card into view, below the answer box that stays at the top. */
  function bring(card: HTMLElement) {
    const r = card.getBoundingClientRect(), top = ui.top.getBoundingClientRect().bottom + 8;
    const bottom = (window.visualViewport?.height ?? innerHeight) - 8;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (r.top < top) scrollBy({ top: r.top - top, behavior: smooth ? 'smooth' : 'auto' });
    else if (r.bottom > bottom) scrollBy({ top: Math.min(r.bottom - bottom, r.top - top), behavior: smooth ? 'smooth' : 'auto' });
  }

  /** A tap on one: asked now; one found already shows its name again. */
  function pick(j: number) {
    if (done || j < 0) return;
    if (found[j]) { again(j); return; }
    if (j !== cur) ask(j);
    if (matchMedia('(pointer: fine)').matches) ui.input.focus({ preventScroll: true });
  }

  /** Skip (or → in an empty box): on to the next, this one left for later. */
  function skip() {
    if (done || cur < 0) return;
    if (mapSet && !skipped.includes(cur)) skipped.push(cur);
    const j = nextItem(items, found, cur, skipped);
    if (j !== cur) ask(j);
    ui.input.focus({ preventScroll: true });
  }
  ui.skip.addEventListener('pointerdown', e => e.preventDefault()); // the box keeps the focus
  ui.skip.addEventListener('click', skip);

  // ---------------------------------------------------------------- typing
  /** How long a name typed waits before it counts, in case it is the start of a longer name: of another one of the
   *  set ("Niger" on the way to "Nigeria"), or of the same ("Vatican" on the way to "Vatican City", so the rest of it
   *  isn't left behind in the box). */
  const pause = (k: string) => {
    let ms = 0;
    for (const [n, js] of index) {
      if (n.length <= k.length || !n.startsWith(k)) continue;
      if (js.some(j => j !== cur && !found[j])) return 600;
      if (js.includes(cur)) ms = 350;
    }
    return ms;
  };

  ui.input.addEventListener('input', () => {
    clearTimeout(wait);
    if (done || cur < 0) return;
    if (clearing) { clearTimeout(clearing); clearing = 0; ui.input.classList.remove('wrong'); }
    const text = ui.input.value, k = norm(text);
    // Right as typed: found at once, unless it may be the start of a longer name.
    if (!(index.get(k) ?? []).includes(cur)) return;
    const j = cur;
    wait = window.setTimeout(() => { if (norm(ui.input.value) === k && cur === j) find(j, text); }, pause(k));
  });

  ui.input.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && !ui.input.value) { e.preventDefault(); skip(); }
  });

  ui.form.addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(wait);
    if (done || cur < 0) return;
    const text = ui.input.value.trim();
    if (!text) return;
    if ((index.get(norm(text)) ?? []).includes(cur)) { find(cur, text); return; }
    // Enter forgives a typo ("Liechtenstien"), as in a round.
    const set = setOf(p!.set)!, pool = d.pools[set.pool], it = items[cur];
    const meant = resolveFor(text, pool, it.accept);
    if (meant && it.accept.includes(meant.id)) { find(cur, meant.name); return; }
    // Wrong. When it names another one of the set, that one shows where it is, for a moment.
    const other = meant ? items.findIndex((x, j) => j !== cur && x.accept.includes(meant.id)) : -1;
    if (other >= 0) flash(other);
    streak = 0;
    sound.retry();
    ui.input.classList.remove('wrong');
    void ui.input.offsetWidth;
    ui.input.classList.add('wrong');
    const wrongText = ui.input.value;
    clearing = window.setTimeout(() => {
      clearing = 0;
      if (ui.input.value === wrongText) ui.input.value = '';
      ui.input.classList.remove('wrong');
    }, 420);
  });

  function find(j: number, typed: string) {
    if (done || found[j]) return;
    found[j] = true;
    const it = items[j];
    if (mapSet) mapSet.found.add(keyOf(it));
    const card = cards[j];
    if (card) {
      card.classList.add('found');
      card.querySelector('.slot')!.textContent = it.answer;
    }
    ui.input.value = '';
    ui.last.className = 'fill-last ok';
    ui.last.textContent = it.clue ? `${typedName(it, typed)} · ${it.clue}` : it.answer;
    sound.right(streak++);
    paintCount();
    if (!left()) { finish(false); return; }
    ask(nextItem(items, found, j, skipped));
  }
  /** The name as typed when it is one of the right ones (Sucre for Bolivia), else the item's own. */
  function typedName(it: Item, typed: string): string {
    const set = setOf(p!.set)!;
    const e = d.pools[set.pool].find(x => it.accept.includes(x.id) && [x.name, ...x.aliases].some(n => norm(n) === norm(typed)));
    return e?.name ?? it.answer;
  }
  /** One found already, tapped: its name again. */
  function again(j: number) {
    const card = cards[j];
    if (card) {
      card.classList.remove('again');
      void card.offsetWidth;
      card.classList.add('again');
    }
    ui.last.className = 'fill-last';
    ui.last.textContent = items[j].clue ? `${items[j].answer} · ${items[j].clue}` : items[j].answer;
  }
  /** One named wrongly: on the map it shows where it is, in amber, for a moment. */
  function flash(j: number) {
    if (!mapSet) return;
    clearTimeout(flashing);
    mapSet.flash = keyOf(items[j]);
    drawMap(true);
    flashing = window.setTimeout(() => { if (mapSet) { mapSet.flash = undefined; drawMap(true); } }, FLASH);
  }

  // ---------------------------------------------------------------- the end: all found, or given up
  ui.give.addEventListener('click', () => finish(true));
  function finish(gaveUp: boolean) {
    if (done || !p) return;
    done = true;
    clearTimeout(wait);
    clearTimeout(flashing);
    const ms = performance.now() - started;
    const n = items.length - left(), pct = Math.round((n / items.length) * 100);
    cur = -1;
    root.dataset.cur = '';
    cards.forEach(c => c.classList.remove('cur'));
    if (mapSet) { mapSet.current = mapSet.flash = undefined; }
    if (gaveUp) {
      items.forEach((it, j) => {
        if (found[j]) return;
        if (mapSet) mapSet.missed.add(keyOf(it));
        const card = cards[j];
        if (card) { card.classList.add('missed'); card.querySelector('.slot')!.textContent = it.answer; }
      });
    }
    if (mapSet) drawMap(true);
    const prev = practiceBest(p), now = { pct, ms };
    if (n && better(now, prev)) { (stats.practice ??= {})[practiceKey(p)] = now; saveStats(); }
    ui.form.hidden = ui.give.hidden = ui.skip.hidden = true;
    ui.end.hidden = false;
    ui.last.textContent = '';
    ui.score.textContent = `${n} / ${items.length}`;
    ui.time.textContent = `in ${clockOf(ms)}`;
    ui.best.textContent = !n ? '' : better(now, prev) ? (prev ? 'New best!' : 'First run') : `Best ${bestLabel(prev!)}`;
    root.classList.toggle('all-found', n === items.length);
    sound.done(n / items.length);
    d.done?.();
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // ---------------------------------------------------------------- leaving
  function leave() {
    if (done || left() === items.length) { d.home(); return; }
    d.askLeave(d.home);
  }
  $(root, '#fill-quit').addEventListener('click', leave);
  $(root, '#fill-again').addEventListener('click', () => { if (p) start(p); });
  $(root, '#fill-home').addEventListener('click', () => d.home());

  return {
    start,
    leave,
    /** Back from "Leave this round?": the time away doesn't count. */
    resume(away: number) { started += away; if (!done) ui.input.focus({ preventScroll: true }); },
    get practice() { return p; },
  };
}

/** The middle of a river's course (its longest line), [lat, lng]. */
function middleOf(lines: [number, number][][] | undefined): [number, number] | undefined {
  const line = lines?.reduce((a, b) => (b.length > a.length ? b : a), [] as [number, number][]);
  const m = line?.[Math.floor(line.length / 2)];
  return m ? [m[1], m[0]] : undefined;
}
