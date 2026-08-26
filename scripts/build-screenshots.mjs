// assets/screenshots/_raw/*.png (as captured) -> assets/screenshots/*.png (as shown in the course).
//
// Raw captures are 1400-1900px wide with a lot of empty chrome around the part
// the text actually talks about. At the course's ~780px content width that makes
// the UI labels unreadable. This crops each one to the region the prose points at
// and draws a callout box where the text names a specific control.
//
// Re-run after adding or replacing anything in _raw/:  npm run build:screenshots
//
// crop/box coordinates are FRACTIONS of the raw image (0..1) so they survive a
// re-capture at a different window size. box coordinates are fractions of the
// CROPPED image (what you see in the output), not of the raw one.

import { readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// sharp already ships inside netlify-cli's dependency tree — no extra install.
const sharp = require('netlify-cli/node_modules/sharp');

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, '..', 'assets', 'screenshots', '_raw');
const OUT = join(__dirname, '..', 'assets', 'screenshots');

const CALLOUT = '#E4572E';

// out name -> recipe.
//   from:  raw file name (without .png), defaults to the out name
//   crop:  [x, y, x2, y2] fractions of the raw image
//   stack: several crops of the same raw image, stacked vertically with a gap
//          (used to cut dead space out of the middle of a tall sidebar)
//   boxes: callout rectangles [x, y, x2, y2] fractions of the cropped image,
//          optionally { r: [...], n: 1 } to number them for the caption
const SHOTS = {
  'm2-nav': {
    stack: [[0, 0, 1, 0.33], [0, 0.85, 1, 1]],
    boxes: [{ r: [0.03, 0.11, 0.98, 0.61], n: 1 }, { r: [0.03, 0.71, 0.98, 0.99], n: 2 }],
  },
  'm2-actions-budget': {
    boxes: [{ r: [0.876, 0.44, 1.0, 0.93], n: 1 }, { r: [0.658, 0.07, 0.775, 0.20], n: 2 }],
  },
  'm3-type-select': { crop: [0.32, 0.27, 0.68, 0.80] },
  'm4-directories-overview': { crop: [0, 0, 1, 0.44] },
  'm4-create-advertiser': {
    crop: [0, 0, 1, 0.91],
    boxes: [{ r: [0.04, 0.72, 0.50, 0.80], n: 1 }, { r: [0.505, 0.72, 0.96, 0.80], n: 2 }],
  },
  'm8-add-creative-documents': {
    crop: [0, 0, 1, 0.98],
    boxes: [[0.73, 0.12, 0.985, 0.375]],
  },
  'm9-three-methods': { crop: [0.37, 0.06, 0.73, 0.59] },
  'm9-form-steps': { crop: [0, 0, 1, 0.48] },
  'm10-summary-map': { crop: [0.12, 0, 0.98, 0.68] },
  'm10-stats-screens': { crop: [0.12, 0, 0.98, 0.42] },
  'm10-stats-impressions': { crop: [0.12, 0, 0.98, 0.95] },
  'm10-stats-charts': {},
  'm10-photo-reports': {},
  'm10-export-menu': {},
  'm11-ag-cost': {
    boxes: [{ r: [0.08, 0.33, 0.41, 0.46], n: 1 }, { r: [0.08, 0.46, 0.41, 0.59], n: 2 }],
  },
  'm6-screens-overview': {
    from: 'screens-overview',
    boxes: [
      { r: [0.182, 0.055, 0.932, 0.105], n: 1 },
      { r: [0.182, 0.108, 0.968, 0.489], n: 2 },
      { r: [0.182, 0.500, 0.968, 0.940], n: 3 },
    ],
  },
  'm6-pre-campaign': { from: 'screens-pre-campaign', crop: [0.18, 0.05, 0.65, 0.47] },
  'm6-place-search': { from: 'screens-place-search', crop: [0.40, 0.06, 0.60, 0.43] },
  'm6-autopick': { from: 'screens-autopick-settings', crop: [0.50, 0.05, 0.69, 0.50] },
  'm6-gid-import': { from: 'screens-gid-table', crop: [0.59, 0.49, 0.85, 0.78] },
  'm6-bids': {
    from: 'screens-bids',
    crop: [0.18, 0.04, 0.98, 0.55],
    boxes: [
      { r: [0.022, 0.125, 0.342, 0.212], n: 1 },
      { r: [0.760, 0.235, 0.870, 0.99], n: 2 },
      { r: [0.872, 0.235, 0.980, 0.99], n: 3 },
    ],
  },
  'm7-creatives-list': { from: 'creatives-list-new', crop: [0.09, 0, 1, 0.55] },
  't7-campaign-details': { from: 'summary-campaign-details', crop: [0.09, 0, 1, 0.66] },
};

