// Text helpers shared by the importer, the checker and (later) the answer matcher.

const ENTITIES = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' };

export function decodeHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-z]+);/gi, (m, n) => {
      if (ENTITIES[n.toLowerCase()]) return ENTITIES[n.toLowerCase()];
      const acc = n.match(/^([a-z])(acute|grave|circ|uml|tilde|cedil|ring|slash)$/i);
      if (acc) return (acc[1] + ({ acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', cedil: '̧', ring: '̊', slash: '' })[acc[2].toLowerCase()]).normalize('NFC');
      return m;
    })
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/\s+/g, ' ').trim();
}

// Normalise a name for comparison: case, accents, punctuation, "the", "St."/"Saint", "&"/"and".
export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[øœæßłđþı]/g, c => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', þ: 'th', ı: 'i' })[c])
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the\s+|\s+the$/g, '')
    .trim();
}

export function slug(s) {
  return norm(s).replace(/\s+/g, '-');
}
