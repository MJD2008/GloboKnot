// New unlocks (James, 23 Nov 2026): "a brief (2-3 second) popup at the top of the screen when an achievement is
// unlocked", with the twinkle (the unlock sound) right after the round's end or quit sound, and a "New unlock!" that
// opens where the new thing lives, highlighted there the first time it is seen. This instead of lines under the
// results. Settings holds the rewards; Atlas lives in the configuration, so its popup opens that.
import { type Unlock, UNLOCK_IDS, isNew, markSeen } from './prefs';
import { sound } from './sound';

export type Where = 'settings' | 'config';
/** Each unlock: its name (the achievement), what it gives, and where that is. */
export const UNLOCKS: Record<Unlock, { name: string; what: string; where: Where }> = {
  atlas: { name: 'Atlas', what: 'The hidden level', where: 'config' },
  music: { name: 'Sound Collector', what: 'Choose the music', where: 'settings' },
  crimson: { name: 'First encounter', what: 'Crimson', where: 'settings' },
  effects: { name: 'Initiate', what: 'Texture and animation', where: 'settings' },
  multicolour: { name: 'Master', what: 'Multicolour', where: 'settings' },
};
/** What to light up for each, in Settings or the configuration. */
const SPOTS: Record<Unlock, string> = {
  atlas: '#menu-level [data-level="impossible"]',
  music: '#set-pick-row',
  crimson: '#set-accent [data-accent="crimson"]',
  effects: '#set-fx-texture-row, #set-fx-animation-row',
  multicolour: '#set-accent [data-accent="multicolour"]',
};
const SHOW_MS = 3000; // on screen this long, longer while pointed at or focused

export interface Unlocks {
  /** Says what was just unlocked: the twinkle (unless `quiet`, as under The Gordian Knot's celebration) and the popup,
   *  after `delay` seconds (after the end or stop sound, never over it). */
  announce(list: Unlock[], delay?: number, quiet?: boolean): void;
  /** Settings or the configuration has just been opened and drawn: lights up what is new there, this once. */
  shown(where: Where, box: HTMLElement): void;
}

export function initUnlocks(pop: HTMLButtonElement, go: (where: Where) => void): Unlocks {
  const title = pop.querySelector('b')!, text = pop.querySelector('span')!;
  let list: Unlock[] = [], hideAt = 0, goneAt = 0;
  const hide = (ms: number) => {
    clearTimeout(hideAt);
    hideAt = window.setTimeout(() => {
      pop.classList.remove('show');
      clearTimeout(goneAt);
      goneAt = window.setTimeout(() => (pop.hidden = true), 320);
    }, ms);
  };
  function show(now: Unlock[]) {
    list = [...new Set([...(pop.hidden ? [] : list), ...now])];
    const one = UNLOCKS[list[0]];
    title.textContent = list.length > 1 ? `${list.length} new unlocks!` : 'New unlock!';
    text.textContent = list.length > 1 ? list.map(u => UNLOCKS[u].what).join(' · ') : `${one.name} · ${one.what}`;
    pop.setAttribute('aria-label', `${title.textContent} ${list.map(u => `${UNLOCKS[u].name}: ${UNLOCKS[u].what}`).join(', ')}. Show me`);
    clearTimeout(goneAt);
    pop.hidden = false;
    void pop.offsetWidth; // so it slides in again
    pop.classList.add('show');
    hide(SHOW_MS);
  }
  pop.addEventListener('pointerenter', () => clearTimeout(hideAt));
  pop.addEventListener('pointerleave', () => hide(1200));
  pop.addEventListener('focus', () => clearTimeout(hideAt));
  pop.addEventListener('blur', () => hide(1200));
  pop.addEventListener('click', () => {
    clearTimeout(hideAt);
    pop.classList.remove('show');
    pop.hidden = true;
    go(list.some(u => UNLOCKS[u].where === 'settings') ? 'settings' : 'config');
  });

  return {
    announce(now, delay = 0, quiet = false) {
      if (!now.length) return;
      if (!quiet) sound.unlock(delay);
      window.setTimeout(() => show(now), delay * 1000);
    },
    shown(where, box) {
      box.querySelectorAll('.is-new').forEach(el => el.classList.remove('is-new'));
      const fresh = UNLOCK_IDS.filter(u => UNLOCKS[u].where === where && isNew(u));
      const spots = fresh.flatMap(u => [...box.querySelectorAll<HTMLElement>(SPOTS[u])]).filter(el => !el.closest('[hidden]'));
      for (const el of spots) el.classList.add('is-new');
      requestAnimationFrame(() => spots[0]?.scrollIntoView({ block: 'nearest' }));
      markSeen(fresh);
      // The highlight goes with the panel: seen once, it is no longer new.
      const dialog = box.closest('dialog');
      dialog?.addEventListener('close', () => spots.forEach(el => el.classList.remove('is-new')), { once: true });
    },
  };
}
