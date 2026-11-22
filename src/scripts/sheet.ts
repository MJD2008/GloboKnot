// A country's sheet (James, 16 Nov 2026): tap a country on the home globe and a sheet about it opens beside the globe,
// which picks the country out in green. On it: photos of the country, swiped or clicked through (public/photos, docs/PHOTOS.md),
// a map with the capital, the major rivers and the notable peaks named and the neighbours around it, and the facts:
// capital, languages, highest point, peaks, rivers, neighbours. The rivers and peaks beyond the knowledge base come from
// public/data/sheets.json (scripts/build-sheets.mjs), loaded with the first sheet.
// A neighbour (its name, or its shape on the map) opens its own sheet, and the first stays open ("without closing the
// original one"): a wide screen shows the last two side by side, sliding the menu over to make room; a narrower one
// shows one. No tabs for the ones before (James, 22 Nov 2026: they cluttered the screen): only the sheets that fit stay
// open. × closes one; Esc closes them all and puts the globe back (app.ts).
import type { Knowledge, City, Country, Peak, River } from './kb';
import type { MapLabel, SheetMap, WorldMap } from './map';
import { sound } from './sound';

interface Extra { r?: string[]; p?: [name: string, m: number, lat: number, lng: number][] }
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

  /** How many sheets fit side by side, and how far the menu slides over for them (wide screens only). */
  function room(): { n: number; shift: number } {
    const w = innerWidth, col = Math.min(720, w), panel = 340, gap = 12;
    if (w < 1100) return { n: 1, shift: 0 };
    const n = w - 2 * panel - 3 * gap >= col ? 2 : 1;
    const right = w - n * panel - (n + 1) * gap; // the free space ends here
    let shift = Math.min(0, right - (w + col) / 2);
    // With the globe grown over the screen, the menu goes to the left edge, out of the way (James, 22 Nov 2026).
    if (document.body.classList.contains('globe-big')) {
      const menu = document.querySelector<HTMLElement>('#play')?.offsetWidth ?? col;
      shift = Math.min(shift, 24 - (w - menu) / 2);
    }
    return { n, shift };
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

  /** The photo in view changed (by itself, a click, a swipe or a drag): its dot, its caption, and its slow drift. */
  function photoAt(fig: HTMLElement) {
    const i = shown(fig);
    if (fig.dataset.i === String(i)) return;
    fig.dataset.i = String(i);
    fig.dataset.wait = '0';
    fig.querySelectorAll('.cs-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    fig.querySelectorAll('.cs-slide').forEach((d, j) => d.classList.toggle('on', j === i));
    const id = fig.closest<HTMLElement>('.cs')!.dataset.id!;
    fig.querySelector('figcaption')!.innerHTML = caption(o.photos[id]?.[i]);
  }
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
  // seconds, which you can click to speed up"): each stays about 5 s, drifting slowly. Not with reduced motion.
  const STAY = 10; // half-second ticks
  setInterval(() => {
    if (document.hidden || root.hidden || still()) return;
    for (const fig of root.querySelectorAll<HTMLElement>('.cs-photo[data-n]')) {
      if (Number(fig.dataset.n) < 2 || fig.querySelector('.dragging')) continue;
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
      <div class="cs-map-box"><svg class="map cs-map" role="img" aria-label="Map of ${esc(c.name)}" viewBox="0 0 640 400"></svg></div>
      <dl class="cs-facts">${facts(id, dataNow?.countries[id])}</dl>`;
    return el;
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
    const { n, shift } = room();
    while (order.length > n) close(order[0], false);
    for (const [id, el] of panels) el.classList.toggle('front', id === order.at(-1));
    root.hidden = !order.length;
    document.body.classList.toggle('cs-open', !!order.length);
    document.body.style.setProperty('--cs-shift', order.length ? `${shift}px` : '0px');
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
    // A click or a tap on the photo: the next one (James, 22 Nov 2026: "a simple click should do it"); not after a drag.
    const strip = t.closest<HTMLElement>('.cs-strip');
    if (strip) {
      if (dragged) { dragged = false; return; }
      const fig = strip.parentElement!;
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
  addEventListener('resize', () => { if (order.length) layout(); });

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
    relayout() { if (order.length) layout(); },
  };
}
