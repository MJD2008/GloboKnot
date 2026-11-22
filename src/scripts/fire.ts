// The logo on fire (James, 22 Nov 2026: "When playing the Gordian Knot, make the Globoknot logo in the top-left corner
// appear to be on fire"; kept anywhere by those who earned The Gordian Knot's animation). Small flames rise off the
// mark and the word: sparks of light born along the bottom of the logo, rising, swelling and cooling from white-yellow
// through orange to red as they fade, drawn on a little canvas behind it. Added together on a dark page they burn
// bright; on a light page they are drawn plainly, so they still show. With less motion asked for: a still glow (CSS).

const W_PAD = 14, H = 60; // px of canvas round the logo: to each side, and in all (the flames rise above it)
const BELOW = 10;         // px of it below the logo: the hottest part of the fire sits under the word, not on it

interface Flame { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; ember: boolean }

/** Sprites from hot to cool: a soft round light in each colour, drawn once. */
function sprites(dark: boolean): HTMLCanvasElement[] {
  const steps = 12, out: HTMLCanvasElement[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // white-yellow, yellow, orange, red, dark red
    const stops: [number, number, number][] = [[255, 246, 205], [255, 205, 70], [255, 128, 32], [222, 40, 40], [140, 12, 24]];
    const k = t * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(k)), f = k - j;
    const [r, g, b] = stops[j].map((v, n) => Math.round(v + (stops[j + 1][n] - v) * f));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${r},${g},${b},${dark ? 0.75 : 0.9})`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},${dark ? 0.32 : 0.45})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 32, 32);
    out.push(c);
  }
  return out;
}

export function initFire(brand: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fire';
  canvas.setAttribute('aria-hidden', 'true');
  brand.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let flames: Flame[] = [], raf = 0, last = 0, w = 0, dpr = 1, dark = true, looks: HTMLCanvasElement[] = [];

  const burning = () => {
    const b = document.body.classList, r = document.documentElement.classList;
    return (b.contains('gordian') && !b.contains('home')) || r.contains('fx-animation');
  };
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = brand.offsetWidth + 2 * W_PAD;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${H}px`;
  }
  function look() {
    const nowDark = document.body.classList.contains('home') || document.documentElement.dataset.theme === 'dark';
    if (nowDark !== dark || !looks.length) { dark = nowDark; looks = sprites(dark); }
  }
  /** New flames along the bottom edge of the logo, in a few clusters that drift, so the fire has tongues. */
  const roots = [0.06, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9].map(x => ({ x, phase: Math.random() * 6 }));
  function spawn(dt: number, t: number) {
    const base = H - BELOW + 3, n = Math.round(dt * 120 + Math.random());
    for (let i = 0; i < n; i++) {
      const ember = Math.random() < 0.05;
      const r = roots[Math.floor(Math.random() * roots.length)];
      const x = W_PAD + (r.x + Math.sin(t / 700 + r.phase) * 0.03) * (w - 2 * W_PAD) + (Math.random() - 0.5) * 10;
      flames.push({
        x, y: base - Math.random() * 4,
        vx: (Math.random() - 0.5) * 8, vy: -(36 + Math.random() * 30) * (ember ? 1.3 : 1),
        age: 0, life: ember ? 1.2 + Math.random() * 0.6 : 0.55 + Math.random() * 0.4,
        size: ember ? 2.4 : 4 + Math.random() * 4.5, ember,
      });
    }
  }
  function frame(t: number) {
    raf = 0;
    if (!burning() || document.hidden) { stop(); return; }
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    spawn(dt, t);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, H);
    ctx!.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const sway = Math.sin(t / 380) * 6;
    flames = flames.filter(f => (f.age += dt) < f.life);
    for (const f of flames) {
      const k = f.age / f.life;
      f.x += (f.vx + sway * (1 - k)) * dt;
      f.y += f.vy * dt;
      const s = f.ember ? f.size : f.size * (1 - k * 0.65);
      const img = looks[Math.min(looks.length - 1, Math.floor((f.ember ? 0.3 + k * 0.4 : k ** 0.8) * looks.length))];
      // in quickly, bright for half its life, then out
      ctx!.globalAlpha = f.ember ? 1 - k : k < 0.1 ? k / 0.1 : k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
      // a tongue: taller than wide
      if (f.ember) ctx!.drawImage(img, f.x - s, f.y - s, s * 2, s * 2);
      else ctx!.drawImage(img, f.x - s * 0.7, f.y - s * 1.7, s * 1.4, s * 3.4);
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
