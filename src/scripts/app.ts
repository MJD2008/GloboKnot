// The quiz: home → questions → results. The level and the configuration (the grey line under it) decide what is
// asked, or Practice does; minimal words, while colour,
// motion and sound carry the feedback. The answer always appears where the player is looking: in the answer box.
// Every question has a time limit; a wrong typed answer is not revealed, the player tries again until time runs out.
import { geoDistance } from 'd3-geo';
import { resolveFor } from '../../scripts/lib/match.mjs';
import { norm } from '../../scripts/lib/text.mjs';
import { Globe } from './globe';
import { Sky } from './sky';
import { Knowledge, type Country, type Entity, type KBData, type Language, type Peak, type River } from './kb';
import { WorldMap, type MapLabel, type MapOptions } from './map';
import { catOn, icon, initMenu, placesLabel } from './menu';
import { bestLabel, initPractice, practiceBest, practiceKey, practiceLabel, practicePlaces, practiceSeed, type Practice } from './practice';
import { ACCENTS, TIME, UNLOCK_ROUNDS, applySettings, better, dailyResult, gordianOpen, saveDaily, saveSelection, saveSettings, saveStats, selection, setLevel, settings, stats, today, type Accent, type Theme } from './prefs';
import { ANSWERS, CATS, DAILY, GORDIAN, LEVELS, LEVEL_IDS, available, buildRound, codeOf, dailyRound, isCustom, levelAsk, practiceRound, rebuildRound, remember, levelOf, type Answers, type Ask, type Level, type Pool, type Question, type Selection, type Tempt } from './questions';
import { zoomable, type Zoom } from './zoom';
import { sound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const url = (path: string) => new URL(path, document.baseURI).href;

applySettings();

const screens = { start: $('#start'), quiz: $('#quiz'), results: $('#results') };
const ui = {
  homeLevel: $('#home-level'),
  config: $<HTMLButtonElement>('#config'),
  configWhat: $('#config-what'),
  configRest: $('#config-rest'),
  play: $<HTMLButtonElement>('#play'),
  playLabel: $('#play-label'),
  playSub: $('#play-sub'),
  notNow: $<HTMLButtonElement>('#not-now'),
  daily: $<HTMLButtonElement>('#daily'),
  dailySub: $('#daily-sub'),
  practice: $<HTMLButtonElement>('#practice'),
  quit: $<HTMLButtonElement>('#quit'),
  beads: $('#beads'),
  trail: $('#trail'),
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
  stats: $('#stats'),
  statRun: $('#stat-run'),
  statFast: $('#stat-fast'),
  statTime: $('#stat-time'),
  nextLevel: $('#next-level'),
  nextGo: $<HTMLButtonElement>('#next-go'),
  resultsTitle: $('#results-title'),
  versus: $('#versus'),
  best: $('#best'),
  unlock: $('#unlock'),
  share: $<HTMLButtonElement>('#share'),
  shareNote: $('#share-note'),
  summary: $('#summary'),
  answers: $('#answers'),
  review: $<HTMLDialogElement>('#review'),
  reviewN: $('#review-n'),
  reviewTitle: $('#review-title'),
  reviewMedia: $('#review-media'),
  reviewMap: $('#review-map') as unknown as SVGSVGElement,
  reviewSample: $('#review-sample'),
  reviewAnswer: $('#review-answer'),
  reviewCard: $('#review-card'),
  reviewPrev: $<HTMLButtonElement>('#review-prev'),
  reviewNext: $<HTMLButtonElement>('#review-next'),
  again: $<HTMLButtonElement>('#again'),
  home: $<HTMLButtonElement>('#home'),
  toast: $('#toast'),
  edition: $('#edition'),
  globe: $<HTMLCanvasElement>('#globe'),
  menu: $<HTMLDialogElement>('#menu'),
  practiceSheet: $<HTMLDialogElement>('#practice-sheet'),
  settings: $<HTMLDialogElement>('#settings'),
  about: $<HTMLDialogElement>('#about'),
};
const sheets = [ui.menu, ui.practiceSheet, ui.settings, ui.about];

let kb: Knowledge;
let world: WorldMap;
let mapZoom: Zoom | null = null;    // the quiz map's zoom
let reviewZoom: Zoom | null = null; // the answers' map
let reviewAt = 0;                   // the answer being looked at
let pools: Record<Pool, Entity[]>;
let globe: Globe | null = null;
const sky = new Sky($<HTMLCanvasElement>('#sky'));
if (!screens.start.hidden) sky.play();
let menu: { paint(): void } | null = null;
let practiceSheet: { paint(): void } | null = null;
let riversLoaded: Promise<void> | null = null;

interface Result {
  q: Question;
  ok: boolean;
  typed: string;   // the right answer as typed, or the last wrong one
  late?: boolean;  // the time ran out
  tries: number;   // answers sent, the right one included (one pick for a choice question)
  pick?: string;   // the option picked (choice questions)
  ms: number;      // how long it took
}
/** Each answer ties a knot: tight on the first try, loose after a retry (worth half), or the rope frays. */
type Knot = 'tight' | 'loose' | 'miss';
const knotOf = (r: Result): Knot => (!r.ok ? 'miss' : r.tries > 1 ? 'loose' : 'tight');
const scoreOf = (rs: Result[]) => (rs.length ? rs.reduce((n, r) => n + ({ tight: 1, loose: 0.5, miss: 0 } as const)[knotOf(r)], 0) / rs.length : 0);

/** A challenge link: the same questions (codes and subjects), asked the same way (typed or picked, and the same
 *  options: the seed draws them), and a score to beat. How they are asked is one code for the whole round ("b2": Both,
 *  tempting options) or, for the Daily, a letter per question for its level ("eemmhhii"). v1 links (before the
 *  answers could be chosen) ask the way every round did then: each question its own way, with tempting options. */
interface Challenge { edition: string; seed: string; pct: number; secs: number; asks: Ask[]; levels?: Level[]; items: { code: string; subject: string }[] }
const CHALLENGE_MAX = 100; // questions; longer rounds are shared without a link
const ANSWER_CODE: Record<Answers, string> = { choose: 'c', both: 'b', type: 't' };
const LEVEL_CODE: Record<Level, string> = { easy: 'e', medium: 'm', hard: 'h', impossible: 'i' };
function encodeChallenge(c: Challenge): string {
  const how = c.levels ? c.levels.map(l => LEVEL_CODE[l]).join('') : `${ANSWER_CODE[c.asks[0].answers]}${c.asks[0].tempt}`;
  return ['2', c.edition, c.seed, c.pct, c.secs, how, c.items.map(i => `${i.code}.${i.subject}`).join('~')].join('_');
}
function parseChallenge(hash: string): Challenge | null {
  const m = /^#c=(.+)$/.exec(hash);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split('_');
  if (parts[0] === '1') parts.splice(5, 0, 'b2');
  const [v, edition, seed, pct, secs, how = '', list] = parts;
  if (!['1', '2'].includes(v) || !seed || !list) return null;
  // "C.NLD" or "R.NLD.amsterdam": the code is the part before the first dot (city ids hold a dot themselves)
  const items = list.split('~').map(x => { const k = x.indexOf('.'); return { code: x.slice(0, k), subject: x.slice(k + 1) }; }).filter(i => i.code && i.subject);
  if (!items.length || items.length > CHALLENGE_MAX) return null;
  const answers = (Object.keys(ANSWER_CODE) as Answers[]).find(a => ANSWER_CODE[a] === how[0]), tempt = Number(how.slice(1));
  const levels = how.length === items.length ? [...how].map(ch => LEVEL_IDS.find(l => LEVEL_CODE[l] === ch)) : [];
  const base = { edition, seed, pct: Number(pct) || 0, secs: Number(secs) || 0, items };
  if (how.length === 2 && answers && [0, 1, 2].includes(tempt)) return { ...base, asks: items.map(() => ({ answers, tempt: tempt as Tempt })) };
  if (levels.length && levels.every(Boolean)) return { ...base, asks: (levels as Level[]).map(levelAsk), levels: levels as Level[] };
  return null;
}
let challenge: Challenge | null = parseChallenge(location.hash);

const state = {
  sel: selection as Selection,
  daily: false,
  challenge: null as Challenge | null, // the challenge being played
  gordian: false,                      // The Gordian Knot: every question in the game
  practice: null as Practice | null,   // a practice run: every question of one type in one region
  level: null as Level | null,         // the level of a round of the player's own (not the Daily, a challenge or All)
  stopped: false,                      // Esc or Stop: the answers so far, without a score
  planned: 0,                          // questions in the round as it began (a stop cuts it short)
  seed: '',
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
  last: null as { pct: number; ms: number; rank: string; knots: Knot[] } | null,
};

// ---------------------------------------------------------------- loading
async function load() {
  // The globe is decoration: it loads on its own and never holds up the quiz.
  fetch(url('data/globe.json')).then(r => r.json()).then(topo => {
    globe = new Globe(ui.globe, topo);
    globe.chainNear = chainNear;
    globe.countryAt = countryAt;
    if (!screens.start.hidden) globe.play();
  }).catch(() => { ui.globe.parentElement!.hidden = true; });

  const [data, topo] = await Promise.all([
    fetch(url('data/countries.json')).then(r => r.json() as Promise<KBData>),
    fetch(url('data/world.json')).then(r => r.json()),
  ]);
  kb = new Knowledge(data);
  world = new WorldMap(topo);
  mapZoom = zoomable(ui.svg, world);
  reviewZoom = zoomable(ui.reviewMap, world);
  pools = { country: kb.countries, city: kb.cities, language: kb.languages, peak: kb.peaks, river: kb.rivers };
  ui.edition.textContent = data.edition;
  paintNumbers(data);
  menu = initMenu(kb, ui.menu, paintHome);
  practiceSheet = initPractice(kb, ui.practiceSheet, p => start(selection, false, null, p));
  [ui.play, ui.daily, ui.practice].forEach(b => (b.disabled = false));
  paintHome();
  document.body.classList.add('ready');
  if (!screens.start.hidden) globe?.play();
}

function loadRivers(): Promise<void> {
  riversLoaded ??= fetch(url('data/rivers.json')).then(r => r.json()).then(courses => { world.rivers = courses; });
  return riversLoaded;
}

/** The country under the pointer on the home globe: only countries the quiz knows get a name. */
let byNum: Map<string, Country> | null = null;
function countryAt(p: [number, number]) {
  if (!kb || !world) return null;
  byNum ??= new Map(kb.countries.map(c => [c.num, c]));
  const hit = world.countryAt(p), c = hit && byNum.get(hit.num);
  return c ? { name: c.name, shape: hit.shape } : null;
}

/** A walk of up to five neighbouring countries starting near (lon, lat), for the globe on the home screen. */
function chainNear(lon: number, lat: number): [number, number][] {
  if (!kb) return [];
  const at = (c: Country): [number, number] => [c.ll[1], c.ll[0]];
  const starts = kb.countries
    .filter(c => c.tier !== 'other' && kb.neighbours(c.id).length)
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
/** The home screen: the level, and under it one grey line with what, where and how many (it opens the
 *  configuration), Play, and the Daily and Practice. */
function paintHome() {
  // The level and the grey line show at once; the rest waits for the data.
  paintLevels();
  paintConfig();
  if (!kb) return;
  const n = available(kb, selection.size === 0 ? GORDIAN : selection);
  ui.play.disabled = !n;
  // A challenge link waits on the Play button until it is taken or put aside.
  ui.playLabel.textContent = challenge ? 'Take the challenge' : 'Play';
  ui.playSub.textContent = challenge ? `Beat ${challenge.pct}% · ${challenge.items.length} questions` : selection.size === 0 ? 'The Gordian Knot' : '';
  ui.playSub.hidden = !ui.playSub.textContent;
  ui.notNow.hidden = !challenge;
  const done = dailyResult();
  ui.dailySub.textContent = done === null ? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : `${Math.round(done * 100)}%`;
  ui.daily.classList.toggle('done', done !== null);
}

/** Easy, Medium and Hard; Impossible joins them once it is open (or when it is already the level). */
function paintLevels() {
  const shown = LEVEL_IDS.filter(l => l !== 'impossible' || gordianOpen() || selection.level === 'impossible');
  if (ui.homeLevel.dataset.shown !== shown.join()) {
    ui.homeLevel.dataset.shown = shown.join();
    ui.homeLevel.innerHTML = shown.map(l => `<button type="button" data-level="${l}" class="${l}">${LEVELS[l].label}</button>`).join('');
  }
  for (const b of ui.homeLevel.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.level === selection.level));
}

/** The configuration in one line: the categories as icons (half-lit when only some of their questions are picked),
 *  where, how many, and how to answer when that isn't the level's own way. */
function paintConfig() {
  const all = selection.size === 0, view = all ? GORDIAN : selection;
  const cats = CATS.map(c => ({ ...c, on: catOn(c.id, view.kinds) })).filter(c => c.on !== 'none');
  ui.configWhat.innerHTML = cats.map(c => `<span class="${c.on}" title="${c.label}">${icon(c.id)}</span>`).join('');
  const where = all || !selection.places.length ? 'World' : kb ? placesLabel(kb) : '';
  const how = !all && selection.answers ? ANSWERS.find(a => a.id === selection.answers)?.label ?? '' : '';
  ui.configRest.innerHTML = [esc(where), all ? 'All' : `${selection.size}<span class="wide"> questions</span>`, how].filter(Boolean).join(' · ');
  ui.config.setAttribute('aria-label', `${[cats.map(c => c.label).join(', '), where, all ? 'every question' : `${selection.size} questions`, how].filter(Boolean).join(' · ')}. Change`);
}

// ---------------------------------------------------------------- screens and sheets
function show(name: keyof typeof screens) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  // The home screen is a night sky; the quiz and the results follow the theme.
  document.body.classList.toggle('home', name === 'start');
  // The Gordian Knot is played in crimson, with a heartbeat.
  document.body.classList.toggle('gordian', name !== 'start' && state.gordian);
  themeColor();
  if (name === 'start') { globe?.play(); sky.play(); paintHome(); } else { globe?.pause(); sky.pause(); }
  sound.scene(name === 'quiz' ? 'music-quiz' : 'music-home');
  if (name !== 'results') clearKnotSounds();
  window.scrollTo({ top: 0 });
}
/** The browser's own bar takes the colour of the page. */
function themeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = document.body.classList.contains('home') ? '#060912' : settings.theme === 'dark' ? '#0f1318' : '#f6f5f1';
}

