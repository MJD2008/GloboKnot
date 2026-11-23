// A country's sheet (James, 16 Nov 2026): tap a country on the home globe and a sheet about it opens beside the globe,
// which picks the country out in green. On it: photos of the country, swiped or clicked through (public/photos, docs/PHOTOS.md),
// a map with the capital, the major rivers and the notable peaks named and the neighbours around it, and the facts:
// capital, languages, highest point, peaks, rivers, neighbours. Under the photos a line about the country, and after the
// map one interesting fact (James, 22 Nov 2026: "a short description and an interesting fact per country"). The texts,
// and the rivers and peaks beyond the knowledge base, come from public/data/sheets.json (scripts/build-sheets.mjs),
// loaded with the first sheet.
// A neighbour (its name, or its shape on the map) opens its own sheet, and the first stays open ("without closing the
// original one"): a wide screen shows the last two side by side, sliding the menu over to make room; a narrower one
// shows one, at the right from 900 px wide (James, 23 Nov 2026: "to the right, like it originally was"; it came up from
// the bottom under 1100 px), from the bottom on a phone. No tabs for the ones before (James, 22 Nov 2026: they cluttered
// the screen): only the sheets that fit stay open. × closes one; Esc closes them all and puts the globe back (app.ts).
import type { Knowledge, City, Country, Peak, River } from './kb';
import type { MapLabel, SheetMap, WorldMap } from './map';
import { sound } from './sound';
import { backdrop } from './backdrop';

interface Extra { r?: string[]; p?: [name: string, m: number, lat: number, lng: number][]; a?: string; f?: string }
interface SheetData { rivers: Record<string, { n: string; c: [number, number][][] }>; countries: Record<string, Extra> }
/** A photo of a country: what it shows ("Paris"), who took it and under which licence, and where that is written. */
export interface Photo { src: string; place?: string; credit?: string; link?: string }

export interface Sheets {
  /** Opens a country's sheet in front (or brings it to the front). */
  open(id: string): void;
  /** Esc: closes every sheet; false when none was open. */
  back(): boolean;
  closeAll(): void;
  /** The grown globe came or went: the menu moves out of its way, or back. */
  relayout(): void;
}
const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
/** A framed landscape: the photo as the background. */
const FRAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 16.5 5-5 4 4 2.5-2.5 5.5 5.5" /><circle cx="16" cy="9.2" r="1.3" /></svg>';
/** A spark: the fact's mark, in place of a word. */
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.7 4.6 2.6 6.9 7.5 9.5-4.9 2.6-6.8 4.9-7.5 9.5-.7-4.6-2.6-6.9-7.5-9.5 4.9-2.6 6.8-4.9 7.5-9.5Z" /></svg>';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => n.toLocaleString('en-GB');

