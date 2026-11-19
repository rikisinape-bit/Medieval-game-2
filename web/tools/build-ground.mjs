// Builds the ground textures src/game3d/terreno_<name>.jpg (colour, 512 px, the ambient occlusion baked in so the
// hollows are a little darker) and terreno_<name>_n.jpg (normal map, 256 px: the ground answers the sun's light) from
// the texture sets in assets/sorgenti/terreno/ (third-party originals: not in the repository). engine.js lays them in
// world space (groundMat). Usage: node tools/build-ground.mjs
import sharp from "sharp";

const SRC = new URL("../../assets/sorgenti/terreno/", import.meta.url).pathname;
const OUT = new URL("../src/game3d/", import.meta.url).pathname;
// name -> [texture set, saturation, brightness, contrast] (graded towards the game's palette; contrast < 1 calms the
// painted light and shade: the relief comes from the normal map and the sun instead)
const SETS = { erba: ["Vol_42_1", 1.0, 1.5, 0.9], terra: ["Vol_16_2", 0.7, 1.6, 0.5], crepe: ["Vol_19_4", 0.75, 1.55, 0.85] };

for (const [name, [vol, sat, bri, con]] of Object.entries(SETS)) {
  const f = (m) => `${SRC}${vol}/${vol}_${m}.png`;
  const { data: col, info } = await sharp(f("Base_Color")).resize(512, 512).modulate({ saturation: sat, brightness: bri }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ao = await sharp(f("Ambient_Occlusion")).resize(512, 512).greyscale().raw().toBuffer();
  const avg = [0, 1, 2].map((c) => { let t = 0; for (let i = c; i < col.length; i += 3) t += col[i]; return t / (512 * 512); });
  for (let i = 0; i < 512 * 512; i++) {
    const k = Math.pow(ao[i] / 255, 0.6);
    for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.max(0, Math.min(255, Math.round((avg[c] + (col[i * 3 + c] - avg[c]) * con) * k)));
  }
  await sharp(col, { raw: info }).jpeg({ quality: 82, mozjpeg: true }).toFile(`${OUT}terreno_${name}.jpg`);
  await sharp(f("Normal")).resize(256, 256).removeAlpha().jpeg({ quality: 90 }).toFile(`${OUT}terreno_${name}_n.jpg`);
  const st = await sharp(`${OUT}terreno_${name}.jpg`).stats();
  console.log(`terreno_${name}: media ${st.channels.slice(0, 3).map((c) => Math.round(c.mean)).join(", ")}`);
}
