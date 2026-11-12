// Copies the flag of every country in the knowledge base into public/flags/ (flag-icons, MIT licence).
// Run: node scripts/copy-flags.mjs
import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const kb = JSON.parse(await fs.readFile(root + 'public/data/countries.json', 'utf8'));
await fs.mkdir(root + 'public/flags', { recursive: true });
for (const c of kb.countries) {
  await fs.copyFile(root + `node_modules/flag-icons/flags/4x3/${c.flag}.svg`, root + `public/flags/${c.flag}.svg`);
}
await fs.copyFile(root + 'node_modules/flag-icons/LICENSE', root + 'public/flags/LICENSE.txt');
console.log(`public/flags: ${kb.countries.length} flags`);
