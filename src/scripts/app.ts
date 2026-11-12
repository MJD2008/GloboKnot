// The quiz screen: start → 10 questions → results. Minimal words; colour, motion and sound carry the feedback.
import { geoDistance } from 'd3-geo';
import { resolve } from '../../scripts/lib/match.mjs';
import { Globe } from './globe';
import { Knowledge, type Country, type Entity, type KBData } from './kb';
import { WorldMap } from './map';
import { buildRound, remember, type Mode, type Question } from './questions';
import { sound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const url = (path: string) => new URL(path, document.baseURI).href;

const screens = { start: $('#start'), play: $('#play'), results: $('#results') };
const ui = {
  modes: [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')],
  card: $('#card'),
  media: $('#media'),
  svg: $('#map') as unknown as SVGSVGElement,
  flag: $<HTMLImageElement>('#flag'),
  prompt: $('#prompt'),
  form: $<HTMLFormElement>('#answer-form'),
  input: $<HTMLInputElement>('#answer'),
  choices: $('#choices'),
  reveal: $('#reveal'),
  skip: $<HTMLButtonElement>('#skip'),
  progress: $('#progress'),
  clock: $('#clock'),
  log: $('#log'),
  score: $('#score'),
  time: $('#time'),
  misses: $('#misses'),
  again: $<HTMLButtonElement>('#again'),
  home: $<HTMLButtonElement>('#home'),
  sound: $<HTMLButtonElement>('#sound'),
  edition: $('#edition'),
  globe: $<HTMLCanvasElement>('#globe'),
};

let kb: Knowledge;
let world: WorldMap;
let pools: Record<Question['pool'], Entity[]>;
let globe: Globe | null = null;

const state = {
  mode: 'mixed' as Mode,
  round: [] as Question[],
  i: 0,
  results: [] as { q: Question; ok: boolean; typed: string }[],
  streak: 0,
  started: 0,
  locked: false,
  timer: 0,
  advance: 0,
};

// ---------- loading
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
  pools = { country: kb.countries, city: kb.cities, language: kb.languages };
  ui.edition.textContent = data.edition;
  ui.modes.forEach(b => (b.disabled = false));
  document.body.classList.add('ready');
  if (!screens.start.hidden) globe?.play();
}

/** A walk of up to five neighbouring countries starting near (lon, lat), for the globe on the start screen. */
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

// ---------- screens
function show(name: keyof typeof screens) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  if (name === 'start') globe?.play(); else globe?.pause();
  window.scrollTo({ top: 0 });
}

function start(mode: Mode) {
  state.mode = mode;
  state.round = buildRound(kb, mode, 10);
  state.i = 0;
  state.results = [];
  state.streak = 0;
  state.started = performance.now();
  ui.log.innerHTML = '';
  ui.progress.innerHTML = state.round.map(() => '<i></i>').join('');
  clearInterval(state.timer);
  state.timer = window.setInterval(tick, 250);
  tick();
  show('play');
  ask();
}

