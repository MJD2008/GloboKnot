// The preview's own tools (James, 23 Nov 2026: "for the preview icon, could you make it a button so I can select
// certain achievements/things automatically, so I don't have to actually complete a gordian knot to try and test out
// the unlocks"). Only while the site is a preview (Base.astro's PREVIEW makes the badge a button); gone at launch.
// A switch per unlock: on unlocks it at once, with its popup and twinkle as in the game (and "New unlock!" leads to
// it, lit up); off locks it again, so it is new once more. Also the countries explored (Tie the world), to see the
// globe and the count fill up. Everything stays in this browser only.
import { GOLD_AT, type Unlock, UNLOCK_IDS, relock, saveTied, tied, unlockNow, unlocked } from './prefs';
import { UNLOCKS } from './unlocks';

const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
const LETTERS = 'lcfgmr'; // a letter per category, as prefs.ts keeps them

export function initPreviewTools(badge: HTMLButtonElement, o: {
  /** Says what was unlocked, as the game does. */
  announce: (list: Unlock[]) => void;
  /** Something changed: colours, the configuration, the home screen and the globe drawn again. */
  refresh: () => void;
  /** Every country's id. */
  countries: () => string[];
}) {
  const d = document.createElement('dialog');
  d.className = 'sheet preview-tools';
  d.setAttribute('aria-labelledby', 'preview-tools-title');
  d.innerHTML = `<div class="sheet-in">
    <header class="sheet-head"><h2 id="preview-tools-title">Preview tools</h2><button class="icon-btn close" type="button" aria-label="Close">${X}</button></header>
    <div class="sheet-body">
      <p class="hint">Only in the preview, only in this browser. An unlock switched on comes with its popup, as in the game.</p>
      ${UNLOCK_IDS.map(u => `<div class="setting"><span>${UNLOCKS[u].name} <small>${UNLOCKS[u].what}</small></span>
        <button class="switch" type="button" role="switch" data-unlock="${u}" aria-label="${UNLOCKS[u].name}"><i></i></button></div>`).join('')}
      <div class="setting"><span>Everything</span><span class="pt-row"><button class="pill" type="button" data-all="on">Unlock all</button><button class="pill" type="button" data-all="off">Lock all</button></span></div>
      <div class="setting"><span>Countries explored <small id="pt-count"></small></span><span class="pt-row"><button class="pill" type="button" data-tie="20">+20</button><button class="pill" type="button" data-tie="gold">+5 gold</button><button class="pill" type="button" data-tie="clear">Clear</button></span></div>
    </div>
  </div>`;
  document.body.append(d);

  const paint = () => {
    for (const s of d.querySelectorAll<HTMLButtonElement>('[data-unlock]')) s.setAttribute('aria-checked', String(unlocked(s.dataset.unlock as Unlock)));
    const ids = new Set(o.countries());
    const n = Object.keys(tied).filter(id => ids.has(id)).length, gold = Object.entries(tied).filter(([id, l]) => ids.has(id) && l.length >= GOLD_AT).length;
    d.querySelector('#pt-count')!.textContent = `${n}/${ids.size}, ${gold} gold`;
  };
  /** Ties `n` countries not yet tied (one category), or turns `n` gold (three), at random. */
  const tieSome = (n: number, gold: boolean) => {
    const pool = o.countries().filter(id => (tied[id] ?? '').length < (gold ? GOLD_AT : 1)).sort(() => Math.random() - 0.5);
    for (const id of pool.slice(0, n)) {
      let l = tied[id] ?? '';
      for (const c of LETTERS) if (l.length < (gold ? GOLD_AT : 1) && !l.includes(c)) l += c;
      tied[id] = l;
    }
    saveTied();
  };

  badge.addEventListener('click', () => { paint(); d.showModal(); });
  d.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t === d || t.closest('.close')) { d.close(); return; }
    const b = t.closest<HTMLButtonElement>('button');
    if (!b) return;
    const turnOn = (list: Unlock[]) => {
      const now = list.filter(unlockNow);
      if (!now.length) return;
      o.refresh();
      d.close(); // so the popup is in sight (a dialog would cover it)
      o.announce(now);
    };
    if (b.dataset.unlock) {
      const u = b.dataset.unlock as Unlock;
      if (unlocked(u)) { relock(u); o.refresh(); } else turnOn([u]);
    } else if (b.dataset.all === 'on') turnOn(UNLOCK_IDS);
    else if (b.dataset.all === 'off') { for (const u of UNLOCK_IDS) if (unlocked(u)) relock(u); o.refresh(); }
    else if (b.dataset.tie === 'clear') { for (const id of Object.keys(tied)) delete tied[id]; saveTied(); o.refresh(); }
    else if (b.dataset.tie) { tieSome(b.dataset.tie === 'gold' ? 5 : 20, b.dataset.tie === 'gold'); o.refresh(); }
    paint();
  });
}
