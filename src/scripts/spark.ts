// The Gordian Knot's crimson, charged (James, 22 Nov 2026: "Could the red colour when you select atlas + all, also
// make a heartbeat and/or have electric effects bulging out where possible?"). Once Atlas and All are picked, the All
// button and Play beat like the round's heart (lub-dub, every 1.3 s; global.css, .charged), and on each beat a few
// small sparks leap out of their edges and die away within a tenth of a second or so. Small and few, so nothing
// flashes; none at all for someone who asked their device for less motion.

const BEAT = 1300; // ms: the heartbeat of The Gordian Knot's round
const NS = 'http://www.w3.org/2000/svg';
const M = 40;      // px round the element the sparks may reach
const live = new Map<HTMLElement, number>();

/** Charges an element (true) or lets it go (false). */
export function charge(el: HTMLElement, on: boolean) {
  el.classList.toggle('charged', on);
  const timer = live.get(el);
  if (!on) {
    if (timer) { clearInterval(timer); live.delete(el); el.querySelector(':scope > .sparks')?.remove(); }
    return;
  }
  if (timer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let svg = el.querySelector<SVGSVGElement>(':scope > .sparks');
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    svg.classList.add('sparks');
    svg.setAttribute('aria-hidden', 'true');
    el.append(svg);
  }
  const s = svg;
  // On the "lub" two or three sparks, on the "dub" (a third of a beat later) one or two.
  const beat = () => {
    if (!el.isConnected || !el.offsetParent || document.hidden) return;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) window.setTimeout(() => zap(el, s), i * 45);
    window.setTimeout(() => zap(el, s), BEAT * 0.3);
    window.setTimeout(() => zap(el, s), BEAT * 0.3 + 50);
  };
  // In step with the CSS heartbeat, which starts with the class.
  live.set(el, window.setInterval(beat, BEAT));
  window.setTimeout(beat, 60);
}

/** One spark: a jagged line from a point on the edge, out and away from it, sometimes forking. */
function zap(el: HTMLElement, svg: SVGSVGElement) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  svg.setAttribute('viewBox', `${-M} ${-M} ${w + 2 * M} ${h + 2 * M}`);
  // A point on the edge, more likely on the long sides; and the way out from there.
  const per = 2 * (w + h), d = Math.random() * per;
  let x: number, y: number, nx: number, ny: number;
  if (d < w) { x = d; y = 0; nx = 0; ny = -1; }
  else if (d < w + h) { x = w; y = d - w; nx = 1; ny = 0; }
  else if (d < 2 * w + h) { x = w - (d - w - h); y = h; nx = 0; ny = 1; }
  else { x = 0; y = h - (d - 2 * w - h); nx = -1; ny = 0; }
  const r = Math.min(14, h / 2); // the rounded corners: start a little inside them
  x = Math.max(r * 0.4, Math.min(w - r * 0.4, x));
  y = Math.max(r * 0.4, Math.min(h - r * 0.4, y));
  const len = 16 + Math.random() * (M - 16);
  const tilt = (Math.random() - 0.5) * 0.9; // leaning a little to one side
  const dx = nx - ny * tilt, dy = ny + nx * tilt, k = Math.hypot(dx, dy);
  const line = (x0: number, y0: number, ux: number, uy: number, l: number, steps: number) => {
    const pts = [[x0, y0]];
    for (let i = 1; i <= steps; i++) {
      const t = (l * i) / steps, j = (Math.random() - 0.5) * 10 * (i < steps ? 1 : 0.4);
      pts.push([x0 + ux * t - uy * j, y0 + uy * t + ux * j]);
    }
    return pts;
  };
  const main = line(x, y, dx / k, dy / k, len, 5 + Math.floor(Math.random() * 2));
  const paths = [main];
  if (Math.random() < 0.6) { // a fork from the middle
    const [fx, fy] = main[2], side = Math.random() < 0.5 ? 1 : -1;
    const ux = dx / k - (dy / k) * 0.8 * side, uy = dy / k + (dx / k) * 0.8 * side, q = Math.hypot(ux, uy);
    paths.push(line(fx, fy, ux / q, uy / q, len * 0.45, 2));
  }
  const g = document.createElementNS(NS, 'g');
  const d2 = paths.map(p => 'M' + p.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L')).join('');
  g.innerHTML = `<path class="glow" d="${d2}"/><path class="core" d="${d2}"/>`;
  svg.append(g);
  window.setTimeout(() => g.remove(), 280);
}
