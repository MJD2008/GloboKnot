// Practice: every question of one type in one region (or the whole world), in the same order every time, typed or
// picked, with the best score and time for each. For learning a set until it sticks, and for speedruns.
import { CONTINENTS, type Knowledge } from './kb';
import { icon } from './menu';
import { stats, type Best } from './prefs';
import { CATS, TEMPLATES, available, codeOf, type Answers } from './questions';

export type Region = 'world' | (typeof CONTINENTS)[number];
export interface Practice { kind: string; region: Region; answers: Extract<Answers, 'choose' | 'type'> }
const REGIONS: Region[] = ['world', ...CONTINENTS];
const REGION_CODE: Record<Region, string> = { world: 'w', Africa: 'af', Asia: 'as', Europe: 'eu', 'North America': 'na', 'South America': 'sa', Oceania: 'oc' };

/** "C-eu-t": capitals of Europe, typed. Records are kept under it, and it seeds the order: never change one. */
export const practiceKey = (p: Practice) => `${codeOf(p.kind)}-${REGION_CODE[p.region]}-${p.answers === 'choose' ? 'c' : 't'}`;
export const practiceSeed = (p: Practice) => `p-${practiceKey(p)}`;
export const practicePlaces = (kb: Knowledge, r: Region) => (r === 'world' ? [] : kb.countries.filter(c => kb.continent(c.id) === r).map(c => c.id));
export const regionLabel = (r: Region) => (r === 'world' ? 'World' : r);
const typable = (kind: string) => !!TEMPLATES.find(t => t.id === kind)?.typable;
/** "Country → capital · Europe" */
export const practiceLabel = (p: Practice) => `${TEMPLATES.find(t => t.id === p.kind)?.label ?? p.kind} · ${regionLabel(p.region)}`;
export const practiceBest = (p: Practice): Best | undefined => stats.practice?.[practiceKey(p)];

// ---------- the last practice picked, kept in this browser
const KEY = 'gk-practice';
function loadPractice(): Practice {
  const p: Practice = { kind: 'cap.name', region: 'Europe', answers: 'type' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (TEMPLATES.some(t => t.id === saved.kind)) p.kind = saved.kind;
    if (REGIONS.includes(saved.region)) p.region = saved.region;
    if (saved.answers === 'choose' || saved.answers === 'type') p.answers = saved.answers;
  } catch { /* private mode */ }
  return p;
}
export const practice = loadPractice();
const savePractice = () => { try { localStorage.setItem(KEY, JSON.stringify(practice)); } catch { /* private mode */ } };

const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const bestLabel = (b: Best) => `${b.pct}% in ${clock(b.ms)}`;

/** The Practice sheet: what (one question type, under its category), where, how to answer, and Start. */
export function initPractice(kb: Knowledge, root: HTMLElement, onStart: (p: Practice) => void) {
  const what = root.querySelector<HTMLElement>('#practice-what')!;
  const where = root.querySelector<HTMLElement>('#practice-where')!;
  const answers = root.querySelector<HTMLElement>('#practice-answers')!;
  const play = root.querySelector<HTMLButtonElement>('#practice-play')!;
  const playSub = play.querySelector<HTMLElement>('small')!;

  what.innerHTML = CATS.map(c => `
    <div class="p-group">
      <span class="p-cat">${icon(c.id)}${c.label}</span>
      <div class="p-kinds">${TEMPLATES.filter(t => t.cat === c.id).map(t => `<button type="button" class="pill" data-kind="${t.id}">${t.label}</button>`).join('')}</div>
    </div>`).join('');
  where.innerHTML = REGIONS.map(r => `<button type="button" class="pill" data-region="${r}">${regionLabel(r)} <small></small></button>`).join('');
  answers.innerHTML = '<button type="button" data-answers="choose">Choose <small>easier</small></button><button type="button" data-answers="type">Type</button>';

  const count = (r: Region) => available(kb, { kinds: [practice.kind], places: practicePlaces(kb, r), size: 0 });

  root.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!t || t.disabled) return;
    if (t.dataset.kind) {
      practice.kind = t.dataset.kind;
      // A region with nothing to ask for this type gives way to the whole world.
      if (!count(practice.region)) practice.region = 'world';
    } else if (t.dataset.region) practice.region = t.dataset.region as Region;
    else if (t.dataset.answers) practice.answers = t.dataset.answers as Practice['answers'];
    else if (t === play) { onStart({ ...practice, answers: typable(practice.kind) ? practice.answers : 'choose' }); return; }
    else return;
    savePractice();
    paint();
  });

  function paint() {
    for (const b of what.querySelectorAll<HTMLButtonElement>('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === practice.kind));
    for (const b of where.querySelectorAll<HTMLButtonElement>('[data-region]')) {
      const n = count(b.dataset.region as Region);
      b.querySelector('small')!.textContent = String(n);
      b.disabled = !n;
      b.setAttribute('aria-pressed', String(b.dataset.region === practice.region));
    }
    // "Which is the flag of X?" can only be picked: its answer is a picture.
    const canType = typable(practice.kind), how = canType ? practice.answers : 'choose';
    for (const b of answers.querySelectorAll<HTMLButtonElement>('[data-answers]')) {
      b.setAttribute('aria-pressed', String(b.dataset.answers === how));
      if (b.dataset.answers === 'type') { b.disabled = !canType; b.title = canType ? '' : 'A flag can only be picked'; }
    }
    const n = count(practice.region), best = practiceBest({ ...practice, answers: how });
    play.disabled = !n;
    playSub.textContent = `${n} questions${best ? ` · Best ${bestLabel(best)}` : ''}`;
  }

  paint();
  return { paint };
}
