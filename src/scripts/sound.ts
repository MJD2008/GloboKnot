// Sounds and music in named slots. James makes the game's audio: a file in public/audio named after a slot
// (correct.mp3, music-home.mp3, ...) plays for that slot. Without one, a slot keeps its small synthesised placeholder
// (a bright tick for a right answer, a low thud for a miss...) or stays silent. docs/AUDIO.md lists the slots, when
// each plays and how long it may be. The build lists the files it finds into the page (#audio-files), so adding a
// sound is dropping the file in and building again.
//
// Three volumes, set in Settings: Volume (everything), Effects and Music. They are kept in localStorage (gk-audio).

/** The effects. `loose` falls back to `correct` (a little lower), `closed` to `rank`. */
export type Slot = 'correct' | 'loose' | 'wrong' | 'retry' | 'tick' | 'timeout' | 'heartbeat' | 'round-end' | 'knot' | 'rank' | 'closed';
/** The music: one loop for the home screen (and the results), one for the questions. */
export type Music = 'music-home' | 'music-quiz';
export interface Levels { master: number; effects: number; music: number } // 0 to 100 each

const KEY = 'gk-audio';
const DEFAULTS: Levels = { master: 100, effects: 100, music: 70 };

function loadLevels(): Levels {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) return { ...DEFAULTS, ...saved };
    if (localStorage.getItem('gk-muted') === '1') return { ...DEFAULTS, master: 0 }; // the old Sound switch, off
  } catch { /* private mode */ }
  return { ...DEFAULTS };
}
let levels = loadLevels();

/** The audio files in the build, by slot: an mp3 (or m4a) before an ogg, which not every browser plays. */
const files: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  try {
    const names: string[] = JSON.parse(document.getElementById('audio-files')?.textContent || '[]');
    const rank = (n: string) => ['mp3', 'm4a', 'ogg', 'wav'].indexOf(n.split('.').pop()!.toLowerCase());
    for (const n of names.filter(n => rank(n) >= 0).sort((a, b) => rank(a) - rank(b))) map[n.replace(/\.[^.]+$/, '')] ??= n;
  } catch { /* no list: every slot keeps its placeholder */ }
  return map;
})();
const fileUrl = (slot: string) => new URL(`audio/${files[slot]}`, document.baseURI).href;

// ---- the mixer: effects and music each have a volume, and both go through the main one
let ctx: AudioContext | null = null;
let master: GainNode, fx: GainNode, mus: GainNode;
/** Sliders feel even when the volume follows the square of their position. */
const gainOf = (v: number) => (Math.max(0, Math.min(100, v)) / 100) ** 2;

