// The quiz: home → questions → results. The configuration (≡) decides what is asked; minimal words, while colour,
// motion and sound carry the feedback. The answer always appears where the player is looking: in the answer box.
// Every question has a time limit; a wrong typed answer is not revealed, the player tries again until time runs out.
import { geoDistance } from 'd3-geo';
import { resolve } from '../../scripts/lib/match.mjs';
import { norm } from '../../scripts/lib/text.mjs';
import { Globe } from './globe';
import { Knowledge, type Country, type Entity, type KBData } from './kb';
import { WorldMap } from './map';
import { catOn, icon, initMenu, placesLabel, setCat } from './menu';
import { ACCENTS, TIMES, applySettings, dailyResult, saveDaily, saveSelection, saveSettings, selection, settings, today, type Accent } from './prefs';
import { CATS, DAILY, TEMPLATES, available, buildRound, remember, seeded, type Cat, type Pool, type Question, type Selection } from './questions';
import { sound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const url = (path: string) => new URL(path, document.baseURI).href;

applySettings();

const screens = { start: $('#start'), quiz: $('#quiz'), results: $('#results') };
const ui = {
  chips: $('#chips'),
  play: $<HTMLButtonElement>('#play'),
  playSub: $('#play-sub'),
  daily: $<HTMLButtonElement>('#daily'),
  dailySub: $('#daily-sub'),
  choose: $<HTMLButtonElement>('#choose'),
  quit: $<HTMLButtonElement>('#quit'),
  beads: $('#beads'),
  clock: $('#clock'),
  timer: $('#timer'),
  count: $('#count'),
  card: $('#card'),
  tags: $('#tags'),
  media: $('#media'),
  svg: $('#map') as unknown as SVGSVGElement,
  flag: $<HTMLImageElement>('#flag'),
  sample: $('#sample'),
  prompt: $('#prompt'),
  badge: $('#badge'),
  form: $<HTMLFormElement>('#answer-form'),
  input: $<HTMLInputElement>('#answer'),
  choices: $('#choices'),
  verdict: $('#verdict'),
  typed: $('#typed'),
  right: $('#right'),
  next: $<HTMLButtonElement>('#next'),
  skip: $<HTMLButtonElement>('#skip'),
  ring: $('#ring') as unknown as SVGSVGElement,
  pct: $('#pct'),
  rank: $('#rank'),
  summary: $('#summary'),
  answers: $('#answers'),
  again: $<HTMLButtonElement>('#again'),
  change: $<HTMLButtonElement>('#change'),
  home: $<HTMLButtonElement>('#home'),
  edition: $('#edition'),
  globe: $<HTMLCanvasElement>('#globe'),
  menu: $<HTMLDialogElement>('#menu'),
  settings: $<HTMLDialogElement>('#settings'),
  about: $<HTMLDialogElement>('#about'),
};

let kb: Knowledge;
let world: WorldMap;
let pools: Record<Pool, Entity[]>;
let globe: Globe | null = null;
let menu: { paint(): void } | null = null;
let riversLoaded: Promise<void> | null = null;

interface Result {
  q: Question;
  ok: boolean;
  typed: string;   // the right answer as typed, or the last wrong one
  late?: boolean;  // the time ran out
  tries: number;   // answers sent, the right one included (one pick for a choice question)
  pick?: string;   // the option picked (choice questions)
}
const state = {
  sel: selection as Selection,
  daily: false,
  round: [] as Question[],
  i: 0,
  results: [] as Result[],
  streak: 0,
  best: 0,
  started: 0,
  locked: false,
  timed: true,
  clock: 0,
  advance: 0,
  low: 0,
  deadline: 0,
  secs: 0,        // the second last shown in the countdown
  tries: 0,       // wrong typed answers on this question
  lastWrong: '',  // the last of them
  auto: 0,        // auto-submit, waiting for a pause in typing
};

// ---------------------------------------------------------------- loading
async function load() {
  // The globe is decoration: it loads on its own and never holds up the quiz.
  fetch(url('data/globe.json')).then(r => r.json()).then(topo => {
    globe = new Globe(ui.globe, topo);
    globe.chainNear = chainNear;
    if (!screens.start.hidden) globe.play();
  }).catch(() => { ui.globe.hidden = true; });

  const [data, topo] = await Promise.all([
    fetch(url('data/countries.json')).then(r => r.json() as Promise<KBData>),
    fetch(url('data/world.json')).then(r => r.json()),
  ]);
  kb = new Knowledge(data);
  world = new WorldMap(topo);
  pools = { country: kb.countries, city: kb.cities, language: kb.languages, peak: kb.peaks, river: kb.rivers };
  ui.edition.textContent = data.edition;
  menu = initMenu(kb, ui.menu, paintHome);
  [ui.play, ui.daily, ui.choose].forEach(b => (b.disabled = false));
  paintHome();
  document.body.classList.add('ready');
  if (!screens.start.hidden) globe?.play();
}

function loadRivers(): Promise<void> {
  riversLoaded ??= fetch(url('data/rivers.json')).then(r => r.json()).then(courses => { world.rivers = courses; });
  return riversLoaded;
}

/** A walk of up to five neighbouring countries starting near (lon, lat), for the globe on the home screen. */
function chainNear(lon: number, lat: number): [number, number][] {
  if (!kb) return [];
  const at = (c: Country): [number, number] => [c.ll[1], c.ll[0]];
  const starts = kb.countries
    .filter(c => c.tier === 'core' && kb.neighbours(c.id).length)
    .map(c => ({ c, d: geoDistance([lon, lat], at(c)) }))
    .filter(x => x.d < 0.9)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  if (!starts.length) return [];
  let cur = starts[Math.floor(Math.random() * starts.length)].c;
  const seen = new Set([cur.id]);
  const out = [at(cur)];
  for (let i = 0; i < 4; i++) {
    const next = kb.neighbours(cur.id).filter(id => !seen.has(id)).map(id => kb.country(id)).filter((c): c is Country => !!c);
    if (!next.length) break;
    cur = next[Math.floor(Math.random() * next.length)];
    seen.add(cur.id);
    out.push(at(cur));
  }
  return out;
}

// ---------------------------------------------------------------- home
function paintHome() {
  if (!kb) return;
  ui.chips.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.cat = c.id;
    const on = catOn(c.id);
    b.setAttribute('aria-pressed', String(on !== 'none'));
    if (on === 'some') b.classList.add('some');
    b.innerHTML = `${icon(c.id)}<span>${c.label}</span>`;
    ui.chips.append(b);
  }
  const n = available(kb, selection);
  ui.play.disabled = !selection.kinds.length || !n;
  ui.playSub.textContent = !selection.kinds.length ? 'Pick a category' : `${Math.min(selection.size, n)} questions · ${placesLabel(kb)}`;
  const done = dailyResult();
  ui.dailySub.textContent = done === null ? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : `${Math.round(done * 100)}%`;
  ui.daily.classList.toggle('done', done !== null);
}

