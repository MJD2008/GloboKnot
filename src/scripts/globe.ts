// The start screen's globe: it turns slowly while chains of neighbouring countries get tied together,
// the same kind of links the quiz is built on. Drag it to turn it (a throw keeps it spinning for a moment, then it
// eases back into its own pace); point at a country, or tap it, to see its name. The countries the player has tied
// (answered right the first time: the experiment Tie the world) light up in gold, brighter once right in three
// categories; the ones tied in the round just played pulse when the home screen comes back, and the globe turns to
// face them.
// Zooming in (the wheel, a pinch, a double tap, or + beside it) grows the globe itself (James, 16 Nov 2026: "so you
// can cover the screen with your globe if you so wish"): it leaves its rope for a layer over the whole screen and
// grows round its own place, behind the menu, which stays where it is and can still be used ("could the menu still
// stay visible when earth is zoomed into?"); it covers the screen, then goes on into the ground, with the countries'
// borders, and holds still to be looked at. ↺, −, Esc or the logo bring it back. Day and night are as they are right
// now ("With night and day and lights too?"): the night side darkens through the twilight, and the lights of some
// 6,000 towns and cities glow there.
// Canvas, Natural Earth 1:110m (public domain); zoomed in, and for the names, the quiz's 1:50m map; the lights from
// Natural Earth's populated places (scripts/build-lights.mjs).
import { geoCentroid, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { ExtendedFeature, ExtendedFeatureCollection, GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import { subsolar, unit, type Vec } from './sun';

type LonLat = [number, number];
interface Chain { points: LonLat[]; born: number }
/** A piece of land (a GeoJSON feature) and its bounding cap (centre, and radius in radians), to skip the ones out of
 *  view. */
export interface Part { shape: GeoPermissibleObjects; c: LonLat; r: number }
/** The quiz's own map, for a closer look: its countries, each filled as land and outlined. */
export interface Detail { parts: Part[] }
/** A country tied: its numeric code (ISO 3166), its position [lat, lng] (a dot where the 1:110m map has no shape for
 *  it), gold once right in three categories, fresh when it was tied in the round just played. */
export interface Tied { num: string; ll: [number, number]; gold: boolean; fresh: boolean }
/** The lights of the night side as public/data/lights.json holds them: [lon, lat, size] after one another, in
 *  1/scale of a degree, biggest first, sizes 0 to 99. */
export interface LightsData { scale: number; lights: number[] }
type Shapes = ExtendedFeatureCollection;
type Path = ReturnType<typeof geoPath>;

const SPIN = 4.5;     // degrees per second
const TILT = -22;     // looks a little from the north, where most land is
const STEP = 380;     // ms to draw one link
const LIFE = 8200;    // ms a chain stays before it fades
const FADE = 900;
const EVERY = 2600;   // ms between new chains
const RAD = Math.PI / 180;
const ZOOM_STEP = 2;   // the + and − buttons, and a double tap
const DOUBLE_TAP = 300; // a tap waits this long for a second one before the country's sheet opens (ms)
const MAX_COVER = 4;   // zoomed all the way in, the globe is four times as big as it takes to cover the screen
const FADE_BY = 0.35;  // the rope round it is gone by a zoom of 1.35
const TIE = '#f2c14e'; // the gold of a tied country (and of the rope, once The Gordian Knot is untied)
const LIVE = '#7fdcff'; // the glow of a country with players on the site now
const PULSE = 3600;    // ms the countries tied in the last round pulse
const FACE = 1400;     // ms to turn and face them
const DETAIL_AT = 1.3; // zoomed in this far, the 1:50m countries and their borders are drawn instead of the land
const NIGHT = [3, 6, 20]; // the colour laid over the night side
const NIGHT_A = 0.66;  // and how much of it
const DAY_A = 0.2;     // the day side darkens towards the line between day and night by this much
const SUN_EVERY = 30_000; // ms between looks at where the sun is
const LIGHTS_AT_1 = 1800; // lights looked at on the globe in its rope; more as it grows (all of them from about 3.4x)
const LIGHTS_MAX = 2000;  // and at most this many drawn at once
const ICONS = {
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V9h4.5"/></svg>',
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** 0 at a, 1 at b (either way round), smooth in between. */
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export interface Hit { name: string; shape: GeoPermissibleObjects; id?: string }
/** Players on the site now in a country: its id, numeric code and position [lat, lng] (a dot where it has no shape). */
export interface Online { id: string; num: string; ll: [number, number]; n: number }

export class Globe {
  private readonly ctx: CanvasRenderingContext2D;
  /** The land at 1:110m, one piece per landmass, to skip the ones round the back; and the countries. */
  private readonly land: Part[] = [];
  private readonly countries: Part[] = [];
  private coarse = false; // the last frame was drawn from the 1:110m countries while the globe moved
  /** The countries at 1:110m by numeric code, to light up the tied ones. */
  private readonly shapes = new Map<string, GeoPermissibleObjects>();
  private tied: Tied[] = [];
  private tiedShapes: { detail: boolean; lit: Shapes; gold: Shapes; fresh: Shapes; dots: Tied[] } | null = null;
  private pulseFrom = -Infinity;
  private face: { t0: number; l0: number; p0: number; l1: number; p1: number } | null = null;
  private readonly grat = geoGraticule10();
  private readonly projection = geoOrthographic().clipAngle(90).precision(0.7);
  private readonly path: Path;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private chains: Chain[] = [];
  private lambda = -35; // starts facing Europe, Africa and the Middle East
  private phi = TILT;
  private spinV = SPIN; // degrees per second: a throw changes it, then it eases back to SPIN
  private drag: { id: number; x: number; y: number; t: number; v: number; moved: number } | null = null;
  /** Fingers or the mouse on the globe; two of them pinch. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; zoom: number } | null = null;
  private zoom = 1;
  private zoomTo = 1;
  private dirty = true; // something changed since the last frame: draw it
  private readonly zoomBox: HTMLElement;
  private released = -Infinity;
  private hover: Hit | null = null;
  /** The country whose sheet is open, in green. */
  private picked: Hit | null = null;
  private pointer: { x: number; y: number } | null = null; // the mouse, while it is over the globe
  private lastHit = 0;
  private tapTimer = 0;
  private readonly label: HTMLElement;
  private last = 0;
  private lastChain = -Infinity;
  private raf = 0;
  private running = false;
  private size = 0;
  private dpr = 1;
  private colors = { ocean: '', land: '', coast: '', grat: '', accent: '', dot: '', pick: '' };
  // ---- grown: the layer over the whole screen
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;
  private lw = 0;
  private lh = 0;
  private ldpr = 1;
  private big = false; // drawn on the layer
  private homeAt = { x: 0, y: 0, r: 100 }; // the globe in its rope, on the screen (css px)
  /** The rope round the globe, faded out while the globe is grown out of it; and how much of it shows. */
  private readonly rope: SVGElement | null;
  private shown = 1;
  // ---- day and night
  private sunAt = -Infinity;
  private sun: Vec = [1, 0, 0];
  private readonly mask = document.createElement('canvas');
  private readonly maskCtx: CanvasRenderingContext2D;
  private maskData: ImageData | null = null;
  private lights: { v: Float32Array; size: Float32Array; n: number } | null = null;
  private sprite: CanvasImageSource = glow();
  /** Picks the next chain near a point (lon, lat); returns [] when it has nothing. */
  chainNear: ((lon: number, lat: number) => LonLat[]) | null = null;
  /** The named country at a point (lon, lat), or null (sea, or a place the quiz has no country for). */
  countryAt: ((p: LonLat) => Hit | null) | null = null;
  /** A tap or a click on a country: its sheet opens. */
  onTap: ((hit: Hit) => void) | null = null;
  /** The globe grew out of its rope (true), or went back into it (false): the music comes down from space. */
  onZoom: ((zoomed: boolean) => void) | null = null;
  private wasZoomed = false;
  /** A tap waiting to see whether a second one follows: a double tap zooms, and opens no sheet. */
  private tapWait = 0;
  /** The quiz's map, once it has loaded: drawn when zoomed in. */
  detail: (() => Detail | null) | null = null;
  /** A country's shape on the quiz's map (1:50m), for the tied ones when zoomed in. */
  shapeOf: ((num: string) => GeoPermissibleObjects | null) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, topology: any) {
    this.ctx = canvas.getContext('2d')!;
    for (const poly of polygonsOf(feature(topology, topology.objects.land))) {
      this.land.push(capOf({ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: poly } } as GeoPermissibleObjects));
    }
    if (topology.objects.countries) {
      for (const f of (feature(topology, topology.objects.countries) as unknown as { features: (GeoPermissibleObjects & { id?: string })[] }).features) {
        if (f.id != null) this.shapes.set(String(f.id), f);
        this.countries.push(capOf(f));
      }
    }
    this.path = geoPath(this.projection, this.ctx);
    this.maskCtx = this.mask.getContext('2d')!;
    this.label = document.createElement('div');
    this.label.className = 'globe-label';
    this.label.hidden = true;
    this.label.setAttribute('aria-hidden', 'true');
    canvas.after(this.label);
    // + and −, and back to the globe in its rope once zoomed in: beside the globe, outside the rope, where they stay
    // while it grows.
    this.zoomBox = document.createElement('div');
    this.zoomBox.className = 'globe-zoom';
    this.zoomBox.innerHTML = `<button type="button" data-z="in" aria-label="Zoom in" title="Zoom in">${ICONS.in}</button>`
      + `<button type="button" data-z="out" aria-label="Zoom out" title="Zoom out" disabled>${ICONS.out}</button>`
      + `<button type="button" data-z="home" aria-label="Back to the whole globe" title="Back" hidden>${ICONS.home}</button>`;
    canvas.parentElement!.append(this.zoomBox);
    this.zoomBox.addEventListener('click', e => {
      const z = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-z]')?.dataset.z;
      if (z === 'in') this.zoomBy(ZOOM_STEP);
      if (z === 'out') this.zoomBy(1 / ZOOM_STEP);
      if (z === 'home') this.zoomBy(0);
    });
    // The layer the globe grows on: over the whole screen, but under the menu and the header. It comes right after the
    // globe's box, before the menu, which is on the same level (z-index 1) and so is drawn over it; the + and −
    // (z-index 2) stay on top too. Between the buttons the globe can still be turned.
    this.rope = canvas.parentElement!.querySelector<SVGElement>('.globe-rope');
    this.layer = document.createElement('canvas');
    this.layer.className = 'globe-layer';
    this.layer.hidden = true;
    this.layer.setAttribute('role', 'img');
    this.layer.setAttribute('aria-label', 'The globe, zoomed in: drag to turn it, pinch or scroll to zoom, Esc to go back');
    canvas.parentElement!.after(this.layer);
    this.layerCtx = this.layer.getContext('2d')!;
    new ResizeObserver(() => { this.resize(); this.redraw(); }).observe(canvas);
    new ResizeObserver(() => { this.resizeLayer(); this.redraw(); }).observe(this.layer);
    // Grown round its place in the page, it moves with the page when the page scrolls (a short phone).
    addEventListener('scroll', () => { if (this.big) { this.dirty = true; this.redraw(); } }, { passive: true });
    this.readColors();
    this.resize();
    this.listen(canvas);
    this.listen(this.layer);
    // Stamped thousands of times a frame: as a bitmap, which draws faster than a canvas.
    if (typeof createImageBitmap === 'function') createImageBitmap(this.sprite as HTMLCanvasElement).then(b => { this.sprite = b; }).catch(() => {});
  }

  /** Colours changed (Settings). */
  refresh() {
    this.readColors();
    this.redraw();
  }

  private redraw() {
    if (!this.running) this.draw(performance.now());
  }

  /** Zoomed in: grown out of its rope. */
  get zoomed() {
    return this.zoomTo > 1;
  }

  /** Back to the globe in its rope (↺, Esc, the logo); false when it already is. */
  back() {
    if (this.zoomTo <= 1) return false;
    this.zoomBy(0);
    return true;
  }

  /** The countries tied so far. The fresh ones (tied in the round just played) pulse for a moment, and the globe turns
   *  to face the first of them. */
  setTied(list: Tied[]) {
    this.tied = list;
    this.tiedShapes = null;
    const fresh = list.find(c => c.fresh);
    if (fresh) {
      this.pulseFrom = performance.now();
      this.faceTo(fresh.ll);
    }
    this.canvas.dataset.tied = String(list.length);
    this.dirty = true;
    this.redraw();
  }

  /** Players on the site now, by country (James, 22 Nov 2026): their countries glow, brighter for more players, and
   *  pointing at one says how many. */
  private online: Online[] = [];
  private onlineById = new Map<string, number>();
  setOnline(list: Online[]) {
    this.online = list;
    this.onlineById = new Map(list.map(p => [p.id, p.n]));
    this.canvas.dataset.online = list.map(p => `${p.id}:${p.n}`).join(',');
    if (this.hover) this.labelOf(this.hover);
    this.dirty = true;
    this.redraw();
  }
  private labelOf(hit: Hit) {
    const n = hit.id ? this.onlineById.get(hit.id) ?? 0 : 0;
    this.label.textContent = n ? `${hit.name} · ${n} online` : hit.name;
  }

  /** The lights of the night side. */
  setLights(data: LightsData) {
    const n = Math.floor(data.lights.length / 3), v = new Float32Array(3 * n), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = unit([data.lights[3 * i] / data.scale, data.lights[3 * i + 1] / data.scale]);
      v[3 * i] = u[0]; v[3 * i + 1] = u[1]; v[3 * i + 2] = u[2];
      size[i] = data.lights[3 * i + 2] / 99;
    }
    this.lights = { v, size, n };
    this.dirty = true;
    this.redraw();
  }

  /** Picks out the country whose sheet is open, in green (null: none). */
  pick(hit: Hit | null) {
    if (hit?.name === this.picked?.name) return;
    this.picked = hit;
    this.canvas.dataset.picked = hit?.name ?? '';
    this.dirty = true;
    this.redraw();
  }

  /** Turns the globe to a country opened from a sheet, unless it is in view already; as zoomed in as it is. */
  look(ll: [number, number]) {
    const g = this.where();
    this.projection.scale(g.r).translate([g.x, g.y]).rotate([this.lambda, this.phi]).clipExtent(null);
    const xy = geoDistance([ll[1], ll[0]], [-this.lambda, -this.phi]) < 1.35 ? this.projection([ll[1], ll[0]]) : null;
    if (xy && xy[0] > 40 && xy[0] < innerWidth - 40 && xy[1] > 40 && xy[1] < innerHeight - 40 && Math.hypot(xy[0] - g.x, xy[1] - g.y) < g.r * 0.8) return;
    this.faceTo(ll, true);
  }

  /** Turns the globe to face a place [lat, lng], the shortest way round; back to the globe in its rope first (unless
   *  `stay`: as zoomed in as it is). */
  private faceTo([lat, lon]: [number, number], stay = false) {
    if (this.zoomTo > 1 && !stay) this.zoomBy(0);
    const l1 = this.lambda + ((((-lon - this.lambda) % 360) + 540) % 360) - 180, p1 = clamp(-lat, -60, 60);
    if (this.still || !this.running) { this.lambda = l1; this.phi = p1; this.released = performance.now(); return; }
    this.face = { t0: performance.now(), l0: this.lambda, p0: this.phi, l1, p1 };
    this.spinV = SPIN;
  }

  /** The tied countries as three groups to fill (lit, gold, fresh) and the ones too small for a shape, as dots. Zoomed
   *  in, from the quiz's 1:50m map, so they match its coasts. */
  private tiedGroups(detail: boolean) {
    if (this.tiedShapes?.detail === detail) return this.tiedShapes;
    const lit: GeoPermissibleObjects[] = [], gold: GeoPermissibleObjects[] = [], fresh: GeoPermissibleObjects[] = [], dots: Tied[] = [];
    let complete = true;
    for (const c of this.tied) {
      const big = detail ? this.shapeOf?.(c.num) ?? null : null;
      if (detail && !big && this.shapes.has(c.num)) complete = false; // the quiz's map is still loading
      const shape = big ?? this.shapes.get(c.num);
      if (!shape) { dots.push(c); continue; }
      (c.gold ? gold : lit).push(shape);
      if (c.fresh) fresh.push(shape);
    }
    const fc = (features: GeoPermissibleObjects[]): Shapes => ({ type: 'FeatureCollection', features: features as ExtendedFeature[] });
    const groups = { detail, lit: fc(lit), gold: fc(gold), fresh: fc(fresh), dots };
    if (complete) this.tiedShapes = groups;
    return groups;
  }

  // ---- dragging, hovering and tapping (on the globe in its rope, and on the layer once grown)
  private listen(c: HTMLCanvasElement) {
    c.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      c.setPointerCapture(e.pointerId);
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) { // a second finger: pinch, and the turning waits
        this.pinch = { d: this.spread(), zoom: this.zoomTo };
        this.drag = null;
        this.setHover(null);
        return;
      }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, v: 0, moved: 0 };
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', e => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size === 2) {
        this.zoomBy(this.spread() / Math.max(1, this.pinch.d) * this.pinch.zoom / this.zoomTo, true);
        return;
      }
      const d = this.drag;
      if (d && e.pointerId === d.id) {
        const k = this.degPerPx() / this.zoom, dx = e.clientX - d.x, dy = e.clientY - d.y, dt = Math.max(8, e.timeStamp - d.t);
        this.lambda += dx * k;
        this.phi = clamp(this.phi - dy * k, -70, 70);
        d.v = 0.7 * d.v + 0.3 * ((dx * k) / dt) * 1000;
        d.moved += Math.abs(dx) + Math.abs(dy);
        d.x = e.clientX; d.y = e.clientY; d.t = e.timeStamp;
        if (d.moved > 6) this.setHover(null);
        this.dirty = true;
        this.redraw();
      } else if (e.pointerType === 'mouse') {
        this.pointer = { x: e.clientX, y: e.clientY };
        this.hoverAt(e.clientX, e.clientY);
      }
    });
    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        // One finger left after a pinch: it turns the globe from where it is, without a throw.
        if (this.touches.size < 2) this.pinch = null;
        const [id, at] = [...this.touches][0] ?? [];
        if (at) this.drag = { id: id!, x: at.x, y: at.y, t: e.timeStamp, v: 0, moved: 99 };
        else { this.drag = null; c.classList.remove('dragging'); this.released = performance.now(); }
        return;
      }
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      c.classList.remove('dragging');
      this.released = performance.now();
      if (d.moved <= 6) { // a tap or a click: the country's sheet opens (or its name shows for a moment)
        this.hoverAt(e.clientX, e.clientY);
        clearTimeout(this.tapTimer);
        const hit = this.hover;
        if (hit && this.onTap) {
          if (e.pointerType !== 'mouse') this.setHover(null);
          // The second tap of a double tap: the double tap zooms (dblclick), and the first tap's sheet stays shut.
          if (this.tapWait) { clearTimeout(this.tapWait); this.tapWait = 0; return; }
          this.tapWait = window.setTimeout(() => { this.tapWait = 0; this.onTap?.(hit); }, DOUBLE_TAP);
        } else if (e.pointerType !== 'mouse') this.tapTimer = window.setTimeout(() => this.setHover(null), 2600);
        return;
      }
      if (!this.still) this.spinV = e.timeStamp - d.t > 90 ? 0 : clamp(d.v / this.zoom, -360, 360);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse' || this.drag) return;
      this.pointer = null;
      this.setHover(null);
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomBy(Math.exp(-clamp(e.deltaY * (e.deltaMode === 1 ? 33 : 1), -120, 120) * 0.004), true);
    }, { passive: false });
    c.addEventListener('dblclick', () => this.zoomBy(this.zoomTo >= this.zoomMax() * 0.999 ? 0 : ZOOM_STEP));
  }

  /** How far apart the two fingers of a pinch are. */
  private spread() {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  /** Zoomed all the way in, the globe is four times as big as it takes to cover the screen from where it is (to reach
   *  the farthest corner), and at least six times its size in the rope. */
  private zoomMax() {
    const { x, y, r } = this.homeAt, w = innerWidth, h = innerHeight;
    const far = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    return Math.max(6, (MAX_COVER * far) / Math.max(40, r));
  }

  /** Zooms by a factor (0: back to the globe in its rope); `now` follows a finger or the wheel without easing. */
  private zoomBy(f: number, now = false) {
    if (!this.big) this.measure();
    const max = this.zoomMax();
    this.zoomTo = f === 0 ? 1 : clamp(this.zoomTo * f, 1, max);
    if (now || this.still || !this.running) this.zoom = this.zoomTo;
    if (this.zoomTo > 1) this.spinV = 0; // zoomed in, it holds still to be looked at
    this.setHover(null);
    const [zin, zout, home] = this.zoomBox.querySelectorAll('button');
    zin.disabled = this.zoomTo >= max * 0.999;
    zout.disabled = home.hidden = this.zoomTo <= 1;
    document.body.classList.toggle('globe-big', this.zoomTo > 1);
    if (this.wasZoomed !== this.zoomTo > 1) { this.wasZoomed = this.zoomTo > 1; this.onZoom?.(this.wasZoomed); }
    this.setBig(this.zoom > 1 || this.zoomTo > 1);
    this.dirty = true;
    this.redraw();
  }

  /** Where the globe in its rope is on the screen (css px), with the menu in its place: when the menu steps aside
   *  (sheet.ts: to the left while the globe is grown, James 23 Nov 2026, or for a sheet), the grown globe stays put. */
  private measure() {
    const b = this.canvas.getBoundingClientRect();
    if (!b.width) return;
    const start = this.canvas.closest<HTMLElement>('.start');
    const aside = start ? parseFloat(getComputedStyle(start).left) || 0 : 0;
    this.homeAt = { x: b.left - aside + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 - 2 };
  }

  /** Grown, the globe is drawn on the layer over the whole screen; back at its size, in its rope again. */
  private setBig(on: boolean) {
    if (on === this.big) return;
    this.big = on;
    this.layer.hidden = !on;
    this.canvas.style.visibility = on ? 'hidden' : '';
    if (on) {
      this.measure();
      this.resizeLayer();
    } else {
      this.layer.width = this.layer.height = this.lw = this.lh = 0; // let the memory go
      this.fadeRope(1);
    }
    this.dirty = true;
  }

  /** The globe on the layer (css px): it grows round its place in the rope, behind the menu. */
  private bigView() {
    const { x, y, r } = this.homeAt;
    return { x, y, r: r * this.zoom };
  }

  /** Turning or zooming: under a finger, from a throw, or on its own. */
  private moving() {
    return !!this.drag || !!this.pinch || !!this.face || this.zoom !== this.zoomTo || (this.zoomTo > 1 && this.spinV !== 0);
  }

  /** The globe on the screen now (css px). */
  private where() {
    if (this.big) return this.bigView();
    const b = this.canvas.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 - 2 };
  }

  /** The rope fades as the globe grows out of it. The rest of the home screen stays as it is, over the globe. */
  private fadeRope(shown: number) {
    if (shown === this.shown) return;
    this.shown = shown;
    if (this.rope) this.rope.style.opacity = shown >= 1 ? '' : String(Math.round(shown * 100) / 100);
  }

  /** Degrees of turn per css pixel of drag, so the ground follows the finger near the middle. */
  private degPerPx() {
    return 180 / Math.PI / Math.max(40, this.canvas.clientWidth / 2 - 2);
  }

  private hoverAt(x: number, y: number) {
    if (!this.countryAt) return;
    const g = this.where();
    if (!(g.r > 0) || Math.hypot(x - g.x, y - g.y) > g.r) { this.setHover(null); return; }
    this.projection.scale(g.r).translate([g.x, g.y]).rotate([this.lambda, this.phi]).clipExtent(null);
    const ll = this.projection.invert?.([x, y]);
    this.setHover(ll ? this.countryAt(ll as LonLat) : null, x, y);
  }

  private setHover(hit: Hit | null, x = 0, y = 0) {
    const same = hit?.name === this.hover?.name;
    this.hover = hit;
    if (hit) {
      this.labelOf(hit);
      this.label.style.left = `${x}px`;
      this.label.style.top = `${y}px`;
    }
    this.label.hidden = !hit;
    if (!same) { this.dirty = true; this.redraw(); }
  }

  play() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    if (this.still) { this.spawn(this.last - LIFE / 2); this.draw(this.last); this.running = false; return; }
    const frame = (t: number) => {
      if (!this.running) return;
      this.tick(t);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Leaving the home screen: it stops, back in its rope. */
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.setHover(null);
    if (this.zoomTo > 1 || this.big) this.zoomBy(0, true);
  }

  private tick(t: number) {
    const dt = Math.min(64, t - this.last);
    this.last = t;
    let moving = this.dirty || this.chains.length > 0;
    if (this.zoom !== this.zoomTo) {
      // Eased on a log scale, so every doubling takes as long.
      const a = Math.log(this.zoom), b = Math.log(this.zoomTo);
      this.zoom = Math.abs(a - b) < 0.003 ? this.zoomTo : Math.exp(a + (b - a) * (1 - Math.exp(-dt / 110)));
      moving = true;
    }
    if (this.big && this.zoom === 1 && this.zoomTo === 1) this.setBig(false);
    if (this.coarse && !this.moving()) moving = true; // it came to rest: draw it sharp
    if (t - this.sunAt > SUN_EVERY) moving = true; // the line between day and night has moved on
    const zoomed = this.zoomTo > 1;
    if (this.face) {
      if (this.drag || this.pinch) this.face = null; // a finger takes over
      else {
        const p = Math.min(1, (t - this.face.t0) / FACE), e = easeInOut(p);
        this.lambda = this.face.l0 + (this.face.l1 - this.face.l0) * e;
        this.phi = this.face.p0 + (this.face.p1 - this.face.p0) * e;
        moving = true;
        if (p >= 1) { this.face = null; this.released = t + 2200; } // it holds the view a moment before tilting back
      }
    }
    if (t - this.pulseFrom < PULSE + 100) moving = true;
    if (!this.drag && !this.pinch && !this.face) {
      // A throw slows down into the normal spin; pointing at a country slows the globe so the name can be read.
      // Zoomed in, a throw slows down to a stop.
      const target = zoomed ? 0 : this.pointer ? SPIN * 0.25 : SPIN;
      this.lambda = (this.lambda + (this.spinV * dt) / 1000) % 360;
      this.spinV += (target - this.spinV) * (1 - Math.exp(-dt / 900));
      if (Math.abs(this.spinV - target) < 0.01) this.spinV = target;
      if (!zoomed && t - this.released > 1800) this.phi += (TILT - this.phi) * (1 - Math.exp(-dt / 1600));
      if (this.spinV !== 0 || (!zoomed && Math.abs(TILT - this.phi) > 0.01)) moving = true;
      // The ground moves under a still mouse: check the name now and then.
      if (this.pointer && moving && t - this.lastHit > 120) { this.lastHit = t; this.hoverAt(this.pointer.x, this.pointer.y); }
    }
    if (!zoomed && t - this.lastChain > EVERY) this.spawn(t);
    this.chains = this.chains.filter(c => t - c.born < LIFE + FADE);
    if (moving) this.draw(t);
  }

  /** A new chain a little ahead of the centre, so it drifts across the face of the globe. */
  private spawn(t: number) {
    this.lastChain = t;
    if (!this.chainNear) return;
    const lon = -this.lambda - 25, lat = -this.phi;
    const points = this.chainNear(lon, lat);
    if (points.length > 1) this.chains.push({ points, born: t });
  }

  private resize() {
    const css = this.canvas.clientWidth;
    if (!css) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = Math.round(css * this.dpr);
    this.canvas.width = this.canvas.height = this.size;
    this.dirty = true;
  }

  private resizeLayer() {
    if (!this.big) return;
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    if (!w || !h) return;
    // Sharp, but at most about 2.5 million pixels, so that a big screen keeps up.
    const k = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(2.5e6 / (w * h)));
    this.lw = Math.round(w * k);
    this.lh = Math.round(h * k);
    this.ldpr = this.lw / w;
    if (this.layer.width !== this.lw || this.layer.height !== this.lh) { this.layer.width = this.lw; this.layer.height = this.lh; }
    this.dirty = true;
  }

  private readColors() {
    // The home screen is a night sky in both themes, so the globe always has its night colours.
    const st = getComputedStyle(this.canvas);
    const v = (name: string) => st.getPropertyValue(name).trim();
    this.colors = { ocean: v('--ocean'), land: v('--land'), coast: v('--border'), grat: v('--grat'), accent: v('--glow'), dot: '#0b111c', pick: v('--target') || '#3ee483' };
  }

  /** Where the sun is overhead, looked up again every 30 s. */
  private sunNow() {
    const t = performance.now();
    if (t - this.sunAt < SUN_EVERY) return;
    this.sunAt = t;
    const ll = subsolar(Date.now());
    this.sun = unit(ll);
    this.canvas.dataset.sun = this.layer.dataset.sun = `${ll[0].toFixed(2)},${ll[1].toFixed(2)}`;
  }

  /** A unit vector as the viewer sees it now: [towards the viewer, right, up]. */
  private view([x, y, z]: Vec): Vec {
    const l = this.lambda * RAD, p = this.phi * RAD, cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p);
    const x1 = x * cl - y * sl;
    return [x1 * cp - z * sp, x * sl + y * cl, z * cp + x1 * sp];
  }

  private draw(t: number) {
    this.sunNow();
    this.dirty = false;
    if (this.big) {
      if (!this.lw) this.resizeLayer();
      if (!this.lw) return;
      this.measure();
      const v = this.bigView(), k = this.ldpr;
      this.fadeRope(1 - clamp((this.zoom - 1) / FADE_BY, 0, 1));
      this.layerCtx.clearRect(0, 0, this.lw, this.lh);
      this.paint(this.layerCtx, this.lw, this.lh, v.x * k, v.y * k, v.r * k, k, t, true);
      // where it is, how big, and which way it faces, for the tests
      this.layer.dataset.view = `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.r.toFixed(1)}`;
      this.layer.dataset.zoom = this.zoom.toFixed(3);
      this.layer.dataset.at = `${this.lambda.toFixed(2)},${this.phi.toFixed(2)}`;
    } else {
      const { ctx, size } = this;
      if (!size) return;
      ctx.clearRect(0, 0, size, size);
      this.paint(ctx, size, size, size / 2, size / 2, size / 2 - 2 * this.dpr, this.dpr, t, false);
    }
  }

  /** Draws the globe on a canvas: centre (cx, cy) and radius r in the canvas's own pixels, k of them to a css pixel. */
  private paint(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, r: number, k: number, t: number, big: boolean) {
    const c = this.colors, path = this.path.context(ctx);
    this.projection.scale(r).translate([cx, cy]).rotate([this.lambda, this.phi]).clipExtent(big ? [[-2, -2], [w + 2, h + 2]] : null);
    if (big) this.halo(ctx, w, h, cx, cy, r, k); // in its rope, a css drop-shadow does it

    // sea, grid, land (zoomed in: the countries, with their borders)
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = c.ocean; ctx.fill();
    ctx.beginPath(); path(this.grat); ctx.strokeStyle = c.grat; ctx.lineWidth = k; ctx.stroke();
    // Only the land in view: the near side, and of that only what is on the screen once the globe is bigger than it.
    // Zoomed in, the countries, whose outlines are the borders too: the quiz's 1:50m map once the globe holds still,
    // the 1:110m one while it moves, which keeps a drag smooth.
    const zoomed = this.zoom >= DETAIL_AT, moving = zoomed && this.moving();
    const fine = zoomed && !moving ? this.detail?.()?.parts ?? null : null, detail = !!fine?.length;
    this.coarse = moving;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    const reach = (far >= r ? Math.PI / 2 : Math.asin(far / r)) + 0.03, mid: LonLat = [-this.lambda, -this.phi];
    const parts = (detail ? fine! : zoomed ? this.countries : this.land).filter(p => geoDistance(p.c, mid) - p.r < reach);
    ctx.beginPath(); path({ type: 'FeatureCollection', features: parts.map(p => p.shape) } as GeoPermissibleObjects); ctx.fillStyle = c.land; ctx.fill();
    // Zoomed in, the outlines of the countries are their borders too.
    ctx.strokeStyle = c.coast; ctx.lineWidth = 0.8 * k; ctx.stroke();
    const center = mid, age = t - this.pulseFrom;
    const groups = this.tied.length ? this.tiedGroups(!!detail) : null;
    if (groups) {
      // Tied: a gold tint; right in three categories: gold. Part of the ground, so night falls on them too.
      ctx.fillStyle = TIE;
      ctx.globalAlpha = 0.34; ctx.beginPath(); path(groups.lit); ctx.fill();
      ctx.globalAlpha = 0.86; ctx.beginPath(); path(groups.gold); ctx.fill();
      for (const d of groups.dots) {
        const pt: LonLat = [d.ll[1], d.ll[0]];
        if (geoDistance(pt, center) > 89 * RAD) continue;
        const xy = this.projection(pt);
        if (!xy) continue;
        const fresh = d.fresh && age < PULSE;
        ctx.globalAlpha = d.gold || fresh ? 0.95 : 0.6;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], (d.gold ? 2.6 : 2.1) * k * Math.sqrt(this.zoom) * (fresh ? 1.4 : 1), 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // day and night as they are now, and the lights of the night side
    this.shade(ctx, w, h, cx, cy, r, path);
    this.drawLights(ctx, w, h, cx, cy, r, k, big ? this.layer : this.canvas);

    // The ones tied in the round just played pulse three times, over the night.
    if (groups && age < PULSE && groups.fresh.features.length) {
      const p = this.still ? 1 : 0.5 - 0.5 * Math.cos((age / PULSE) * 6 * Math.PI);
      ctx.globalAlpha = 0.65 * p; ctx.fillStyle = '#fff3c9'; ctx.beginPath(); path(groups.fresh); ctx.fill();
      ctx.globalAlpha = p; ctx.strokeStyle = TIE; ctx.lineWidth = 1.6 * k; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Players on the site now: their countries glow, brighter for more of them, breathing slowly; over the night too.
    if (this.online.length) {
      const breathe = this.still ? 1 : 0.8 + 0.2 * Math.sin(t / 700);
      ctx.fillStyle = ctx.strokeStyle = LIVE;
      for (const p of this.online) {
        const a = Math.min(0.6, 0.2 + 0.13 * Math.log2(1 + p.n)) * breathe;
        const shape = (detail ? this.shapeOf?.(p.num) : null) ?? this.shapes.get(p.num);
        if (shape) {
          ctx.globalAlpha = a; ctx.beginPath(); path(shape); ctx.fill();
          ctx.globalAlpha = Math.min(1, a * 1.6); ctx.lineWidth = 1.1 * k; ctx.stroke();
          continue;
        }
        const pt: LonLat = [p.ll[1], p.ll[0]];
        if (geoDistance(pt, center) > 89 * RAD) continue;
        const xy = this.projection(pt);
        if (!xy) continue;
        ctx.globalAlpha = Math.min(1, a * 1.8);
        ctx.beginPath(); ctx.arc(xy[0], xy[1], (2 + Math.log2(1 + p.n)) * k * Math.sqrt(this.zoom), 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (this.picked) {
      ctx.beginPath(); path(this.picked.shape);
      ctx.globalAlpha = 0.8; ctx.fillStyle = c.pick; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#eafff2'; ctx.lineWidth = 1.2 * k; ctx.stroke();
    }
    if (this.hover && this.hover.name !== this.picked?.name) {
      ctx.beginPath(); path(this.hover.shape);
      ctx.globalAlpha = 0.7; ctx.fillStyle = c.accent; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = c.accent; ctx.lineWidth = k; ctx.stroke();
    }

    // the chains
    ctx.lineCap = 'round';
    for (const ch of this.chains) {
      const age = t - ch.born;
      const alpha = age < LIFE ? 1 : Math.max(0, 1 - (age - LIFE) / FADE);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2.2 * k;
      for (let i = 0; i < ch.points.length - 1; i++) {
        const p = Math.min(1, Math.max(0, (age - i * STEP) / STEP));
        if (!p) break;
        const a = ch.points[i], b = ch.points[i + 1];
        const end = p < 1 ? (geoInterpolate(a, b)(ease(p)) as LonLat) : b;
        ctx.beginPath(); path({ type: 'LineString', coordinates: [a, end] }); ctx.stroke();
      }
      for (let i = 0; i < ch.points.length; i++) {
        const shown = (age - i * STEP) / 200; // each knot pops in when its link arrives
        if (shown <= 0) break;
        const pt = ch.points[i];
        if (geoDistance(pt, center) > 89 * RAD) continue;
        const xy = this.projection(pt);
        if (!xy) continue;
        const q = Math.min(1, shown);
        const rr = (3.6 + 2.4 * Math.sin(Math.PI * Math.min(1, shown))) * q * k;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rr + 1.6 * k, 0, 2 * Math.PI); ctx.fillStyle = c.dot; ctx.fill();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rr, 0, 2 * Math.PI); ctx.fillStyle = c.accent; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // the edge of the ball, a little darker
    const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = g; ctx.fill();
  }

  /** The glow of the air round the globe on the layer, while it doesn't cover the screen. */
  private halo(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, r: number, k: number) {
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    if (r >= far) return;
    const R = r + 34 * k, g = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, R);
    g.addColorStop(0, 'rgba(90, 150, 255, 0.3)');
    g.addColorStop(0.4, 'rgba(90, 150, 255, 0.1)');
    g.addColorStop(1, 'rgba(90, 150, 255, 0)');
    const x0 = Math.max(0, cx - R), y0 = Math.max(0, cy - R);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, Math.min(w, cx + R) - x0, Math.min(h, cy + R) - y0);
  }

  /** Day and night as they are now: the day side a little darker away from the sun, the night side dark, with a soft
   *  twilight between. Worked out on a coarse grid over the globe from where the sun is as the viewer sees it, then
   *  stretched over the globe, so the twilight stays smooth at any size. */
  private shade(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, r: number, path: Path) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h, Math.ceil(cy + r));
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    const mw = clamp(Math.ceil((x1 - x0) / 6), 2, 200), mh = clamp(Math.ceil((y1 - y0) / 6), 2, 200);
    if (!this.maskData || this.maskData.width !== mw || this.maskData.height !== mh) {
      this.mask.width = mw;
      this.mask.height = mh;
      this.maskData = this.maskCtx.createImageData(mw, mh);
    }
    const data = this.maskData.data, [sd, sx, sy] = this.view(this.sun);
    const cw = (x1 - x0) / mw, ch = (y1 - y0) / mh;
    for (let j = 0, o = 0; j < mh; j++) {
      const Y0 = (cy - (y0 + (j + 0.5) * ch)) / r;
      for (let i = 0; i < mw; i++, o += 4) {
        let X = (x0 + (i + 0.5) * cw - cx) / r, Y = Y0, D = 0;
        const q = X * X + Y * Y;
        // Off the edge, the edge itself, so the stretched grid stays right up to it.
        if (q > 1) { const n = Math.sqrt(q); X /= n; Y /= n; } else D = Math.sqrt(1 - q);
        const up = D * sd + X * sx + Y * sy; // how high the sun stands there (sine of its altitude)
        const night = smoothstep(0.05, -0.2, up);
        data[o] = NIGHT[0] * night;
        data[o + 1] = NIGHT[1] * night;
        data[o + 2] = NIGHT[2] * night;
        data[o + 3] = 255 * (DAY_A * (1 - Math.max(0, up)) * (1 - night) + NIGHT_A * night);
      }
    }
    this.maskCtx.putImageData(this.maskData, 0, 0);
    ctx.save();
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mask, 0, 0, mw, mh, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /** The lights of towns and cities on the night side, coming on through the twilight; bigger places glow bigger and
   *  brighter. The biggest 1,800 in the rope; more as the globe grows. */
  private drawLights(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, r: number, k: number, on: HTMLCanvasElement) {
    const L = this.lights;
    if (!L) return;
    const n = Math.min(L.n, Math.round(LIGHTS_AT_1 * this.zoom ** 1.2)), v = L.v, most = LIGHTS_MAX;
    const [ux, uy, uz] = this.sun;
    const l = this.lambda * RAD, p = this.phi * RAD, cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p);
    const grow = this.zoom ** 0.35 * k;
    let lit = 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = v[3 * i], y = v[3 * i + 1], z = v[3 * i + 2];
      const up = x * ux + y * uy + z * uz;
      if (up > 0.02) continue; // daylight
      const x1 = x * cl - y * sl, depth = x1 * cp - z * sp;
      if (depth < 0.01) continue; // round the back
      const size = L.size[i], s = (0.9 + 3.3 * size) * grow;
      const X = cx + r * (x * sl + y * cl), Y = cy - r * (z * cp + x1 * sp);
      if (X < -s || Y < -s || X > w + s || Y > h + s) continue;
      const a = (0.25 + 0.75 * size) * smoothstep(0.02, -0.12, up) * Math.min(1, depth * 6);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(this.sprite, X - s, Y - s, 2 * s, 2 * s);
      if (++lit >= most) break; // biggest first: what's left are the smallest towns
    }
    ctx.restore();
    on.dataset.lights = String(lit);
  }
}