function audio(): AudioContext | null {
  if (!levels.master) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      master = ctx.createGain(); fx = ctx.createGain(); mus = ctx.createGain();
      fx.connect(master); mus.connect(master); master.connect(ctx.destination);
      setGains(true);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function setGains(now = false) {
  if (!ctx) return;
  for (const [node, v] of [[master, levels.master], [fx, levels.effects], [mus, levels.music]] as const) {
    if (now) node.gain.value = gainOf(v); else node.gain.setTargetAtTime(gainOf(v), ctx.currentTime, 0.04);
  }
}

// ---- effects from files: decoded once, then played as often as needed
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(slot: string): Promise<AudioBuffer | null> | null {
  const a = audio();
  if (!a || !files[slot]) return null;
  let b = buffers.get(slot);
  if (!b) {
    b = fetch(fileUrl(slot)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(d => a.decodeAudioData(d)).catch(() => null);
    buffers.set(slot, b);
  }
  return b;
}
/** Plays a slot's file, `semitones` up or down; false when there is no file (the caller may fall back). */
function play(slot: Slot, semitones = 0): boolean {
  const p = load(slot);
  if (!p) return false;
  void p.then(buf => {
    if (!buf || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = semis(semitones);
    src.connect(fx);
    src.start();
  });
  return true;
}

// ---- the placeholders
function tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', level = 0.16) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(level, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(fx);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
const semis = (n: number) => Math.pow(2, n / 12);
function synthRight(lift: number) {
  tone(659.25 * lift, 0, 0.12);
  tone(987.77 * lift, 0.07, 0.2);
  tone(1318.5 * lift, 0.07, 0.12, 'sine', 0.04);
}

// ---- music: a loop per screen, faded in and out; it waits for the first tap or key (browsers ask for one)
const tracks = new Map<Music, { el: HTMLAudioElement; gain: GainNode }>();
let wanted: Music | null = null;
let playing: Music | null = null;
let unlocked = false;

function musicTo(name: Music | null) {
  const a = audio();
  const next = a && levels.music && name && files[name] && !document.hidden ? name : null;
  if (next === playing) {
    const t = next && tracks.get(next);
    if (t?.el.paused) void t.el.play().catch(() => {});
    return;
  }
  if (playing) { // fade the old one out, then pause it
    const old = tracks.get(playing)!;
    if (ctx) old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    window.setTimeout(() => { if (playing !== name) old.el.pause(); }, 1400);
  }
  playing = next;
  if (!next || !a) return;
  let t = tracks.get(next);
  if (!t) {
    const el = new Audio(fileUrl(next));
    el.loop = true;
    el.preload = 'auto';
    const gain = a.createGain();
    gain.gain.value = 0;
    a.createMediaElementSource(el).connect(gain).connect(mus);
    t = { el, gain };
    tracks.set(next, t);
  }
  if (next === 'music-quiz') t.el.currentTime = 0; // every round starts its music from the top
  t.gain.gain.setTargetAtTime(1, a.currentTime, 0.35);
  void t.el.play().catch(() => {});
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  removeEventListener('pointerdown', unlock, true);
  removeEventListener('keydown', unlock, true);
  if (!audio()) return;
  // decode the effects now, so the first answer isn't late
  for (const slot of Object.keys(files)) if (!slot.startsWith('music-')) load(slot);
  musicTo(wanted);
}
addEventListener('pointerdown', unlock, true);
addEventListener('keydown', unlock, true);
document.addEventListener('visibilitychange', () => {
  if (!unlocked) return;
  if (document.hidden) for (const t of tracks.values()) t.el.pause();
  else { playing = null; musicTo(wanted); }
});

export const sound = {
  /** A right answer, first time. Each answer in a row sounds a little higher (up to seven semitones). */
  right(streak: number) {
    const up = Math.min(streak, 7);
    if (!play('correct', up)) synthRight(semis(up));
  },
  /** A right answer after a wrong try: a loose knot. */
  loose(streak: number) {
    const up = Math.min(streak, 7);
    if (!play('loose', up) && !play('correct', up - 3)) synthRight(semis(up - 3));
  },
  /** A wrong pick, or a skip. */
  wrong() {
    if (play('wrong')) return;
    tone(196, 0, 0.22, 'triangle', 0.18);
    tone(146.8, 0.09, 0.28, 'triangle', 0.16);
  },
  /** A wrong typed answer; the question stays open. */
  retry() {
    if (play('retry')) return;
    tone(220, 0, 0.09, 'square', 0.035);
    tone(207.65, 0.07, 0.11, 'square', 0.03);
  },
  /** Each of the last five seconds (5, 4, ... 1): a soft tick, a little higher towards the end. */
  tick(secondsLeft: number) {
    if (!play('tick', 5 - secondsLeft)) tone(880 * semis(5 - secondsLeft), 0, 0.05, 'sine', 0.05);
  },
  /** The time ran out. */
  timeout() {
    if (play('timeout')) return;
    tone(174.6, 0, 0.3, 'triangle', 0.18);
    tone(130.8, 0.12, 0.4, 'triangle', 0.16);
  },
  /** The Gordian Knot's slow heartbeat, with each beat at the edges of the screen (silent without a file). */
  heartbeat() { play('heartbeat'); },
  /** The round is over. */
  done(share: number) {
    if (play('round-end')) return;
    const notes = share >= 0.8 ? [523.25, 659.25, 783.99, 1046.5] : share >= 0.5 ? [523.25, 659.25, 783.99] : [392, 523.25];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.32, 'sine', 0.14));
  },
  /** On the results, each knot as the rope reaches it, a little higher round the ring (silent without a file). */
  knot(j: number) { play('knot', Math.min(j, 12) / 2); },
  /** The score and rank, once the rope is drawn; `closed` when every knot was tight (silent without a file). */
  rank(closed: boolean) { if (!closed || !play('closed')) play('rank'); },
  /** The music for a screen: the home screen and the results, or the questions. */
  scene(name: Music | null) {
    wanted = name;
    if (unlocked) musicTo(name);
  },
  /** Whether there is music in the build at all (Settings shows the Music slider only then). */
  get hasMusic() { return !!(files['music-home'] || files['music-quiz']); },
  get levels(): Levels { return { ...levels }; },
  set(change: Partial<Levels>) {
    levels = { ...levels, ...change };
    try { localStorage.setItem(KEY, JSON.stringify(levels)); } catch { /* private mode */ }
    if (levels.master) audio();
    setGains();
    if (unlocked) musicTo(wanted);
  },
  /** A short sample at the current volume, while a slider moves. */
  sample() { this.right(2); },
};
