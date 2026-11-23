// The Gordian Knot's answer key, for the server (worker/board.ts): every question of the fixed challenge (Atlas, All,
// typed) by its key ("capital:FRA"), with the names that count as right. A finished run sends the name it answered
// each question with (the right entity's own name, once the browser has matched what was typed), and the server checks
// them against this, so only a run that really answered every question right goes on the board.
// Built from the same data and code as the site, by wrangler before every `wrangler deploy` and `wrangler dev`
// (wrangler.jsonc, build.command), into worker/gen/answers.json (not kept in git). Needs Node 22.18 or newer (it
// reads the TypeScript sources directly); Cloudflare builds with Node 24.
import fs from 'node:fs';

if (!process.features.typescript) throw new Error('scripts/build-answers.mjs needs Node 22.18 or newer, which reads TypeScript');
const { Knowledge } = await import('../src/scripts/kb.ts');
const { buildRound, GORDIAN, seeded } = await import('../src/scripts/questions.ts');

const data = JSON.parse(fs.readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));
const kb = new Knowledge(data);
const pools = { country: kb.countries, city: kb.cities, language: kb.languages, peak: kb.peaks, river: kb.rivers };

/** Every question once: key -> the names of its right answers. */
function key(seed) {
  const out = {};
  for (const q of buildRound(kb, GORDIAN, seeded(seed), false, seed)) {
    if (out[q.key]) throw new Error(`two questions share the key ${q.key}`);
    if (q.format !== 'type') throw new Error(`${q.key} is not typed`);
    const names = q.pools.flatMap(p => pools[p]).filter(e => q.accept.includes(e.id)).map(e => e.name);
    if (!names.length) throw new Error(`${q.key} has no right answer`);
    out[q.key] = [...new Set(names)];
  }
  return out;
}
// The order of the questions changes with the seed; the questions and their answers must not.
const answers = key('a'), again = key('b');
if (JSON.stringify(Object.keys(answers).sort().map(k => [k, answers[k]])) !== JSON.stringify(Object.keys(again).sort().map(k => [k, again[k]]))) {
  throw new Error('The Gordian Knot is not the same set of questions from one run to the next');
}
const n = Object.keys(answers).length;
fs.mkdirSync(new URL('../worker/gen/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../worker/gen/answers.json', import.meta.url), JSON.stringify({ edition: data.edition, n, answers }));
console.log(`worker/gen/answers.json: The Gordian Knot, ${n} questions, edition ${data.edition}`);