function tick() {
  ui.clock.textContent = clock(performance.now() - state.started);
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- one question
function ask() {
  const q = state.round[state.i];
  state.locked = false;
  ui.card.classList.remove('ok', 'bad');
  ui.reveal.textContent = '';
  ui.reveal.className = 'reveal';
  [...ui.progress.children].forEach((el, j) => el.classList.toggle('now', j === state.i));

  // media
  ui.media.dataset.kind = q.media.kind;
  if (q.media.kind === 'map') {
    const c = kb.country(q.media.country)!;
    world.render(ui.svg, c.num, c.ll);
  } else if (q.media.kind === 'flag') {
    const c = kb.country(q.media.country)!;
    ui.flag.src = url(`flags/${c.flag}.svg`);
  }
  ui.prompt.textContent = q.prompt;

  // answer
  if (q.format === 'type') {
    ui.form.hidden = false;
    ui.choices.hidden = true;
    ui.input.value = '';
    ui.input.readOnly = false;
    ui.input.placeholder = q.pool === 'city' ? 'City' : q.pool === 'language' ? 'Language' : 'Country';
    ui.input.focus({ preventScroll: true });
  } else {
    ui.form.hidden = true;
    ui.choices.hidden = false;
    ui.choices.innerHTML = '';
    q.choices!.forEach((ch, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.dataset.id = ch.id;
      b.innerHTML = `<kbd>${j + 1}</kbd><span></span>`;
      b.querySelector('span')!.textContent = ch.label;
      b.addEventListener('click', () => answer(ch.id, ch.label));
      ui.choices.append(b);
    });
    (document.activeElement as HTMLElement | null)?.blur();
  }
}

/** `given` is the typed text or a choice id. */
function answer(given: string, label = given) {
  if (state.locked) return;
  const q = state.round[state.i];
  let ok = false, typed = label.trim();
  if (q.format === 'type') {
    if (!typed) { nudge(); return; }
    const hit = resolve(typed, pools[q.pool]);
    ok = !!hit && q.accept.includes(hit.id);
    if (ok && hit) typed = hit.name; // silent auto-correct: the log shows the correct spelling
  } else {
    ok = q.accept.includes(given);
    for (const b of ui.choices.querySelectorAll<HTMLButtonElement>('.choice')) {
      b.disabled = true;
      if (q.accept.includes(b.dataset.id!)) b.classList.add('right');
      else if (b.dataset.id === given) b.classList.add('wrong');
    }
  }
  finish(q, ok, typed);
}

function giveUp() {
  if (state.locked) return;
  finish(state.round[state.i], false, '');
}

function finish(q: Question, ok: boolean, typed: string) {
  state.locked = true;
  ui.input.readOnly = true; // not disabled: that would close a phone's keyboard between questions
  state.results.push({ q, ok, typed });
  state.streak = ok ? state.streak + 1 : 0;
  ui.progress.children[state.i].classList.add(ok ? 'ok' : 'bad');
  ui.card.classList.add(ok ? 'ok' : 'bad');

  // The right answer, always shown; a wrong typed answer is shown struck through before it.
  ui.reveal.className = `reveal ${ok ? 'ok' : 'bad'}`;
  ui.reveal.innerHTML = '';
  if (!ok && typed && q.format === 'type') {
    const s = document.createElement('s');
    s.textContent = typed;
    ui.reveal.append(s, ' ');
  }
  const right = document.createElement('strong');
  right.textContent = q.answer;
  ui.reveal.append(right);

  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  li.textContent = q.answer;
  ui.log.prepend(li);

  if (ok) sound.right(state.streak - 1); else sound.wrong();
  clearTimeout(state.advance);
  state.advance = window.setTimeout(next, ok ? 750 : 1900);
}

function next() {
  clearTimeout(state.advance);
  if (!state.locked) return;
  state.i++;
  if (state.i < state.round.length) ask(); else end();
}

function nudge() {
  ui.card.classList.remove('shake');
  void ui.card.offsetWidth; // restart the animation
  ui.card.classList.add('shake');
}

// ---------- results
function end() {
  clearInterval(state.timer);
  const ms = performance.now() - state.started;
  const right = state.results.filter(r => r.ok).length;
  remember(state.round.map(q => q.key));
  ui.score.textContent = `${right}/${state.round.length}`;
  ui.time.textContent = clock(ms);
  ui.misses.innerHTML = '';
  for (const r of state.results.filter(r => !r.ok)) {
    const li = document.createElement('li');
    const p = document.createElement('span');
    p.textContent = r.q.media.kind === 'flag' ? 'Flag' : r.q.media.kind === 'map' && r.q.format === 'type' && r.q.pool === 'country' ? 'Map' : r.q.prompt;
    const a = document.createElement('strong');
    a.textContent = r.q.answer;
    li.append(p, a);
    ui.misses.append(li);
  }
  ui.misses.hidden = !ui.misses.children.length;
  sound.done(right / state.round.length);
  show('results');
  ui.again.focus({ preventScroll: true });
}

// ---------- events
ui.modes.forEach(b => b.addEventListener('click', () => start(b.dataset.mode as Mode)));
ui.form.addEventListener('submit', e => { e.preventDefault(); if (state.locked) next(); else answer(ui.input.value); });
ui.skip.addEventListener('click', () => (state.locked ? next() : giveUp()));
ui.again.addEventListener('click', () => start(state.mode));
ui.home.addEventListener('click', () => show('start'));
ui.card.addEventListener('animationend', () => ui.card.classList.remove('shake'));

const paintSound = () => {
  ui.sound.setAttribute('aria-pressed', String(!sound.muted));
  ui.sound.title = sound.muted ? 'Sound off' : 'Sound on';
};
ui.sound.addEventListener('click', () => { sound.toggle(); paintSound(); });
paintSound();

document.addEventListener('keydown', e => {
  if (screens.play.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); state.locked ? next() : giveUp(); return; }
  if (e.key === 'Enter' && state.locked) { e.preventDefault(); next(); return; }
  // Typing during the reveal moves straight on, and the letter lands in the next answer box.
  if (state.locked && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) { next(); return; }
  const q = state.round[state.i];
  if (q?.format === 'choice' && !state.locked && /^[1-4]$/.test(e.key)) {
    const b = ui.choices.querySelectorAll<HTMLButtonElement>('.choice')[Number(e.key) - 1];
    b?.click();
  }
});

load().catch(() => {
  ui.edition.textContent = 'could not load the data, please reload';
});
