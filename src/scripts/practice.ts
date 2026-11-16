// The Practice sheet: which set (one per category: countries, capitals, flags, languages, highest points, rivers) and
// where (the whole world or a continent), each with how many there are to find and the best so far. Start opens the
// set on one screen (fill.ts). Simpler than before 16 Nov 2026, when Practice asked one question type at a time, picked
// or typed, against the clock (James: "could the practice mode be simplified"). Flags are only ever the whole world,
// mixed (his finishing notes the same evening): for them the continents step aside.
import type { Knowledge } from './kb';
import { icon } from './menu';
import { bestLabel, practiceBest } from './fill';
import { REGIONS, SETS, regionFor, regionLabel, setItems, setOf, type Practice, type Region, type SetId } from './sets';

// ---------- the last practice picked, kept in this browser
const KEY = 'gk-practice';
function loadPractice(): Practice {
  const p: Practice = { set: 'countries', region: 'Europe' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (setOf(saved.set)) p.set = saved.set;
    // Before 16 Nov 2026 a question type was saved: its category's set now.
    else if (typeof saved.kind === 'string') p.set = SETS.find(s => saved.kind.split('.')[0] === s.kind.split('.')[0])?.id ?? p.set;
    if (REGIONS.includes(saved.region)) p.region = saved.region;
  } catch { /* private mode */ }
  return p;
}
export const practice = loadPractice();
const savePractice = () => { try { localStorage.setItem(KEY, JSON.stringify(practice)); } catch { /* private mode */ } };

export function initPractice(kb: Knowledge, root: HTMLElement, onStart: (p: Practice) => void) {
  const what = root.querySelector<HTMLElement>('#practice-what')!;
  const where = root.querySelector<HTMLElement>('#practice-where')!;
  const play = root.querySelector<HTMLButtonElement>('#practice-play')!;
  const playSub = play.querySelector<HTMLElement>('small')!;

  what.innerHTML = SETS.map(s => `<button type="button" class="pill set" data-set="${s.id}">${icon(s.cat)}${s.label}</button>`).join('');
  where.innerHTML = REGIONS.map(r => `<button type="button" class="pill" data-region="${r}">${regionLabel(r)} <small></small></button>`).join('');

  const counts = new Map<string, number>();
  const count = (set: SetId, r: Region) => {
    const k = `${set}|${r}`;
    if (!counts.has(k)) counts.set(k, setItems(kb, { set, region: r }).length);
    return counts.get(k)!;
  };

  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t || t.disabled) return;
    if (t.dataset.set) {
      practice.set = t.dataset.set as SetId;
      // A region with nothing to find in this set gives way to the whole world.
      if (!count(practice.set, practice.region)) practice.region = 'world';
    } else if (t.dataset.region) practice.region = t.dataset.region as Region;
    else if (t === play) { onStart(now()); return; }
    else return;
    savePractice();
    paint();
  });

  /** The practice as it will be played: flags in the whole world, whatever was picked for the others. */
  const now = (): Practice => ({ set: practice.set, region: regionFor(practice.set, practice.region) });

  function paint() {
    const p = now(), worldOnly = !!setOf(p.set)?.world;
    for (const b of what.querySelectorAll<HTMLButtonElement>('[data-set]')) b.setAttribute('aria-pressed', String(b.dataset.set === p.set));
    for (const b of where.querySelectorAll<HTMLButtonElement>('[data-region]')) {
      const r = b.dataset.region as Region, n = count(p.set, r);
      b.querySelector('small')!.textContent = String(n);
      b.disabled = !n;
      b.hidden = worldOnly && r !== 'world';
      b.setAttribute('aria-pressed', String(r === p.region));
    }
    const n = count(p.set, p.region), best = practiceBest(p);
    play.disabled = !n;
    playSub.textContent = `${n} to find${best ? ` · Best ${bestLabel(best)}` : ''}`;
  }

  paint();
  return { paint };
}