// ---------------------------------------------------------------- screens and sheets
function show(name: keyof typeof screens) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  if (name === 'start') { globe?.play(); paintHome(); } else globe?.pause();
  window.scrollTo({ top: 0 });
}

function open(d: HTMLDialogElement) {
  for (const other of [ui.menu, ui.settings, ui.about]) if (other !== d && other.open) other.close();
  $('#about-time').textContent = String(settings.time);
  if (d === ui.menu) menu?.paint();
  if (d === ui.settings) paintSettings();
  if (!d.open) d.showModal();
}
for (const d of [ui.menu, ui.settings, ui.about]) {
  d.addEventListener('click', e => {
    // A click on the backdrop (the dialog box itself, outside its panel) or a close button closes it.
    if (e.target === d || (e.target as HTMLElement).closest('.close')) d.close();
  });
}

// ---------------------------------------------------------------- a round
async function start(sel: Selection, daily = false) {
  if (!kb) return;
  state.sel = sel;
  state.daily = daily;
  state.round = buildRound(kb, sel, daily ? seeded(`globoknot ${today()}`) : Math.random, daily);
  if (!state.round.length) return;
  if (state.round.some(q => q.media.kind === 'map' && q.media.river)) {
    try { await loadRivers(); } catch { state.round = state.round.filter(q => !(q.media.kind === 'map' && q.media.river)); }
  }
  for (const d of [ui.menu, ui.settings, ui.about]) if (d.open) d.close();
  state.i = 0;
  state.results = [];
  state.streak = state.best = 0;
  state.timed = true; // every round, the Daily too
  state.started = performance.now();
  ui.beads.innerHTML = state.round.map(() => '<i></i>').join('');
  ui.beads.classList.toggle('many', state.round.length > 20);
  ui.clock.hidden = state.round.length <= 20; // long rounds also count: "12/50"
  clearInterval(state.clock);
  show('quiz');
  ask();
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- one question
const ARROW = '<svg viewBox="0 0 14 10" aria-hidden="true"><path d="M1 5h11M8.5 1.5 12 5 8.5 8.5"/></svg>';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function ask() {
  const q = state.round[state.i];
  state.locked = false;
  state.tries = 0;
  state.lastWrong = '';
  clearTimeout(state.auto);
  ui.skip.style.visibility = '';
  ui.card.classList.remove('ok', 'bad');
  ui.verdict.hidden = true;
  [...ui.beads.children].forEach((el, j) => el.classList.toggle('now', j === state.i));
  ui.clock.textContent = `${state.i + 1}/${state.round.length}`;
  // What is given and what is asked, top left: MAP → COUNTRY.
  ui.tags.innerHTML = `<span class="tag">${esc(q.given)}</span>${ARROW}<span class="tag ask">${esc(q.asked)}</span>`;

  // the clue
  const m = q.media;
  ui.media.dataset.kind = m.kind;
  if (m.kind === 'map') {
    const c = m.country ? kb.country(m.country) : undefined;
    world.render(ui.svg, { num: c?.num, ll: c?.ll, dot: m.dot, peak: m.peak, river: m.river });
    ui.svg.setAttribute('aria-label', m.river ? 'Map with a river' : m.peak ? 'Map with a mountain' : m.dot ? 'Map with a country and its capital' : 'Map with one country highlighted');
  } else if (m.kind === 'flag') {
    showFlag(ui.flag, url(`flags/${kb.country(m.country)!.flag}.svg`));
  } else if (m.kind === 'text') {
    ui.sample.textContent = m.text;
    ui.sample.lang = m.lang;
  }
  ui.prompt.textContent = q.prompt;
  ui.badge.innerHTML = m.kind === 'none' ? icon(q.cat) : '';

  // the answer
  if (q.format === 'type') {
    ui.form.hidden = false;
    ui.choices.hidden = true;
    ui.input.value = '';
    ui.input.readOnly = false;
    ui.input.classList.remove('miss', 'unknown');
    ui.input.placeholder = placeholder(q.pools);
    ui.input.focus({ preventScroll: true });
  } else {
    ui.form.hidden = true;
    ui.choices.hidden = false;
    const flags = q.choices!.some(c => c.flag);
    ui.choices.className = `choices${flags ? ' flags loading' : ''}`;
    ui.choices.innerHTML = '';
    q.choices!.forEach((ch, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.dataset.id = ch.id;
      if (ch.flag) {
        b.innerHTML = `<kbd>${j + 1}</kbd><img alt="" src="${url(`flags/${ch.flag}.svg`)}" /><span class="name"></span>`;
        b.setAttribute('aria-label', `Flag ${j + 1}`);
      } else b.innerHTML = `<kbd>${j + 1}</kbd><span class="name"></span>`;
      b.querySelector('.name')!.textContent = ch.label;
      b.addEventListener('click', () => answer(ch.id, ch.label));
      ui.choices.append(b);
    });
    // Flag options appear together, once their images are ready (at most a moment later).
    if (flags) {
      const imgs = [...ui.choices.querySelectorAll('img')];
      const shown = () => { if (state.round[state.i] === q) ui.choices.classList.remove('loading'); };
      Promise.all(imgs.map(i => i.decode().catch(() => undefined))).then(shown);
      setTimeout(shown, 600);
    }
    (document.activeElement as HTMLElement | null)?.blur();
  }
  preload(state.round[state.i + 1]);
  startTimer();
}

function placeholder(p: Pool[]): string {
  if (p.length > 1) return 'Language, or a country where it’s spoken';
  return { country: 'Country', city: 'City', language: 'Language', peak: 'Mountain', river: 'River' }[p[0]];
}

// ---- flags: the new flag shows only once it is decoded, so the old one never flashes up. The next question's
// flags load while this one is played.
let flagToken = 0;
function showFlag(img: HTMLImageElement, src: string) {
  const token = ++flagToken;
  img.classList.add('loading');
  img.src = src;
  const done = () => { if (token === flagToken) img.classList.remove('loading'); };
  img.decode().then(done, done);
}
const preloaded = new Set<string>();
function preload(q?: Question) {
  if (!q) return;
  const flags = q.media.kind === 'flag' ? [kb.country(q.media.country)!.flag] : (q.choices ?? []).map(c => c.flag).filter((f): f is string => !!f);
  for (const f of flags) {
    const src = url(`flags/${f}.svg`);
    if (preloaded.has(src)) continue;
    preloaded.add(src);
    const img = new Image();
    img.src = src;
    img.decode().catch(() => undefined);
  }
}

// ---- the time limit, under the answer box (a phone's keyboard covers the bottom of the screen). The bar runs from
// green to red; the last five seconds are counted, with a heartbeat. Drawn frame by frame: it is information, so it
// runs even when the player asked for reduced motion (which only stops the heartbeat).
function startTimer() {
  const total = settings.time * 1000;
  state.deadline = performance.now() + total;
  state.secs = 0;
  ui.timer.classList.remove('low', 'out', 'beat', 'stopped');
  ui.count.textContent = '';
  cancelAnimationFrame(state.low);
  const frame = () => {
    if (state.locked) return;
    const ms = Math.max(0, state.deadline - performance.now());
    ui.timer.style.setProperty('--left', (ms / total).toFixed(4));
    const s = Math.ceil(ms / 1000);
    if (ms > 0 && s <= 5 && s !== state.secs) {
      state.secs = s;
      ui.count.textContent = String(s);
      ui.timer.classList.add('low');
      ui.timer.classList.remove('beat');
      void ui.timer.offsetWidth; // restart the heartbeat on every second
      ui.timer.classList.add('beat');
      sound.tick(s);
    }
    if (ms <= 0) { timeUp(); return; }
    state.low = requestAnimationFrame(frame);
  };
  frame();
}
function stopTimer() {
  cancelAnimationFrame(state.low);
  ui.timer.classList.remove('beat');
  ui.timer.classList.add('stopped');
  ui.count.textContent = '';
}
function timeUp() {
  if (state.locked) return;
  ui.timer.classList.add('out'); // the bar leaves an empty box behind
  finish(state.round[state.i], false, state.lastWrong, true);
}

/** The entity a typed answer means. One name can belong to two things (Tonga is a country and a language): an exact
 *  match on an accepted one comes first. Typos are still judged against everything, so a slip never turns into a
 *  near neighbour. */
function match(typed: string, q: Question): Entity | null {
  const pool = q.pools.flatMap(p => pools[p]), right = (e: Entity) => q.accept.includes(e.id);
  return resolve(typed, [...pool.filter(right), ...pool.filter(e => !right(e))]);
}

/** `given` is the typed text or a choice id. */
function answer(given: string, label = given) {
  if (state.locked) return;
  const q = state.round[state.i];
  if (q.format === 'type') {
    const typed = label.trim();
    if (!typed) { nudge(); return; }
    const hit = match(typed, q);
    if (hit && q.accept.includes(hit.id)) { finish(q, true, hit.name); return; } // silent auto-correct
    // Wrong: nothing is revealed. The box shows how the answer was read (struck through) and is selected, so typing
    // replaces it. A name we don't know gets a dotted underline instead.
    state.tries++;
    state.lastWrong = hit?.name ?? typed;
    if (hit) ui.input.value = hit.name;
    ui.input.classList.remove('miss', 'unknown');
    void ui.input.offsetWidth;
    ui.input.classList.add(hit ? 'miss' : 'unknown');
    ui.input.select();
    nudge();
    sound.retry();
    return;
  }
  const ok = q.accept.includes(given);
  ui.choices.querySelector(`.choice[data-id="${CSS.escape(given)}"]`)?.classList.add(ok ? 'right' : 'wrong');
  finish(q, ok, label, false, given);
}

// ---- auto-submit: a typed answer that is exactly a right name (or alias) is sent without Enter. A name that is the
// start of a longer one waits a little longer ("Niger" on the way to "Nigeria"). Only right answers go by themselves.
const names = (e: Entity) => [e.name, ...e.aliases];
function autoSubmit() {
  clearTimeout(state.auto);
  const q = state.round[state.i];
  if (!settings.auto || state.locked || q?.format !== 'type') return;
  const k = norm(ui.input.value);
  if (!k) return;
  const pool = q.pools.flatMap(p => pools[p]);
  if (!pool.some(e => q.accept.includes(e.id) && names(e).some(n => norm(n) === k))) return;
  const longer = pool.some(e => names(e).some(n => { const m = norm(n); return m.length > k.length && m.startsWith(k); }));
  state.auto = window.setTimeout(() => {
    if (!state.locked && state.round[state.i] === q && norm(ui.input.value) === k) answer(ui.input.value);
  }, longer ? 500 : 150);
}

function giveUp() {
  if (state.locked) return;
  finish(state.round[state.i], false, state.lastWrong);
}

function finish(q: Question, ok: boolean, typed: string, late = false, pick?: string) {
  state.locked = true;
  clearTimeout(state.auto);
  ui.skip.style.visibility = 'hidden';
  stopTimer();
  ui.input.readOnly = true; // not disabled: that would close a phone's keyboard between questions
  ui.input.classList.remove('miss', 'unknown');
  state.results.push({ q, ok, typed, late, tries: q.format === 'type' ? state.tries + (ok ? 1 : 0) : 1, pick });
  state.streak = ok ? state.streak + 1 : 0;
  state.best = Math.max(state.best, state.streak);
  ui.beads.children[state.i].classList.add(ok ? 'ok' : 'bad');
  ui.card.classList.add(ok ? 'ok' : 'bad');

  // The verdict sits on the answer box: the right answer, after a wrong typed one struck through.
  if (q.format === 'type') {
    ui.verdict.hidden = false;
    ui.verdict.className = `verdict ${ok ? 'ok' : 'bad'}`;
    ui.typed.textContent = late ? "Time's up" : !ok && typed ? typed : '';
    ui.typed.classList.toggle('late', late);
    ui.right.textContent = ok ? typed : q.answer;
    ui.verdict.classList.toggle('long', ui.right.textContent.length > 24);
  } else {
    // The right option lights up, also after a skip or when time ran out.
    for (const b of ui.choices.querySelectorAll<HTMLButtonElement>('.choice')) {
      b.disabled = true;
      if (q.accept.includes(b.dataset.id!)) b.classList.add('right');
    }
    if (q.choices!.some(c => c.flag)) ui.choices.classList.add('named');
  }
  if (q.media.kind === 'map' && q.reveal?.length) world.reveal(q.reveal.map(id => kb.country(id)?.num).filter((n): n is string => !!n));

  if (ok) sound.right(state.streak - 1); else if (late) sound.timeout(); else sound.wrong();
  clearTimeout(state.advance);
  state.advance = window.setTimeout(next, ok ? 900 : 2200);
}

function next() {
  clearTimeout(state.advance);
  if (!state.locked) return;
  state.i++;
  if (state.i < state.round.length) ask(); else end();
}

function quit() {
  clearTimeout(state.advance);
  clearTimeout(state.auto);
  cancelAnimationFrame(state.low);
  clearInterval(state.clock);
  if (!state.results.length) { show('start'); return; }
  state.round = state.round.slice(0, state.results.length);
  end();
}

function nudge() {
  ui.card.classList.remove('shake');
  void ui.card.offsetWidth; // restart the animation
  ui.card.classList.add('shake');
}

// ---------------------------------------------------------------- results
const RANKS: [number, string][] = [[100, 'Knot closed'], [90, 'Cartographer'], [75, 'Navigator'], [50, 'Explorer'], [25, 'Wanderer'], [0, 'Stowaway']];

function end() {
  clearInterval(state.clock);
  cancelAnimationFrame(state.low);
  const ms = performance.now() - state.started;
  const total = state.results.length;
  const right = state.results.filter(r => r.ok).length;
  const share = total ? right / total : 0;
  const pct = Math.round(share * 100);
  remember(state.round.map(q => q.key));
  if (state.daily && total === 10) saveDaily(share);

  ui.pct.textContent = `${pct}%`;
  ui.rank.textContent = RANKS.find(([min]) => pct >= min)![1];
  ui.summary.textContent = `${right} of ${total} · ${clock(ms)}${state.best >= 3 ? ` · ${state.best} in a row` : ''}`;
  drawRing(state.results.map(r => r.ok), share === 1);

  ui.answers.innerHTML = '';
  state.results.forEach((r, j) => {
    const li = document.createElement('li');
    li.className = r.ok ? 'ok' : 'bad';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(j + 1);
    const clue = document.createElement('span');
    clue.className = 'clue';
    if (r.q.media.kind === 'flag') {
      const img = document.createElement('img');
      img.src = url(`flags/${kb.country(r.q.media.country)!.flag}.svg`);
      img.alt = 'Flag';
      clue.append(img);
    } else if (r.q.media.kind === 'map' && r.q.media.country && (r.q.kind === 'loc.map' || r.q.kind === 'cap.map')) {
      // The country's outline (and the capital's dot) instead of the word "Map".
      const c = kb.country(r.q.media.country)!;
      clue.innerHTML = world.thumb(c.num, r.q.media.dot);
      if (r.q.kind === 'cap.map') clue.append(c.name);
    } else clue.textContent = r.q.clue;
    const a = document.createElement('span');
    a.className = 'ans';
    const flagOf = (id: string) => { const img = document.createElement('img'); img.src = url(`flags/${kb.country(id)!.flag}.svg`); img.alt = kb.name(id); return img; };
    if (r.q.kind === 'flag.pick') {
      // The flags themselves: the right one, and the one picked if that was another.
      const b = document.createElement('strong');
      b.append(flagOf(r.q.accept[0]));
      a.append(b);
      if (!r.ok && r.pick) { const s = document.createElement('s'); s.append(flagOf(r.pick)); a.append(s); }
      if (r.late) { const s = document.createElement('small'); s.textContent = "Time's up"; a.append(s); }
    } else {
      if (!r.ok && r.typed) { const s = document.createElement('s'); s.textContent = r.typed; a.append(s, ' '); }
      if (r.late) { const s = document.createElement('small'); s.textContent = "Time's up"; a.append(s, ' '); }
      if (r.ok && r.tries > 1) { const s = document.createElement('small'); s.textContent = `${ordinal(r.tries)} try`; a.append(s, ' '); }
      const b = document.createElement('strong');
      b.textContent = r.ok && r.q.format === 'type' ? r.typed : r.q.answer;
      a.append(b);
    }
    li.append(n, clue, a);
    ui.answers.append(li);
  });
  sound.done(share);
  show('results');
  ui.again.focus({ preventScroll: true });
}

const ordinal = (n: number) => `${n}${n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** The knot: one strand per question around a ring, tied (accent) when right. All right closes the ring. */
function drawRing(oks: boolean[], closed: boolean) {
  const n = oks.length, R = 92, C = 110, gap = n > 1 ? Math.min(0.06, 1.2 / n) : 0;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => `${(C + R * Math.sin(a)).toFixed(2)} ${(C - R * Math.cos(a)).toFixed(2)}`;
    return `M${p(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
  };
  let svg = `<circle class="track" cx="${C}" cy="${C}" r="${R}"/>`;
  if (closed) svg += `<circle class="strand ok closed" cx="${C}" cy="${C}" r="${R}" style="--d:0s"/>`;
  else oks.forEach((ok, j) => {
    const a0 = (j / n) * 2 * Math.PI + gap / 2, a1 = ((j + 1) / n) * 2 * Math.PI - gap / 2;
    svg += `<path class="strand ${ok ? 'ok' : 'bad'}" d="${arc(a0, a1)}" style="--d:${(j * Math.min(0.08, 1.2 / n)).toFixed(3)}s"/>`;
  });
  ui.ring.innerHTML = svg;
}

// ---------------------------------------------------------------- settings
function paintSettings() {
  $('#set-sound').setAttribute('aria-checked', String(!sound.muted));
  $('#set-auto').setAttribute('aria-checked', String(settings.auto));
  $('#set-time').innerHTML = TIMES.map(t => `<button type="button" data-time="${t}" aria-pressed="${settings.time === t}">${t} s</button>`).join('');
  $('#set-theme').innerHTML = (['auto', 'light', 'dark'] as const).map(t => `<button type="button" data-theme="${t}" aria-pressed="${settings.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  $('#set-accent').innerHTML = (Object.keys(ACCENTS) as Accent[]).map(a => `<button type="button" data-accent="${a}" aria-pressed="${settings.accent === a}" title="${ACCENTS[a].label}" aria-label="${ACCENTS[a].label}" style="--sw:${ACCENTS[a].light}"></button>`).join('');
}
ui.settings.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!t) return;
  if (t.id === 'set-sound') sound.toggle();
  else if (t.id === 'set-auto') settings.auto = !settings.auto;
  else if (t.dataset.time) settings.time = Number(t.dataset.time);
  else if (t.dataset.theme) settings.theme = t.dataset.theme as typeof settings.theme;
  else if (t.dataset.accent) settings.accent = t.dataset.accent as Accent;
  else return;
  saveSettings();
  paintSettings();
  menu?.paint();
});

// ---------------------------------------------------------------- events
ui.chips.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
  if (!b) return;
  const cat = b.dataset.cat as Cat;
  const on = catOn(cat) === 'none';
  // Something always stays selected: the last category can't be switched off.
  if (!on && selection.kinds.every(k => TEMPLATES.find(t => t.id === k)?.cat === cat)) {
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
    return;
  }
  setCat(cat, on);
  saveSelection();
  paintHome();
});
ui.play.addEventListener('click', () => start(selection));
ui.daily.addEventListener('click', () => start(DAILY, true));
ui.choose.addEventListener('click', () => open(ui.menu));
$('#open-menu').addEventListener('click', () => open(ui.menu));
$('#open-settings').addEventListener('click', () => open(ui.settings));
$('#open-about').addEventListener('click', () => open(ui.about));
$('#menu-play').addEventListener('click', () => start(selection));
ui.form.addEventListener('submit', e => { e.preventDefault(); if (state.locked) next(); else answer(ui.input.value); });
ui.input.addEventListener('input', () => { ui.input.classList.remove('miss', 'unknown'); autoSubmit(); });
ui.skip.addEventListener('click', () => (state.locked ? next() : giveUp()));
ui.next.addEventListener('click', next);
ui.quit.addEventListener('click', quit);
ui.again.addEventListener('click', () => start(state.sel, state.daily));
ui.change.addEventListener('click', () => { show('start'); open(ui.menu); });
ui.home.addEventListener('click', () => show('start'));
ui.card.addEventListener('animationend', e => { if (e.target === ui.card) ui.card.classList.remove('shake'); });
ui.chips.addEventListener('animationend', e => (e.target as HTMLElement).classList.remove('shake'));
ui.card.addEventListener('click', e => {
  // During the verdict a tap anywhere on the card moves on (but not a tap that just answered).
  if (state.locked && !(e.target as HTMLElement).closest('.choice')) next();
});

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || screens.quiz.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); state.locked ? next() : giveUp(); return; }
  if (e.key === 'Enter' && state.locked) { e.preventDefault(); next(); return; }
  // Typing during the verdict moves straight on, and the letter lands in the next answer box.
  if (state.locked && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) { next(); return; }
  const q = state.round[state.i];
  if (q?.format === 'choice' && !state.locked && /^[1-4]$/.test(e.key)) {
    ui.choices.querySelectorAll<HTMLButtonElement>('.choice')[Number(e.key) - 1]?.click();
  }
});

load().catch(() => {
  ui.playSub.textContent = 'Could not load the data. Please reload.';
});
