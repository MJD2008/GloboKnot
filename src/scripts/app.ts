// The quiz: home → questions → results. The configuration (≡) decides what is asked; minimal words, while colour,
// motion and sound carry the feedback. The answer always appears where the player is looking: in the answer box.
// Every question has a time limit; a wrong typed answer is not revealed, the player tries again until time runs out.
import { geoDistance } from 'd3-geo';
import { resolveFor } from '../../scripts/lib/match.mjs';
import { norm } from '../../scripts/lib/text.mjs';
import { Globe } from './globe';
import { Sky } from './sky';
import { Knowledge, type Country, type Entity, type KBData } from './kb';
import { WorldMap, type MapOptions } from './map';
import { catOn, icon, initMenu, placesLabel, setCat } from './menu';
import { ACCENTS, TIME, UNLOCK_ROUNDS, applySettings, better, dailyResult, gordianOpen, saveDaily, saveSelection, saveSettings, saveStats, selection, settings, stats, today, type Accent, type Theme } from './prefs';
import { CATS, DAILY, GORDIAN, LEVELS, TEMPLATES, askOf, available, buildRound, codeOf, isCustom, levelOf, rebuildRound, remember, seeded, type Answers, type Ask, type Cat, type Level, type Pool, type Question, type Selection, type Tempt } from './questions';
import { zoomable, type Zoom } from './zoom';
import { sound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const url = (path: string) => new URL(path, document.baseURI).href;

applySettings();

const screens = { start: $('#start'), quiz: $('#quiz'), results: $('#results') };
const ui = {
  chips: $('#chips'),
  play: $<HTMLButtonElement>('#play'),
  playLabel: $('#play-label'),
  playSub: $('#play-sub'),
  notNow: $<HTMLButtonElement>('#not-now'),
  daily: $<HTMLButtonElement>('#daily'),
  dailySub: $('#daily-sub'),
  choose: $<HTMLButtonElement>('#choose'),
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
  rankLine: $('#rank-line'),
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
  reviewFlag: $<HTMLImageElement>('#review-flag'),
  reviewSample: $('#review-sample'),
  reviewAnswer: $('#review-answer'),
  reviewPrev: $<HTMLButtonElement>('#review-prev'),
  reviewNext: $<HTMLButtonElement>('#review-next'),
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
let mapZoom: Zoom | null = null;    // the quiz map's zoom
let reviewZoom: Zoom | null = null; // the answers' map
let reviewAt = 0;                   // the answer being looked at
let pools: Record<Pool, Entity[]>;
let globe: Globe | null = null;
const sky = new Sky($<HTMLCanvasElement>('#sky'));
if (!screens.start.hidden) sky.play();
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
/** Each answer ties a knot: tight on the first try, loose after a retry (worth half), or the rope frays. */
type Knot = 'tight' | 'loose' | 'miss';
const knotOf = (r: Result): Knot => (!r.ok ? 'miss' : r.tries > 1 ? 'loose' : 'tight');
const scoreOf = (rs: Result[]) => (rs.length ? rs.reduce((n, r) => n + ({ tight: 1, loose: 0.5, miss: 0 } as const)[knotOf(r)], 0) / rs.length : 0);

/** A challenge link: the same questions (codes and subjects), asked the same way (typed or picked, and the same
 *  options: the seed draws them), and a score to beat. v1 links (before the answers could be chosen) ask the way
 *  every round did then: each question its own way, with tempting options. */
interface Challenge { edition: string; seed: string; pct: number; secs: number; ask: Ask; items: { code: string; subject: string }[] }
const CHALLENGE_MAX = 100; // questions; longer rounds are shared without a link
const ANSWER_CODE: Record<Answers, string> = { choose: 'c', both: 'b', type: 't' };
function encodeChallenge(c: Challenge): string {
  const how = `${ANSWER_CODE[c.ask.answers]}${c.ask.tempt}`;
  return ['2', c.edition, c.seed, c.pct, c.secs, how, c.items.map(i => `${i.code}.${i.subject}`).join('~')].join('_');
}
function parseChallenge(hash: string): Challenge | null {
  const m = /^#c=(.+)$/.exec(hash);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split('_');
  if (parts[0] === '1') parts.splice(5, 0, 'b2');
  const [v, edition, seed, pct, secs, how, list] = parts;
  const answers = (Object.keys(ANSWER_CODE) as Answers[]).find(a => ANSWER_CODE[a] === how?.[0]), tempt = Number(how?.slice(1));
  if (!['1', '2'].includes(v) || !seed || !list || !answers || ![0, 1, 2].includes(tempt)) return null;
  // "C.NLD" or "R.NLD.amsterdam": the code is the part before the first dot (city ids hold a dot themselves)
  const items = list.split('~').map(x => { const k = x.indexOf('.'); return { code: x.slice(0, k), subject: x.slice(k + 1) }; }).filter(i => i.code && i.subject);
  return items.length && items.length <= CHALLENGE_MAX ? { edition, seed, pct: Number(pct) || 0, secs: Number(secs) || 0, ask: { answers, tempt: tempt as Tempt }, items } : null;
}
let challenge: Challenge | null = parseChallenge(location.hash);

const state = {
  sel: selection as Selection,
  daily: false,
  challenge: null as Challenge | null, // the challenge being played
  gordian: false,                      // The Gordian Knot: every question in the game
  level: null as Level | null,         // the level of a round of the player's own (not the Daily, a challenge or All)
  ask: { answers: 'both', tempt: 2 } as Ask,
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
  }).catch(() => { ui.globe.hidden = true; });

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
/** What Play starts, in a few words: "Easy", "Easy + custom" (the player changed the question types), "Hard · Europe". */
function modeLabel(): string {
  const mode = LEVELS[selection.level].label + (isCustom(selection) ? ' + custom' : '');
  return selection.places.length ? `${mode} · ${placesLabel(kb)}` : mode;
}

function paintHome() {
  if (!kb) return;
  ui.chips.innerHTML = '';
  ui.chips.hidden = selection.size === 0; // The Gordian Knot asks everything: nothing to pick
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
  const n = available(kb, selection.size === 0 ? GORDIAN : selection);
  ui.play.disabled = !n;
  // A challenge link waits on the Play button until it is taken or put aside.
  ui.playLabel.textContent = challenge ? 'Take the challenge' : 'Play';
  ui.playSub.textContent = challenge ? `Beat ${challenge.pct}% · ${challenge.items.length} questions` : selection.size === 0 ? 'The Gordian Knot' : modeLabel();
  ui.notNow.hidden = !challenge;
  const done = dailyResult();
  ui.dailySub.textContent = done === null ? new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : `${Math.round(done * 100)}%`;
  ui.daily.classList.toggle('done', done !== null);
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
  window.scrollTo({ top: 0 });
}
/** The browser's own bar takes the colour of the page. */
function themeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = document.body.classList.contains('home') ? '#060912' : settings.theme === 'dark' ? '#0f1318' : '#f6f5f1';
}

