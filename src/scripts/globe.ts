// The start screen's globe: it turns slowly while chains of neighbouring countries get tied together,
// the same kind of links the quiz is built on. Canvas, Natural Earth 1:110m land (public domain).
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';

type LonLat = [number, number];
interface Chain { points: LonLat[]; born: number }

const SPIN = 4.5;     // degrees per second
const TILT = -22;     // looks a little from the north, where most land is
const STEP = 380;     // ms to draw one link
const LIFE = 8200;    // ms a chain stays before it fades
const FADE = 900;
const EVERY = 2600;   // ms between new chains
const RAD = Math.PI / 180;

export class Globe {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly land: GeoPermissibleObjects;
  private readonly grat = geoGraticule10();
  private readonly projection = geoOrthographic().clipAngle(90).precision(0.7);
  private readonly path;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private chains: Chain[] = [];
  private lambda = -35; // starts facing Europe, Africa and the Middle East
  private last = 0;
  private lastChain = -Infinity;
  private raf = 0;
  private running = false;
  private size = 0;
  private dpr = 1;
  private colors = { ocean: '', land: '', coast: '', grat: '', accent: '', dot: '', shade: '', light: '' };
  /** Picks the next chain near a point (lon, lat); returns [] when it has nothing. */
  chainNear: ((lon: number, lat: number) => LonLat[]) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, topology: any) {
    this.ctx = canvas.getContext('2d')!;
    this.land = feature(topology, topology.objects.land) as unknown as GeoPermissibleObjects;
    this.path = geoPath(this.projection, this.ctx);
    new ResizeObserver(() => { this.resize(); if (!this.running) this.draw(performance.now()); }).observe(canvas);
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener?.('change', () => { this.readColors(); this.draw(performance.now()); });
    this.readColors();
    this.resize();
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
  }

  private tick(t: number) {
    const dt = Math.min(64, t - this.last);
    this.last = t;
    this.lambda = (this.lambda + (SPIN * dt) / 1000) % 360;
    if (t - this.lastChain > EVERY) this.spawn(t);
    this.chains = this.chains.filter(c => t - c.born < LIFE + FADE);
    this.draw(t);
  }

  /** A new chain a little ahead of the centre, so it drifts across the face of the globe. */
  private spawn(t: number) {
    this.lastChain = t;
    if (!this.chainNear) return;
    const lon = -this.lambda - 25, lat = -TILT;
    const points = this.chainNear(lon, lat);
    if (points.length > 1) this.chains.push({ points, born: t });
  }

  private resize() {
    const css = this.canvas.clientWidth;
    if (!css) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = Math.round(css * this.dpr);
    this.canvas.width = this.canvas.height = this.size;
  }

  private readColors() {
    const st = getComputedStyle(this.canvas);
    const v = (name: string) => st.getPropertyValue(name).trim();
    const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light'
      || document.documentElement.dataset.theme === 'dark';
    this.colors = {
      ocean: v('--ocean'), land: v('--land'), coast: v('--border'), grat: v('--grat'), accent: v('--accent'),
      dot: v('--surface'),
      light: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)',
      shade: dark ? 'rgba(0,0,0,0.35)' : 'rgba(20,40,70,0.10)',
    };
  }

  private draw(t: number) {
    const { ctx, size, colors: c } = this;
    if (!size) return;
    const r = size / 2 - 2 * this.dpr;
    this.projection.scale(r).translate([size / 2, size / 2]).rotate([this.lambda, TILT]);
    ctx.clearRect(0, 0, size, size);

    // sea, grid, land
    ctx.beginPath(); this.path({ type: 'Sphere' }); ctx.fillStyle = c.ocean; ctx.fill();
    ctx.beginPath(); this.path(this.grat); ctx.strokeStyle = c.grat; ctx.lineWidth = this.dpr; ctx.stroke();
    ctx.beginPath(); this.path(this.land); ctx.fillStyle = c.land; ctx.fill();
    ctx.strokeStyle = c.coast; ctx.lineWidth = 0.8 * this.dpr; ctx.stroke();

    // the chains
    const center: LonLat = [-this.lambda, -TILT];
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

    // light from the top left, so it reads as a ball
    const g = ctx.createRadialGradient(size * 0.36, size * 0.3, r * 0.05, size / 2, size / 2, r);
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, c.shade);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
  }
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
