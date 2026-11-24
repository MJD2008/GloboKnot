// Sounds and music in named slots. James makes the game's audio: a file in public/audio named after a slot
// (correct.mp3, music-home.mp3, ...) plays for that slot. Without one, a slot keeps its small synthesised placeholder
// (a bright tick for a right answer, a low thud for a miss...) or stays silent. docs/AUDIO.md lists the slots, when
// each plays and how long it may be. The build lists the files it finds into the page (#audio-files), so adding a
// sound is dropping the file in and building again.
//
// James (22 Nov 2026): the music follows the time of day by the player's own clock, the space track blends into it
// "so it doesn't feel like you're suddenly playing another audio asset", and nothing should feel "too aggressive or
// impeding". Later that evening: the music quieter overall ("subtle and unobtrusive", fine in a background tab), the
// jazz "can dim down (but still be hearable) when playing a round", softer effects in the quiz, the jazz coming in
// gradually over space at a round's start, natural fades back to the menu and between tracks, and a quick but smooth
// fade when a round ends or is left. So music never starts or stops: it fades, each change shaped to its moment
// (`moveOf`), a track loops by crossfading into its own start, and the music dips a little under some effects.
// Effects start on the tap: decoded ahead, and any silence before the sound skipped.
//
// Three volumes, set in Settings: Volume (everything), Effects and Music; and, once Sound Collector is earned, which
// music plays. They are kept in localStorage (gk-audio).

/** The effects. `loose` falls back to `correct` (a little lower), `closed` to `rank`, `retry` and `timeout` to
 *  `wrong` (softer and higher, lower). */
export type Slot = 'correct' | 'loose' | 'wrong' | 'retry' | 'tick' | 'timeout' | 'heartbeat' | 'round-end' | 'low' | 'knot'
  | 'rank' | 'closed' | 'start' | 'open' | 'select' | 'gordian-stop' | 'unlock' | 'celebrate';
/** Where the player is, for the music: the home screen (space), the globe grown over it, a round or Practice, The
 *  Gordian Knot, or the results (quiet: a round's end fades its music out). */
export type Scene = 'home' | 'globe' | 'round' | 'gordian' | 'results';
/** Which music plays once the player may pick it (Sound Collector): by the clock, as before (the default), one part of
 *  the day's jazz all the time, or space everywhere. */
export type Pick = 'auto' | 'morning' | 'afternoon' | 'evening' | 'night' | 'space';
export const PICKS: Pick[] = ['auto', 'morning', 'afternoon', 'evening', 'night', 'space'];
export interface Levels { master: number; effects: number; music: number; pick: Pick } // the volumes 0 to 100 each

const KEY = 'gk-audio';
const DEFAULTS: Levels = { master: 100, effects: 100, music: 70, pick: 'auto' };

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
/** The music as a whole sits this far under its files (about -4.5 dB): quiet enough to leave on in a background tab. */
const MUSIC_TRIM = 0.6;
/** How loud the music is in each place, against the home screen: dimmed under a round but still there, and quiet on
 *  the results. */
const SCENE_LEVEL: Record<Scene, number> = { home: 1, globe: 1, round: 0.6, gordian: 0.8, results: 0 };

