// Builds the ground textures src/game3d/terreno_<name>.jpg (colour, 512 px, the ambient occlusion baked in so the
// hollows are a little darker) and terreno_<name>_n.jpg (normal map: the ground answers the sun's light), and the leaf
// texture foglia.jpg of the ground-cover leaves (leaves.js), from the texture sets in assets/sorgenti/ (third-party
// originals: not in the repository). engine.js lays the ground in world space (groundMat).
// Usage: node tools/build-ground.mjs
// (assets/sorgenti/terreno/Vol_16_2 is the old dirt with stones, kept for later.)
import sharp from "sharp";

const SRC = new URL("../../assets/sorgenti/", import.meta.url).pathname;
const OUT = new URL("../src/game3d/", import.meta.url).pathname;
const vol = (v) => ({ col: `terreno/${v}/${v}_Base_Color.png`, ao: `terreno/${v}/${v}_Ambient_Occlusion.png`, nrm: `terreno/${v}/${v}_Normal.png`, dx: true });
const ROCK = "rocce/textures/rock_05_2k_jpg/rock_05_";
const STONE = "pietra_castello/Stone Ground Textures/";
// name -> files and grading towards the game's palette: saturation, brightness, contrast (< 1 calms the painted light
// and shade: the relief comes from the normal map and the sun instead); dx: the normal map has its green pointing down
// the picture (DirectX), turned to the game's way (green up); nsize: size of the normal map
const SETS = {
  erba: { ...vol("Vol_42_1"), sat: 1.0, bri: 1.5, con: 0.9 },                                                 // meadow
  terra: { col: `${ROCK}diff_2k.jpg`, ao: `${ROCK}ao_2k.jpg`, nrm: `${ROCK}nor_2k.jpg`, sat: 0.8, bri: 1.08, con: 0.8 },   // dirt (the rock of rocks.blend)
  crepe: { ...vol("Vol_19_4"), sat: 0.75, bri: 1.55, con: 0.85 },                                             // cracked earth (bandits' camp)
  pietra: { col: `${STONE}Albedo.jpg`, nrm: `${STONE}Normal.jpg`, sat: 0.8, bri: 0.86, con: 0.95, nsize: 512 },   // flagstones (Valdoro)
};

for (const [name, { col: colF, ao: aoF, nrm, dx, sat, bri, con, nsize = 256 }] of Object.entries(SETS)) {
  const { data: col, info } = await sharp(SRC + colF).resize(512, 512).modulate({ saturation: sat, brightness: bri }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ao = aoF && (await sharp(SRC + aoF).resize(512, 512).greyscale().raw().toBuffer());
  const avg = [0, 1, 2].map((c) => { let t = 0; for (let i = c; i < col.length; i += 3) t += col[i]; return t / (512 * 512); });
  for (let i = 0; i < 512 * 512; i++) {
    const k = ao ? Math.pow(ao[i] / 255, 0.6) : 1;
    for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.max(0, Math.min(255, Math.round((avg[c] + (col[i * 3 + c] - avg[c]) * con) * k)));
  }
  await sharp(col, { raw: info }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}terreno_${name}.jpg`);
  const { data: n, info: ni } = await sharp(SRC + nrm).resize(nsize, nsize).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (dx) for (let i = 1; i < n.length; i += 3) n[i] = 255 - n[i];
  await sharp(n, { raw: ni }).jpeg({ quality: 90 }).toFile(`${OUT}terreno_${name}_n.jpg`);
  const st = await sharp(`${OUT}terreno_${name}.jpg`).stats();
  console.log(`terreno_${name}: media ${st.channels.slice(0, 3).map((c) => Math.round(c.mean)).join(", ")}`);
}

// The leaf: the middle of the leaf of rocks.blend, its midrib along the picture (u: base to tip, v: across)
const LEAF = `${SRC}rocce/textures/hojapropia/Leafs_diffuseOriginal.png`;
const { width: lw, height: lh } = await sharp(LEAF).metadata();
await sharp(LEAF).removeAlpha().extract({ left: Math.round(lw * 0.18), top: Math.round(lh * 0.27), width: Math.round(lw * 0.6), height: Math.round(lh * 0.42) })
  .resize(256, 128).modulate({ saturation: 0.85, brightness: 1.05 }).jpeg({ quality: 85, mozjpeg: true }).toFile(`${OUT}foglia.jpg`);
console.log("foglia.jpg");
