// The Practice sheet: which set (one per category: countries, capitals, flags, languages, highest points, rivers) and
// where (the whole world or a continent), each with how many there are to find and the best so far. Start opens the
// set on one screen, to fill in at once (fill.ts). Simpler than before 16 Nov 2026, when Practice asked one question
// type at a time, picked or typed, against the clock (James: "could the practice mode be simplified").
import type { Knowledge } from './kb';
import { icon } from './menu';
import { bestLabel, practiceBest } from './fill';
import { REGIONS, SETS, regionLabel, setItems, setOf, type Practice, type Region, type SetId } from './sets';

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
    else if (t === play) { onStart({ ...practice }); return; }
    else return;
    savePractice();
    paint();
  });

  function paint() {
    for (const b of what.querySelectorAll<HTMLButtonElement>('[data-set]')) b.setAttribute('aria-pressed', String(b.dataset.set === practice.set));
    for (const b of where.querySelectorAll<HTMLButtonElement>('[data-region]')) {
      const n = count(practice.set, b.dataset.region as Region);
      b.querySelector('small')!.textContent = String(n);
      b.disabled = !n;
      b.setAttribute('aria-pressed', String(b.dataset.region === practice.region));
    }
    const n = count(practice.set, practice.region), best = practiceBest(practice);
    play.disabled = !n;
    playSub.textContent = `${n} to find${best ? ` · Best ${bestLabel(best)}` : ''}`;
  }

  paint();
  return { paint };
}
