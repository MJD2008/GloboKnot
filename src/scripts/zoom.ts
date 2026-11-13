// Zoom and pan for a map. The wheel or a pinch zooms, a drag moves the map, and three small buttons zoom in, out and
// back. On a phone one finger only moves the map once it is zoomed in, so the page can still scroll.
// A gesture first moves and scales the drawing (cheap, every frame); a moment after it ends the map is drawn again,
// sharp, from its new centre and width (WorldMap.settle).
import { H, W, type WorldMap } from './map';

const ICONS = {
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5M5 4.5V9h4.5"/></svg>',
};
const STEP = 1.8; // one press of + or -

export interface Zoom { reset(): void }

export function zoomable(svg: SVGSVGElement, world: WorldMap): Zoom {
  const box = document.createElement('div');
  box.className = 'zoom';
  box.innerHTML = `<button type="button" data-z="in" aria-label="Zoom in" title="Zoom in">${ICONS.in}</button>`
    + `<button type="button" data-z="out" aria-label="Zoom out" title="Zoom out">${ICONS.out}</button>`
    + `<button type="button" data-z="home" aria-label="Back to the first view" title="Back" hidden>${ICONS.home}</button>`;
  svg.after(box);
  const home = box.querySelector<HTMLButtonElement>('[data-z="home"]')!;

  // the pending transform of the drawing: scale k, then move by (tx, ty), in map units
  let k = 1, tx = 0, ty = 0, timer = 0;
  const mine = () => world.drawnIn(svg);
  const layer = () => svg.querySelector<SVGGElement>('.zoomer');
  const apply = (ease = false) => {
    const g = layer();
    if (!g) return;
    g.classList.toggle('ease', ease);
    g.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(4)})`;
  };
  const paint = () => {
    svg.classList.toggle('zoomed', world.zoom > 1.01);
    home.hidden = !world.moved;
    box.querySelector<HTMLButtonElement>('[data-z="in"]')!.disabled = world.zoom >= world.maxZoom * 0.999;
    box.querySelector<HTMLButtonElement>('[data-z="out"]')!.disabled = world.zoom <= world.minZoom * 1.001;
  };
  const settle = () => {
    clearTimeout(timer);
    if (mine() && (k !== 1 || tx || ty)) world.settle(k, tx, ty);
    k = 1; tx = ty = 0;
    paint();
  };
  const soon = (ms = 180) => { clearTimeout(timer); timer = window.setTimeout(settle, ms); };
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  /** Scales by f around p (map units), within the zoom limits. */
  const scale = (f: number, [px, py]: [number, number], ease = false) => {
    const z = world.zoom * k;
    f = Math.min(world.maxZoom, Math.max(world.minZoom, z * f)) / z;
    tx = px - f * (px - tx);
    ty = py - f * (py - ty);
    k *= f;
    apply(ease);
  };

  svg.addEventListener('wheel', e => {
    if (!mine()) return;
    e.preventDefault();
    scale(Math.exp(-e.deltaY * (e.deltaMode ? 0.06 : 0.0022)), at(e));
    soon();
  }, { passive: false });

  const pts = new Map<number, [number, number]>();
  let pinch: { d: number; m: [number, number] } | null = null;
  svg.addEventListener('pointerdown', e => {
    if (!mine() || e.button > 0) return;
    pts.set(e.pointerId, at(e));
    pinch = null;
    clearTimeout(timer);
    try { svg.setPointerCapture(e.pointerId); } catch { /* already gone */ }
  });
  svg.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const now = at(e);
    pts.set(e.pointerId, now);
    if (pts.size === 1) {
      // not zoomed in: a finger is left to scroll the page
      if (e.pointerType === 'touch' && world.zoom * k <= 1.01) return;
      tx += now[0] - prev[0];
      ty += now[1] - prev[1];
      apply();
      svg.classList.add('dragging');
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && pinch.d > 0) {
        tx += m[0] - pinch.m[0];
        ty += m[1] - pinch.m[1];
        scale(d / pinch.d, m);
      }
      pinch = { d, m };
    }
  });
  const up = (e: PointerEvent) => {
    if (!pts.delete(e.pointerId)) return;
    pinch = null;
    svg.classList.remove('dragging');
    if (!pts.size) soon(60);
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);

  box.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-z]');
    if (!b || !mine()) return;
    if (b.dataset.z === 'home') {
      clearTimeout(timer);
      k = 1; tx = ty = 0;
      world.resetView();
      paint();
      return;
    }
    if (k !== 1 || tx || ty) settle();
    scale(b.dataset.z === 'in' ? STEP : 1 / STEP, [W / 2, H / 2], true);
    soon(230); // after the eased step
  });

  return {
    /** A new map was drawn: forget any gesture in progress. */
    reset() { clearTimeout(timer); k = 1; tx = ty = 0; pts.clear(); pinch = null; svg.classList.remove('dragging'); paint(); },
  };
}
