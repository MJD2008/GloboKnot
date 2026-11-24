// A country's photo as the background (James, 22 Nov 2026: "When a player selects a country on the main-menu globe,
// allow them to use an image provided in that country's index entry as their background ... Preserve the normal
// background as the default. Do not add a general background-selection option to Settings."). The button on a sheet's
// photo sets it (and, on the same photo, takes it away again: back to the night sky); another country's photo replaces
// it. On the home screen it takes the place of the night sky, sharp and bright, darkened only at the top and the foot
// so the header and the menu read (James, 23 Nov 2026: "a bit more crisp and bright"); in a round and on its results it
// is only a faint, blurred tint under the page's own colour. Kept in this browser (gk-background).
import type { Photo } from './sheet';

const KEY = 'gk-background';
export interface Backdrop { id: string; src: string }

let saved: Backdrop | null = null;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (raw && typeof raw.id === 'string' && typeof raw.src === 'string') saved = { id: raw.id, src: raw.src };
} catch { /* private mode, or nothing kept */ }

const listeners: (() => void)[] = [];
let paint: () => void = () => {};

export const backdrop = {
  /** The photo in use, or null for the night sky. */
  get now(): Backdrop | null { return saved; },
  is: (src: string) => saved?.src === src,
  set(next: Backdrop | null) {
    saved = next;
    try { if (next) localStorage.setItem(KEY, JSON.stringify(next)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    paint();
    for (const f of listeners) f();
  },
  /** Called when it changes (the sheets' buttons, the night sky). */
  onChange(f: () => void) { listeners.push(f); },
};

/** The layer behind the page: two photos, so one can fade into the next. The page brings it (Base.astro), with the
 *  photo picked already showing, so the site opens on it (James, 24 Nov 2026); made here when it isn't there. */
export function initBackdrop(url: (path: string) => string, photos: Record<string, Photo[]>) {
  let el = document.querySelector<HTMLElement>('.backdrop');
  if (!el) {
    el = document.createElement('div');
    el.className = 'backdrop';
    el.setAttribute('aria-hidden', 'true');
    el.append(document.createElement('i'), document.createElement('i'));
    document.body.prepend(el);
  }
  const layers = [...el.querySelectorAll<HTMLElement>(':scope > i')].slice(0, 2);
  let showing: string | null = null, top = 0;
  // The photo the page put in place before it was first drawn: kept as it is, no fading in again.
  const early = el.dataset.src;
  if (early && layers[0].classList.contains('on')) showing = url(early);
  layers[0].style.transition = ''; // it came in at once (Base.astro); it fades like the rest from here on
  paint = () => {
    const want = saved ? url(saved.src) : null;
    if (want === showing) return;
    showing = want;
    if (!want) {
      layers.forEach(l => l.classList.remove('on'));
      document.documentElement.classList.remove('has-backdrop');
      document.documentElement.removeAttribute('data-backdrop');
      return;
    }
    // Shown once it has loaded, so the sky never gives way to nothing; a file that is gone puts the sky back.
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (showing !== want) return;
      top = 1 - top;
      layers[top].style.backgroundImage = `url("${want}")`;
      layers[top].classList.add('on');
      layers[1 - top].classList.remove('on');
      document.documentElement.classList.add('has-backdrop');
      document.documentElement.dataset.backdrop = saved?.id ?? '';
    };
    img.onerror = () => { if (showing === want) backdrop.set(null); };
    img.src = want;
  };
  // A photo no longer in the list (a later edition, or the preview's smaller set) is forgotten: the sky comes back.
  if (saved && !photos[saved.id]?.some(p => p.src === saved!.src)) backdrop.set(null);
  else paint();
  // The early one's file gone: the sky comes back too.
  if (showing && saved) {
    const was = showing, check = new Image();
    check.onerror = () => { if (showing === was) backdrop.set(null); };
    check.src = was;
  }
}
