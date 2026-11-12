// The administrative map: an orthographic globe turned and zoomed to the asked country.
// Natural Earth 1:50m (public domain) via world-atlas; tiny countries get a ring so they can be found.
import { geoArea, geoCentroid, geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects, GeoStream } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

type Shape = Feature<Polygon | MultiPolygon, { n: string }>;
type LonLat = [number, number];

const W = 640, H = 400, PAD = 12;
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

  constructor(topology: any) {
    const fc = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { n: string }>;
    this.shapes = fc.features as Shape[];
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

  /** Draws the globe into `svg`, centred on the country with ISO numeric code `num` (or on `ll` if it has no shape). */
  render(svg: SVGSVGElement, num: string, ll: [number, number]) {
    const target = this.byNum.get(num);
    const main = target ? mainPart(target) : null;
    const center: LonLat = main ? (geoCentroid(main) as LonLat) : [ll[1], ll[0]];
    let reach = 0; // how far (degrees) the country's main part reaches from its centre
    if (main) for (const p of main.coordinates[0]) reach = Math.max(reach, geoDistance(center, p as LonLat) * RAD);
    // Zoom out until a large landmass is in view too: a small island alone in the sea can't be recognised,
    // but Nauru between New Guinea and the Marshall Islands can.
    const radius = Math.min(60, Math.max(7, reach * 1.5 + 2, this.nearestLandmark(center, target) * 1.1 + 4));

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
    let land = '';
    for (const s of this.shapes) {
      if (s === target) continue;
      const cap = this.caps.get(s)!;
      if (geoDistance(center, cap.c) - cap.r > view) continue;
      land += path(s) ?? '';
    }
    parts.push(`<path class="land" d="${land}"/>`);
    if (target) parts.push(`<path class="land hl" d="${path(target) ?? ''}"/>`);
    // Tiny or shapeless countries: a ring around them.
    const [[x0, y0], [x1, y1]] = main ? geoPath(projection).bounds(main) : [[0, 0], [0, 0]];
    if (!main || Math.max(x1 - x0, y1 - y0) < 12) {
      const pt = projection(center);
      if (pt) parts.push(`<circle class="ring" cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="15"/>`);
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = parts.join('');
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
