// Small synthesised sounds (no audio files yet): a bright two-note tick that climbs with a streak, a soft low thud
// for a miss, a short buzz for a wrong try, a quiet tick in the last five seconds and a short arpeggio at the end of a
// round. These are placeholders: James is making the game's sounds, and they will replace these one by one.

const KEY = 'gk-muted';
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

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
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const semis = (n: number) => Math.pow(2, n / 12);

export const sound = {
  right(streak: number) {
    const lift = semis(Math.min(streak, 7)); // each answer in a row sounds a little higher
    tone(659.25 * lift, 0, 0.12);
    tone(987.77 * lift, 0.07, 0.2);
    tone(1318.5 * lift, 0.07, 0.12, 'sine', 0.04);
  },
  wrong() {
    tone(196, 0, 0.22, 'triangle', 0.18);
    tone(146.8, 0.09, 0.28, 'triangle', 0.16);
  },
  /** A wrong typed answer; the question stays open. */
  retry() {
    tone(220, 0, 0.09, 'square', 0.035);
    tone(207.65, 0.07, 0.11, 'square', 0.03);
  },
  /** Each of the last five seconds (5, 4, ... 1): a soft tick, a little higher towards the end. */
  tick(secondsLeft: number) {
    tone(880 * semis(5 - secondsLeft), 0, 0.05, 'sine', 0.05);
  },
  /** The time ran out. */
  timeout() {
    tone(174.6, 0, 0.3, 'triangle', 0.18);
    tone(130.8, 0.12, 0.4, 'triangle', 0.16);
  },
  done(share: number) {
    const notes = share >= 0.8 ? [523.25, 659.25, 783.99, 1046.5] : share >= 0.5 ? [523.25, 659.25, 783.99] : [392, 523.25];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.32, 'sine', 0.14));
  },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode */ }
    return muted;
  },
};
