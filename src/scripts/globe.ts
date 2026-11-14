// The start screen's globe: it turns slowly while chains of neighbouring countries get tied together,
// the same kind of links the quiz is built on. Drag it to turn it (a throw keeps it spinning for a moment, then it
// eases back into its own pace); point at a country, or tap it, to see its name. The wheel, a pinch or the + and -
// beside it zoom in (James, 14 Nov 2026): the rope loop stays where it is, like a lens, the globe stops turning by
// itself and the countries get their borders, so it can be explored. Canvas, Natural Earth 1:110m land (public
// domain); zoomed in, and for the names, the quiz's 1:50m map.
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';

type LonLat = [number, number];
interface Chain { points: LonLat[]; born: number }
/** The quiz's own map, for a closer look: the countries (filled as land) and the borders between them. */
export interface Detail { land: GeoPermissibleObjects; borders: GeoPermissibleObjects }

const SPIN = 4.5;     // degrees per second
const TILT = -22;     // looks a little from the north, where most land is
const STEP = 380;     // ms to draw one link
const LIFE = 8200;    // ms a chain stays before it fades
const FADE = 900;
const EVERY = 2600;   // ms between new chains
const RAD = Math.PI / 180;
const ZOOM_MAX = 6;
const DETAIL_AT = 1.3; // zoomed in this far, the 1:50m countries and their borders are drawn instead of the land
const ICONS = {
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V9h4.5"/></svg>',
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export interface Hit { name: string; shape: GeoPermissibleObjects }

export class Globe {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly land: GeoPermissibleObjects;
  private readonly grat = geoGraticule10();
  private readonly projection = geoOrthographic().clipAngle(90).precision(0.7);
  private readonly path;
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
  private colors = { ocean: '', land: '', coast: '', grat: '', accent: '', dot: '', shade: '', light: '' };
  /** Picks the next chain near a point (lon, lat); returns [] when it has nothing. */
  chainNear: ((lon: number, lat: number) => LonLat[]) | null = null;
  /** The named country at a point (lon, lat), or null (sea, or a place the quiz has no country for). */
  countryAt: ((p: LonLat) => Hit | null) | null = null;
  /** The quiz's map, once it has loaded: drawn when zoomed in. */
  detail: (() => Detail | null) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, topology: any) {
    this.ctx = canvas.getContext('2d')!;
    this.land = feature(topology, topology.objects.land) as unknown as GeoPermissibleObjects;
    this.path = geoPath(this.projection, this.ctx);
    this.label = document.createElement('div');
    this.label.className = 'globe-label';
    this.label.hidden = true;
    this.label.setAttribute('aria-hidden', 'true');
    canvas.after(this.label);
    // + and -, and back to the whole globe once zoomed in: beside the globe, outside the rope.
    this.zoomBox = document.createElement('div');
    this.zoomBox.className = 'globe-zoom';
    this.zoomBox.innerHTML = `<button type="button" data-z="in" aria-label="Zoom in" title="Zoom in">${ICONS.in}</button>`
      + `<button type="button" data-z="out" aria-label="Zoom out" title="Zoom out" disabled>${ICONS.out}</button>`
      + `<button type="button" data-z="home" aria-label="Back to the whole globe" title="Back" hidden>${ICONS.home}</button>`;
    canvas.parentElement!.append(this.zoomBox);
    this.zoomBox.addEventListener('click', e => {
      const z = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-z]')?.dataset.z;
      if (z === 'in') this.zoomBy(1.8);
      if (z === 'out') this.zoomBy(1 / 1.8);
      if (z === 'home') this.zoomBy(0);
    });
    new ResizeObserver(() => { this.resize(); this.redraw(); }).observe(canvas);
    this.readColors();
    this.resize();
    this.listen();
  }

  /** Colours changed (Settings). */
  refresh() {
    this.readColors();
    this.redraw();
  }

  private redraw() {
    if (!this.running) this.draw(performance.now());
  }

  // ---- dragging, hovering and tapping
  private listen() {
    const c = this.canvas;
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
      if (d.moved <= 6) { // a tap or a click: name the country there for a moment
        this.hoverAt(e.clientX, e.clientY);
        clearTimeout(this.tapTimer);
        if (e.pointerType !== 'mouse') this.tapTimer = window.setTimeout(() => this.setHover(null), 2600);
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
    c.addEventListener('dblclick', () => this.zoomBy(this.zoomTo >= ZOOM_MAX ? 0 : 1.8));
  }

  /** How far apart the two fingers of a pinch are. */
  private spread() {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  /** Zooms by a factor (0: back to the whole globe); `now` follows a finger or the wheel without easing. */
  private zoomBy(f: number, now = false) {
    this.zoomTo = f === 0 ? 1 : clamp(this.zoomTo * f, 1, ZOOM_MAX);
    if (now || this.still || !this.running) this.zoom = this.zoomTo;
    if (this.zoomTo > 1) this.spinV = 0; // zoomed in, it holds still to be looked at
    this.setHover(null);
    const [zin, zout, home] = this.zoomBox.querySelectorAll('button');
    zin.disabled = this.zoomTo >= ZOOM_MAX;
    zout.disabled = home.hidden = this.zoomTo <= 1;
    this.canvas.classList.toggle('zoomed', this.zoomTo > 1);
    this.dirty = true;
    this.redraw();
  }

  /** Degrees of turn per css pixel of drag, so the ground follows the finger near the middle. */
  private degPerPx() {
    return 180 / Math.PI / Math.max(40, this.canvas.clientWidth / 2 - 2);
  }

  private hoverAt(x: number, y: number) {
    if (!this.countryAt || !this.size) return;
    const box = this.canvas.getBoundingClientRect();
    const px = ((x - box.left) * this.size) / box.width, py = ((y - box.top) * this.size) / box.height;
    const r = this.size / 2 - 2 * this.dpr;
    if (Math.hypot(px - this.size / 2, py - this.size / 2) > r) { this.setHover(null); return; }
    this.projection.scale(r * this.zoom).translate([this.size / 2, this.size / 2]).rotate([this.lambda, this.phi]);
    const ll = this.projection.invert?.([px, py]);
    this.setHover(ll ? this.countryAt(ll as LonLat) : null, x, y);
  }

  private setHover(hit: Hit | null, x = 0, y = 0) {
    const same = hit?.name === this.hover?.name;
    this.hover = hit;
    if (hit) {
      this.label.textContent = hit.name;
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

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.setHover(null);
  }

  private tick(t: number) {
    const dt = Math.min(64, t - this.last);
    this.last = t;
    let moving = this.dirty || this.chains.length > 0;
    if (this.zoom !== this.zoomTo) {
      this.zoom += (this.zoomTo - this.zoom) * (1 - Math.exp(-dt / 90));
      if (Math.abs(this.zoom - this.zoomTo) < 0.002) this.zoom = this.zoomTo;
      moving = true;
    }
    const zoomed = this.zoomTo > 1;
    if (!this.drag && !this.pinch) {
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

  private readColors() {
    // The home screen is a night sky in both themes, so the globe always has its night colours.
    const st = getComputedStyle(this.canvas);
    const v = (name: string) => st.getPropertyValue(name).trim();
    this.colors = {
      ocean: v('--ocean'), land: v('--land'), coast: v('--border'), grat: v('--grat'), accent: v('--glow'),
      dot: '#0b111c', light: 'rgba(255,255,255,0.08)', shade: 'rgba(0,0,0,0.35)',
    };
  }

  private draw(t: number) {
    const { ctx, size, colors: c } = this;
    if (!size) return;
    this.dirty = false;
    const r = size / 2 - 2 * this.dpr;
    this.projection.scale(r * this.zoom).translate([size / 2, size / 2]).rotate([this.lambda, this.phi])
      .clipExtent(this.zoom > 1 ? [[0, 0], [size, size]] : null);
    ctx.clearRect(0, 0, size, size);
    // Zoomed in, the globe is bigger than its circle: the circle shows a part of it, like a lens.
    ctx.save();
    ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, 2 * Math.PI); ctx.clip();

    // sea, grid, land (zoomed in: the countries, with their borders)
    ctx.beginPath(); this.path({ type: 'Sphere' }); ctx.fillStyle = c.ocean; ctx.fill();
    ctx.beginPath(); this.path(this.grat); ctx.strokeStyle = c.grat; ctx.lineWidth = this.dpr; ctx.stroke();
    const detail = this.zoom >= DETAIL_AT ? this.detail?.() : null;
    ctx.beginPath(); this.path(detail ? detail.land : this.land); ctx.fillStyle = c.land; ctx.fill();
    ctx.strokeStyle = c.coast; ctx.lineWidth = 0.8 * this.dpr; ctx.stroke();
    if (detail) { ctx.beginPath(); this.path(detail.borders); ctx.strokeStyle = c.coast; ctx.lineWidth = 0.7 * this.dpr; ctx.stroke(); }
    if (this.hover) {
      ctx.beginPath(); this.path(this.hover.shape);
      ctx.globalAlpha = 0.7; ctx.fillStyle = c.accent; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = c.accent; ctx.lineWidth = this.dpr; ctx.stroke();
    }

    // the chains
    const center: LonLat = [-this.lambda, -this.phi];
    ctx.lineCap = 'round';
    for (const ch of this.chains) {
      const age = t - ch.born;
      const alpha = age < LIFE ? 1 : Math.max(0, 1 - (age - LIFE) / FADE);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2.2 * this.dpr;
      for (let i = 0; i < ch.points.length - 1; i++) {
        const p = Math.min(1, Math.max(0, (age - i * STEP) / STEP));
        if (!p) break;
        const a = ch.points[i], b = ch.points[i + 1];
        const end = p < 1 ? (geoInterpolate(a, b)(ease(p)) as LonLat) : b;
        ctx.beginPath(); this.path({ type: 'LineString', coordinates: [a, end] }); ctx.stroke();
      }
      for (let i = 0; i < ch.points.length; i++) {
        const shown = (age - i * STEP) / 200; // each knot pops in when its link arrives
        if (shown <= 0) break;
        const pt = ch.points[i];
        if (geoDistance(pt, center) > 89 * RAD) continue;
        const xy = this.projection(pt);
        if (!xy) continue;
        const k = Math.min(1, shown);
        const rr = (3.6 + 2.4 * Math.sin(Math.PI * Math.min(1, shown))) * k * this.dpr;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rr + 1.6 * this.dpr, 0, 2 * Math.PI); ctx.fillStyle = c.dot; ctx.fill();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], rr, 0, 2 * Math.PI); ctx.fillStyle = c.accent; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // light from the top left, so it reads as a ball
    const g = ctx.createRadialGradient(size * 0.36, size * 0.3, r * 0.05, size / 2, size / 2, r);
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, c.shade);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
  }
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
