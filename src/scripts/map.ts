// The map: an orthographic globe turned and zoomed to what is asked (a country, a capital, a peak, a river).
// Natural Earth 1:50m (public domain) via world-atlas; tiny countries get a ring so they can be found.
import { geoArea, geoCentroid, geoCircle, geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects, GeoStream } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

type Shape = Feature<Polygon | MultiPolygon, { n: string }>;
type LonLat = [number, number];
/** A country's name on the map (ISO numeric code); the main one is the country the map is about. */
export interface MapLabel { num: string; name: string; main?: boolean }
/** What a map shows: a country (ISO numeric code, its position [lat, lng]), a capital's dot, a peak or a river, and
 *  the names of countries in view (the answers do: a country with its neighbours around it). Or a practice set
 *  (`set`), in a view given (`view`) and a frame of its own size (`size`, in map units). */
export interface MapOptions {
  num?: string; ll?: [number, number]; dot?: [number, number]; peak?: [number, number]; river?: string; labels?: MapLabel[];
  set?: MapSet; view?: { center: LonLat; radius: number }; size?: [number, number];
}
/** A practice set on the map: its countries (ISO numeric codes, with their positions) or its rivers; the ones found
 *  light up with their names, and after giving up the ones missed show in red. */
export interface MapSet { countries?: Map<string, [number, number]>; rivers?: string[]; found: Set<string>; missed: Set<string>; names: Map<string, string> }
/** The view of the map last drawn: where it is centred and how wide (degrees), where it started, and its frame. */
interface View { svg: SVGSVGElement; o: MapOptions; center: LonLat; radius: number; home: LonLat; base: number; revealed: string[]; w: number; h: number }

export const W = 640, H = 400;
const PAD = 12;
const RAD = 180 / Math.PI;
/** A single landmass from about 50,000 km² (steradians) counts as a landmark that helps place a small country. */
const BIG = (50_000 / 510.1e6) * 4 * Math.PI;

export class WorldMap {
  private readonly shapes: Shape[];
  private readonly byNum = new Map<string, Shape>();
  /** Each shape's bounding cap on the globe, to skip shapes that are nowhere near the view. */
  private readonly caps = new Map<Shape, { c: LonLat; r: number }>();
  /** Large single landmasses (Great Britain, New Guinea, Madagascar...) with the country they belong to. */
  private readonly landmarks: { owner: Shape; ring: Position[] }[] = [];
  /** The countries as land and the borders between them, for the home globe zoomed in. */
  readonly detail: { land: GeoPermissibleObjects; borders: GeoPermissibleObjects };

  constructor(topology: any) {
    const fc = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { n: string }>;
    this.shapes = fc.features as Shape[];
    this.detail = { land: fc as GeoPermissibleObjects, borders: mesh(topology, topology.objects.countries, (a: unknown, b: unknown) => a !== b) as GeoPermissibleObjects };
    for (const s of this.shapes) {
      if (s.id != null) this.byNum.set(String(s.id), s);
      const c = geoCentroid(s) as LonLat;
      let r = 0;
      for (const rings of polygons(s)) {
        for (const p of rings[0]) r = Math.max(r, geoDistance(c, p as LonLat));
        if (polygonArea(rings) >= BIG) this.landmarks.push({ owner: s, ring: rings[0] });
      }
      this.caps.set(s, { c, r });
    }
  }

  /** A country's shape at 1:50m by its numeric code (ISO 3166), for the home globe zoomed in. */
  shape(num: string): GeoPermissibleObjects | null { return (this.byNum.get(num) as GeoPermissibleObjects | undefined) ?? null; }

  /** The country at a point on the globe ([lon, lat]): its numeric code (ISO 3166) and its shape. */
  countryAt(p: LonLat): { num: string; shape: GeoPermissibleObjects } | null {
    for (const s of this.shapes) {
      const cap = this.caps.get(s)!;
      if (s.id == null || geoDistance(cap.c, p) > cap.r + 0.002) continue;
      if (geoContains(s, p)) return { num: String(s.id), shape: s };
    }
    return null;
  }