function open(d: HTMLDialogElement) {
  for (const other of sheets) if (other !== d && other.open) other.close();
  if (d === ui.menu) menu?.paint();
  if (d === ui.practiceSheet) practiceSheet?.paint();
  if (d === ui.settings) paintSettings();
  if (!d.open) d.showModal();
}
for (const d of sheets) {
  d.addEventListener('click', e => {
    // A click on the backdrop (the dialog box itself, outside its panel) or a close button closes it.
    if (e.target === d || (e.target as HTMLElement).closest('.close')) d.close();
  });
}

// ---------------------------------------------------------------- a round
async function start(sel: Selection, daily = false, ch: Challenge | null = null, practice: Practice | null = null) {
  if (!kb) return;
  state.sel = sel;
  state.daily = daily;
  state.challenge = ch;
  state.practice = practice;
  state.gordian = !daily && !ch && !practice && sel.size === 0;
  if (state.gordian) state.sel = sel = GORDIAN; // every question in the game, whatever else was picked
  state.level = daily || ch || practice || state.gordian ? null : levelOf(sel);
  state.stopped = false;
  // Every round has a seed, so it can be played again by someone else from a link. A practice's seed is its name:
  // the same order every time.
  state.seed = ch ? ch.seed : daily ? `daily-${today()}` : practice ? practiceSeed(practice) : Math.random().toString(36).slice(2, 10);
  state.round = ch ? rebuildRound(kb, ch.items, ch.seed, ch.asks, ch.levels)
    : practice ? practiceRound(kb, practice.kind, practicePlaces(kb, practice.region), practice.answers, state.seed)
      : daily ? dailyRound(kb, state.seed) : buildRound(kb, sel, Math.random, false, state.seed);
  if (!state.round.length) return;
  state.planned = state.round.length;
  if (state.gordian && !stats.gordianSeen) { stats.gordianSeen = true; saveStats(); }
  if (ch) { challenge = null; history.replaceState(null, '', location.pathname + location.search); }
  if (state.round.some(q => q.media.kind === 'map' && q.media.river)) {
    try { await loadRivers(); } catch { state.round = state.round.filter(q => !(q.media.kind === 'map' && q.media.river)); }
  }
  for (const d of sheets) if (d.open) d.close();
  state.i = 0;
  state.results = [];
  state.streak = state.best = 0;
  state.timed = true; // every round, the Daily too
  state.started = performance.now();
  // The Daily's knots grow with its levels, so the climb shows before it starts.
  ui.beads.innerHTML = state.round.map(q => (q.level ? `<i class="lv-${q.level}"></i>` : '<i></i>')).join('');
  ui.trail.innerHTML = '';
  ui.beads.classList.toggle('many', state.round.length > 20 && state.round.length <= 30);
  ui.beads.classList.toggle('lots', state.round.length > 30); // too many to show apart: one rope, coloured as it goes
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
  trailNow();
  ui.clock.textContent = `${state.i + 1}/${state.round.length}`;
  // What is given and what is asked, top left, one above the other: MAP, then COUNTRY.
  ui.tags.innerHTML = `<span class="tag given">${esc(q.given)}</span><span class="tag ask">${esc(q.asked)}</span>`;

  // the clue
  const m = q.media;
  ui.media.dataset.kind = m.kind;
  ui.media.classList.remove('big');
  if (m.kind === 'map') {
    const c = m.country ? kb.country(m.country) : undefined;
    world.render(ui.svg, { num: c?.num, ll: c?.ll, dot: m.dot, peak: m.peak, river: m.river });
    mapZoom?.reset();
    ui.svg.setAttribute('aria-label', m.river ? 'Map with a river' : m.peak ? 'Map with a mountain' : m.dot ? 'Map with a country and its capital' : 'Map with one country highlighted');
  } else if (m.kind === 'flag') {
    showFlag(ui.flag, url(`flags/${kb.country(m.country)!.flag}.svg`));
  } else if (m.kind === 'text') {
    ui.sample.textContent = m.text;
    ui.sample.lang = m.lang;
  }
  ui.prompt.textContent = q.prompt;

  // the answer
  if (q.format === 'type') {
    ui.form.hidden = false;
    ui.choices.hidden = true;
    ui.input.value = '';
    ui.input.readOnly = false;
    clearTimeout(clearing);
    clearing = 0;
    ui.input.classList.remove('wrong');
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
  const total = TIME * 1000;
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

/** The entity a typed answer means, for this question (scripts/lib/match.mjs): an exact name first, a right one before
 *  others (Tonga is a country and a language); a right answer's context names ("Congo" for DR Congo); the usual typo
 *  correction, judged against everything so a slip never turns into a near neighbour; and failing that, a near miss
 *  for the right answer ("Ngera" for Nigeria). */
function match(typed: string, q: Question): Entity | null {
  return resolveFor(typed, q.pools.flatMap(p => pools[p]), q.accept);
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
    // Wrong: nothing is revealed. The card shakes and the typed text fades out and clears itself, ready for the next
    // try. (Typing straight away clears it at once.) The last try is still listed with the answers at the end.
    state.tries++;
    state.lastWrong = hit?.name ?? typed;
    ui.input.classList.remove('wrong');
    void ui.input.offsetWidth;
    ui.input.classList.add('wrong');
    wrongText = ui.input.value;
    clearTimeout(clearing);
    clearing = window.setTimeout(clearTry, 420);
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
const rightNames = (e: Entity) => [...names(e), ...(e.context ?? [])];
function autoSubmit() {
  clearTimeout(state.auto);
  const q = state.round[state.i];
  if (!settings.auto || state.locked || q?.format !== 'type') return;
  const k = norm(ui.input.value);
  if (!k) return;
  const pool = q.pools.flatMap(p => pools[p]);
  if (!pool.some(e => q.accept.includes(e.id) && rightNames(e).some(n => norm(n) === k))) return;
  const longer = pool.some(e => names(e).some(n => { const m = norm(n); return m.length > k.length && m.startsWith(k); }));
  state.auto = window.setTimeout(() => {
    if (!state.locked && state.round[state.i] === q && norm(ui.input.value) === k) answer(ui.input.value);
  }, longer ? 500 : 150);
}

/** The wrong try fades out of the box; it only goes if it is still what the box holds. */
let clearing = 0, wrongText = '';
function clearTry() {
  clearTimeout(clearing);
  clearing = 0;
  if (ui.input.value === wrongText) ui.input.value = '';
  ui.input.classList.remove('wrong');
}
ui.input.addEventListener('beforeinput', () => { if (clearing) clearTry(); });

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
  clearTimeout(clearing);
  clearing = 0;
  ui.input.classList.remove('wrong');
  const ms = Math.min(TIME * 1000, Math.max(0, TIME * 1000 - (state.deadline - performance.now())));
  state.results.push({ q, ok, typed, late, tries: q.format === 'type' ? state.tries + (ok ? 1 : 0) : 1, pick, ms });
  state.streak = ok ? state.streak + 1 : 0;
  state.best = Math.max(state.best, state.streak);
  const knot = knotOf(state.results[state.results.length - 1]);
  ui.beads.children[state.i].classList.add(knot);
  trailAdd(state.results[state.results.length - 1], state.i);
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

  if (knot === 'loose') sound.loose(state.streak - 1); else if (ok) sound.right(state.streak - 1); else if (late) sound.timeout(); else sound.wrong();
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
  end(true);
}

function nudge() {
  ui.card.classList.remove('shake');
  void ui.card.offsetWidth; // restart the animation
  ui.card.classList.add('shake');
}

// ---------------------------------------------------------------- answers as rows
/** One answered question as a row: its number, what was asked (a flag, an outline or a few words) and the answer.
 *  The answers list on the results is made of these, and so is the rope down the side of a wide screen. */
function answerRow(r: Result, j: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `${r.ok ? 'ok' : 'bad'} ${knotOf(r)}`;
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
  return li;
}

// ---- wide screens: the round so far as a rope down the left side, one knot per answer (the newest at the bottom)
const TRAIL_MAX = 40; // rows kept: a very long round would pile up thousands
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const trailEnd = () => ui.trail.scrollTo({ top: ui.trail.scrollHeight, behavior: calm.matches ? 'auto' : 'smooth' });
/** The question being asked: an open knot at the end of the rope. */
function trailNow() {
  ui.trail.querySelector('.now')?.remove();
  const li = document.createElement('li');
  li.className = 'now';
  li.innerHTML = '<span class="n"></span>';
  ui.trail.append(li);
  trailEnd();
}
/** The answer just given takes the open knot's place. */
function trailAdd(r: Result, j: number) {
  ui.trail.querySelector('.now')?.remove();
  ui.trail.append(answerRow(r, j));
  while (ui.trail.children.length > TRAIL_MAX) ui.trail.firstElementChild!.remove();
  trailEnd();
}
ui.trail.addEventListener('scroll', () => ui.trail.classList.toggle('scrolled', ui.trail.scrollTop > 2), { passive: true });

// ---------------------------------------------------------------- results
/** Ranks are knots, from a loose end to the knot with no end. */
const RANKS: [number, string][] = [
  [100, 'Endless knot'],
  [90, 'Figure-eight'],
  [75, 'Bowline'],
  [50, 'Reef knot'],
  [25, 'Granny knot'],
  [0, 'Loose end'],
];
const rankOf = (pct: number) => RANKS.find(([min]) => pct >= min)!;
/** After a great round (90% or more) of a level's own questions, the next level is offered. Hard leads to Impossible
 *  only once Impossible has been found. */
const NEXT_AT = 90;
function levelUp(): Level | null {
  if (!state.level || isCustom(state.sel) || state.results.length < 5) return null;
  const next = LEVEL_IDS[LEVEL_IDS.indexOf(state.level) + 1];
  return next && (next !== 'impossible' || gordianOpen()) ? next : null;
}

/** The end of a round. A stopped round (Esc or Stop) shows the answers so far and nothing else: no score, no knot,
 *  no record, nothing to share, and it doesn't count towards what opens up after a few rounds. */
function end(stopped = false) {
  clearInterval(state.clock);
  cancelAnimationFrame(state.low);
  const ms = performance.now() - state.started;
  const total = state.results.length;
  const knots = state.results.map(knotOf);
  const right = knots.filter(k => k !== 'miss').length, loose = knots.filter(k => k === 'loose').length;
  const share = scoreOf(state.results);
  const pct = Math.round(share * 100);
  // Recently seen questions rest in the next rounds; a practice run goes through them all on purpose, so it doesn't.
  if (!state.practice) remember(state.round.map(q => q.key));
  state.stopped = stopped;
  screens.results.classList.toggle('stopped', stopped);
  ui.resultsTitle.hidden = !state.gordian && !state.practice && !stopped;
  ui.resultsTitle.textContent = stopped ? 'Stopped' : state.practice ? 'Practice' : 'The Gordian Knot';
  ui.versus.hidden = ui.best.hidden = ui.unlock.hidden = ui.nextLevel.hidden = true;
  ui.shareNote.hidden = true;
  if (stopped) {
    state.last = null;
    ui.summary.textContent = `${total} of ${state.planned} answered · ${clock(ms)}`;
  } else {
    if (state.daily && total === state.round.length) saveDaily(share);
    const [, rank] = rankOf(pct);
    state.last = { pct, ms, rank, knots };
    ui.pct.textContent = `${pct}%`;
    ui.rank.textContent = rank;
    ui.summary.textContent = `${right} of ${total}${loose ? ` · ${loose} loose` : ''}`;
    // The longest run of right answers, the fastest right answer and the time, as three small numbers.
    const fastest = Math.min(...state.results.filter(r => r.ok).map(r => r.ms));
    ui.statRun.textContent = String(state.best);
    ui.statFast.textContent = Number.isFinite(fastest) ? `${(Math.max(0.1, fastest / 1000)).toFixed(1)} s` : '–';
    ui.statTime.textContent = clock(ms);
    drawRing(knots);
    const next = pct >= NEXT_AT ? levelUp() : null;
    if (next) { ui.nextLevel.hidden = false; ui.nextGo.textContent = `Try ${LEVELS[next].label}`; ui.nextGo.dataset.level = next; }

    // Against a challenge: their score next to yours.
    if (state.challenge) {
      // the higher score wins; the same score goes to the faster one
      const them = state.challenge.pct, secs = Math.round(ms / 1000), t = state.challenge.secs;
      const won = pct > them || (pct === them && secs < t), lost = pct < them || (pct === them && secs > t);
      const how = pct === them && secs !== t ? ` Same score, ${won ? 'but you were faster' : 'but they were faster'}.` : '';
      ui.versus.hidden = false;
      ui.versus.textContent = `You ${pct}% · Challenger ${them}% · ${won ? 'You win!' : lost ? 'They win this one.' : 'A dead heat.'}${how}`;
      ui.versus.className = `versus ${won ? 'won' : lost ? 'lost' : 'draw'}`;
    }

    // The Gordian Knot keeps one record: the best score, then the fastest. So does each practice.
    if (state.gordian) {
      const prev = stats.record, now = { pct, ms };
      if (better(now, prev)) stats.record = now;
      ui.best.hidden = false;
      ui.best.textContent = better(now, prev) ? (prev ? 'New record!' : 'Your first Gordian Knot.') : `Record: ${prev!.pct}% in ${clock(prev!.ms)}`;
    }
    if (state.practice) {
      const prev = practiceBest(state.practice), now = { pct, ms };
      if (better(now, prev)) (stats.practice ??= {})[practiceKey(state.practice)] = now;
      ui.best.hidden = false;
      ui.best.textContent = `${practiceLabel(state.practice)} · ${better(now, prev) ? (prev ? 'New best!' : 'First run') : `Best ${bestLabel(prev!)}`}`;
    }

    // After a few rounds, Impossible and The Gordian Knot show themselves, once.
    const wasOpen = gordianOpen();
    stats.rounds++;
    ui.unlock.hidden = wasOpen || !gordianOpen();
    saveStats();
  }

  ui.answers.innerHTML = '';
  state.results.forEach((r, j) => {
    const li = answerRow(r, j);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Answer ${j + 1}: see it on the map`);
    li.addEventListener('click', () => openReview(j));
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReview(j); } });
    ui.answers.append(li);
  });
  if (!stopped) sound.done(share);
  show('results');
  ui.again.focus({ preventScroll: true });
}

// ---- looking back: an answer on a big map (or its text), with the right answer lit up and the countries around it
// named, and a card about what the question was about.
/** What to show for a question afterwards: the map of the country it was about, with its neighbours named, or the
 *  question's own map (a river or a mountain, with its countries named). A language's text stays a text. */
function reviewOf(q: Question): { map?: MapOptions; reveal: string[]; text?: { text: string; lang: string } } {
  const m = q.media;
  const at = (id?: string) => { const c = id ? kb.country(id) : undefined; return c ? { num: c.num, ll: c.ll } : {}; };
  const labelled = (ids: string[], main?: string): MapLabel[] => (main ? [main, ...ids.filter(x => x !== main)] : ids).flatMap(id => {
    const c = kb.country(id);
    return c ? [{ num: c.num, name: c.name, main: id === main }] : [];
  });
  if (m.kind === 'text') return { text: m, reveal: [] };
  if (m.kind === 'map' && (m.river || m.peak)) {
    const reveal = q.reveal ?? (m.river ? kb.riverCountries(m.river) : []);
    return { map: { ...at(m.country), dot: m.dot, peak: m.peak, river: m.river, labels: labelled(reveal) }, reveal };
  }
  const id = q.countries[0];
  if (!id) return { reveal: [] };
  const map: MapOptions = { ...at(id), labels: labelled(kb.neighbours(id), id) };
  if (m.kind === 'map' && m.dot) map.dot = m.dot;
  if (q.kind.startsWith('cap.')) {
    const city = kb.cities.find(x => x.id === kb.mainCapitals(id)[0]);
    if (city?.ll) map.dot = city.ll;
  }
  if (q.kind === 'peak.name') {
    const peak = kb.peaks.find(p => p.id === kb.highestPoint(id));
    if (peak?.ll) map.peak = peak.ll;
  }
  return { map, reveal: q.kind === 'nb.name' ? q.accept : [] };
}

/** A few facts about what a question was about. A country: its flag, capital, languages, highest point, rivers and
 *  neighbours. A river: its length and where it flows. A language: where it is official and spoken. A mountain: its
 *  height and whose highest point it is. All from the same checked facts the questions come from. */
interface Card { flag?: string; title: string; sub: string; rows: [string, string][] }
const fmt = (n: number) => n.toLocaleString('en-GB');
function listOf(ids: string[], max = 8): string {
  const list = [...new Set(ids.map(id => kb.name(id)))].sort((a, b) => a.localeCompare(b));
  return list.length > max ? `${list.slice(0, max).join(', ')} and ${list.length - max} more` : list.join(', ');
}
function cardOf(q: Question): Card | null {
  if (q.cat === 'rivers') {
    const r = kb.get<River>(q.subject);
    return r ? { title: r.name, sub: 'River', rows: [['Length', `${fmt(r.km)} km`], ['Flows through', listOf(kb.riverCountries(r.id))]] } : null;
  }
  if (q.kind === 'lang.text') {
    const l = kb.get<Language>(q.subject);
    if (!l) return null;
    const official = kb.whereSpoken(l.id, false), spoken = kb.whereSpoken(l.id).filter(id => !official.includes(id));
    const rows: [string, string][] = [];
    if (official.length) rows.push(['Official in', listOf(official)]);
    if (spoken.length) rows.push([official.length ? 'Also spoken in' : 'Spoken in', listOf(spoken)]);
    return { title: l.name, sub: 'Language', rows };
  }
  if (q.kind === 'peak.map') {
    const p = kb.get<Peak>(q.subject);
    return p ? { title: p.name, sub: `${fmt(p.m)} m`, rows: [['Highest point of', listOf(kb.peakCountries(p.id))]] } : null;
  }
  const id = q.countries[0], c = id ? kb.country(id) : undefined;
  if (!c) return null;
  const caps = kb.mainCapitals(id).map(x => kb.name(x)), langs = kb.languagesOf(id);
  const peak = kb.get<Peak>(kb.highestPoint(id) ?? '');
  const rivers = [...new Set(kb.in(id, 'flows_through').filter(f => f[3] !== 'also').map(f => kb.get<River>(f[0]))
    .filter((r): r is River => !!r).sort((a, b) => b.km - a.km).map(r => r.name))];
  const nb = kb.neighbours(id);
  const rows: [string, string][] = [];
  if (caps.length) rows.push([caps.length > 1 ? 'Capitals' : 'Capital', caps.join(', ')]);
  if (langs.length) rows.push([langs.length > 1 ? 'Languages' : 'Language', listOf(langs, 6)]);
  if (peak) rows.push(['Highest point', `${peak.name} · ${fmt(peak.m)} m`]);
  if (rivers.length) rows.push(['Rivers', rivers.length > 4 ? `${rivers.slice(0, 4).join(', ')} and ${rivers.length - 4} more` : rivers.join(', ')]);
  // (A question about the neighbours lists them as its answer already.)
  if (q.kind !== 'nb.name') rows.push(['Neighbours', nb.length ? listOf(nb, 12) : 'None']);
  return { flag: c.flag, title: c.name, sub: kb.continent(id) ?? '', rows };
}

function paintCard(q: Question) {
  const card = cardOf(q);
  ui.reviewCard.hidden = !card;
  if (!card) return;
  ui.reviewCard.innerHTML = `
    <header class="facts-head">
      ${card.flag ? `<img class="facts-flag${q.cat === 'flags' ? ' big' : ''}" src="${url(`flags/${card.flag}.svg`)}" alt="Flag of ${esc(card.title)}" />` : ''}
      <div><b>${esc(card.title)}</b><small>${esc(card.sub)}</small></div>
    </header>
    <dl>${card.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function openReview(j: number) {
  const r = state.results[j];
  if (!r) return;
  reviewAt = j;
  const q = r.q, v = reviewOf(q);
  ui.reviewN.textContent = `${j + 1}/${state.results.length}`;
  ui.reviewN.className = `review-n ${knotOf(r)}`;
  ui.reviewTitle.textContent = q.prompt;
  ui.reviewMedia.dataset.kind = v.map ? 'map' : v.text ? 'text' : 'none';
  if (v.text) {
    ui.reviewSample.textContent = v.text.text;
    ui.reviewSample.lang = v.text.lang;
  }
  // Lists cut short in the quiz ("Hungary, Romania +4") are given in full here.
  const all = q.kind === 'nb.name' ? q.accept : q.kind === 'river.map' ? q.reveal ?? [] : [];
  ui.reviewAnswer.textContent = all.length > 1 ? all.map(id => kb.name(id)).sort((a, b) => a.localeCompare(b)).join(', ') : q.answer;
  paintCard(q);
  ui.reviewPrev.disabled = j === 0;
  ui.reviewNext.disabled = j === state.results.length - 1;
  if (!ui.review.open) ui.review.showModal();
  // The map is drawn once the dialog shows, so the names on it can be sized for the width it is shown at.
  if (v.map) {
    world.render(ui.reviewMap, v.map);
    world.reveal(v.reveal.map(id => kb.country(id)?.num).filter((n): n is string => !!n));
    reviewZoom?.reset();
  }
}
ui.reviewPrev.addEventListener('click', () => openReview(reviewAt - 1));
ui.reviewNext.addEventListener('click', () => openReview(reviewAt + 1));
ui.review.addEventListener('click', e => {
  if (e.target === ui.review || (e.target as HTMLElement).closest('.close')) ui.review.close();
});
ui.review.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' && reviewAt > 0) { e.preventDefault(); openReview(reviewAt - 1); }
  if (e.key === 'ArrowRight' && reviewAt < state.results.length - 1) { e.preventDefault(); openReview(reviewAt + 1); }
});
// The answer's row keeps the focus when the review closes.
ui.review.addEventListener('close', () => (ui.answers.children[reviewAt] as HTMLElement | undefined)?.focus({ preventScroll: true }));

// ---- sharing: the score, the knots as a row of signs, and a link to the same questions
async function shareResult() {
  const r = state.last;
  if (!r) return;
  // A Daily's signs come in steps, one per level: "●● ●○ ●· ··".
  const levels = state.round.every(q => q.level) ? state.round.map(q => q.level!) : undefined;
  const signs = r.knots.map((k, i) => (i && levels && levels[i] !== levels[i - 1] ? ' ' : '') + ({ tight: '●', loose: '○', miss: '·' })[k]).join('');
  // The Daily's day is in its seed (also when it is played from a link, on another day).
  const day = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(state.seed)?.[1];
  const what = day ? `Daily ${new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : state.gordian ? 'The Gordian Knot'
    : state.practice ? `Practice · ${practiceLabel(state.practice)}` : `${state.level ? `${LEVELS[state.level].label} · ` : ''}${r.knots.length} questions`;
  const text = `Globoknot · ${what}\n${r.rank} · ${r.pct}%\n${signs.length <= 50 ? signs : ''}`.trim();
  let link = location.origin + location.pathname;
  if (state.round.length <= CHALLENGE_MAX) {
    const c: Challenge = { edition: kb.edition, seed: state.seed, pct: r.pct, secs: Math.round(r.ms / 1000), asks: state.round.map(q => q.ask),
      levels, items: state.round.map(q => ({ code: codeOf(q.kind), subject: q.subject })) };
    link += `#c=${encodeChallenge(c)}`;
  }
  const full = `${text}\nCan you beat it? ${link}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Globoknot', text: `${text}\nCan you beat it?`, url: link }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(full);
    toast('Copied');
    return;
  } catch { /* no clipboard here: show the text to copy by hand */ }
  ui.shareNote.hidden = false;
  ui.shareNote.innerHTML = '';
  const box = document.createElement('textarea');
  box.readOnly = true;
  box.value = full;
  box.rows = 4;
  ui.shareNote.append(box);
  box.select();
}

/** The site itself, from the share button at the top: the phone's own share sheet, or the link copied. */
async function shareSite() {
  const link = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ title: 'Globoknot', text: 'Our world in a knot. A geography quiz.', url: link }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); }
}

/** A word or two at the bottom of the screen for a moment ("Copied"). */
let toastTimer = 0;
function toast(text: string) {
  clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  ui.toast.classList.remove('show');
  void ui.toast.offsetWidth; // restart the animation
  ui.toast.classList.add('show');
  toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 1900);
}

const ordinal = (n: number) => `${n}${n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** The score as a rope tied into a ring, one knot per answer: tight knots are solid, loose ones open, and where an
 *  answer was missed the rope is broken, with frayed ends. Every knot tight: the ring closes. */
function drawRing(knots: Knot[]) {
  const n = knots.length, R = 92, C = 110, TAU = 2 * Math.PI;
  const pt = (a: number, r = R) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  const arc = (a0: number, a1: number) => `M${pt(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)}`;
  const at = (j: number) => (j / n) * TAU;
  const step = Math.min(0.08, 1.2 / Math.max(1, n)); // seconds of drawing per answer
  const sec = (x: number) => `${x.toFixed(3)}s`;
  const size = Math.min(7.5, ((TAU * R) / Math.max(1, n)) * 0.36); // knots shrink when there are many
  const miss = (j: number) => knots[(j + n) % n] === 'miss';
  // the lay of the rope: short slanted lines across it, as in a drawing of a rope
  const lay = (a0: number, a1: number) => {
    let d = '';
    for (let a = a0 + 3.5 / R; a < a1 - 1 / R; a += 7 / R) d += `M${pt(a - 2.6 / R, R - 3.6)}L${pt(a + 2.6 / R, R + 3.6)}`;
    return d;
  };
  let svg = `<circle class="track" cx="${C}" cy="${C}" r="${R}"/>`;
  ui.ring.classList.toggle('closed', n > 0 && knots.every(k => k === 'tight'));
  if (n && !knots.includes('miss')) {
    // one unbroken rope
    svg += `<circle class="rope" cx="${C}" cy="${C}" r="${R}" pathLength="1" transform="rotate(-90 ${C} ${C})" style="--d:0s;--t:${sec(n * step)}"/>`
      + `<path class="twist" d="${lay(0, TAU)}" style="--d:${sec(n * step)}"/>`;
  } else {
    // stretches of rope between the misses; each break has frayed ends
    for (let j = 0; j < n;) {
      let e = j;
      while (e + 1 < n && miss(e + 1) === miss(j)) e++;
      const a0 = at(j), a1 = at(e + 1), d = `--d:${sec(j * step)}`;
      if (miss(j)) {
        // the strands of the cut rope come apart like a brush: [from, to] across the rope, and how far they reach
        const f = Math.min(0.12, (a1 - a0) * 0.3);
        const fray = (b: number, dir: number) => `<path class="fray" d="${([[-3.8, -7, 0.75], [-1.3, -2.4, 1], [1.3, 2.8, 0.9], [3.8, 7.4, 0.65]] as const)
          .map(([o0, o1, k]) => `M${pt(b, R + o0)}L${pt(b + dir * f * k, R + o1)}`).join('')}" style="${d}"/>`;
        if (!miss(j - 1)) svg += fray(a0, 1);
        if (!miss(e + 1)) svg += fray(a1, -1);
      } else {
        // where the rope runs on past twelve o'clock, the two pieces overlap a little so no seam shows
        const r0 = a0 - (j === 0 && !miss(-1) ? 0.6 / R : 0), r1 = a1 + (e === n - 1 && !miss(0) ? 0.6 / R : 0);
        svg += `<path class="rope" pathLength="1" d="${arc(r0, r1)}" style="${d};--t:${sec((e + 1 - j) * step)}"/>`
          + `<path class="twist" d="${lay(a0, a1)}" style="--d:${sec((e + 1) * step)}"/>`;
      }
      j = e + 1;
    }
  }
  // the knots, popping up as the rope reaches them (too small to see in very long rounds)
  if (size >= 1.6) knots.forEach((k, j) => {
    if (k === 'miss') return;
    const [x, y] = pt(at(j + 0.5)).split(' ');
    svg += `<circle class="knot ${k}" cx="${x}" cy="${y}" r="${(k === 'loose' ? size * 0.9 : size).toFixed(2)}" style="--d:${sec((j + 0.5) * step)}"/>`;
  });
  ui.ring.innerHTML = svg;
  // Sounds in time with the drawing: each knot as it pops up, then the score (not for very long rounds).
  clearKnotSounds();
  if (n > 60) return;
  if (size >= 1.6) knots.forEach((k, j) => { if (k !== 'miss') knotSounds.push(window.setTimeout(() => sound.knot(j), (j + 0.5) * step * 1000)); });
  knotSounds.push(window.setTimeout(() => sound.rank(knots.every(k => k === 'tight')), n * step * 1000 + 250));
}
let knotSounds: number[] = [];
function clearKnotSounds() {
  knotSounds.forEach(clearTimeout);
  knotSounds = [];
}

// ---------------------------------------------------------------- about
/** About opens with the numbers, counted from the facts as they are: a river crossing that only one source names
 *  ("also") counts as a right answer but isn't a checked fact. */
function paintNumbers(data: KBData) {
  const put = (id: string, n: number) => { $(`#n-${id}`).textContent = n.toLocaleString('en-GB'); };
  put('facts', data.facts.filter(f => f[3] !== 'also').length);
  put('countries', data.countries.length);
  put('capitals', data.cities.length);
  put('languages', data.languages.length);
  put('peaks', data.peaks.length);
  put('rivers', data.rivers.length);
  put('questions', available(kb, GORDIAN));
}

// ---------------------------------------------------------------- settings
function paintSettings() {
  const v = sound.levels;
  $<HTMLInputElement>('#set-master').value = String(v.master);
  $<HTMLInputElement>('#set-effects').value = String(v.effects);
  $<HTMLInputElement>('#set-music').value = String(v.music);
  $('#set-music-row').hidden = !sound.hasMusic;
  for (const r of ui.settings.querySelectorAll<HTMLInputElement>('input[type="range"]')) r.style.setProperty('--fill', `${r.value}%`);
  $('#set-auto').setAttribute('aria-checked', String(settings.auto));
  $('#set-theme').innerHTML = (['light', 'dark'] as const).map(t => `<button type="button" data-theme="${t}" aria-pressed="${settings.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  // The colour belongs to the theme shown: each theme keeps its own.
  const mine = settings.accents[settings.theme];
  $('#set-accent').innerHTML = (Object.keys(ACCENTS) as Accent[]).map(a => `<button type="button" data-accent="${a}" aria-pressed="${mine === a}" title="${ACCENTS[a].label}" aria-label="${ACCENTS[a].label}" style="--sw:${settings.theme === 'dark' ? ACCENTS[a].dark : ACCENTS[a].light}"></button>`).join('');
}
ui.settings.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!t) return;
  if (t.id === 'set-auto') settings.auto = !settings.auto;
  else if (t.dataset.theme) settings.theme = t.dataset.theme as Theme;
  else if (t.dataset.accent) settings.accents[settings.theme] = t.dataset.accent as Accent;
  else return;
  saveSettings();
  paintSettings();
  themeColor();
  globe?.refresh();
  sky.readAccent();
  menu?.paint();
});

// The volumes change as the slider moves; the effects play a sample once it is let go.
ui.settings.addEventListener('input', e => {
  const r = e.target as HTMLInputElement;
  const which = ({ 'set-master': 'master', 'set-effects': 'effects', 'set-music': 'music' } as const)[r.id as 'set-master'];
  if (!which) return;
  sound.set({ [which]: Number(r.value) });
  r.style.setProperty('--fill', `${r.value}%`);
});
ui.settings.addEventListener('change', e => {
  const id = (e.target as HTMLElement).id;
  if (id === 'set-master' || id === 'set-effects') sound.sample();
});

// ---------------------------------------------------------------- events
// A level on the home screen picks its own questions and answers, as in the configuration.
ui.homeLevel.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-level]');
  if (!b || b.dataset.level === selection.level) return;
  setLevel(b.dataset.level as Level);
  saveSelection();
  paintHome();
});
ui.config.addEventListener('click', () => open(ui.menu));
ui.practice.addEventListener('click', () => open(ui.practiceSheet));
$('#share-site').addEventListener('click', () => void shareSite());
ui.play.addEventListener('click', () => (challenge ? start(selection, false, challenge) : start(selection)));
ui.notNow.addEventListener('click', () => { challenge = null; history.replaceState(null, '', location.pathname + location.search); paintHome(); });
ui.share.addEventListener('click', () => void shareResult());
// A tap on the flag shows it bigger (and again, back to its size).
ui.flag.addEventListener('click', () => ui.media.classList.toggle('big'));
ui.daily.addEventListener('click', () => start(DAILY, true));
$('#open-settings').addEventListener('click', () => open(ui.settings));
$('#open-about').addEventListener('click', () => open(ui.about));
$('#menu-play').addEventListener('click', () => start(selection));
ui.form.addEventListener('submit', e => { e.preventDefault(); if (state.locked) next(); else answer(ui.input.value); });
ui.input.addEventListener('input', () => autoSubmit());
ui.skip.addEventListener('click', () => (state.locked ? next() : giveUp()));
ui.next.addEventListener('click', next);
ui.quit.addEventListener('click', quit);
// New round: the same kind of round again, with new questions. After the Daily (the same eight all day) that is a round of
// the player's own.
ui.again.addEventListener('click', () => (state.daily ? start(selection) : start(state.sel, false, null, state.practice)));
// ⓘ buttons show the few words they control, and hide them again; a sheet closes with them hidden.
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.info[aria-controls]');
  if (!b) return;
  const box = document.getElementById(b.getAttribute('aria-controls')!)!;
  box.hidden = !box.hidden;
  b.setAttribute('aria-expanded', String(!box.hidden));
});
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => {
  for (const b of d.querySelectorAll<HTMLButtonElement>('button.info[aria-expanded="true"]')) b.click();
});
// "Too easy? Try Medium": the next level, at once.
ui.nextGo.addEventListener('click', () => {
  setLevel(ui.nextGo.dataset.level as Level);
  saveSelection();
  start(selection);
});
// A challenge link opened while the site is already open: show it on the home screen (but never in the middle of a round).
window.addEventListener('hashchange', () => {
  const c = parseChallenge(location.hash);
  if (!c) return;
  challenge = c;
  if (screens.quiz.hidden) show('start');
});
ui.home.addEventListener('click', () => show('start'));
ui.card.addEventListener('animationend', e => { if (e.target === ui.card) ui.card.classList.remove('shake'); });
ui.card.addEventListener('click', e => {
  // During the verdict a tap anywhere on the card moves on (but not a tap that just answered).
  if (state.locked && !(e.target as HTMLElement).closest('.choice')) next();
});

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || screens.quiz.hidden) return;
  // Esc stops the round, as the X button does. → skips, but only with nothing typed, so it still moves the cursor
  // through a typed answer; after an answer, → and Enter both go on.
  if (e.key === 'Escape') { e.preventDefault(); quit(); return; }
  if ((e.key === 'Enter' || e.key === 'ArrowRight') && state.locked) { e.preventDefault(); next(); return; }
  if (e.key === 'ArrowRight' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && (state.round[state.i]?.format === 'choice' || !ui.input.value)) {
    e.preventDefault();
    giveUp();
    return;
  }
  // Typing during the verdict moves straight on, and the letter lands in the next answer box.
  if (state.locked && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) { next(); return; }
  const q = state.round[state.i];
  if (q?.format === 'choice' && !state.locked && /^[1-4]$/.test(e.key)) {
    ui.choices.querySelectorAll<HTMLButtonElement>('.choice')[Number(e.key) - 1]?.click();
  }
});

paintHome();
sound.scene('music-home');
// The Gordian Knot's heartbeat at the edges of the screen gets its sound, beat for beat, while a question is open.
document.body.addEventListener('animationiteration', e => {
  if (e.animationName === 'heartbeat' && !screens.quiz.hidden) sound.heartbeat();
});
load().catch(() => {
  ui.playSub.textContent = 'Could not load the data. Please reload.';
  ui.playSub.hidden = false;
});