export function initSheets(root: HTMLElement, o: {
  kb: Knowledge; world: WorldMap; url: (path: string) => string; loadRivers: () => Promise<void>;
  photos: Record<string, Photo[]>;
  /** The sheet in front changed (null: none open): the globe picks its country out, and turns to it. */
  onFront: (id: string | null) => void;
}): Sheets {
  const { kb, world, url } = o;
  const row = root.querySelector<HTMLElement>('.cs-row')!;
  const preview = document.documentElement.hasAttribute('data-preview');
  const order: string[] = []; // open, oldest first: the last is in front
  const panels = new Map<string, HTMLElement>();
  const drawn = new Set<string>();
  let data: Promise<SheetData | null> | null = null;
  let dataNow: SheetData | null = null; // once loaded

  /** The rivers and peaks of every country, and the courses of the rivers that are not in the knowledge base. */
  function load(): Promise<SheetData | null> {
    data ??= o.loadRivers().catch(() => {}).then(() => fetch(url('data/sheets.json'))).then(r => r.json() as Promise<SheetData>).then(d => {
      for (const [id, r] of Object.entries(d.rivers)) world.rivers[id] ??= r.c;
      dataNow = d;
      return d;
    }).catch(() => { data = null; return null; });
    return data;
  }

  /** From this wide, the sheets stand in a column at the right; narrower (a phone), one comes up from the bottom. */
  const SIDE = 900;
  /** How many sheets fit side by side, how far the menu slides over for them, and how wide it may be: narrower beside a
   *  sheet on a screen too small for both. While the globe is grown the menu waits at the left edge, sheet or not, until
   *  the globe is back (James, 23 Nov 2026: "moved to the left until you un-zoom, or press esc"). */
  function room(): { n: number; shift: number; menu: number; side: number } {
    const w = innerWidth, panel = 340, gap = 12, full = Math.min(560, w - 32);
    if (w < SIDE) return { n: 1, shift: 0, menu: 0, side: 0 }; // the menu as it is
    const n = w - 2 * panel - 3 * gap >= 720 ? 2 : 1;
    const right = order.length ? w - n * panel - (n + 1) * gap : w; // the free space ends here
    const menu = Math.max(320, Math.min(full, right - 24 - gap));
    const edge = 24 - (w - menu) / 2; // the shift that puts the menu at the left edge
    const shift = document.body.classList.contains('globe-big') ? edge : Math.max(edge, Math.min(0, right - gap - (w + menu) / 2));
    const open = Math.min(order.length, n); // the sheets open now, at the right
    return { n, shift, menu, side: open ? open * panel + (open + 1) * gap : 0 };
  }
  const start = document.querySelector<HTMLElement>('#start');
  /** The menu where room() puts it (`menu` 0: its own width), and how much of the right the sheets take (`side`: the
   *  globe's zoom buttons keep clear of them while it is grown). */
  function place({ shift, menu, side }: { shift: number; menu: number; side: number }) {
    document.body.style.setProperty('--cs-shift', `${Math.round(shift)}px`);
    document.body.style.setProperty('--cs-side', `${Math.round(side)}px`);
    if (menu) start?.style.setProperty('--menu-w', `${Math.round(menu)}px`); else start?.style.removeProperty('--menu-w');
  }

  function facts(id: string, extra: Extra | undefined): string {
    const rows: [string, string][] = [];
    const caps = kb.mainCapitals(id).map(c => kb.name(c));
    if (caps.length) rows.push([caps.length > 1 ? 'Capitals' : 'Capital', esc(caps.join(', '))]);
    const langs = [...new Set(kb.languagesOf(id).map(l => kb.name(l)))].sort((a, b) => a.localeCompare(b));
    if (langs.length) rows.push([langs.length > 1 ? 'Languages' : 'Language', esc(langs.join(', '))]);
    const top = kb.get<Peak>(kb.highestPoint(id) ?? '');
    if (top) rows.push(['Highest point', `${esc(top.name)} <small>${fmt(top.m)} m</small>`]);
    if (extra?.p?.length) rows.push([extra.p.length > 1 ? 'Peaks' : 'Peak', extra.p.map(([n, m]) => `<span class="cs-item">${esc(n)} <small>${fmt(m)} m</small></span>`).join('')]);
    const rivers = riversOf(extra);
    if (rivers.length) rows.push([rivers.length > 1 ? 'Rivers' : 'River', esc(rivers.map(r => r.name).join(', '))]);
    const nb = kb.neighbours(id).map(n => kb.country(n)).filter((c): c is Country => !!c).sort((a, b) => a.name.localeCompare(b.name));
    rows.push(['Neighbours', nb.length ? `<span class="cs-chips">${nb.map(c => `<button class="cs-chip" type="button" data-open="${c.id}">${esc(c.name)}</button>`).join('')}</span>` : 'None']);
    return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  /** "Paris · Jane Doe, CC BY-SA 4.0", the credit linked to the photo's page (its licence is there). */
  function caption(p: Photo | undefined): string {
    if (!p) return '';
    const credit = p.credit ? (p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.credit)}</a>` : esc(p.credit)) : '';
    return [p.place ? esc(p.place) : '', credit].filter(Boolean).join(' · ');
  }

  /** The photo in view changed (by itself, a click, a swipe or a drag): its dot and its caption. */
  function photoAt(fig: HTMLElement) {
    const i = shown(fig);
    if (fig.dataset.i === String(i)) return;
    fig.dataset.i = String(i);
    fig.dataset.wait = '0';
    fig.querySelectorAll('.cs-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    fig.querySelectorAll('.cs-slide').forEach((d, j) => d.classList.toggle('on', j === i));
    const id = fig.closest<HTMLElement>('.cs')!.dataset.id!;
    fig.querySelector('figcaption')!.innerHTML = caption(o.photos[id]?.[i]);
    markBackdrop(fig);
  }
  /** The photo in view: is it the background? Its button says so (pressed), and what a press would do. */
  function markBackdrop(fig: HTMLElement) {
    const b = fig.querySelector<HTMLElement>('.cs-bg'), id = fig.closest<HTMLElement>('.cs')?.dataset.id;
    if (!b || !id) return;
    const p = o.photos[id]?.[shown(fig)], on = !!p && backdrop.is(p.src);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Back to the night sky' : 'Use as background';
    b.setAttribute('aria-label', b.title);
  }
  backdrop.onChange(() => root.querySelectorAll<HTMLElement>('.cs-photo[data-n]').forEach(markBackdrop));
  /** Which photo is in view. */
  function shown(fig: HTMLElement): number {
    const strip = fig.querySelector<HTMLElement>('.cs-strip')!, n = Number(fig.dataset.n);
    return Math.max(0, Math.min(n - 1, Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth))));
  }
  /** Brings photo i into view, gliding over in about a second; after the last comes the first. */
  function photoTo(fig: HTMLElement, i: number) {
    const strip = fig.querySelector<HTMLElement>('.cs-strip')!, n = Number(fig.dataset.n);
    const to = (((i % n) + n) % n) * strip.clientWidth, from = strip.scrollLeft;
    fig.dataset.wait = '0';
    if (still() || Math.abs(to - from) < 1) { strip.scrollLeft = to; return; }
    const run = (strip.dataset.run = String(Number(strip.dataset.run ?? 0) + 1)), t0 = performance.now(), ms = 900;
    strip.classList.add('moving'); // no snapping while it glides
    const step = (now: number) => {
      if (strip.dataset.run !== run) return; // a newer move took over
      const k = Math.min(1, (now - t0) / ms), ease = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      strip.scrollLeft = from + (to - from) * ease;
      if (k < 1) requestAnimationFrame(step); else strip.classList.remove('moving');
    };
    requestAnimationFrame(step);
  }
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The photos move on by themselves (James, 22 Nov 2026: "a slowly moving carousel that switches image every few
  // seconds, which you can click to speed up"): each stays about 5 s, without zooming (23 Nov 2026). Not with reduced
  // motion.
  const STAY = 10; // half-second ticks
  setInterval(() => {
    if (document.hidden || root.hidden || still()) return;
    for (const fig of root.querySelectorAll<HTMLElement>('.cs-photo[data-n]')) {
      // not while dragged, nor once its photo was made the background (it stays on that one until clicked on)
      if (Number(fig.dataset.n) < 2 || fig.querySelector('.dragging') || fig.dataset.hold) continue;
      const wait = Number(fig.dataset.wait ?? 0) + 1;
      fig.dataset.wait = String(wait);
      if (wait >= STAY) photoTo(fig, shown(fig) + 1);
    }
  }, 500);

  function riversOf(extra: Extra | undefined): { id: string; name: string }[] {
    return (extra?.r ?? []).map(r => ({ id: r, name: kb.get<River>(r)?.name ?? dataNow?.rivers[r]?.n ?? '' })).filter(r => r.name);
  }

  function panel(id: string): HTMLElement {
    const c = kb.country(id)!;
    const el = document.createElement('article');
    el.className = 'cs';
    el.dataset.id = id;
    el.tabIndex = -1;
    el.setAttribute('aria-labelledby', `sheet-${id}`);
    const list = o.photos[id] ?? [];
    const pic = list.length
      ? `<figure class="cs-photo" data-n="${list.length}">
          <div class="cs-strip" tabindex="-1" title="${list.length > 1 ? 'Next photo' : ''}">${list.map((p, i) => `<div class="cs-slide${i ? '' : ' on'}"><img src="${url(p.src)}" alt="${esc(p.place || c.name)}" ${i ? 'loading="lazy" ' : ''}draggable="false" /></div>`).join('')}</div>
          ${list.length > 1 ? `<span class="cs-dots" aria-hidden="true">${list.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</span>` : ''}
          <button class="cs-bg" type="button" aria-pressed="false" title="Use as background" aria-label="Use as background">${FRAME}</button>
          <figcaption>${caption(list[0])}</figcaption>
        </figure>`
      // In the preview only: where a photo goes, and its file name.
      : preview ? `<figure class="cs-photo empty"><span>Photo: <code>public/photos/${id.toLowerCase()}.jpg</code></span></figure>` : '';
    el.innerHTML = `
      <header class="cs-head">
        <img class="cs-flag" src="${url(`flags/${c.flag}.svg`)}" alt="" />
        <div class="cs-name"><h2 id="sheet-${id}">${esc(c.name)}</h2><small>${esc(kb.continent(id) ?? '')}</small></div>
        <button class="icon-btn cs-x" type="button" aria-label="Close ${esc(c.name)}" title="Close">${X}</button>
      </header>
      ${pic}
      <p class="cs-about" hidden></p>
      <div class="cs-map-box"><svg class="map cs-map" role="img" aria-label="Map of ${esc(c.name)}" viewBox="0 0 640 400"></svg></div>
      <p class="cs-fact" hidden>${SPARK}<span class="sr-only">Fact: </span><span></span></p>
      <dl class="cs-facts">${facts(id, dataNow?.countries[id])}</dl>`;
    texts(el, dataNow?.countries[id]);
    const fig = el.querySelector<HTMLElement>('.cs-photo[data-n]');
    if (fig) markBackdrop(fig);
    return el;
  }

  /** The line about the country and its fact, once loaded. */
  function texts(el: HTMLElement, extra: Extra | undefined) {
    const about = el.querySelector<HTMLElement>('.cs-about')!, fact = el.querySelector<HTMLElement>('.cs-fact')!;
    about.textContent = extra?.a ?? '';
    about.hidden = !extra?.a;
    fact.lastElementChild!.textContent = extra?.f ?? '';
    fact.hidden = !extra?.f;
  }

  /** The map, once the rivers and peaks have loaded, and only while the sheet shows (names are sized to it). */
  async function draw(id: string) {
    if (drawn.has(id)) return;
    const d = await load();
    const el = panels.get(id);
    if (!el || el.hidden || drawn.has(id)) return;
    drawn.add(id);
    const extra = d?.countries[id];
    el.querySelector('.cs-facts')!.innerHTML = facts(id, extra);
    texts(el, extra);
    const c = kb.country(id)!;
    const nb = kb.neighbours(id).map(n => kb.country(n)).filter((x): x is Country => !!x);
    const top = kb.get<Peak>(kb.highestPoint(id) ?? '');
    const sheet: SheetMap = {
      caps: kb.mainCapitals(id).map(x => kb.get<City>(x)).filter((x): x is City & { ll: [number, number] } => !!x?.ll).map(x => ({ name: x.name, ll: x.ll })),
      rivers: riversOf(extra),
      peaks: [...(top ? [{ name: top.name, ll: top.ll, top: true }] : []), ...(extra?.p ?? []).map(([name, , lat, lng]) => ({ name, ll: [lat, lng] as [number, number] }))],
      links: nb.map(n => ({ num: n.num, k: n.id, name: n.name })),
    };
    const labels: MapLabel[] = nb.map(n => ({ num: n.num, name: n.name }));
    world.render(el.querySelector<SVGSVGElement>('.cs-map')!, { num: c.num, ll: c.ll, labels, sheet });
  }

  /** Keeps the sheets that fit (the oldest go), and slides the menu over on a wide screen. */
  function layout() {
    const { n } = room();
    while (order.length > n) close(order[0], false);
    for (const [id, el] of panels) el.classList.toggle('front', id === order.at(-1));
    root.hidden = !order.length;
    document.body.classList.toggle('cs-open', !!order.length);
    place(room());
    for (const id of order) void draw(id);
    o.onFront(order.at(-1) ?? null);
  }

  /** Opens a sheet in front; `focus`: moves the keyboard's focus to it (opened from the keyboard). */
  function open(id: string, focus = false) {
    if (!kb.country(id)) return;
    const at = order.indexOf(id);
    if (at >= 0) order.splice(at, 1);
    order.push(id);
    if (!panels.has(id)) {
      const el = panel(id);
      panels.set(id, el);
      row.append(el);
      sound.open();
    }
    // The one in front is the right-most (layout closes the oldest when there are more than fit).
    for (const x of order) row.append(panels.get(x)!);
    layout();
    if (focus) panels.get(id)!.focus({ preventScroll: true });
  }

  function close(id: string, relayout = true) {
    const at = order.indexOf(id);
    if (at < 0) return;
    order.splice(at, 1);
    panels.get(id)?.remove();
    panels.delete(id);
    drawn.delete(id);
    if (relayout) layout();
  }

  root.addEventListener('click', e => {
    const t = e.target as Element;
    // The photo in view as the background, or (the same one again) back to the night sky; the photos stop there.
    const bg = t.closest<HTMLElement>('.cs-bg');
    if (bg) {
      const fig = bg.closest<HTMLElement>('.cs-photo')!, id = bg.closest<HTMLElement>('.cs')!.dataset.id!;
      const p = o.photos[id]?.[shown(fig)];
      if (!p) return;
      const off = backdrop.is(p.src);
      backdrop.set(off ? null : { id, src: p.src });
      if (off) delete fig.dataset.hold; else fig.dataset.hold = '1';
      sound.select();
      return;
    }
    // A click or a tap on the photo: the next one (James, 22 Nov 2026: "a simple click should do it"); not after a drag.
    const strip = t.closest<HTMLElement>('.cs-strip');
    if (strip) {
      if (dragged) { dragged = false; return; }
      const fig = strip.parentElement!;
      delete fig.dataset.hold;
      if (Number(fig.dataset.n) > 1) photoTo(fig, shown(fig) + 1);
      return;
    }
    const x = t.closest<HTMLElement>('.cs-x');
    if (x) { close(x.closest<HTMLElement>('.cs')!.dataset.id!); return; }
    const keys = e.detail === 0; // Enter or Space on a button, not a pointer
    const to = t.closest<Element>('[data-open], .cs-map [data-k]');
    if (to) open((to as HTMLElement).dataset.open ?? to.getAttribute('data-k')!, keys);
  });
  root.addEventListener('scroll', e => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains('cs-strip')) photoAt(t.parentElement!);
  }, true);
  // A mouse can also drag the photos along, as a finger swipes them; let go, and the next photo comes in if it was dragged
  // a sixth of the way, else the same one settles back.
  let drag: { strip: HTMLElement; fig: HTMLElement; x: number; left: number; i: number; id: number } | null = null;
  let dragged = false; // the click that ends a drag is not a click on the photo
  root.addEventListener('pointerdown', e => {
    const strip = (e.target as Element).closest<HTMLElement>('.cs-strip');
    if (!strip || e.pointerType === 'touch' || e.button !== 0 || strip.children.length < 2) return;
    const fig = strip.parentElement!;
    strip.dataset.run = String(Number(strip.dataset.run ?? 0) + 1); // stops a glide under way
    strip.classList.remove('moving');
    drag = { strip, fig, x: e.clientX, left: strip.scrollLeft, i: shown(fig), id: e.pointerId };
    strip.setPointerCapture(e.pointerId);
    strip.classList.add('dragging');
    e.preventDefault();
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.strip.scrollLeft = drag.left - (e.clientX - drag.x);
  });
  const drop = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { strip, fig, x, i } = drag, moved = e.clientX - x, w = strip.clientWidth;
    drag = null;
    strip.classList.remove('dragging');
    dragged = Math.abs(moved) > 6;
    if (!dragged) return; // a click: the click handler shows the next photo
    const n = Number(fig.dataset.n), to = Math.abs(moved) > w / 6 ? Math.max(0, Math.min(n - 1, i + (moved < 0 ? 1 : -1))) : i;
    photoTo(fig, to);
  };
  root.addEventListener('pointerup', drop);
  root.addEventListener('pointercancel', drop);
  addEventListener('resize', () => { if (order.length) layout(); else place(room()); });

  return {
    open,
    back() {
      if (!order.length) return false;
      for (const id of [...order]) close(id, false);
      layout();
      return true;
    },
    closeAll() {
      for (const id of [...order]) close(id, false);
      layout();
    },
    relayout() { if (order.length) layout(); else place(room()); },
  };
}