function audio(): AudioContext | null {
  if (!levels.master) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      master = ctx.createGain(); fx = ctx.createGain(); mus = ctx.createGain(); duck = ctx.createGain();
      // The effects lose a little of their top end, so a quick run of answers never grates.
      const soft = ctx.createBiquadFilter();
      soft.type = 'highshelf'; soft.frequency.value = 4500; soft.gain.value = -5;
      duck.connect(mus); fx.connect(soft).connect(master); mus.connect(master); master.connect(ctx.destination);
      setGains(true);
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}
function setGains(now = false) {
  if (!ctx) return;
  for (const [node, v, k] of [[master, levels.master, 1], [fx, levels.effects, 1], [mus, levels.music, MUSIC_TRIM]] as const) {
    if (now) node.gain.value = gainOf(v) * k; else node.gain.setTargetAtTime(gainOf(v) * k, ctx.currentTime, 0.04);
  }
}
/** Dips the music to `depth` for `secs`, `delay` seconds from now, then lets it back up gently. */
function dip(depth: number, secs: number, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(duck.gain.value, t);
  duck.gain.setTargetAtTime(depth, t + delay, 0.03);
  duck.gain.setTargetAtTime(1, t + delay + secs, 0.35);
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
/** How loud each effect plays against its file: a round's run of answers stays gentle (James, 22 Nov 2026: "sound
 *  effects feel a bit aggressive still during the quiz"). */
const FX_LEVEL: Partial<Record<Slot, number>> = {
  correct: 0.6, loose: 0.55, wrong: 0.42, retry: 0.6, timeout: 0.45, tick: 0.55, start: 0.6, heartbeat: 0.7,
  'round-end': 0.7, low: 0.6, knot: 0.7, rank: 0.75, closed: 0.75, 'gordian-stop': 0.8, unlock: 0.8, celebrate: 0.85,
};
/** How each effect sits on the music: how far it dips it, and for how long. Small ones leave it alone. */
const DIPS: Partial<Record<Slot, [number, number]>> = {
  wrong: [0.85, 0.3], timeout: [0.8, 0.4], start: [0.75, 0.9], 'round-end': [0.7, 0.8], low: [0.7, 1.2], closed: [0.7, 1],
  rank: [0.8, 0.6], open: [0.9, 0.5], 'gordian-stop': [0.6, 2.4], unlock: [0.6, 2.4], celebrate: [0.4, 18],
};
/** Plays a slot's file, `semitones` up or down, at `level` (1: as made, before FX_LEVEL), `delay` seconds from now;
 *  false when there is no file (the caller may fall back). */
function play(slot: Slot, semitones = 0, level = 1, delay = 0): boolean {
  const p = load(slot);
  if (!p) return false;
  void p.then(s => {
    if (!s || !ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = semis(semitones);
    const lv = level * (FX_LEVEL[slot] ?? 1);
    let out: AudioNode = fx;
    if (lv !== 1) { const g = ctx.createGain(); g.gain.value = lv; g.connect(fx); out = g; }
    src.connect(out);
    src.start(ctx.currentTime + delay, s.lead);
    const d = DIPS[slot];
    if (d) dip(1 - (1 - d[0]) * level, d[1], delay);
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
// player is (their own clock), or the music they picked; The Gordian Knot has its own; the results are quiet. A part
// of the day without a file falls back to music-quiz, then to space.
/** The part of the day at an hour: morning 6 to 12, afternoon 12 to 18, evening 18 to 22, night 22 to 6. */
export const dayPart = (h = new Date().getHours()) => (h < 6 || h >= 22 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
function dayTrack(): string | null {
  const pick = levels.pick;
  if (pick === 'space' && files['music-home']) return 'music-home';
  const own = `music-${pick === 'auto' || pick === 'space' ? dayPart() : pick}`;
  return files[own] ? own : files['music-quiz'] ? 'music-quiz' : files['music-home'] ? 'music-home' : null;
}
function trackFor(s: Scene): string | null {
  switch (s) {
    case 'home': return files['music-home'] ? 'music-home' : dayTrack();
    case 'gordian': return files['music-gordian'] ? 'music-gordian' : dayTrack();
    case 'results': return null;
    default: return dayTrack();
  }
}

// Tracks play on a few "voices": an <audio> element each, through a filter and a gain, so two can overlap while one
// blends into the next (or into its own start, to loop). They are made, and allowed to play, on the first tap.
interface Voice { el: HTMLAudioElement; gain: GainNode; filter: BiquadFilterNode; track: string | null; gen: number; primed: boolean }
const voices: Voice[] = [];
const VOICES = 4;
let cur: Voice | null = null;     // the voice of the track that should be heard
let curLevel = 1;                 // and how loud it should be (SCENE_LEVEL)
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

/** Moves a gain to `to` over `secs`, `wait` seconds from now, from wherever it is. 'even': evenly in loudness (dB),
 *  which brings a track in gradually, its first seconds too faint to notice; 'late': holds a moment, then sinks, a
 *  fade out that doesn't feel cut off. Silence counts as -48 dB; a fade to 0 ends in silence. */
function glide(p: AudioParam, to: number, secs: number, wait = 0, shape: 'even' | 'late' = 'even') {
  if (!ctx) return;
  const t = ctx.currentTime, from = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(from, t);
  if (wait > 0) p.setValueAtTime(from, t + wait);
  const db = (g: number) => (g > 0.004 ? 20 * Math.log10(g) : -48);
  const a = db(from), b = db(to), steps = Math.max(3, Math.ceil(secs * 5));
  for (let i = 1; i <= steps; i++) {
    const x = i / steps, k = shape === 'late' ? x * x : x;
    p.linearRampToValueAtTime(i === steps ? to : 10 ** ((a + (b - a) * k) / 20), t + wait + secs * x);
  }
}
/** Opens or closes a voice's filter from `from` Hz to `to` Hz over `secs`, `wait` seconds from now. */
function sweep(f: AudioParam, from: number, to: number, secs: number, wait = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  f.cancelScheduledValues(t);
  f.setValueAtTime(from, t);
  if (wait > 0) f.setValueAtTime(from, t + wait);
  f.exponentialRampToValueAtTime(to, t + wait + Math.max(0.05, secs));
}

interface In { wait: number; secs: number; rise: boolean }
interface Out { wait: number; secs: number; close: boolean }
/** Brings a voice in: `rise` is the way down from space, the music coming up muffled and opening out. */
function bringIn(v: Voice, track: string, from: number, how: In, level: number) {
  if (!ctx) return;
  v.gen = ++gens;
  if (v.track !== track) {
    v.track = track;
    v.el.src = fileUrl(track);
    const seek = () => { try { v.el.currentTime = from; } catch { /* not seekable yet */ } };
    if (v.el.readyState >= 1) seek(); else v.el.addEventListener('loadedmetadata', seek, { once: true });
  }
  glide(v.gain.gain, level, how.secs, how.wait);
  const f0 = v.filter.frequency.value;
  sweep(v.filter.frequency, how.rise ? Math.min(f0, 400) : f0, OPEN, how.rise ? how.secs : Math.min(how.secs, 1), how.wait);
  void v.el.play().catch(() => {});
}
/** Lets a voice go, then stops it; `close`: on the way up into space, its filter closes as it fades. */
function letGo(v: Voice, how: Out) {
  if (!ctx) return;
  const gen = (v.gen = ++gens);
  glide(v.gain.gain, 0, how.secs, how.wait, 'late');
  if (how.close) sweep(v.filter.frequency, v.filter.frequency.value, 500, how.secs, how.wait);
  window.setTimeout(() => { if (v.gen === gen) silence(v); }, (how.wait + how.secs) * 1000 + 300);
}
/** Near its end, a track starts again on another voice and the two overlap, so it never stops. */
function comeRound(v: Voice) {
  const d = v.el.duration;
  if (v !== cur || !v.track || !(d > LOOP * 4) || d - v.el.currentTime > LOOP) return;
  const next = take();
  bringIn(next, v.track, 0, { wait: 0, secs: LOOP * 0.6, rise: false }, curLevel);
  letGo(v, { wait: 0, secs: LOOP, close: false });
  setCur(next);
}
/** The voice heard now; its track, voice and level are written on the page (data-music, data-voice, data-music-level)
 *  for the tests. */
function setCur(v: Voice | null) {
  cur = v;
  document.body.dataset.music = v?.track ?? '';
  document.body.dataset.voice = v ? String(voices.indexOf(v)) : '';
  document.body.dataset.musicLevel = v ? String(curLevel) : '';
}

type Kind = 'space' | 'day' | 'boss' | 'none';
const kindOf = (t: string | null | undefined): Kind => (!t ? 'none' : t === 'music-home' ? 'space' : t === 'music-gordian' ? 'boss' : 'day');
/** How one music gives way to the next (seconds). A round begun from the home screen lets space carry on a while and
 *  brings the jazz in under it, slowly; the jazz going back into space closes as it fades; a round's end fades out
 *  quickly but smoothly; between two jazz tracks, a long crossfade. */
function moveOf(from: Kind, to: Kind, scene: Scene | null): { out: Out; in: In } {
  const move = (o: [number, number, boolean], i: [number, number, boolean]) => ({ out: { wait: o[0], secs: o[1], close: o[2] }, in: { wait: i[0], secs: i[1], rise: i[2] } });
  if (to === 'none') return move([0, from === 'boss' ? 2.6 : scene === 'results' ? 1.8 : 2.4, false], [0, 0, false]);
  if (from === 'none') return move([0, 0, false], [0.2, to === 'space' ? 5 : 6, to === 'day']);
  if (from === 'space' && to === 'day') return scene === 'round' ? move([0, 10, false], [2.5, 8.5, true]) : move([0.3, 5, false], [0.2, 5, true]);
  if (from === 'day' && to === 'space') return move([0, 4.5, true], [0.4, 5, false]);
  if (to === 'boss') return move([0, 3, false], [0.6, 4, false]);
  if (from === 'boss') return move([0, 2.6, false], [1.2, 5, false]);
  return move([0, 6, false], [1, 6, false]);
}

/** A phone or tablet put away (another app, the screen off) stops the music; a tab left in the background on a
 *  computer keeps playing, quietly (James: players may "keep the game open in a background tab"). */
const away = () => document.hidden && matchMedia('(pointer: coarse)').matches;

function musicTo(scene: Scene | null) {
  const a = audio();
  const level = scene ? SCENE_LEVEL[scene] : 0;
  const name = a && levels.music && level && !away() ? trackFor(scene!) : null;
  if (cur && name && cur.track === name) {
    // The same track: only its level moves (a round dims what the grown globe played).
    if (cur.el.paused) void cur.el.play().catch(() => {});
    cur.gen = ++gens;
    curLevel = level;
    document.body.dataset.musicLevel = String(level);
    glide(cur.gain.gain, level, 2.5);
    sweep(cur.filter.frequency, cur.filter.frequency.value, OPEN, 1);
    return;
  }
  const old = cur, m = moveOf(kindOf(old?.track), kindOf(name), scene);
  if (old) {
    at[old.track!] = old.el.currentTime;
    letGo(old, m.out);
  }
  setCur(null);
  if (!name || !a || !voices.length) return;
  // The same track still fading out: brought back, not started again.
  const v = voices.find(v => v.track === name) ?? take();
  curLevel = level;
  bringIn(v, name, at[name] ?? 0, m.in, level);
  setCur(v);
}
// The part of the day turns while the music plays (by the clock): the next part's jazz blends in.
setInterval(() => { if (unlocked && wanted && cur?.track && kindOf(cur.track) === 'day' && trackFor(wanted) !== cur.track) musicTo(wanted); }, 60_000);

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
    // decode the effects now, so the first answer isn't late (all but the rare, long celebration)
    for (const slot of Object.keys(files)) if (!slot.startsWith('music-') && slot !== 'celebrate') load(slot);
    musicTo(wanted);
  };
  if (a.state === 'running') go(); else void a.resume().then(go).catch(() => {});
}
for (const type of UNLOCK) addEventListener(type, unlock, true);
document.addEventListener('visibilitychange', () => {
  if (!unlocked) return;
  if (!document.hidden) { musicTo(wanted); return; }
  if (!away()) return;
  for (const v of voices) {
    if (v !== cur) { if (v.track) silence(v); continue; }
    // kept as the voice heard, silent and paused, to come back in from nothing when the page does
    v.gen = ++gens;
    if (ctx) { v.gain.gain.cancelScheduledValues(ctx.currentTime); v.gain.gain.setValueAtTime(0, ctx.currentTime); }
    v.el.pause();
  }
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
  /** The Gordian Knot stopped, or finished short of every question (silent without a file). */
  gordianStop() { play('gordian-stop'); },
  /** Something earned (Atlas, a colour, the music choice...): once, however many came at once, `delay` seconds from
   *  now, so it never plays over the Gordian Knot's stop sound (silent without a file). */
  unlock(delay = 0) { play('unlock', 0, 1, delay); },
  /** Every question of The Gordian Knot right: the celebration, while the name is asked for (silent without a file). */
  celebrate() { play('celebrate'); },
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
  /** How loud the music is meant to be and is, voice by voice (for the tests). */
  get mix() { return { level: curLevel, gain: cur?.gain.gain.value ?? 0, voices: voices.filter(v => v.track).map(v => [v.track, Math.round(v.gain.gain.value * 1000) / 1000]) }; },
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
