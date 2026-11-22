// Sounds and music in named slots. James makes the game's audio: a file in public/audio named after a slot
// (correct.mp3, music-home.mp3, ...) plays for that slot. Without one, a slot keeps its small synthesised placeholder
// (a bright tick for a right answer, a low thud for a miss...) or stays silent. docs/AUDIO.md lists the slots, when
// each plays and how long it may be. The build lists the files it finds into the page (#audio-files), so adding a
// sound is dropping the file in and building again.
//
// James (22 Nov 2026): the music follows the time of day by the player's own clock, the space track blends into it
// "so it doesn't feel like you're suddenly playing another audio asset", and nothing should feel "too aggressive or
// impeding". So music never starts or stops: it fades, every change is a crossfade, a track loops by crossfading into
// its own start, and the music dips a little under each effect. Effects start on the tap: decoded ahead, and any
// silence before the sound skipped.
//
// Three volumes, set in Settings: Volume (everything), Effects and Music. They are kept in localStorage (gk-audio).

/** The effects. `loose` falls back to `correct` (a little lower), `closed` to `rank`, `retry` and `timeout` to
 *  `wrong` (softer and higher, lower). */
export type Slot = 'correct' | 'loose' | 'wrong' | 'retry' | 'tick' | 'timeout' | 'heartbeat' | 'round-end' | 'low' | 'knot'
  | 'rank' | 'closed' | 'start' | 'open' | 'select';
/** Where the player is, for the music: the home screen (space), the globe grown over it, a round or Practice, The
 *  Gordian Knot, or the results (which keep the round's music). */
export type Scene = 'home' | 'globe' | 'round' | 'gordian' | 'results';
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

// ---- the mixer: effects and music each have a volume, and both go through the main one. The music also goes through
// a "duck", which dips it under an effect and brings it back.
let ctx: AudioContext | null = null;
let master: GainNode, fx: GainNode, mus: GainNode, duck: GainNode;
/** Sliders feel even when the volume follows the square of their position. */
const gainOf = (v: number) => (Math.max(0, Math.min(100, v)) / 100) ** 2;

function audio(): AudioContext | null {
  if (!levels.master) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      master = ctx.createGain(); fx = ctx.createGain(); mus = ctx.createGain(); duck = ctx.createGain();
      duck.connect(mus); fx.connect(master); mus.connect(master); master.connect(ctx.destination);
      setGains(true);
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}
function setGains(now = false) {
  if (!ctx) return;
  for (const [node, v] of [[master, levels.master], [fx, levels.effects], [mus, levels.music]] as const) {
    if (now) node.gain.value = gainOf(v); else node.gain.setTargetAtTime(gainOf(v), ctx.currentTime, 0.04);
  }
}
/** Dips the music to `depth` for `secs`, then lets it back up gently. */
function dip(depth: number, secs: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setTargetAtTime(depth, t, 0.03);
  duck.gain.setTargetAtTime(1, t + secs, 0.35);
}