  /** A small outline of a country (its mainland and the islands near it) with its capital as a dot, for the
   *  answers list. Tiny countries, a few points at this scale, get a ring as on the map. */
  thumb(num: string, dot?: [number, number]): string {
    const svg = (inner: string) => `<svg class="thumb" viewBox="0 0 40 30" aria-hidden="true">${inner}</svg>`;
    const ring = svg(`<circle class="tiny" cx="20" cy="15" r="8"/>${dot ? '<circle cx="20" cy="15" r="2.6"/>' : ''}`);
    const s = this.byNum.get(num);
    if (!s) return ring;
    const c = geoCentroid(mainPart(s)) as LonLat;
    const near = polygons(s).filter(rings => {
      const p: Polygon = { type: 'Polygon', coordinates: rings };
      return geoArea(p) < 2 * Math.PI && geoDistance(geoCentroid(p) as LonLat, c) < 10 / RAD;
    });
    if (near.reduce((n, rings) => n + rings[0].length, 0) < 24) return ring;
    const shape: MultiPolygon = { type: 'MultiPolygon', coordinates: near };
    const projection = geoOrthographic().rotate([-c[0], -c[1]]).fitExtent([[3, 3], [37, 27]], shape);
    const path = geoPath({ stream: (out: GeoStream) => projection.stream(thin(out, 0.6)) }).digits(1);
    const p = dot ? projection([dot[1], dot[0]]) : null;
    return svg(`<path d="${path(shape) ?? ''}"/>${p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6"/>` : ''}`);
  }

  /** River courses by id ([lon, lat] lines), loaded when a round has river questions. */
  rivers: Record<string, LonLat[][]> = {};
  private last: { path: ReturnType<typeof geoPath>; svg: SVGSVGElement; projection: ReturnType<typeof geoOrthographic> } | null = null;
  private view: View | null = null;

  /**
   * Draws the globe into `svg`. What it centres on, in order: a river's course, the country with ISO numeric code
   * `num` (its capital marked with `dot`), or a `peak`. Positions are [lat, lng].
   */
  render(svg: SVGSVGElement, o: MapOptions) {
    const target = o.num ? this.byNum.get(o.num) : undefined;
    const main = target ? mainPart(target) : null;
    const course = o.river ? this.rivers[o.river] : undefined;
    let center: LonLat, radius: number;
    if (o.view) ({ center, radius } = o.view);
    else if (course?.length) {
      // The whole course in view, with a little land around it.
      const line = { type: 'MultiLineString', coordinates: course } as const;
      center = geoCentroid(line) as LonLat;
      let reach = 0;
      for (const l of course) for (const p of l) reach = Math.max(reach, geoDistance(center, p) * RAD);
      radius = Math.min(60, Math.max(6, reach * 1.12 + 1.5));
    } else if (main || !o.peak) {
      center = main ? (geoCentroid(main) as LonLat) : [o.ll?.[1] ?? 0, o.ll?.[0] ?? 0];
      let reach = 0; // how far (degrees) the country's main part reaches from its centre
      if (main) for (const p of main.coordinates[0]) reach = Math.max(reach, geoDistance(center, p as LonLat) * RAD);
      // Zoom out until a large landmass is in view too: a small island alone in the sea can't be recognised,
      // but Nauru between New Guinea and the Marshall Islands can.
      radius = Math.min(60, Math.max(7, reach * 1.5 + 2, this.nearestLandmark(center, target) * 1.1 + 4));
      // The capital's dot well inside the view, also when it lies away from the mainland (Kuala Lumpur, west of the
      // Malaysian part of Borneo).
      if (o.dot) radius = Math.min(60, Math.max(radius, geoDistance(center, [o.dot[1], o.dot[0]]) * RAD * 1.25 + 1));
    } else {
      // A peak: enough of the region around it to tell which country it is in.
      center = [o.peak[1], o.peak[0]];
      radius = Math.min(60, Math.max(11, this.nearestLandmark(center) * 1.1 + 5));
    }
    const [w, h] = o.size ?? [W, H];
    this.view = { svg, o, center, radius, home: center, base: radius, revealed: [], w, h };
    this.draw();
  }

  /** Draws the map in view again, as it is now (a practice set with one more found). */
  redraw() { if (this.view) this.draw(); }
  /** The frame of the map in view, in map units. */
  get size(): [number, number] { return this.view ? [this.view.w, this.view.h] : [W, H]; }

  // ---- zoom: a gesture first scales and moves the drawing (cheap), then settle() draws it again, sharp, from the
  // new centre and width. Drawing takes tens of milliseconds, too slow for every frame of a pinch.
  /** How far the view is zoomed in: 1 as first drawn, above 1 closer. */
  get zoom(): number { return this.view ? this.view.base / this.view.radius : 1; }
  /** Zoom limits: in to a sixth of the first width (no closer than 0.8°), out to a whole hemisphere. */
  get minZoom(): number { return this.view ? this.view.base / 90 : 1; }
  get maxZoom(): number { return this.view ? this.view.base / Math.max(0.8, this.view.base / 6) : 1; }
  /** Whether the view was zoomed or moved since it was first drawn. */
  get moved(): boolean {
    const v = this.view;
    return !!v && (Math.abs(v.radius - v.base) > 1e-6 || geoDistance(v.center, v.home) > 1e-6);
  }
  /** Whether the map in view is the one drawn in `svg` (the quiz and the answers each have one). */
  drawnIn(svg: SVGSVGElement): boolean { return this.view?.svg === svg; }

  /** Turns a gesture's transform of the drawing (scale `k`, then move by `tx`, `ty` in map units) into a new centre
   *  and width, and draws the map again. */
  settle(k: number, tx: number, ty: number) {
    const v = this.view, p = this.last?.projection;
    if (!v || !p) return;
    const c = p.invert?.([(v.w / 2 - tx) / k, (v.h / 2 - ty) / k]);
    if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) v.center = [c[0], Math.max(-89, Math.min(89, c[1]))];
    v.radius = Math.min(90, Math.max(Math.max(0.8, v.base / 6), v.radius / k));
    this.draw();
  }

  /** Back to the view as first drawn. */
  resetView() {
    if (!this.view) return;
    this.view.center = this.view.home;
    this.view.radius = this.view.base;
    this.draw();
  }

  private draw() {
    const v = this.view!;
    const { svg, o, center, radius, w: W, h: H } = v;
    const target = o.num ? this.byNum.get(o.num) : undefined;
    const main = target ? mainPart(target) : null;
    const course = o.river ? this.rivers[o.river] : undefined;
    const projection = geoOrthographic()
      .rotate([-center[0], -center[1]])
      .fitExtent([[PAD, PAD], [W - PAD, H - PAD]], geoCircle().center(center).radius(radius)() as GeoPermissibleObjects)
      .clipExtent([[-4, -4], [W + 4, H + 4]]); // drop what falls outside the frame
    // Points closer than half a pixel add nothing you can see, only drawing time: leave them out.
    const path = geoPath({ stream: (out: GeoStream) => projection.stream(thin(out, 0.5)) }).digits(1);
    const view = radius >= 40 ? Math.PI : (radius * 2 + 3) / RAD; // how far from the centre anything can show

    const parts: string[] = [];
    parts.push(`<path class="ocean" d="${path({ type: 'Sphere' }) ?? ''}"/>`);
    parts.push(`<path class="grat" d="${path(geoGraticule10()) ?? ''}"/>`);
    const set = o.set, own = set?.countries;
    let land = '';
    for (const s of this.shapes) {
      if (s === target || own?.has(String(s.id))) continue;
      const cap = this.caps.get(s)!;
      if (geoDistance(center, cap.c) - cap.r > view) continue;
      land += path(s) ?? '';
    }
    parts.push(`<path class="land" d="${land}"/>`);
    // A practice set's countries each on their own, lit up once found; the smallest also as a dot, to be seen.
    if (set && own) {
      const state = (n: string) => (set.found.has(n) ? ' found' : set.missed.has(n) ? ' missed' : '');
      const flat = geoPath(projection);
      let dots = '';
      for (const [n, at] of own) {
        const s = this.byNum.get(n), cls = state(n);
        if (s) {
          const cap = this.caps.get(s)!;
          if (geoDistance(center, cap.c) - cap.r > view) continue;
          parts.push(`<path class="land set${cls}" d="${path(s) ?? ''}"/>`);
        }
        const [[x0, y0], [x1, y1]] = s ? flat.bounds(mainPart(s)) : [[0, 0], [0, 0]];
        if (s && Math.max(x1 - x0, y1 - y0) >= 7) continue;
        const pt = projection(s ? (geoCentroid(mainPart(s)) as LonLat) : [at[1], at[0]]);
        if (pt && pt[0] > -8 && pt[0] < W + 8 && pt[1] > -8 && pt[1] < H + 8) dots += `<circle class="set-dot${cls}" cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="4.5"/>`;
      }
      parts.push(dots);
    }
    if (target) parts.push(`<path class="land hl" d="${path(target) ?? ''}"/>`);
    parts.push(`<g class="rv">${this.revealPath(path, v.revealed)}</g>`);
    // Tiny or shapeless countries: a ring around them (not needed when the capital's dot marks the spot).
    let ring: [number, number] | null = null;
    if (!set && (target || (!o.peak && !course))) {
      const [[x0, y0], [x1, y1]] = main ? geoPath(projection).bounds(main) : [[0, 0], [0, 0]];
      if ((!main || Math.max(x1 - x0, y1 - y0) < 12) && !o.dot) {
        ring = projection(v.home);
        if (ring) parts.push(`<circle class="ring" cx="${ring[0].toFixed(1)}" cy="${ring[1].toFixed(1)}" r="15"/>`);
      }
    }
    if (course?.length) {
      const d = path({ type: 'MultiLineString', coordinates: course }) ?? '';
      parts.push(`<path class="river-case" d="${d}"/><path class="river" d="${d}"/>`);
    }
    // A practice set's rivers: all of them faint, those found in blue with their names, those missed in red.
    let riverNames = '';
    if (set?.rivers) {
      const order = [...set.rivers].sort((a, b) => Number(set.found.has(a) || set.missed.has(a)) - Number(set.found.has(b) || set.missed.has(b)));
      const taken: [number, number, number, number][] = [];
      for (const id of order) {
        const lines = this.rivers[id];
        if (!lines?.length) continue;
        const d = path({ type: 'MultiLineString', coordinates: lines }) ?? '';
        if (!d) continue;
        const cls = set.found.has(id) ? ' found' : set.missed.has(id) ? ' missed' : '';
        parts.push(`<path class="river-case" d="${d}"/><path class="river set${cls}" d="${d}"/>`);
        const name = cls ? set.names.get(id) : '';
        if (name) riverNames += this.riverName(projection, lines, name, taken, W, H);
      }
    }
    if (o.dot) {
      const pt = projection([o.dot[1], o.dot[0]]);
      if (pt) parts.push(`<g class="dot" transform="translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)})"><circle class="pulse" r="9"/><circle r="5.5"/></g>`);
    }
    if (o.peak) {
      const pt = projection([o.peak[1], o.peak[0]]);
      if (pt) parts.push(`<g class="peak" transform="translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)})"><circle class="pulse" r="12"/><path d="M0-9 9 6H-9z"/></g>`);
    }
    if (o.labels?.length) parts.push(this.names(svg, projection, o.labels, !!ring));
    if (set?.countries) parts.push(this.names(svg, projection, [...set.found, ...set.missed].map(num => ({ num, name: set.names.get(num) ?? '' })), false, true));
    if (riverNames) parts.push(`<g class="names">${riverNames}</g>`);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // One group around everything, so a pinch or a drag can move the drawing before it is drawn again.
    svg.innerHTML = `<g class="zoomer">${parts.join('')}</g>`;
    this.last = { path, svg, projection };
  }

  /** Country names, each in the middle of the part of its country in view: the main country first, then the larger
   *  ones. A name that would cover another moves just above or below; if it still can't fit, or only a sliver of its
   *  country shows at the edge, it is left out. The main country is only named when its name fits inside it: a small
   *  one stays visible (it is lit up, and named next to the map anyway). Sizes are in map units, worked out from the
   *  width the map is shown at (the
   *  box around it: a dialog that is still growing into view would give a smaller width), so a name reads at about
   *  12.5 px on a phone and on a wide screen alike. */
  private names(svg: SVGSVGElement, projection: ReturnType<typeof geoOrthographic>, labels: MapLabel[], ring: boolean, small = false): string {
    const { w: W, h: H } = this.view!;
    const shown = svg.parentElement?.clientWidth || svg.getBoundingClientRect().width || W;
    const k = W / shown; // map units per pixel on screen
    const flat = geoPath(projection);
    const items = labels.flatMap(l => {
      const s = this.byNum.get(l.num);
      if (!s) return [];
      const m = mainPart(s); // France is named in France, not between it and French Guiana
      const [x, y] = flat.centroid(m);
      return Number.isFinite(x) && Number.isFinite(y) ? [{ ...l, x, y, area: flat.area(m), box: flat.bounds(m) }] : [];
    }).sort((a, b) => Number(!!b.main) - Number(!!a.main) || b.area - a.area);
    const taken: [number, number, number, number][] = [];
    const edge = 16 * k, gap = 3 * k;
    let out = '';
    for (const it of items) {
      if (!it.main && (it.x < edge || it.x > W - edge || it.y < edge || it.y > H - edge)) continue;
      const size = (it.main ? 13.5 : small ? 11 : 12.5) * k;
      const w = it.name.length * size * 0.58 + 2 * gap, h = size * 1.25;
      if (it.main && (ring || it.box[1][0] - it.box[0][0] < w * 1.1 || it.box[1][1] - it.box[0][1] < h * 1.8)) continue;
      for (const dy of it.main ? [0] : [0, -h, h]) {
        const cx = Math.min(Math.max(it.x, w / 2 + gap), W - w / 2 - gap);
        const cy = Math.min(Math.max(it.y + dy, h / 2 + gap), H - h / 2 - gap);
        const box: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (taken.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
        taken.push(box);
        out += `<text class="name${it.main ? ' main' : ''}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" style="font-size:${size.toFixed(1)}px;stroke-width:${(3.2 * k).toFixed(1)}px">${escapeXml(it.name)}</text>`;
        break;
      }
    }
    return `<g class="names">${out}</g>`;
  }

  /** A river's name by its course, near the middle of the part in view, unless it would cover another name. */
  private riverName(projection: ReturnType<typeof geoOrthographic>, lines: LonLat[][], name: string, taken: [number, number, number, number][], W: number, H: number): string {
    const k = W / (this.view!.svg.parentElement?.clientWidth || W);
    const pts = lines.flat().map(p => projection(p)).filter((p): p is [number, number] => !!p && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H);
    if (!pts.length) return '';
    const [x, y] = pts[Math.floor(pts.length / 2)];
    const size = 11 * k, w = name.length * size * 0.58 + 6 * k, h = size * 1.25;
    const cx = Math.min(Math.max(x, w / 2 + 3), W - w / 2 - 3), cy = Math.min(Math.max(y - h * 0.6, h / 2 + 3), H - h / 2 - 3);
    const box: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    if (taken.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) return '';
    taken.push(box);
    return `<text class="name river-name" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" style="font-size:${size.toFixed(1)}px;stroke-width:${(3.2 * k).toFixed(1)}px">${escapeXml(name)}</text>`;
  }

