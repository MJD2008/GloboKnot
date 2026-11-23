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

/** The layer behind the page: two photos, so one can fade into the next. */
export function initBackdrop(url: (path: string) => string, photos: Record<string, Photo[]>) {
  // A photo no longer in the list (a later edition, or the preview's smaller set) is forgotten.
  if (saved && !photos[saved.id]?.some(p => p.src === saved!.src)) backdrop.set(null);
  const el = document.createElement('div');
  el.className = 'backdrop';
  el.setAttribute('aria-hidden', 'true');
  const layers = [document.createElement('i'), document.createElement('i')];
  el.append(...layers);
  document.body.prepend(el);
  let showing: string | null = null, top = 0;
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
  paint();
}