function px(frac, size) {
  return Math.max(0, Math.min(size, Math.round(frac * size)));
}

function region(crop, w, h) {
  const [x, y, x2, y2] = crop;
  const left = px(x, w);
  const top = px(y, h);
  return { left, top, width: Math.max(1, px(x2, w) - left), height: Math.max(1, px(y2, h) - top) };
}

function overlay(boxes, w, h) {
  const parts = boxes.map((b) => {
    const [x, y, x2, y2] = Array.isArray(b) ? b : b.r;
    const n = Array.isArray(b) ? null : b.n;
    const left = px(x, w), top = px(y, h);
    const bw = px(x2, w) - left, bh = px(y2, h) - top;
    const rect =
      `<rect x="${left + 1.5}" y="${top + 1.5}" width="${bw - 3}" height="${bh - 3}" rx="7"` +
      ` fill="none" stroke="${CALLOUT}" stroke-width="3"/>`;
    if (!n) return rect;
    // numbered badge hugging the top-left corner, nudged inside if it would clip
    const cx = Math.max(15, left), cy = Math.max(15, top);
    return rect +
      `<circle cx="${cx}" cy="${cy}" r="14" fill="${CALLOUT}"/>` +
      `<text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="#fff"` +
      ` font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold">${n}</text>`;
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`);
}

async function stackCrops(img, crops, w, h) {
  const GAP = 10;
  const pieces = await Promise.all(
    crops.map(async (c) => {
      const r = region(c, w, h);
      return { buf: await img.clone().extract(r).png().toBuffer(), ...r };
    })
  );
  const width = Math.max(...pieces.map((p) => p.width));
  const height = pieces.reduce((n, p) => n + p.height, 0) + GAP * (pieces.length - 1);
  let top = 0;
  const composite = pieces.map((p) => {
    const item = { input: p.buf, left: 0, top };
    top += p.height + GAP;
    return item;
  });
  return sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite(composite)
    .png()
    .toBuffer();
}

mkdirSync(OUT, { recursive: true });

const used = new Set(Object.entries(SHOTS).map(([name, r]) => r.from || name));
for (const f of readdirSync(RAW)) {
  const base = f.replace(/\.[^.]+$/, '');
  if (!used.has(base)) console.warn('! ' + f + ' in _raw/ is not used by any recipe');
}

for (const [name, recipe] of Object.entries(SHOTS)) {
  const src = join(RAW, (recipe.from || name) + '.png');
  const img = sharp(src);
  const { width: rw, height: rh } = await img.metadata();

  let buf;
  if (recipe.stack) buf = await stackCrops(img, recipe.stack, rw, rh);
  else if (recipe.crop) buf = await img.clone().extract(region(recipe.crop, rw, rh)).png().toBuffer();
  else buf = await img.clone().png().toBuffer();

  if (recipe.boxes) {
    const m = await sharp(buf).metadata();
    buf = await sharp(buf).composite([{ input: overlay(recipe.boxes, m.width, m.height) }]).png().toBuffer();
  }

  const out = join(OUT, name + '.png');
  await sharp(buf).png({ compressionLevel: 9 }).toFile(out);
  const m = await sharp(out).metadata();
  console.log(`${name}.png  ${rw}x${rh} -> ${m.width}x${m.height}`);
}
