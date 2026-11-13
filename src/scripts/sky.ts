// The night sky behind the home screen. Stars appear, twinkle and fade; now and then one shoots across. Point at a
// star (or tap it) and it lights up, tied to its nearest stars like a constellation; sweep across the sky and the
// stars you pass are tied one to the next. Tap the empty sky and a new star appears there. The same idea as the quiz:
// things tied together.

interface Star {
  x: number; y: number;  // css px
  r: number;             // radius, css px
  base: number;          // brightness 0..1
  tw: number; ph: number; // twinkle speed and phase
  born: number; life: number;
  lit: number;           // when it was last lit (ms), or -Infinity
}
interface Link { a: Star; b: Star; born: number }
interface Meteor { x: number; y: number; vx: number; vy: number; born: number }

const PER_PX = 1 / 1700;   // stars per css px²
const FADE = 2600;         // ms to appear or fade away
const LINK_GROW = 260;     // ms for a line to reach the next star
const LINK_LIFE = 3600;    // ms a line stays
const LINK_FADE = 1400;
const NEAR = 170;          // px: a lit star ties itself to stars this close
const TRAIL = 240;         // px: sweeping from one star to the next ties them
const METEOR_LIFE = 900;

export class Sky {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private links: Link[] = [];
  private meteor: Meteor | null = null;
  private nextMeteor = 0;
  private lastLit: { s: Star; t: number } | null = null;
  private raf = 0;
  private running = false;
  private accent = '#ff7447';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => { this.resize(); if (!this.running) this.draw(performance.now()); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else if (this.wanted) this.play();
    });
    // Hover (mouse) lights the star under the pointer; a tap or click lights one or makes a new one.
    window.addEventListener('pointermove', e => {
      if (!this.wanted || e.pointerType !== 'mouse' || e.buttons) return;
      this.touch(e.clientX, e.clientY, false);
    }, { passive: true });
    window.addEventListener('pointerdown', e => {
      if (!this.wanted || (e.target as HTMLElement).closest('button, a, input, label, dialog, canvas.globe, .chips')) return;
      this.touch(e.clientX, e.clientY, true);
    }, { passive: true });
  }

  private wanted = false;

  /** Start (the home screen is shown). */
  play() {
    this.wanted = true;
    this.readAccent();
    if (this.running || document.hidden) return;
    this.running = true;
    const frame = (t: number) => {
      if (!this.running) return;
      this.draw(t);
      // With reduced motion the sky stands still; it only redraws while lines are on it.
      if (this.still && !this.links.length) { this.running = false; return; }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stop (another screen is shown). */
  pause() {
    this.wanted = false;
    this.stop();
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** The accent colour may change in Settings. */
  readAccent() {
    this.accent = getComputedStyle(this.canvas).getPropertyValue('--glow').trim() || this.accent;
  }

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const want = Math.round(this.w * this.h * PER_PX);
    const now = performance.now();
    this.stars = this.stars.filter(s => s.x < this.w && s.y < this.h).slice(0, want);
    // At first the sky is already full: stars are born at random moments in the past.
    while (this.stars.length < want) this.stars.push(this.star(now - Math.random() * 30000));
  }

  private star(t: number, x?: number, y?: number): Star {
    // A third of the stars gather along a faint band, like the Milky Way.
    let sx = x, sy = y;
    if (sx === undefined || sy === undefined) {
      sx = Math.random() * this.w;
      sy = Math.random() * this.h;
      if (Math.random() < 0.33) {
        const along = Math.random(), off = (Math.random() + Math.random() + Math.random() - 1.5) * 0.16 * this.h;
        sx = along * this.w;
        sy = this.h * (0.85 - 0.6 * along) + off;
      }
    }
    const big = Math.random() < 0.08;
    return {
      x: sx, y: sy,
      r: big ? 1.1 + Math.random() * 0.7 : 0.35 + Math.random() * 0.7,
      base: big ? 0.85 + Math.random() * 0.15 : 0.35 + Math.random() * 0.55,
      tw: 0.0006 + Math.random() * 0.0022, ph: Math.random() * Math.PI * 2,
      born: t, life: 14000 + Math.random() * 40000,
      lit: -Infinity,
    };
  }

  /** The pointer at (x, y): light the star there; a tap on empty sky makes a new one. */
  private touch(x: number, y: number, tap: boolean) {
    const t = performance.now();
    let best: Star | null = null, bd = tap ? 46 : 34;
    for (const s of this.stars) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd && this.alpha(s, t) > 0.2) { bd = d; best = s; }
    }
    if (!best) {
      if (!tap) return;
      best = this.star(t - FADE * 0.7, x, y);
      best.r = 1.3; best.base = 1; best.life = 30000;
      this.stars.push(best);
    }
    if (!tap && t - best.lit < 1500) return;
    this.light(best, t);
    if (!this.running) this.play();
  }

  private light(s: Star, t: number) {
    s.lit = t;
    const linked = (a: Star, b: Star) => this.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    // Swept here from a star lit a moment ago: tie the two together first.
    const prev = this.lastLit;
    if (prev && prev.s !== s && t - prev.t < 1400 && Math.hypot(prev.s.x - s.x, prev.s.y - s.y) < TRAIL && !linked(prev.s, s)) {
      this.links.push({ a: prev.s, b: s, born: t });
    }
    this.lastLit = { s, t };
    const near = this.stars
      .filter(o => o !== s && this.alpha(o, t) > 0.3)
      .map(o => ({ o, d: Math.hypot(o.x - s.x, o.y - s.y) }))
      .filter(x => x.d < NEAR)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.round(Math.random()));
    near.forEach(({ o }, i) => {
      if (linked(s, o)) return;
      this.links.push({ a: s, b: o, born: t + i * 120 });
      o.lit = Math.max(o.lit, t + i * 120 + LINK_GROW);
    });
  }

  /** How visible a star is now: fading in, shining, fading out. */
  private alpha(s: Star, t: number): number {
    if (this.still) return 1;
    const age = t - s.born;
    if (age < 0) return 0;
    if (age < FADE) return age / FADE;
    if (age > s.life + FADE) return 0;
    if (age > s.life) return 1 - (age - s.life) / FADE;
    return 1;
  }

  private draw(t: number) {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // Stars that are gone come back somewhere else; a star stays while a line is tied to it.
    if (!this.still) {
      const tied = new Set(this.links.flatMap(l => [l.a, l.b]));
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        if (t - s.born > s.life + FADE && !tied.has(s)) this.stars[i] = this.star(t);
        else if (tied.has(s) && t - s.born > s.life) s.life = t - s.born;
      }
    }

    // the lines
    this.links = this.links.filter(l => t - l.born < LINK_LIFE + LINK_FADE);
    ctx.lineCap = 'round';
    for (const l of this.links) {
      const age = t - l.born;
      if (age < 0) continue;
      const grow = this.still ? 1 : Math.min(1, age / LINK_GROW);
      const fade = age < LINK_LIFE ? 1 : 1 - (age - LINK_LIFE) / LINK_FADE;
      ctx.globalAlpha = 0.75 * fade;
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.a.x + (l.b.x - l.a.x) * grow, l.a.y + (l.b.y - l.a.y) * grow);
      ctx.stroke();
    }

    // the stars
    for (const s of this.stars) {
      const a = this.alpha(s, t);
      if (a <= 0) continue;
      const twinkle = this.still ? 1 : 0.72 + 0.28 * Math.sin(t * s.tw + s.ph);
      const since = t - s.lit;
      const glow = since >= 0 && since < LINK_LIFE + LINK_FADE ? 1 - since / (LINK_LIFE + LINK_FADE) : 0;
      const b = Math.min(1, s.base * twinkle + glow);
      ctx.globalAlpha = a * b;
      if (glow > 0 || s.r > 1) {
        // a soft halo around bright and lit stars
        ctx.fillStyle = glow > 0 ? this.accent : '#cfe0ff';
        ctx.globalAlpha = a * (0.12 + 0.35 * glow);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (3 + 3 * glow), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * b;
      }
      ctx.fillStyle = '#f2f6ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 + 0.6 * glow), 0, Math.PI * 2); ctx.fill();
    }

    // now and then a shooting star
    if (!this.still) {
      if (!this.meteor && t > this.nextMeteor) {
        if (this.nextMeteor) {
          const fromLeft = Math.random() < 0.5, speed = 0.9 + Math.random() * 0.5;
          this.meteor = {
            x: this.w * (fromLeft ? 0.1 + Math.random() * 0.4 : 0.5 + Math.random() * 0.4), y: this.h * Math.random() * 0.35,
            vx: (fromLeft ? 1 : -1) * speed * 0.8, vy: speed * 0.45, born: t,
          };
        }
        this.nextMeteor = t + 7000 + Math.random() * 12000;
      }
      const m = this.meteor;
      if (m) {
        const age = t - m.born;
        if (age > METEOR_LIFE) this.meteor = null;
        else {
          const k = age / METEOR_LIFE, x = m.x + m.vx * age, y = m.y + m.vy * age;
          const g = ctx.createLinearGradient(x, y, x - m.vx * 160, y - m.vy * 160);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = Math.sin(Math.PI * k);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - m.vx * 160, y - m.vy * 160); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
