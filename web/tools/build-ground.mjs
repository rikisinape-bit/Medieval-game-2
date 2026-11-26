// Builds the ground textures src/game3d/terreno_<name>.jpg (colour, the ambient occlusion baked in so the hollows are a
// little darker) and terreno_<name>_n.jpg (normal map: the ground answers the sun's light), and the leaf texture
// foglia.jpg of the ground-cover leaves (leaves.js), from the texture sets in assets/sorgenti/ (third-party originals:
// not in the repository). engine.js lays the ground in world space (groundMat), terrain.js the open country.
// Usage: node tools/build-ground.mjs [erba terra crepe pietra foglia]   (default: all; a set whose originals are
// missing is skipped and its textures stay as they are)
// (assets/sorgenti/terreno/Vol_16_2 is the old dirt with stones, kept for later.)
import fs from "node:fs";
import zlib from "node:zlib";
import sharp from "sharp";

const SRC = new URL("../../assets/sorgenti/", import.meta.url).pathname;
const OUT = new URL("../src/game3d/", import.meta.url).pathname;
const vol = (v) => ({ col: `terreno/${v}/${v}_Base_Color.png`, ao: `terreno/${v}/${v}_Ambient_Occlusion.png`, nrm: `terreno/${v}/${v}_Normal.png`, dx: true });
const ROCK = "rocce/textures/rock_05_2k_jpg/rock_05_";
const STONE = "pietra_castello/Stone Ground Textures/";
// The meadow: the photo of a lawn of the "Grass" material in the user's grass.blend (images packed in the file, 2048 px,
// seamless, about 2.4 m of lawn; probably from BlenderKit), read straight out of the .blend.
const GRASS = "terreno/grass.blend";
// name -> files and grading towards the game's palette: saturation, brightness, contrast (< 1 calms the painted light
// and shade: the relief comes from the normal map and the sun instead); dx: the normal map has its green pointing down
// the picture (DirectX), turned to the game's way (green up); size / nsize: size of the colour / normal map;
// mean: the average colour to end with (the light of the scene stays as it was tuned with the old painted grass);
// level: the normal map leans on average (the lawn's leans ~6 degrees): moved back to flat
const SETS = {
  erba: { col: [GRASS, "grass-1_diffuse.jpg"], nrm: [GRASS, "grass-1_diffuse_normals.jpg"], sat: 0.75, bri: 1, con: 0.8, mean: [93, 110, 72], level: true, size: 1024 },   // meadow
  terra: { col: `${ROCK}diff_2k.jpg`, ao: `${ROCK}ao_2k.jpg`, nrm: `${ROCK}nor_2k.jpg`, sat: 0.8, bri: 1.08, con: 0.8 },   // dirt (the rock of rocks.blend)
  crepe: { ...vol("Vol_19_4"), sat: 0.75, bri: 1.55, con: 0.85 },                                             // cracked earth (bandits' camp)
  pietra: { col: `${STONE}Albedo.jpg`, nrm: `${STONE}Normal.jpg`, sat: 0.8, bri: 0.86, con: 0.95, nsize: 512 },   // flagstones (Valdoro)
};
const ONLY = process.argv.slice(2);

// Blender compresses .blend files with zstd in the "seekable" format: independent frames, and at the end a table with
// the size of each one (Node decodes one frame per call).
function unzstd(d) {
  if (d.readUInt32LE(d.length - 4) !== 0x8f92eab1) return zlib.zstdDecompressSync(d);
  const n = d.readUInt32LE(d.length - 9), entry = d[d.length - 5] & 0x80 ? 12 : 8, table = d.length - 9 - n * entry;
  const parts = [];
  for (let k = 0, off = 0; k < n; k++) { const size = d.readUInt32LE(table + k * entry); parts.push(zlib.zstdDecompressSync(d.subarray(off, off + size))); off += size; }
  return Buffer.concat(parts);
}
const blends = {};
// A JPEG packed in a .blend: the first one after the image's name, from its SOI marker to its EOI marker.
function jpegFromBlend(file, image) {
  let d = blends[file];
  if (!d) {
    d = fs.readFileSync(file);
    if (d.readUInt32LE(0) === 0xfd2fb528) d = unzstd(d);                          // Blender 3.0+ can compress with zstd
    if (d.subarray(0, 7).toString() !== "BLENDER") throw new Error(`${file}: not a .blend file`);
    blends[file] = d;
  }
  const at = d.indexOf(`IM${image}\0`);
  if (at < 0) throw new Error(`${file}: no image "${image}"`);
  const s = d.indexOf(Buffer.from([0xff, 0xd8, 0xff]), at);
  if (s < 0) throw new Error(`${file}: the image "${image}" is not packed in the file`);
  for (let i = s + 2; i + 4 <= d.length;) {                                        // walk the JPEG segments
    if (d[i] !== 0xff) throw new Error("broken JPEG");
    const mk = d[i + 1];
    if (mk === 0xd9) return d.subarray(s, i + 2);
    if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
    i += 2 + d.readUInt16BE(i + 2);
    if (mk === 0xda) {                                                             // entropy-coded data up to the next marker
      while (i + 1 < d.length && !(d[i] === 0xff && d[i + 1] !== 0 && !(d[i + 1] >= 0xd0 && d[i + 1] <= 0xd7))) i++;
    }
  }
  throw new Error("JPEG without end");
}
// an original: a file in assets/sorgenti/, or [a .blend there, the name of an image packed in it]; null if missing
const source = (f) => (Array.isArray(f) ? (fs.existsSync(SRC + f[0]) ? jpegFromBlend(SRC + f[0], f[1]) : null) : fs.existsSync(SRC + f) ? SRC + f : null);

