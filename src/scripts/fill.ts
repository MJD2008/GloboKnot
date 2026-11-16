// Practice, filled in at once (James, 16 Nov 2026): one set (sets.ts) on one screen. Each answer typed finds its place
// as soon as it is spelt right, in any order; Enter forgives a typo. Countries and rivers light up on a map that zooms
// and turns; capitals and highest points fill a list, flags and text samples their cards. No time limit, and no clock
// while playing: the time is only told at the end, beside the best. Give up shows what was missed, in red.
import { geoCentroid, geoOrthographic } from 'd3-geo';
import { resolveFor } from '../../scripts/lib/match.mjs';
import { norm } from '../../scripts/lib/text.mjs';
import type { Entity, Knowledge } from './kb';
import type { MapSet, WorldMap } from './map';
import { clockOf } from './menu';
import { better, saveStats, stats, type Best } from './prefs';
import type { Pool } from './questions';
import { nameIndex, practiceKey, practiceLabel, setItems, setOf, type Item, type Practice } from './sets';
import { sound } from './sound';
import { zoomable, type Zoom } from './zoom';

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const RAD = 180 / Math.PI;
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
}

export function initFill(root: HTMLElement, d: FillDeps) {
  const ui = {
    title: $(root, '#fill-title'),
    count: $(root, '#fill-count'),
    form: $<HTMLFormElement>(root, '#fill-form'),
    input: $<HTMLInputElement>(root, '#fill-input'),
    bar: $(root, '.fill-progress i'),
    last: $(root, '#fill-last'),
    give: $<HTMLButtonElement>(root, '#fill-give'),
    end: $(root, '#fill-end'),
    score: $(root, '#fill-score'),
    time: $(root, '#fill-time'),
    best: $(root, '#fill-best'),
    board: $(root, '#fill-board'),
  };
  let p: Practice | null = null, items: Item[] = [], found: boolean[] = [], index = new Map<string, number[]>();
  let started = 0, done = false, streak = 0, wait = 0, clearing = 0;
  let mapSet: MapSet | null = null, svg: SVGSVGElement | null = null, zoom: Zoom | null = null, cards: HTMLElement[] = [];

  const left = () => found.filter(f => !f).length;
  const paintCount = () => {
    const n = items.length - left();
    ui.count.textContent = `${n} / ${items.length}`;
    ui.bar.style.setProperty('--done', String(items.length ? n / items.length : 0));
  };

  async function start(practice: Practice) {
    p = practice;
    const set = setOf(p.set)!;
    if (set.layout === 'rivers') await d.loadRivers();
    items = setItems(d.kb, p);
    found = items.map(() => false);
    index = nameIndex(items, d.pools[set.pool]);
    done = false;
    streak = 0;
    clearTimeout(wait);
    ui.title.textContent = practiceLabel(p);
    ui.input.placeholder = set.type;
    ui.input.value = '';
    ui.input.classList.remove('wrong');
    ui.form.hidden = ui.give.hidden = false;
    ui.end.hidden = true;
    ui.last.textContent = '';
    ui.last.className = 'fill-last';
    root.dataset.layout = set.layout;
    paintCount();
    board();
    started = performance.now();
    ui.input.focus({ preventScroll: true });
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
      mapSet = set.layout === 'map'
        ? { countries: new Map(items.map(it => [it.num!, it.ll!])), found: new Set(), missed: new Set(), names: new Map(items.map(it => [it.num!, it.answer])) }
        : { rivers: items.map(it => it.river!), found: new Set(), missed: new Set(), names: new Map(items.map(it => [it.river!, it.answer])) };
      drawMap();
      return;
    }
    const list = document.createElement('ol');
    list.className = `fill-cards ${set.layout}`;
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'fill-card';
      if (it.flag) li.innerHTML = `<img alt="A flag" loading="lazy" src="${d.url(`flags/${it.flag}.svg`)}" /><span class="slot"></span>`;
      else if (it.text) li.innerHTML = `<blockquote dir="auto" lang="${esc(it.lang ?? '')}">${esc(it.text)}</blockquote><span class="slot"></span>`;
      else li.innerHTML = `<span class="clue">${esc(it.clue ?? '')}</span><span class="slot"></span>`;
      list.append(li);
      cards.push(li);
    }
    ui.board.append(list);
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

  // ---------------------------------------------------------------- typing
  /** The items still to find that `text` names exactly. */
  const named = (text: string) => (index.get(norm(text)) ?? []).filter(j => !found[j]);
  /** How long a name typed waits before it counts, in case it is the start of a longer one: of something else still
   *  to find ("Niger" on the way to "Nigeria"), or of the same ("Vatican" on the way to "Vatican City", so the rest
   *  of it isn't left behind in the box). */
  const pause = (k: string, js: number[]) => {
    let ms = 0;
    for (const [n, ks] of index) {
      if (n.length <= k.length || !n.startsWith(k)) continue;
      if (ks.some(j => !found[j] && !js.includes(j))) return 600;
      if (ks.some(j => js.includes(j))) ms = 350;
    }
    return ms;
  };

  ui.input.addEventListener('input', () => {
    clearTimeout(wait);
    if (done) return;
    if (clearing) { clearTimeout(clearing); clearing = 0; ui.input.classList.remove('wrong'); }
    const text = ui.input.value, js = named(text);
    if (!js.length) return;
    // Right as typed: found at once, unless it may be the start of a longer name still to find.
    const k = norm(text);
    wait = window.setTimeout(() => { if (norm(ui.input.value) === k) find(named(text), text); }, pause(k, js));
  });

  ui.form.addEventListener('submit', e => {
    e.preventDefault();
    clearTimeout(wait);
    if (done) return;
    const text = ui.input.value.trim();
    if (!text) return;
    const exact = named(text);
    if (exact.length) { find(exact, text); return; }
    // Enter forgives a typo ("Liechtenstien"), as in a round.
    const set = setOf(p!.set)!, want = items.flatMap((it, j) => (found[j] ? [] : it.accept));
    const hit = resolveFor(text, d.pools[set.pool], want);
    const js = hit ? items.flatMap((it, j) => (!found[j] && it.accept.includes(hit.id) ? [j] : [])) : [];
    if (js.length) { find(js, hit!.name); return; }
    // Found already: it shows again. Otherwise the try shakes and fades out.
    const again = (index.get(norm(text)) ?? []).filter(j => found[j]);
    if (again.length) {
      again.forEach(flashItem);
      ui.input.value = '';
      return;
    }
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

  function find(js: number[], typed: string) {
    if (!js.length || done) return;
    for (const j of js) {
      found[j] = true;
      const it = items[j];
      if (mapSet) mapSet.found.add(it.num ?? it.river!);
      const card = cards[j];
      if (card) {
        card.classList.add('found');
        card.querySelector('.slot')!.textContent = it.flag || it.text ? it.answer : typedName(it, typed);
      }
    }
    if (mapSet) drawMap(true);
    ui.input.value = '';
    const first = items[js[0]];
    ui.last.className = 'fill-last ok';
    ui.last.textContent = first.clue ? `${typedName(first, typed)} · ${first.clue}${js.length > 1 ? ` +${js.length - 1}` : ''}` : js.map(j => items[j].answer).join(' · ');
    sound.right(streak++);
    paintCount();
    if (!left()) finish(false);
  }
  /** The name as typed when it is one of the right ones (Sucre for Bolivia), else the item's own. */
  function typedName(it: Item, typed: string): string {
    const set = setOf(p!.set)!;
    const e = d.pools[set.pool].find(x => it.accept.includes(x.id) && [x.name, ...x.aliases].some(n => norm(n) === norm(typed)));
    return e?.name ?? it.answer;
  }
  function flashItem(j: number) {
    const card = cards[j];
    if (card) {
      card.classList.remove('again');
      void card.offsetWidth;
      card.classList.add('again');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    ui.last.className = 'fill-last';
    ui.last.textContent = `${items[j].answer}: found already`;
  }

  // ---------------------------------------------------------------- the end: all found, or given up
  ui.give.addEventListener('click', () => finish(true));
  function finish(gaveUp: boolean) {
    if (done || !p) return;
    done = true;
    clearTimeout(wait);
    const ms = performance.now() - started;
    const n = items.length - left(), pct = Math.round((n / items.length) * 100);
    if (gaveUp) {
      items.forEach((it, j) => {
        if (found[j]) return;
        if (mapSet) mapSet.missed.add(it.num ?? it.river!);
        const card = cards[j];
        if (card) { card.classList.add('missed'); card.querySelector('.slot')!.textContent = it.answer; }
      });
      if (mapSet) drawMap(true);
    }
    const prev = practiceBest(p), now = { pct, ms };
    if (n && better(now, prev)) { (stats.practice ??= {})[practiceKey(p)] = now; saveStats(); }
    ui.form.hidden = ui.give.hidden = true;
    ui.end.hidden = false;
    ui.last.textContent = '';
    ui.score.textContent = `${n} / ${items.length}`;
    ui.time.textContent = `in ${clockOf(ms)}`;
    ui.best.textContent = !n ? '' : better(now, prev) ? (prev ? 'New best!' : 'First run') : `Best ${bestLabel(prev!)}`;
    root.classList.toggle('all-found', n === items.length);
    sound.done(n / items.length);
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
