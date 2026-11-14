// The configuration (the grey line under the level on the home screen opens it): the level (the knots Loose, Tight and
// Complex, each in its own colour, and Atlas: each picks a set of question types and the answers, and decides how well
// known the places asked about are), how to answer (Choose, Both or Type), what to be asked (categories and their
// question types), where (the whole world, continents or single countries) and how many questions. Every change is
// kept at once; Play starts it. Something always stays selected: the last ticked box can't be unticked until another
// one is ticked. Atlas, the hidden fourth level, is only here (not on the home screen), locked until a Complex round
// of 75% or more; it is always typed: its answers can't be changed and it has no flag to pick. All, under Atlas, is
// The Gordian Knot: every question in the game, so the rest can't be changed while it is picked.
import { CONTINENTS, type Knowledge } from './kb';
import { ANSWERS, CATS, GORDIAN, LEVELS, LEVEL_IDS, TEMPLATES, answersOf, available, canAsk, isCustom, levelOf, type Answers, type Cat, type Level } from './questions';
import { ATLAS_AT, MAX_SIZE, SIZES, atlasOpen, clampSize, saveSelection, saveStats, selection, setLevel, stats } from './prefs';

export const ICONS: Record<Cat | 'world', string> = {
  locations: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  capitals: '<path d="M4 20h16M5 17h14M6 17V10M10 17v-7M14 17v-7M18 17v-7M3.5 10 12 4l8.5 6z"/>',
  flags: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  languages: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  mountains: '<path d="m2.5 19 6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="m7.4 10.7 1.6 1.3 1.5-1.3"/>',
  rivers: '<path d="M3 8c3-2 5 2 8 0s5-2 8 0M3 13c3-2 5 2 8 0s5-2 8 0M3 18c3-2 5 2 8 0s5-2 8 0"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18M3.5 9h17M3.5 15h17"/>',
};
export const icon = (k: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
/** The levels as knots, from an open loop to a double one, and Atlas as a globe on its stand; a padlock while Atlas is
 *  still closed. Drawn in the level's own colour (CSS .lv-easy and so on). */
const LEVEL_ICONS: Record<Level | 'locked', string> = {
  easy: '<path d="M2 17c4 0 6-2 7.4-5.6C10.6 8.3 12.4 5 15.6 5c2.8 0 4.4 2.2 3.8 4.4-.7 2.6-4.4 3.6-7.4 2.6-1.4-.5-2.5-1.3-3.2-2.2"/><path d="M11.8 14.6c1.6 1.6 3.8 2.4 10.2 2.4"/>',
  medium: '<path d="M2 13.5h7.2M14.8 13.5H22"/><path d="M9.2 13.5c0-2.6 1.3-4.6 3.2-4.6 1.7 0 2.6 1.4 2.4 2.7-.3 1.6-2.1 2.4-3.8 2.2"/><path d="M14.8 13.5c-.6 1.7-1.8 2.7-3.2 2.4-1.2-.3-1.9-1.4-1.7-2.6"/>',
  hard: '<path d="M2 18c2 0 3-.8 4-2.2"/><circle cx="9" cy="10" r="4.2"/><circle cx="15" cy="14" r="4.2"/><path d="M18 9.5c1.2-1.2 2.4-1.5 4-1.5"/>',
  impossible: '<circle cx="12" cy="11" r="7"/><path d="M12 4c-2.4 2.2-2.4 11.8 0 14M12 4c2.4 2.2 2.4 11.8 0 14M5 11h14"/><path d="M6 20.5c4-1.6 8-1.6 12 0"/>',
  locked: '<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
export const levelIcon = (l: Level | 'locked') => `<svg class="lv-icon" viewBox="0 0 24 24" aria-hidden="true">${LEVEL_ICONS[l]}</svg>`;
/** A level's name with its knot, in its colour: on the results, a challenge and the configuration line. */
export const levelTag = (l: Level) => `<span class="lv-tag lv-${l}">${levelIcon(l)}${LEVELS[l].label}</span>`;
/** Atlas stays shut until a Complex round of the level's own questions scores this well; then it is in the configuration. */
export const ATLAS_LOCKED = `Score ${ATLAS_AT}% or more in a Complex round to open Atlas.`;
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** 1:02:03, or 4:05 under an hour. */
export function clockOf(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}

/** A category's question types that the level can ask (under Atlas, Flags is the flag to name only). */
const kindsIn = (cat: Cat, level: Level) => TEMPLATES.filter(t => t.cat === cat && canAsk(level, t.id)).map(t => t.id);
export function catOn(cat: Cat, picked = selection.kinds, level: Level = selection.level): 'all' | 'some' | 'none' {
  const kinds = kindsIn(cat, level);
  const n = kinds.filter(k => picked.includes(k)).length;
  return n === 0 ? 'none' : n === kinds.length ? 'all' : 'some';
}
export function setCat(cat: Cat, on: boolean) {
  const kinds = kindsIn(cat, selection.level);
  selection.kinds = on ? [...new Set([...selection.kinds, ...kinds])] : selection.kinds.filter(k => !kinds.includes(k));
}

/** "Whole world", "Europe", "Europe, Africa" or "12 countries". */
export function placesLabel(kb: Knowledge): string {
  if (!selection.places.length) return 'Whole world';
  const set = new Set(selection.places);
  const full = CONTINENTS.filter(ct => kb.countries.filter(c => kb.continent(c.id) === ct).every(c => set.has(c.id)));
  const inFull = kb.countries.filter(c => full.includes(kb.continent(c.id) as never)).length;
  if (full.length && inFull === set.size) return full.length > 2 ? `${full.length} continents` : full.join(', ');
  return set.size === 1 ? kb.name(selection.places[0]) : `${set.size} countries`;
}

export function initMenu(kb: Knowledge, root: HTMLElement, onChange: () => void) {
  const levels = root.querySelector<HTMLElement>('#menu-level')!;
  const levelHint = root.querySelector<HTMLElement>('#menu-level-hint')!;
  const answers = root.querySelector<HTMLElement>('#menu-answers')!;
  const fixed = [...root.querySelectorAll<HTMLElement>('.fixed-by-all')]; // what The Gordian Knot decides
  const what = root.querySelector<HTMLElement>('#menu-what')!;
  const where = root.querySelector<HTMLElement>('#menu-where')!;
  const sizes = root.querySelector<HTMLElement>('#menu-size')!;

  // ---- level, and behind the ⓘ by its heading, what each level asks
  levels.innerHTML = LEVEL_IDS.map(l => `<button type="button" data-level="${l}" class="lv lv-${l}">${levelIcon(l)}<span>${LEVELS[l].label}</span></button>`).join('');
  const atlas = levels.querySelector<HTMLButtonElement>('[data-level="impossible"]')!;
  const how = { choose: 'Pick from four', both: 'Typed or picked', type: 'Typed' } satisfies Record<Answers, string>;
  const levelAbout = root.querySelector<HTMLElement>('#level-about')!;
  levelAbout.innerHTML = LEVEL_IDS.map(l => `<div class="lv-${l}" data-row="${l}"><dt>${LEVELS[l].label}</dt><dd>${LEVELS[l].who} · ${LEVELS[l].what} · ${LEVELS[l].typedOnly ? 'Always typed' : how[LEVELS[l].answers]}</dd></div>`).join('');
  const atlasAbout = levelAbout.querySelector<HTMLElement>('[data-row="impossible"] dd')!;
  const atlasOpenText = atlasAbout.textContent!;
  let lockedTap = false; // a tap on Atlas while it is shut says how to open it

  // ---- answers: picked from four (easier), typed, or each question its own way
  answers.innerHTML = ANSWERS.map(a => `<button type="button" data-answers="${a.id}">${a.label}${a.id === 'choose' ? ' <small>easier</small>' : ''}</button>`).join('');

  // ---- what
  what.innerHTML = CATS.map(c => `
    <div class="group" data-cat="${c.id}">
      <div class="group-row">
        <label class="check"><input type="checkbox" class="cat-check" />${icon(c.id)}<span>${c.label}</span></label>
        ${TEMPLATES.filter(t => t.cat === c.id).length > 1 ? `<button type="button" class="expand" aria-expanded="false" aria-label="${c.label}: question types">${CHEVRON}</button>` : ''}
      </div>
      <div class="subs" hidden>
        ${TEMPLATES.filter(t => t.cat === c.id).map(t => `<label class="check sub"><input type="checkbox" data-kind="${t.id}" /><span>${esc(t.label)}</span></label>`).join('')}
      </div>
    </div>`).join('');

  // ---- where
  const byContinent = CONTINENTS.map(ct => ({ ct, list: kb.countries.filter(c => kb.continent(c.id) === ct).sort((a, b) => a.name.localeCompare(b.name)) }));
  where.innerHTML = `
    <div class="group-row"><label class="check"><input type="checkbox" id="world-check" />${icon('world')}<span>Whole world</span></label></div>
    ${byContinent.map(({ ct, list }) => `
    <div class="group" data-continent="${ct}">
      <div class="group-row">
        <label class="check"><input type="checkbox" class="cont-check" /><span>${ct}</span><small>${list.length}</small></label>
        <button type="button" class="expand" aria-expanded="false" aria-label="${ct}: countries">${CHEVRON}</button>
      </div>
      <div class="subs countries" hidden>
        ${list.map(c => `<label class="check sub"><input type="checkbox" data-country="${c.id}" /><span>${esc(c.name)}</span></label>`).join('')}
      </div>
    </div>`).join('')}`;

  // ---- length: four presets, a box for any other number, and under Atlas All: The Gordian Knot
  sizes.innerHTML = SIZES.map(n => `<button type="button" data-size="${n}">${n}</button>`).join('')
    + `<label class="custom"><input id="size-custom" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${String(MAX_SIZE).length}" placeholder="Custom" aria-label="Custom number of questions" autocomplete="off" /></label>`
    + `<button type="button" data-size="0" class="all" title="The Gordian Knot: every question in the game" hidden>All</button>`;
  const custom = sizes.querySelector<HTMLInputElement>('#size-custom')!;
  const all = sizes.querySelector<HTMLButtonElement>('.all')!;
  custom.addEventListener('input', () => {
    custom.value = custom.value.replace(/\D/g, '');
    const n = parseInt(custom.value, 10);
    if (n > 0) { selection.size = clampSize(n); saveSelection(); paintSizes(true); paintLevel(); onChange(); }
  });
  custom.addEventListener('blur', () => paintSizes());
  custom.addEventListener('keydown', e => { if (e.key === 'Enter') custom.blur(); });

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ex = t.closest<HTMLButtonElement>('.expand');
    if (ex) {
      const subs = ex.closest('.group')!.querySelector<HTMLElement>('.subs')!;
      subs.hidden = !subs.hidden;
      ex.setAttribute('aria-expanded', String(!subs.hidden));
      return;
    }
    // A level (or Reset, which is the level again) ticks that level's own question types.
    const level = t.closest<HTMLButtonElement>('[data-level]');
    if (level && level.getAttribute('aria-disabled') === 'true') {
      lockedTap = true;
      paintLevel();
      return;
    }
    if (level) {
      lockedTap = false;
      setLevel(level.dataset.level as Level);
      changed();
      return;
    }
    const ans = t.closest<HTMLButtonElement>('[data-answers]');
    if (ans && !ans.disabled) {
      const a = ans.dataset.answers as Answers;
      if (a === LEVELS[selection.level].answers) delete selection.answers; else selection.answers = a;
      changed();
      return;
    }
    const size = t.closest<HTMLButtonElement>('[data-size]');
    if (size) {
      selection.size = Number(size.dataset.size);
      if (selection.size === 0 && !stats.gordianSeen) { stats.gordianSeen = true; saveStats(); }
      changed();
    }
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'size-custom') return;
    if (t.classList.contains('cat-check')) setCat(t.closest<HTMLElement>('.group')!.dataset.cat as Cat, t.checked);
    else if (t.dataset.kind) selection.kinds = t.checked ? [...selection.kinds, t.dataset.kind] : selection.kinds.filter(k => k !== t.dataset.kind);
    else if (t.id === 'world-check') selection.places = [];
    else if (t.classList.contains('cont-check')) {
      const ct = t.closest<HTMLElement>('.group')!.dataset.continent;
      const ids = kb.countries.filter(c => kb.continent(c.id) === ct).map(c => c.id);
      selection.places = t.checked ? [...new Set([...selection.places, ...ids])] : selection.places.filter(id => !ids.includes(id));
    } else if (t.dataset.country) {
      selection.places = t.checked ? [...selection.places, t.dataset.country] : selection.places.filter(id => id !== t.dataset.country);
    } else return;
    changed();
  });

  function changed() {
    saveSelection();
    paint();
    onChange();
  }

  /** A box is locked when unticking it would leave nothing selected. */
  const lock = (box: HTMLInputElement, locked: boolean) => {
    box.disabled = locked;
    box.closest('.check')!.classList.toggle('locked', locked);
    box.closest('.check')!.setAttribute('title', locked ? 'Tick something else first' : '');
  };

  function paintLevel() {
    for (const b of levels.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.level === selection.level));
    // Atlas is shut until a great Complex round: a padlock, and a tap says how to open it.
    const shut = !atlasOpen() && selection.level !== 'impossible';
    if (atlas.classList.contains('locked') !== shut) {
      atlas.classList.toggle('locked', shut);
      atlas.querySelector('svg')!.outerHTML = levelIcon(shut ? 'locked' : 'impossible');
    }
    atlas.setAttribute('aria-disabled', String(shut));
    atlas.title = shut ? ATLAS_LOCKED : '';
    atlasAbout.textContent = shut ? `Shut for now. ${ATLAS_LOCKED}` : atlasOpenText;
    if (!shut) lockedTap = false;
    // Under the levels, words only when something needs saying: All, or a mix of the player's own (with Reset).
    const untied = stats.untied ? ` <span class="untied-note">Untied in ${clockOf(stats.untied.ms)}.</span>` : '';
    const hint = lockedTap && shut ? ATLAS_LOCKED
      : selection.size === 0 ? `The Gordian Knot: every question in the game, typed, in one go.${untied}`
        : isCustom(selection) ? `Your own mix <button type="button" class="link" data-level="${selection.level}">Reset</button>` : '';
    if (levelHint.innerHTML !== hint) levelHint.innerHTML = hint; // only when it changes, so it is read out once
    levelHint.hidden = !hint;
  }

  function paint() {
    paintLevel();
    // While All is picked, the rest shows what The Gordian Knot asks, and can't be changed.
    const all = selection.size === 0, view = all ? GORDIAN : selection;
    for (const f of fixed) { f.inert = all; f.classList.toggle('fixed', all); }
    const how = answersOf(view), level = levelOf(view), typedOnly = !!LEVELS[level].typedOnly;
    // Atlas is always typed: Choose and Both can't be picked.
    for (const b of answers.querySelectorAll<HTMLButtonElement>('[data-answers]')) {
      b.setAttribute('aria-pressed', String(b.dataset.answers === how));
      b.disabled = typedOnly && b.dataset.answers !== 'type';
      b.title = b.disabled ? `${LEVELS[level].label} is always typed` : '';
    }
    const kinds = new Set(view.kinds);
    for (const g of what.querySelectorAll<HTMLElement>('.group')) {
      const cat = g.dataset.cat as Cat;
      const state = catOn(cat, view.kinds, level);
      const box = g.querySelector<HTMLInputElement>('.cat-check')!;
      box.checked = state === 'all';
      box.indeterminate = state === 'some';
      // A fully ticked category that holds every selected type can't be unticked (a half-ticked one can: that adds).
      lock(box, state === 'all' && view.kinds.every(k => TEMPLATES.find(t => t.id === k)?.cat === cat));
    }
    for (const b of what.querySelectorAll<HTMLInputElement>('[data-kind]')) {
      b.closest<HTMLElement>('.check')!.hidden = !canAsk(level, b.dataset.kind!); // no flag to pick under Atlas
      b.checked = kinds.has(b.dataset.kind!);
      lock(b, b.checked && kinds.size === 1);
    }

    const set = new Set(view.places);
    const world = where.querySelector<HTMLInputElement>('#world-check')!;
    world.checked = !set.size;
    lock(world, !set.size);
    for (const g of where.querySelectorAll<HTMLElement>('.group')) {
      const ids = kb.countries.filter(c => kb.continent(c.id) === g.dataset.continent).map(c => c.id);
      const n = ids.filter(id => set.has(id)).length;
      const box = g.querySelector<HTMLInputElement>('.cont-check')!;
      box.checked = n === ids.length;
      box.indeterminate = n > 0 && n < ids.length;
      lock(box, n === ids.length && n === set.size);
    }
    for (const b of where.querySelectorAll<HTMLInputElement>('[data-country]')) {
      b.checked = set.has(b.dataset.country!);
      lock(b, b.checked && set.size === 1);
    }
    paintSizes();
    root.querySelector<HTMLButtonElement>('#menu-play')!.disabled = !available(kb, view);
  }

  function paintSizes(typing = false) {
    all.hidden = !atlasOpen() || selection.level !== 'impossible';
    all.classList.toggle('untied', !!stats.untied);
    all.classList.toggle('new', !stats.gordianSeen);
    const preset = selection.size === 0 || (SIZES as readonly number[]).includes(selection.size);
    for (const b of sizes.querySelectorAll<HTMLButtonElement>('[data-size]')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === selection.size));
    custom.closest('.custom')!.classList.toggle('on', !preset);
    if (!typing) custom.value = preset ? '' : String(selection.size);
  }

  paint();
  return { paint };
}