// ---- effects from files: decoded once, then played as often as needed
interface Fx { buf: AudioBuffer; lead: number } // `lead`: the silence before the sound (an mp3 has a little), skipped
const buffers = new Map<string, Promise<Fx | null>>();
function load(slot: string): Promise<Fx | null> | null {
  const a = audio();
  if (!a || !files[slot]) return null;
  let b = buffers.get(slot);
  if (!b) {
    b = fetch(fileUrl(slot)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(d => a.decodeAudioData(d)).then(buf => {
      const ch = buf.getChannelData(0), max = Math.min(ch.length, Math.round(buf.sampleRate * 0.08));
      let i = 0;
      while (i < max && Math.abs(ch[i]) < 0.003) i++;
      return { buf, lead: i < max ? i / buf.sampleRate : 0 };
    }).catch(() => null);
    buffers.set(slot, b);
  }
  return b;
}
/** How each effect sits on the music: how far it dips it, and for how long. Small ones leave it alone. */
const DIPS: Partial<Record<Slot, [number, number]>> = {
  correct: [0.75, 0.25], loose: [0.75, 0.25], wrong: [0.7, 0.35], timeout: [0.7, 0.4], start: [0.55, 0.9],
  'round-end': [0.6, 0.8], low: [0.55, 1.2], closed: [0.6, 1], rank: [0.7, 0.6], open: [0.85, 0.5],
};
/** Plays a slot's file, `semitones` up or down, at `level` (1: as made), `delay` seconds from now; false when there is
 *  no file (the caller may fall back). */
function play(slot: Slot, semitones = 0, level = 1, delay = 0): boolean {
  const p = load(slot);
  if (!p) return false;
  void p.then(s => {
    if (!s || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = semis(semitones);
    let out: AudioNode = fx;
    if (level !== 1) { const g = ctx.createGain(); g.gain.value = level; g.connect(fx); out = g; }
    src.connect(out);
    src.start(ctx.currentTime + delay, s.lead);
    const d = DIPS[slot];
    if (d && !delay) dip(1 - (1 - d[0]) * level, d[1]);
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

// ---- music
// Which track: on the home screen, space; zoomed into the globe and in a round, the part of the day it is where the
// player is (their own clock); The Gordian Knot has its own. A part of the day without a file falls back to
// music-quiz, then to space.
/** The part of the day at an hour: morning 6 to 12, afternoon 12 to 18, evening 18 to 22, night 22 to 6. */
export const dayPart = (h = new Date().getHours()) => (h < 6 || h >= 22 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
function dayTrack(): string | null {
  const own = `music-${dayPart()}`;
  return files[own] ? own : files['music-quiz'] ? 'music-quiz' : files['music-home'] ? 'music-home' : null;
}
function trackFor(s: Scene): string | null {
  switch (s) {
    case 'home': return files['music-home'] ? 'music-home' : dayTrack();
    case 'gordian': return files['music-gordian'] ? 'music-gordian' : dayTrack();
    case 'results': return cur?.track ?? dayTrack();
    default: return dayTrack();
  }
}
const isSpace = (t: string | null | undefined) => t === 'music-home';

// Tracks play on a few "voices": an <audio> element each, through a filter and a gain, so two can overlap while one
// blends into the next (or into its own start, to loop). They are made, and allowed to play, on the first tap.
interface Voice { el: HTMLAudioElement; gain: GainNode; filter: BiquadFilterNode; track: string | null; gen: number; primed: boolean }
const voices: Voice[] = [];
const VOICES = 4;
let cur: Voice | null = null;     // the voice of the track that should be heard
const at: Record<string, number> = {}; // where each track was left, to pick it up there
let wanted: Scene | null = null;
let unlocked = false;

const OPEN = 20000;   // the filter wide open: nothing taken away
const LOOP = 6;       // seconds a track overlaps its own start when it comes round
/** A tiny silent wav, to let each voice play once on the first tap (some browsers allow it only then). */
const SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';

function makeVoices(a: AudioContext) {
  while (voices.length < VOICES) {
    const el = new Audio();
    el.preload = 'auto';
    const filter = a.createBiquadFilter(), gain = a.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = OPEN;
    filter.Q.value = 0.5;
    gain.gain.value = 0;
    a.createMediaElementSource(el).connect(filter).connect(gain).connect(duck);
    const v: Voice = { el, gain, filter, track: null, gen: 0, primed: false };
    el.addEventListener('timeupdate', () => comeRound(v));
    el.addEventListener('ended', () => { if (v === cur) { el.currentTime = 0; void el.play().catch(() => {}); } });
    voices.push(v);
  }
  // Each plays a moment of silence while the tap still counts, so it may play later (some browsers ask that of every
  // <audio>); tried again on the next tap if the browser said no.
  for (const v of voices) {
    if (v.primed || v.track) continue;
    v.el.src = SILENCE;
    void v.el.play().then(() => { v.primed = true; if (!v.track) v.el.pause(); }).catch(() => {});
  }
}
/** A free voice, or else the one that has been fading the longest. */
function take(): Voice {
  const v = voices.find(v => !v.track) ?? voices.filter(v => v !== cur).sort((a, b) => a.gen - b.gen)[0];
  if (v.track) silence(v);
  return v;
}
function silence(v: Voice) {
  v.gen = ++gens;
  v.el.pause();
  v.track = null;
  if (ctx) { v.gain.gain.cancelScheduledValues(ctx.currentTime); v.gain.gain.setValueAtTime(0, ctx.currentTime); }
}
let gens = 0;

/** Brings a voice in over `secs`; `rise`: the way down from space, the music coming up muffled and opening out. */
function bringIn(v: Voice, track: string, from: number, secs: number, rise: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime, g = v.gain.gain, f = v.filter.frequency, g0 = g.value, f0 = f.value;
  v.gen = ++gens;
  if (v.track !== track) {
    v.track = track;
    v.el.src = fileUrl(track);
    const seek = () => { try { v.el.currentTime = from; } catch { /* not seekable yet */ } };
    if (v.el.readyState >= 1) seek(); else v.el.addEventListener('loadedmetadata', seek, { once: true });
  }
  g.cancelScheduledValues(t);
  g.setValueAtTime(g0, t);
  g.setTargetAtTime(1, t, secs / 4);
  f.cancelScheduledValues(t);
  f.setValueAtTime(rise ? Math.min(f0, 380) : f0, t);
  f.exponentialRampToValueAtTime(OPEN, t + (rise ? secs : Math.min(secs, 1)));
  void v.el.play().catch(() => {});
}
/** Lets a voice go over `secs`, then stops it; `rise`: on the way up into space, it closes as it fades. */
function letGo(v: Voice, secs: number, rise: boolean) {
  if (!ctx) return;
  const t = ctx.currentTime, g = v.gain.gain, f = v.filter.frequency, g0 = g.value, f0 = f.value, gen = (v.gen = ++gens);
  g.cancelScheduledValues(t);
  g.setValueAtTime(g0, t);
  g.setTargetAtTime(0, t, secs / 4);
  f.cancelScheduledValues(t);
  f.setValueAtTime(f0, t);
  if (rise) f.exponentialRampToValueAtTime(300, t + secs);
  window.setTimeout(() => { if (v.gen === gen) silence(v); }, secs * 1000 + 300);
}
/** Near its end, a track starts again on another voice and the two overlap, so it never stops. */
function comeRound(v: Voice) {
  const d = v.el.duration;
  if (v !== cur || !v.track || !(d > LOOP * 4) || d - v.el.currentTime > LOOP) return;
  const next = take();
  bringIn(next, v.track, 0, LOOP * 0.6, false);
  letGo(v, LOOP, false);
  setCur(next);
}
/** The voice heard now; its track and voice are written on the page (data-music, data-voice) for the tests. */
function setCur(v: Voice | null) {
  cur = v;
  document.body.dataset.music = v?.track ?? '';
  document.body.dataset.voice = v ? String(voices.indexOf(v)) : '';
}

function musicTo(scene: Scene | null) {
  const a = audio();
  const name = a && levels.music && scene && !document.hidden ? trackFor(scene) : null;
  if (cur && name && cur.track === name) {
    if (cur.el.paused) void cur.el.play().catch(() => {});
    bringIn(cur, name, 0, 0.8, false);
    return;
  }
  const old = cur;
  // Between space and the jazz of the day, a slow blend through the "atmosphere"; between two others, a crossfade;
  // from silence, a fade in.
  const rise = !!old?.track && !!name && isSpace(old.track) !== isSpace(name);
  const secs = rise ? 3.2 : old ? 1.8 : 2.4;
  if (old) {
    at[old.track!] = old.el.currentTime;
    letGo(old, secs, rise && !isSpace(old.track));
  }
  setCur(null);
  if (!name || !a || !voices.length) return;
  // The same track still fading out: brought back, not started again.
  const v = voices.find(v => v.track === name) ?? take();
  bringIn(v, name, at[name] ?? 0, secs, rise && !isSpace(name));
  setCur(v);
}

const UNLOCK = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
function unlock() {
  if (unlocked) return;
  const a = audio();
  if (!a) return;
  makeVoices(a);
  const go = () => {
    if (unlocked || a.state !== 'running') return;
    unlocked = true;
    for (const type of UNLOCK) removeEventListener(type, unlock, true);
    // decode the effects now, so the first answer isn't late
    for (const slot of Object.keys(files)) if (!slot.startsWith('music-')) load(slot);
    musicTo(wanted);
  };
  if (a.state === 'running') go(); else void a.resume().then(go).catch(() => {});
}
for (const type of UNLOCK) addEventListener(type, unlock, true);
document.addEventListener('visibilitychange', () => {
  if (!unlocked) return;
  if (document.hidden) {
    for (const v of voices) if (v === cur) v.el.pause(); else if (v.track) silence(v);
  } else musicTo(wanted);
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
  /** A wrong typed answer; the question stays open: the wrong sound, softer and a little higher. */
  retry() {
    if (play('retry') || play('wrong', 3, 0.45)) return;
    tone(220, 0, 0.09, 'square', 0.035);
    tone(207.65, 0.07, 0.11, 'square', 0.03);
  },
  /** Each of the last five seconds (5, 4, ... 1): a soft tick, a little higher towards the end. */
  tick(secondsLeft: number) {
    if (!play('tick', 5 - secondsLeft)) tone(880 * semis(5 - secondsLeft), 0, 0.05, 'sine', 0.05);
  },
  /** The time ran out: the wrong sound, a little lower. */
  timeout() {
    if (play('timeout') || play('wrong', -2)) return;
    tone(174.6, 0, 0.3, 'triangle', 0.18);
    tone(130.8, 0.12, 0.4, 'triangle', 0.16);
  },
  /** The Gordian Knot's slow heartbeat, with each beat at the edges of the screen (silent without a file). */
  heartbeat() { play('heartbeat'); },
  /** A round (or Practice) begins. */
  start() { play('start'); },
  /** A panel opens: the menu, Practice, About, Settings, a country's sheet, an answer on the map. */
  open() { play('open'); },
  /** Anything pressed: the click under the finger. */
  select() { play('select'); },
  /** The round is over. Under half right: `low`. Otherwise `round-end`, or the right-answer sound climbing a chord. */
  done(share: number) {
    if (share < 0.5 && play('low')) return;
    if (play('round-end')) return;
    const steps = share >= 0.8 ? [0, 4, 7, 12] : share >= 0.5 ? [0, 4, 7] : [0, 3];
    if (files.correct) {
      steps.forEach((n, i) => play('correct', n, i ? 0.8 : 1, i * 0.11));
      dip(0.6, 0.6);
      return;
    }
    const notes = share >= 0.8 ? [523.25, 659.25, 783.99, 1046.5] : share >= 0.5 ? [523.25, 659.25, 783.99] : [392, 523.25];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.32, 'sine', 0.14));
  },
  /** On the results, each knot as the rope reaches it, a little higher round the ring (silent without a file). */
  knot(j: number) { play('knot', Math.min(j, 12) / 2); },
  /** The score and rank, once the rope is drawn; `closed` when every knot was tight (silent without a file). */
  rank(closed: boolean) { if (!closed || !play('closed')) play('rank'); },
  /** Where the player is, for the music (see Scene). */
  scene(s: Scene | null) {
    wanted = s;
    if (unlocked) musicTo(s);
  },
  /** The track a scene plays now (for the tests). */
  trackFor(s: Scene) { return trackFor(s); },
  /** The track heard now, and where it is (for the tests). */
  get now() { return cur ? { track: cur.track, time: cur.el.currentTime, voices: voices.filter(v => v.track).length } : null; },
  /** Whether there is music in the build at all (Settings shows the Music slider only then). */
  get hasMusic() { return Object.keys(files).some(k => k.startsWith('music-')); },
  get levels(): Levels { return { ...levels }; },
  set(change: Partial<Levels>) {
    levels = { ...levels, ...change };
    try { localStorage.setItem(KEY, JSON.stringify(levels)); } catch { /* private mode */ }
    if (levels.master) { const a = audio(); if (a) makeVoices(a); }
    setGains();
    if (unlocked) musicTo(wanted);
    else unlock();
  },
  /** A short sample at the current volume, while a slider moves. */
  sample() { this.right(2); },
};
