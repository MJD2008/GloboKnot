// A press you can feel (James, 14 Nov 2026: "so you really feel like it's clicked"). Every button goes down the
// moment a finger or the mouse does, and springs back up when it lifts; the look is in global.css ("a press you can
// feel"). The press holds for a moment at least, so even the quickest tap shows it, and a button worked from the
// keyboard shows it too. On a phone that can, a click also gives the lightest buzz, unless Effects is off.
import { sound } from './sound';

const HOLD = 110; // ms a press shows, at the least
const BUZZ = 10;  // ms of buzz
const PRESSABLE = 'button, .check';

let held: Element | null = null, since = 0, timer = 0;

function down(el: Element) {
  clearTimeout(timer);
  if (held && held !== el) held.classList.remove('pressed');
  held = el;
  since = performance.now();
  el.classList.add('pressed');
}
function up() {
  if (!held) return;
  const el = held;
  held = null;
  timer = window.setTimeout(() => el.classList.remove('pressed'), Math.max(0, HOLD - (performance.now() - since)));
}
/** A press for a button worked from the keyboard (1 to 4 for an answer, Enter for the answer box). */
export function flash(el: Element | null | undefined) {
  if (!el) return;
  down(el);
  up();
}
const pressable = (target: EventTarget | null): Element | null => {
  const el = target instanceof Element ? target.closest(PRESSABLE) : null;
  return el && !(el as HTMLButtonElement).disabled ? el : null;
};

addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const el = pressable(e.target);
  if (el) down(el);
}, { capture: true, passive: true });
for (const type of ['pointerup', 'pointercancel'] as const) addEventListener(type, up, { capture: true, passive: true });
addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && e.target instanceof HTMLButtonElement) flash(pressable(e.target));
}, true);
addEventListener('click', e => {
  if (!e.isTrusted || !(e.target instanceof Element) || !e.target.closest('button')) return;
  const { master, effects } = sound.levels;
  if (master > 0 && effects > 0) navigator.vibrate?.(BUZZ);
}, { passive: true });
