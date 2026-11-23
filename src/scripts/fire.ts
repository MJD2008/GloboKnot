// The logo on fire (James, 22 Nov 2026: "When playing the Gordian Knot, make the Globoknot logo in the top-left corner
// appear to be on fire"; kept anywhere by those who earned The Gordian Knot's animation). Since 23 Nov 2026 only the
// globe burns ("only come out of the globe ... little flames coming out of the globe", in the red of the page): small
// tongues of flame born on the globe's rim, mostly its upper half, rising and fading from a light red through the
// page's crimson to a deep red, drawn on a little canvas behind the mark. Never yellow or orange: drawn over each other
// plainly (not added up, which would turn them yellow). With less motion asked for: nothing moves (a still glow, CSS).

const PAD = 16;   // px of canvas to each side of the mark
const RISE = 22;  // px of canvas above it, for the flames to rise into

interface Flame { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }

type RGB = [number, number, number];
/** "#d0202c" (or "rgb(...)") as numbers; the page's crimson when it can't be read. */
function rgbOf(css: string): RGB {
  const hex = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as RGB;
  const rgb = css.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [208, 32, 44];
}
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;

/** Sprites from just born to dying: a soft round light, from a lighter red through the crimson to a deep red. */
function sprites(red: RGB): HTMLCanvasElement[] {
  const steps = 10, out: HTMLCanvasElement[] = [];
  const stops: RGB[] = [mix(red, [255, 236, 232], 0.35), red, mix(red, [40, 0, 4], 0.55)];
  for (let i = 0; i < steps; i++) {
    const k = (i / (steps - 1)) * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(k));
    const [r, g, b] = mix(stops[j], stops[j + 1], k - j);
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 32, 32);
    out.push(c);
  }
  return out;
}

export function initFire(brand: HTMLElement) {
  const mark = brand.querySelector<SVGSVGElement>('.logo');
  if (!mark) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fire';
  canvas.setAttribute('aria-hidden', 'true');
  brand.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let flames: Flame[] = [], raf = 0, last = 0, w = 0, h = 0, dpr = 1, red = '', looks: HTMLCanvasElement[] = [];
  // the globe in the mark (Base.astro: a circle at 16,14 of r 8.4 in a 32-wide box), in canvas px
  let cx = 0, cy = 0, r = 0;

  const burning = () => {
    const b = document.body.classList, root = document.documentElement.classList;
    return (b.contains('gordian') && !b.contains('home')) || root.contains('fx-animation');
  };
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = mark!.getBoundingClientRect(), at = brand.getBoundingClientRect();
    const k = box.width / 32;
    w = Math.round(box.width + 2 * PAD);
    h = Math.round(box.height + RISE);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.left = `${Math.round(box.left - at.left - PAD)}px`;
    canvas.style.top = `${Math.round(box.top - at.top - RISE)}px`;
    cx = PAD + 16 * k;
    cy = RISE + 14 * k;
    r = 8.4 * k;
  }
  function look() {
    const now = getComputedStyle(brand).getPropertyValue('--crimson');
    if (now !== red || !looks.length) { red = now; looks = sprites(rgbOf(now)); }
  }
  /** New flames on the globe's rim: mostly over its top, a few down its sides, leaning outwards as they rise. */
  function spawn(dt: number) {
    const n = Math.round(dt * 85 + Math.random() * 0.6);
    for (let i = 0; i < n; i++) {
      // an angle round the rim: 0 at the top, ±π/2 at the sides; most near the top
      const a = (Math.random() - 0.5) * Math.PI * 1.35 * Math.sqrt(Math.random());
      const sx = cx + Math.sin(a) * r * 0.92, sy = cy - Math.cos(a) * r * 0.92;
      flames.push({
        x: sx, y: sy,
        vx: Math.sin(a) * (6 + Math.random() * 6), vy: -(16 + Math.random() * 16) * (0.6 + 0.4 * Math.cos(a)),
        age: 0, life: 0.42 + Math.random() * 0.45, size: 2 + Math.random() * 2.6 * (0.6 + 0.4 * Math.cos(a)),
      });
    }
  }
  function frame(t: number) {
    raf = 0;
    if (!burning() || document.hidden) { stop(); return; }
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    spawn(dt);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, h);
    ctx!.globalCompositeOperation = 'source-over';
    const sway = Math.sin(t / 300) * 3;
    flames = flames.filter(f => (f.age += dt) < f.life);
    for (const f of flames) {
      const k = f.age / f.life;
      f.x += (f.vx + sway * k) * dt;
      f.y += f.vy * dt;
      const s = f.size * (1 - k * 0.55);
      const img = looks[Math.min(looks.length - 1, Math.floor(k ** 0.85 * looks.length))];
      // in quickly, then out
      ctx!.globalAlpha = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      // a tongue: taller than wide
      ctx!.drawImage(img, f.x - s * 0.75, f.y - s * 1.9, s * 1.5, s * 3.6);
    }
    ctx!.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || still.matches) return;
    size();
    look();
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    flames = [];
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
  }
  function check() {
    const on = burning();
    canvas.hidden = !on;
    if (on && !document.hidden) { look(); start(); } else stop();
  }
  const watch = new MutationObserver(check);
  watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  document.addEventListener('visibilitychange', check);
  addEventListener('resize', () => { if (raf) size(); });
  still.addEventListener?.('change', check);
  check();
}