/** A piece of land with its bounding cap: its centre, and how far its outer rings reach from it. */
function capOf(shape: GeoPermissibleObjects): Part {
  const c = geoCentroid(shape) as LonLat;
  let r = 0;
  for (const poly of polygonsOf(shape)) for (const p of poly[0]) r = Math.max(r, geoDistance(c, p as LonLat));
  return { shape, c, r };
}

/** The polygons (rings of [lon, lat]) of a GeoJSON object. */
function polygonsOf(o: any): number[][][][] {
  if (!o) return [];
  if (o.type === 'FeatureCollection') return o.features.flatMap(polygonsOf);
  if (o.type === 'Feature') return polygonsOf(o.geometry);
  if (o.type === 'GeometryCollection') return o.geometries.flatMap(polygonsOf);
  if (o.type === 'Polygon') return [o.coordinates];
  if (o.type === 'MultiPolygon') return o.coordinates;
  return [];
}

/** A small warm glow, drawn once and stamped for every light. */
function glow() {
  const c = document.createElement('canvas'), s = 32;
  c.width = c.height = s;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255, 247, 222, 1)');
  grad.addColorStop(0.14, 'rgba(255, 220, 150, 0.85)');
  grad.addColorStop(0.4, 'rgba(255, 168, 72, 0.28)');
  grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
