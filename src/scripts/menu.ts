// The selection menu (≡): what to be asked (categories and their question types), where (the whole world,
// continents or single countries) and how many questions. Every change is kept at once; Play starts it.
import { CONTINENTS, type Knowledge } from './kb';
import { CATS, TEMPLATES, available, type Cat } from './questions';
import { SIZES, saveSelection, selection, settings } from './prefs';

export const ICONS: Record<Cat | 'world', string> = {
  locations: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  capitals: '<path d="M4 20h16M5 17h14M6 17V10M10 17v-7M14 17v-7M18 17v-7M3.5 10 12 4l8.5 6z"/>',
  flags: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  languages: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  mountains: '<path d="m2.5 19 6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="m7.4 10.7 1.6 1.3 1.5-1.3"/>',
  rivers: '<path d="M3 8c3-2 5 2 8 0s5-2 8 0M3 13c3-2 5 2 8 0s5-2 8 0M3 18c3-2 5 2 8 0s5-2 8 0"/>',
  neighbours: '<path d="M3 6h8v6H3zM11 9h10v9H11zM3 12h8v6"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18M3.5 9h17M3.5 15h17"/>',
};
export const icon = (k: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function catOn(cat: Cat): 'all' | 'some' | 'none' {
  const kinds = TEMPLATES.filter(t => t.cat === cat).map(t => t.id);
  const n = kinds.filter(k => selection.kinds.includes(k)).length;
  return n === 0 ? 'none' : n === kinds.length ? 'all' : 'some';
}
export function setCat(cat: Cat, on: boolean) {
  const kinds = TEMPLATES.filter(t => t.cat === cat).map(t => t.id);
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
  const what = root.querySelector<HTMLElement>('#menu-what')!;
  const where = root.querySelector<HTMLElement>('#menu-where')!;
  const sizes = root.querySelector<HTMLElement>('#menu-size')!;
  const hint = root.querySelector<HTMLElement>('#size-hint')!;
  const count = root.querySelector<HTMLElement>('#menu-count')!;

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

  // ---- length
  sizes.innerHTML = SIZES.map(n => `<button type="button" data-size="${n}">${n}</button>`).join('');

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ex = t.closest<HTMLButtonElement>('.expand');
    if (ex) {
      const subs = ex.closest('.group')!.querySelector<HTMLElement>('.subs')!;
      subs.hidden = !subs.hidden;
      ex.setAttribute('aria-expanded', String(!subs.hidden));
      return;
    }
    const size = t.closest<HTMLButtonElement>('[data-size]');
    if (size) { selection.size = Number(size.dataset.size); changed(); }
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
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

  function paint() {
    for (const g of what.querySelectorAll<HTMLElement>('.group')) {
      const state = catOn(g.dataset.cat as Cat);
      const box = g.querySelector<HTMLInputElement>('.cat-check')!;
      box.checked = state === 'all';
      box.indeterminate = state === 'some';
    }
    for (const b of what.querySelectorAll<HTMLInputElement>('[data-kind]')) b.checked = selection.kinds.includes(b.dataset.kind!);
    const set = new Set(selection.places);
    where.querySelector<HTMLInputElement>('#world-check')!.checked = !set.size;
    for (const g of where.querySelectorAll<HTMLElement>('.group')) {
      const ids = kb.countries.filter(c => kb.continent(c.id) === g.dataset.continent).map(c => c.id);
      const n = ids.filter(id => set.has(id)).length;
      const box = g.querySelector<HTMLInputElement>('.cont-check')!;
      box.checked = n === ids.length;
      box.indeterminate = n > 0 && n < ids.length;
    }
    for (const b of where.querySelectorAll<HTMLInputElement>('[data-country]')) b.checked = set.has(b.dataset.country!);
    for (const b of sizes.querySelectorAll<HTMLButtonElement>('[data-size]')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === selection.size));
    hint.textContent = selection.size > 10 ? `${settings.time} seconds per answer` : 'No time limit';
    const n = available(kb, selection);
    count.textContent = !selection.kinds.length ? 'Pick something to play' : n < selection.size ? `only ${n} questions` : `${selection.size} of ${n} questions`;
    root.querySelector<HTMLButtonElement>('#menu-play')!.disabled = !selection.kinds.length || !n;
  }

  paint();
  return { paint };
}