for (const [name, { col: colF, ao: aoF, nrm, dx, sat, bri, con, mean, level, size = 512, nsize = 256 }] of Object.entries(SETS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const colS = source(colF), nrmS = source(nrm);
  if (!colS || !nrmS) { console.log(`terreno_${name}: originali mancanti in ${SRC}, resta com'è`); continue; }
  const { data: col, info } = await sharp(colS).resize(size, size).modulate({ saturation: sat, brightness: bri }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const aoS = aoF && source(aoF), ao = aoS && (await sharp(aoS).resize(size, size).greyscale().raw().toBuffer());
  const avg = [0, 1, 2].map((c) => { let t = 0; for (let i = c; i < col.length; i += 3) t += col[i]; return t / (size * size); });
  const gain = mean ? mean.map((m, c) => m / avg[c]) : [1, 1, 1];
  for (let i = 0; i < size * size; i++) {
    const k = ao ? Math.pow(ao[i] / 255, 0.6) : 1;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.max(0, Math.min(255, Math.round((avg[c] + (col[i * 3 + c] - avg[c]) * con) * k * gain[c])));
  }
  await sharp(col, { raw: info }).jpeg({ quality: size > 512 ? 58 : 82, mozjpeg: true }).toFile(`${OUT}terreno_${name}.jpg`);   // (a noisy lawn hides the JPEG)
  const { data: n, info: ni } = await sharp(nrmS).resize(nsize, nsize).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (dx) for (let i = 1; i < n.length; i += 3) n[i] = 255 - n[i];
  if (level) for (let c = 0; c < 2; c++) {
    let t = 0; for (let i = c; i < n.length; i += 3) t += n[i];
    const shift = 128 - t / (n.length / 3);
    for (let i = c; i < n.length; i += 3) n[i] = Math.max(0, Math.min(255, Math.round(n[i] + shift)));
  }
  await sharp(n, { raw: ni }).jpeg({ quality: 90 }).toFile(`${OUT}terreno_${name}_n.jpg`);
  const st = await sharp(`${OUT}terreno_${name}.jpg`).stats();
  console.log(`terreno_${name}: media ${st.channels.slice(0, 3).map((c) => Math.round(c.mean)).join(", ")}, ${(fs.statSync(`${OUT}terreno_${name}.jpg`).size / 1024).toFixed(0)} KB`);
}

// The leaf: the middle of the leaf of rocks.blend, its midrib along the picture (u: base to tip, v: across)
const LEAF = `${SRC}rocce/textures/hojapropia/Leafs_diffuseOriginal.png`;
if (ONLY.length && !ONLY.includes("foglia")) process.exit(0);
if (!fs.existsSync(LEAF)) { console.log("foglia.jpg: originale mancante, resta com'è"); process.exit(0); }
const { width: lw, height: lh } = await sharp(LEAF).metadata();
await sharp(LEAF).removeAlpha().extract({ left: Math.round(lw * 0.18), top: Math.round(lh * 0.27), width: Math.round(lw * 0.6), height: Math.round(lh * 0.42) })
  .resize(256, 128).modulate({ saturation: 0.85, brightness: 1.05 }).jpeg({ quality: 85, mozjpeg: true }).toFile(`${OUT}foglia.jpg`);
console.log("foglia.jpg");