  /** After an answer: lights up these countries (ISO numeric codes) on the map just drawn. */
  reveal(nums: string[]) {
    if (!this.last || !this.view) return;
    this.view.revealed = nums;
    const g = this.last.svg.querySelector('.rv');
    if (g) g.innerHTML = this.revealPath(this.last.path, nums);
  }

  private revealPath(path: ReturnType<typeof geoPath>, nums: string[]): string {
    const d = nums.map(n => this.byNum.get(n)).filter((s): s is Shape => !!s).map(s => path(s) ?? '').join('');
    return d ? `<path class="land shown" d="${d}"/>` : '';
  }

  /** Degrees from `center` to the closest large landmass that doesn't belong to `self`. */
  private nearestLandmark(center: LonLat, self?: Shape): number {
    let best = Infinity;
    for (const { owner, ring } of this.landmarks) {
      if (owner === self) continue;
      for (const p of ring) {
        const d = geoDistance(center, p as LonLat);
        if (d < best) best = d;
      }
    }
    return best * RAD;
  }
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function polygons(s: Shape): Position[][][] {
  return s.geometry.type === 'Polygon' ? [s.geometry.coordinates] : s.geometry.coordinates;
}

/** The largest polygon of a country (its mainland), so overseas parts don't pull the view away. */
function mainPart(s: Shape): Polygon {
  let best: Position[][] = polygons(s)[0], bestArea = -1;
  for (const rings of polygons(s)) {
    const a = polygonArea(rings);
    if (a > bestArea) { bestArea = a; best = rings; }
  }
  return { type: 'Polygon', coordinates: best };
}

/** Spherical area of one polygon. A ring wound the other way round (some islands on the 180° line) would
 *  measure as the whole globe minus the island, so the smaller of the two is the island. */
function polygonArea(rings: Position[][]): number {
  const a = geoArea({ type: 'Polygon', coordinates: rings });
  return Math.min(a, 4 * Math.PI - a);
}

/** A stream step that drops points within `tol` pixels of the last one kept (a line's last point is always kept). */
function thin(out: GeoStream, tol: number): GeoStream {
  let inLine = false, x0 = NaN, y0 = NaN, held: [number, number] | null = null;
  return {
    point(x, y) {
      if (!inLine) { out.point(x, y); return; }
      if (Number.isNaN(x0) || Math.abs(x - x0) + Math.abs(y - y0) >= tol) {
        out.point(x, y); x0 = x; y0 = y; held = null;
      } else held = [x, y];
    },
    lineStart() { inLine = true; x0 = y0 = NaN; held = null; out.lineStart(); },
    lineEnd() { if (held) out.point(held[0], held[1]); inLine = false; out.lineEnd(); },
    polygonStart() { out.polygonStart(); },
    polygonEnd() { out.polygonEnd(); },
    sphere() { out.sphere?.(); },
  };
}
