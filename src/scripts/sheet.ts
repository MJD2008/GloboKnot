// A country's sheet (James, 16 Nov 2026): tap a country on the home globe and a sheet about it opens beside the globe,
// which picks the country out in green. On it: photos of the country, swiped through (public/photos, docs/PHOTOS.md),
// a map with the capital, the major rivers and the notable peaks named and the neighbours around it, and the facts:
// capital, languages, highest point, peaks, rivers, neighbours. The rivers and peaks beyond the knowledge base come from
// public/data/sheets.json (scripts/build-sheets.mjs), loaded with the first sheet.
// A neighbour (its name, or its shape on the map) opens its own sheet, and the first stays open ("without closing the
// original one"): a wide screen shows the last two side by side, sliding the menu over to make room; a narrower one
// shows one, with a tab for each sheet open. × or Esc closes the one in front.
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
  /** Esc: closes the sheet in front; false when none is open. */
  back(): boolean;
  closeAll(): void;
}

const MAX_OPEN = 6;
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
  const tabs = root.querySelector<HTMLElement>('.cs-tabs')!;
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
    return { n, shift: Math.min(0, right - (w + col) / 2) };
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

  /** The photo in view changed (swiped, or an arrow): its dot, its caption, and which arrows still lead somewhere. */
  function photoAt(fig: HTMLElement) {
    const strip = fig.querySelector<HTMLElement>('.cs-strip')!, n = Number(fig.dataset.n);
    const i = Math.max(0, Math.min(n - 1, Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth))));
    if (fig.dataset.i === String(i)) return;
    fig.dataset.i = String(i);
    fig.querySelectorAll('.cs-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    const id = fig.closest<HTMLElement>('.cs')!.dataset.id!;
    fig.querySelector('figcaption')!.innerHTML = caption(o.photos[id]?.[i]);
    fig.querySelector<HTMLElement>('.cs-go.prev')!.hidden = i === 0;
    fig.querySelector<HTMLElement>('.cs-go.next')!.hidden = i === n - 1;
  }

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
    const arrow = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" /></svg>`;
    const pic = list.length
      ? `<figure class="cs-photo" data-n="${list.length}">
          <div class="cs-strip" tabindex="-1">${list.map((p, i) => `<img src="${url(p.src)}" alt="${esc(p.place || c.name)}" ${i ? 'loading="lazy" ' : ''}draggable="false" />`).join('')}</div>
          ${list.length > 1 ? `<button class="cs-go prev" type="button" aria-label="Previous photo" hidden>${arrow('M15 5l-7 7 7 7')}</button>
          <button class="cs-go next" type="button" aria-label="Next photo">${arrow('M9 5l7 7-7 7')}</button>
          <span class="cs-dots" aria-hidden="true">${list.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</span>` : ''}
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

  /** Shows the last sheets that fit, the tabs when there are more open, and slides the menu over on a wide screen. */
  function layout() {
    const { n, shift } = room();
    const shown = order.slice(-n);
    for (const [id, el] of panels) {
      el.hidden = !shown.includes(id);
      el.classList.toggle('front', id === order.at(-1));
    }
    tabs.hidden = order.length <= n;
    tabs.innerHTML = tabs.hidden ? '' : order.map(id => {
      const c = kb.country(id)!;
      return `<button class="cs-tab${shown.includes(id) ? ' on' : ''}" type="button" data-tab="${id}"><img src="${url(`flags/${c.flag}.svg`)}" alt="" />${esc(c.name)}</button>`;
    }).join('');
    root.hidden = !order.length;
    document.body.classList.toggle('cs-open', !!order.length);
    document.body.style.setProperty('--cs-shift', order.length ? `${shift}px` : '0px');
    for (const id of shown) void draw(id);
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
    while (order.length > MAX_OPEN) close(order[0], false);
    // The one in front is the right-most.
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
    const go = t.closest<HTMLElement>('.cs-go');
    if (go) {
      const strip = go.parentElement!.querySelector<HTMLElement>('.cs-strip')!;
      strip.scrollBy({ left: (go.classList.contains('next') ? 1 : -1) * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    const x = t.closest<HTMLElement>('.cs-x');
    if (x) { close(x.closest<HTMLElement>('.cs')!.dataset.id!); return; }
    const keys = e.detail === 0; // Enter or Space on a button, not a pointer
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) { open(tab.dataset.tab!, keys); return; }
    const to = t.closest<Element>('[data-open], .cs-map [data-k]');
    if (to) open((to as HTMLElement).dataset.open ?? to.getAttribute('data-k')!, keys);
  });
  root.addEventListener('scroll', e => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains('cs-strip')) photoAt(t.parentElement!);
  }, true);
  addEventListener('resize', () => { if (order.length) layout(); });

  return {
    open,
    back() {
      const id = order.at(-1);
      if (!id) return false;
      close(id);
      return true;
    },
    closeAll() {
      for (const id of [...order]) close(id, false);
      layout();
    },
  };
}