function open(d: HTMLDialogElement) {
  for (const other of [ui.menu, ui.settings, ui.about]) if (other !== d && other.open) other.close();
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
async function start(sel: Selection, daily = false, ch: Challenge | null = null) {
  if (!kb) return;
  state.sel = sel;
  state.daily = daily;
  state.challenge = ch;
  state.gordian = !daily && !ch && sel.size === 0;
  if (state.gordian) state.sel = sel = GORDIAN; // every question in the game, whatever else was picked
  state.level = daily || ch || state.gordian ? null : levelOf(sel);
  state.ask = ch ? ch.ask : askOf(sel);
  state.stopped = false;
  // Every round has a seed, so it can be played again by someone else from a link.
  state.seed = ch ? ch.seed : daily ? `daily-${today()}` : Math.random().toString(36).slice(2, 10);
  state.round = ch ? rebuildRound(kb, ch.items, ch.seed, ch.ask)
    : buildRound(kb, sel, daily ? seeded(state.seed) : Math.random, daily, state.seed);
  if (!state.round.length) return;
  state.planned = state.round.length;
  if (state.gordian && !stats.gordianSeen) { stats.gordianSeen = true; saveStats(); }
  if (ch) { challenge = null; history.replaceState(null, '', location.pathname + location.search); }
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
  trailNow();
  ui.clock.textContent = `${state.i + 1}/${state.round.length}`;
  // What is given and what is asked, top left: MAP → COUNTRY.
  ui.tags.innerHTML = `<span class="tag">${esc(q.given)}</span>${ARROW}<span class="tag ask">${esc(q.asked)}</span>`;

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
  ui.badge.innerHTML = m.kind === 'none' ? icon(q.cat) : '';

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
  state.results.push({ q, ok, typed, late, tries: q.format === 'type' ? state.tries + (ok ? 1 : 0) : 1, pick });
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
const RANKS: [number, string, string][] = [
  [100, 'Endless knot', 'No beginning, no end, no mistakes.'],
  [90, 'Figure-eight', 'The knot climbers trust their lives to.'],
  [75, 'Bowline', 'The king of knots. It holds.'],
  [50, 'Reef knot', 'Square, steady, sailor-approved.'],
  [25, 'Granny knot', 'It holds. Mostly.'],
  [0, 'Loose end', 'Plenty of rope left to tie.'],
];
const rankOf = (pct: number) => RANKS.find(([min]) => pct >= min)!;

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
  remember(state.round.map(q => q.key));
  state.stopped = stopped;
  screens.results.classList.toggle('stopped', stopped);
  ui.resultsTitle.hidden = !state.gordian && !stopped;
  ui.resultsTitle.textContent = stopped ? 'Stopped' : 'The Gordian Knot';
  ui.versus.hidden = ui.best.hidden = ui.unlock.hidden = true;
  ui.shareNote.hidden = true;
  if (stopped) {
    state.last = null;
    ui.summary.textContent = `${total} of ${state.planned} answered · ${clock(ms)}`;
  } else {
    if (state.daily && total === 10) saveDaily(share);
    const [, rank, line] = rankOf(pct);
    state.last = { pct, ms, rank, knots };
    ui.pct.textContent = `${pct}%`;
    ui.rank.textContent = rank;
    ui.rankLine.textContent = line;
    ui.summary.textContent = `${right} of ${total}${loose ? ` · ${loose} loose` : ''} · ${clock(ms)}${state.best >= 3 ? ` · ${state.best} in a row` : ''}`;
    drawRing(knots);

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

    // The Gordian Knot keeps one record: the best score, then the fastest.
    if (state.gordian) {
      const prev = stats.record, now = { pct, ms };
      if (better(now, prev)) stats.record = now;
      ui.best.hidden = false;
      ui.best.textContent = better(now, prev) ? (prev ? 'New record!' : 'Your first Gordian Knot.') : `Record: ${prev!.pct}% in ${clock(prev!.ms)}`;
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

// ---- looking back: an answer on a big map (or its flag or text), with the right answer lit up
/** What to show for a question afterwards: its own map, or the map of the country it was about. */
function reviewOf(q: Question): { map?: MapOptions; reveal: string[]; flag?: string; text?: { text: string; lang: string } } {
  const m = q.media;
  const at = (id?: string) => { const c = id ? kb.country(id) : undefined; return c ? { num: c.num, ll: c.ll } : {}; };
  if (m.kind === 'flag') return { flag: m.country, reveal: [] };
  if (m.kind === 'text') return { text: m, reveal: [] };
  if (m.kind === 'map') {
    const reveal = q.reveal ?? (m.river ? kb.riverCountries(m.river) : []);
    return { map: { ...at(m.country), dot: m.dot, peak: m.peak, river: m.river }, reveal };
  }
  if (q.kind === 'flag.pick') return { flag: q.accept[0], reveal: [] };
  const id = q.countries[0];
  if (!id) return { reveal: [] };
  const map: MapOptions = at(id);
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

function openReview(j: number) {
  const r = state.results[j];
  if (!r) return;
  reviewAt = j;
  const q = r.q, v = reviewOf(q);
  ui.reviewN.textContent = `${j + 1}/${state.results.length}`;
  ui.reviewN.className = `review-n ${knotOf(r)}`;
  ui.reviewTitle.textContent = q.prompt;
  ui.reviewMedia.dataset.kind = v.map ? 'map' : v.flag ? 'flag' : v.text ? 'text' : 'none';
  if (v.map) {
    world.render(ui.reviewMap, v.map);
    world.reveal(v.reveal.map(id => kb.country(id)?.num).filter((n): n is string => !!n));
    reviewZoom?.reset();
  } else if (v.flag) {
    ui.reviewFlag.src = url(`flags/${kb.country(v.flag)!.flag}.svg`);
    ui.reviewFlag.alt = `Flag of ${kb.name(v.flag)}`;
  } else if (v.text) {
    ui.reviewSample.textContent = v.text.text;
    ui.reviewSample.lang = v.text.lang;
  }
  // Lists cut short in the quiz ("Hungary, Romania +4") are given in full here.
  const all = q.kind === 'nb.name' ? q.accept : q.kind === 'river.map' ? q.reveal ?? [] : [];
  ui.reviewAnswer.textContent = all.length > 1 ? all.map(id => kb.name(id)).sort((a, b) => a.localeCompare(b)).join(', ') : q.answer;
  ui.reviewPrev.disabled = j === 0;
  ui.reviewNext.disabled = j === state.results.length - 1;
  if (!ui.review.open) ui.review.showModal();
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
  const signs = r.knots.map(k => ({ tight: '●', loose: '○', miss: '·' })[k]).join('');
  const what = state.daily ? `Daily ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : state.gordian ? 'The Gordian Knot'
    : `${state.level ? `${LEVELS[state.level].label} · ` : ''}${r.knots.length} questions`;
  const text = `Globoknot · ${what}\n${r.rank} · ${r.pct}%\n${signs.length <= 50 ? signs : ''}`.trim();
  let link = location.origin + location.pathname;
  if (state.round.length <= CHALLENGE_MAX) {
    const c: Challenge = { edition: kb.edition, seed: state.seed, pct: r.pct, secs: Math.round(r.ms / 1000), ask: state.ask,
      items: state.round.map(q => ({ code: codeOf(q.kind), subject: q.subject })) };
    link += `#c=${encodeChallenge(c)}`;
  }
  const full = `${text}\nCan you beat it? ${link}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Globoknot', text: `${text}\nCan you beat it?`, url: link }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(full);
    ui.shareNote.textContent = 'Copied. Send it to a friend.';
    ui.shareNote.hidden = false;
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
}

// ---------------------------------------------------------------- settings
function paintSettings() {
  $('#set-sound').setAttribute('aria-checked', String(!sound.muted));
  $('#set-auto').setAttribute('aria-checked', String(settings.auto));
  $('#set-theme').innerHTML = (['light', 'dark'] as const).map(t => `<button type="button" data-theme="${t}" aria-pressed="${settings.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
  // The colour belongs to the theme shown: each theme keeps its own.
  const mine = settings.accents[settings.theme];
  $('#set-accent').innerHTML = (Object.keys(ACCENTS) as Accent[]).map(a => `<button type="button" data-accent="${a}" aria-pressed="${mine === a}" title="${ACCENTS[a].label}" aria-label="${ACCENTS[a].label}" style="--sw:${settings.theme === 'dark' ? ACCENTS[a].dark : ACCENTS[a].light}"></button>`).join('');
}
ui.settings.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!t) return;
  if (t.id === 'set-sound') sound.toggle();
  else if (t.id === 'set-auto') settings.auto = !settings.auto;
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
ui.play.addEventListener('click', () => (challenge ? start(selection, false, challenge) : start(selection)));
ui.notNow.addEventListener('click', () => { challenge = null; history.replaceState(null, '', location.pathname + location.search); paintHome(); });
ui.share.addEventListener('click', () => void shareResult());
// A tap on the flag shows it bigger (and again, back to its size).
ui.flag.addEventListener('click', () => ui.media.classList.toggle('big'));
ui.daily.addEventListener('click', () => start(DAILY, true));
ui.choose.addEventListener('click', () => open(ui.menu));
$('#open-menu').addEventListener('click', () => open(ui.menu));
$('#open-settings').addEventListener('click', () => open(ui.settings));
$('#open-about').addEventListener('click', () => open(ui.about));
$('#menu-play').addEventListener('click', () => start(selection));
ui.form.addEventListener('submit', e => { e.preventDefault(); if (state.locked) next(); else answer(ui.input.value); });
ui.input.addEventListener('input', () => autoSubmit());
ui.skip.addEventListener('click', () => (state.locked ? next() : giveUp()));
ui.next.addEventListener('click', next);
ui.quit.addEventListener('click', quit);
ui.again.addEventListener('click', () => start(state.sel, state.daily));
// A challenge link opened while the site is already open: show it on the home screen (but never in the middle of a round).
window.addEventListener('hashchange', () => {
  const c = parseChallenge(location.hash);
  if (!c) return;
  challenge = c;
  if (screens.quiz.hidden) show('start');
});
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

load().catch(() => {
  ui.playSub.textContent = 'Could not load the data. Please reload.';
});
