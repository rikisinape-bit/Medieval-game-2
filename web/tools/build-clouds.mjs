// Builds the sky's cloud atlas src/game3d/nuvole.webp + nuvole.json from the cloud renders in
// assets/sorgenti/nuvole/render/ (third-party originals: not in the repository). The renders are side views of the
// "Cumulonimbus Field" volumes (VDB), made in Blender with the pack's example scene (cloud shader and sky light):
//   blender (or the bpy module) .../render.py Example/Cumulonimbus_Field_12_ExampleFile.blend render 1280 12 <vdb:name:side>...
// (tools/render-clouds.py). Each render is a bank of clouds (a whole field seen from one side): trimmed, scaled and
// packed on shelves; the colour of the edges is spread into the clear pixels (no dark halo when the texture is
// filtered). nuvole.json: for each bank its rectangle in the atlas (uv), its width in metres (the renders are
// orthographic: metres per pixel = field width / image width) and its height / width.
// Usage: node tools/build-clouds.mjs
import sharp from "sharp";
import fs from "node:fs";

const SRC = process.env.NUVOLE_SRC || new URL("../../assets/sorgenti/nuvole/render/", import.meta.url).pathname;
const OUT = new URL("../src/game3d/", import.meta.url).pathname;
const W = 2048, K = 0.55, MIN_W = 70, PAD = 4;
// metres across each render (the fields' size seen from that side, printed by render.py)
const FIELD_M = { n1: 1062, n3: 1060, n5: 1060, n7: 1060, n8: 631 };

const pieces = [];
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".png")).sort()) {
  const { data, info } = await sharp(SRC + f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, x1 = 0, y0 = h, y1 = 0;                  // trimmed to the cloud
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 - x0 < MIN_W) continue;
  pieces.push({ f, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, m: ((x1 - x0 + 1) * (FIELD_M[f.split("_")[0]] || 1000)) / w });
}
// pack: tallest first, on shelves
pieces.sort((p, q) => q.h - p.h);
let sx = 0, sy = 0, shelf = 0;
for (const p of pieces) {
  p.sw = Math.round(p.w * K); p.sh = Math.round(p.h * K);
  if (sx + p.sw + PAD > W) { sx = 0; sy += shelf + PAD; shelf = 0; }
  p.ax = sx; p.ay = sy; sx += p.sw + PAD; shelf = Math.max(shelf, p.sh);
}
const H = 2 ** Math.ceil(Math.log2(sy + shelf));
// the banks' flat bases and their ends fade out (no straight cut against the sky)
async function piece(p) {
  const { data, info } = await sharp(SRC + p.f).extract({ left: p.x, top: p.y, width: p.w, height: p.h }).resize(p.sw, p.sh).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info, sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = sm(Math.min(1, (h - 1 - y) / (h * 0.22))) * sm(Math.min(1, x / (w * 0.05), (w - 1 - x) / (w * 0.05)));
    data[(y * w + x) * 4 + 3] *= k;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
const layers = await Promise.all(pieces.map(async (p) => ({ input: await piece(p), left: p.ax, top: p.ay })));
const { data: img } = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).raw().toBuffer({ resolveWithObject: true });
// spread the edge colours into the clear pixels (a few rings), so filtering does not pull in black
for (let pass = 0; pass < 6; pass++) {
  const src = Buffer.from(img);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = (y * W + x) * 4;
    if (src[i + 3] > 8 || (src[i] | src[i + 1] | src[i + 2]) !== 0) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = ((y + dy) * W + x + dx) * 4; if (src[j + 3] > 8 || (src[j] | src[j + 1] | src[j + 2]) !== 0) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; } }
    if (n) { img[i] = r / n; img[i + 1] = g / n; img[i + 2] = b / n; }
  }
}
await sharp(img, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 80, alphaQuality: 85, effort: 6 }).toFile(`${OUT}nuvole.webp`);
const json = pieces.map((p) => ({ u: +(p.ax / W).toFixed(5), v: +(1 - (p.ay + p.sh) / H).toFixed(5), uw: +(p.sw / W).toFixed(5), vh: +(p.sh / H).toFixed(5), m: Math.round(p.m), r: +(p.h / p.w).toFixed(3) }));
fs.writeFileSync(`${OUT}nuvole.json`, JSON.stringify(json));
console.log(`${pieces.length} nuvole -> nuvole.webp ${W}x${H} (${(fs.statSync(`${OUT}nuvole.webp`).size / 1024).toFixed(0)} KB)`);
