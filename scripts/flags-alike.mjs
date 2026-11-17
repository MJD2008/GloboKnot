// Which flags look alike: data/countries/flags-alike.json, for each country the flags most like its own, most alike
// first. On Hard and Impossible, flag questions use them as the wrong options (Chad's flag among Romania, Andorra and
// Moldova), so the eye has to look closely.
//
// Each flag is drawn small (48 x 36) in Chromium and cut into a grid of 16 x 12 cells. Two flags are compared three
// ways: cell by cell, in a colour space made for how the eye sees difference (CIELAB); by their layout alone, as the
// lines where one colour meets another (so Norway's cross matches Iceland's, whatever the colours); and by how much of
// each broad colour they use. The cells and the layout are also compared mirrored and upside down (Ireland and
// Côte d'Ivoire, Poland and Indonesia). The result is committed; run this again only when the flags change.
// Run: npm run build:flags-alike, then npm run build:data (needs Playwright's Chromium).
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const KEEP = 6;                 // look-alikes kept per country
const W = 48, H = 36, GX = 16, GY = 12, EDGE = 18;

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
  console.error('This script draws the flags in Chromium. Install Playwright first: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const kb = JSON.parse(await fs.readFile(root + 'public/data/countries.json', 'utf8'));
const svgs = await Promise.all(kb.countries.map(c => fs.readFile(root + `public/flags/${c.flag}.svg`, 'utf8')));

// ---- draw every flag and read its pixels
const browser = await chromium.launch();
const page = await browser.newPage();
const pixels = await page.evaluate(async ({ svgs, W, H }) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const out = [];
  for (const svg of svgs) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, W, H);
    out.push([...g.getImageData(0, 0, W, H).data]);
  }
  return out;
}, { svgs, W, H });
await browser.close();

// ---- colour: sRGB to CIELAB (D65)
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---- each flag as a grid of colours, and as a share of a few broad colours
const BROAD = { white: [255, 255, 255], black: [0, 0, 0], red: [200, 16, 46], blue: [0, 56, 168], sky: [100, 170, 225],
  green: [0, 122, 61], yellow: [252, 209, 22], orange: [255, 130, 0] };
const broadLab = Object.values(BROAD).map(c => lab(...c));
const flags = pixels.map(px => {
  const grid = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = (gy * H) / GY; y < ((gy + 1) * H) / GY; y++) for (let x = (gx * W) / GX; x < ((gx + 1) * W) / GX; x++) {
      const i = (Math.floor(y) * W + Math.floor(x)) * 4;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    grid.push(lab(r / n, g / n, b / n));
  }
  const share = new Array(broadLab.length).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const c = lab(px[i], px[i + 1], px[i + 2]);
    let best = 0;
    broadLab.forEach((b, k) => { if (dE(c, b) < dE(c, broadLab[best])) best = k; });
    share[best] += 4 / px.length;
  }
  return { grid, share };
});
const at = (grid, x, y) => grid[y * GX + x];
const mirror = grid => grid.map((_, i) => at(grid, GX - 1 - (i % GX), Math.floor(i / GX)));
const flip = grid => grid.map((_, i) => at(grid, i % GX, GY - 1 - Math.floor(i / GX)));
const views = flags.map(fl => [fl.grid, mirror(fl.grid), flip(fl.grid)]);
/** The layout: for each pair of neighbouring cells, whether a colour changes between them. */
const edges = grid => {
  const out = [];
  for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
    if (x + 1 < GX) out.push(dE(at(grid, x, y), at(grid, x + 1, y)) > EDGE);
    if (y + 1 < GY) out.push(dE(at(grid, x, y), at(grid, x, y + 1)) > EDGE);
  }
  return out;
};
const layouts = views.map(vs => vs.map(edges));
const jaccard = (a, b) => {
  let both = 0, either = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) both++; if (a[k] || b[k]) either++; }
  return either ? 1 - both / either : 0;
};

/** 0 for the same flag; about 1 for flags with nothing in common. */
function distance(i, j) {
  const a = flags[i].grid;
  const cells = Math.min(...views[j].map(v => v.reduce((s, c, k) => s + dE(a[k], c), 0) / a.length));
  const layout = Math.min(...layouts[j].map(l => jaccard(layouts[i][0], l)));
  const colours = flags[i].share.reduce((s, x, k) => s + Math.abs(x - flags[j].share[k]), 0) / 2;
  return 0.5 * Math.min(1, cells / 60) + 0.3 * layout + 0.2 * colours;
}

const ids = kb.countries.map(c => c.id);
const alike = {};
ids.forEach((id, i) => {
  alike[id] = ids.map((o, j) => [o, i === j ? Infinity : distance(i, j)]).sort((x, y) => x[1] - y[1]).slice(0, KEEP)
    .map(([o, d]) => [o, +d.toFixed(2)]);
});
await fs.writeFile(root + 'data/countries/flags-alike.json', JSON.stringify(alike, null, 0).replace(/\],"/g, '],\n"') + '\n');
const show = id => `${id}: ${alike[id].slice(0, 4).map(([o, d]) => `${o} ${d}`).join(', ')}`;
console.log(['TCD', 'IDN', 'IRL', 'NLD', 'AUS', 'NOR', 'ISL', 'SEN', 'RUS', 'COL', 'AUT', 'LVA', 'QAT', 'EGY', 'SYR', 'SLV', 'HND', 'FRA', 'ITA',
  'JPN', 'BGD', 'USA', 'TUR', 'CHE', 'GBR', 'DEU', 'BEL', 'FIN', 'SWE', 'CAN', 'KOR', 'BRA', 'ARG', 'CHN', 'VNM', 'MEX', 'ESP'].map(show).join('\n'));
console.log(`data/countries/flags-alike.json: ${ids.length} countries, ${KEEP} look-alikes each`);
