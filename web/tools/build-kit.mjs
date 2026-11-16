// Builds web/public/models/kit.glb (medieval buildings) from tools/.kit-cache.json (see convert-kit.mjs).
// Each piece becomes a named node, re-centred on the ground (x/z centre, lowest point at y = 0) and scaled from the
// kit's miniature scale to metres. Materials are shared by name; the few textures are darkened, resized, WebP.
// Usage: node tools/build-kit.mjs
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const CACHE = new URL("./.kit-cache.json", import.meta.url).pathname;
const TEX = new URL("../../assets/sorgenti/Lowpoly_Medieval_Asset/Textures_Pack/", import.meta.url).pathname;
const OUT = new URL("../public/models/kit.glb", import.meta.url).pathname;
export const KIT_SCALE = 0.023;                      // kit units (cm, miniature) -> metres in the game

// Pieces used by the game (regular expressions on the original names).
const USE = [/^Tower_/, /^Castle_Wall/, /^Castle_Entrance$/, /^Closed_/, /^Castle_Open_/, /^Castle_Part_0(12|13|14|15|16|17|18|19|20|21|22|23)$/, /^Castle_Window_/,
  /^Flags_Banners_/, /^Flag_Pole_/, /^House_/, /^Tent_/, /^Campfire_/, /^Wood_/, /^Street_Rock_/, /^Weapon_Holder_/, /^Wall_piece_/];

// Material name -> texture file (the rest are plain colours).
const TEXTURE_OF = { Wall_Tile_01_Mat: "Wall_01.jpg", Wall_Tile_02_Mat: "Wall_02.jpg", Wall_Tile_03_Mat: "Wall_03.jpg", Wood_plank_Tile_Mat: "Wood_plank_01.jpg", Banners_01_Mat: "Banner_01.jpg", Glass_Painted_Mat: "Painted_Glass_01.jpg" };
// Dark-fantasy grading: [brightness, saturation] for textures; plain colours are toned with tone().
const GRADE = { Wall: [1.15, 0.5], Wood: [0.8, 0.6], Banner: [0.7, 0.75], Painted: [0.8, 0.7] };
const OVERRIDE = { Brown_08_Mat: "#5a4630", Glass_01_Mat: "#2a3e4a", Gold_01_Mat: "#8a6a20", Fire_01_Mat: "#c8501a", Fire_02_Mat: "#ff8a20" }; // thatch roofs, windows...
const hexToLin = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };

const data = JSON.parse(fs.readFileSync(CACHE));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = new Document(); const buffer = doc.createBuffer(); const scene = doc.createScene("kit");
doc.createExtension(EXTTextureWebP).setRequired(true);
const materials = {};
const materialOf = async (name, color) => {
  if (materials[name]) return materials[name];
  const m = doc.createMaterial(name).setRoughnessFactor(1).setMetallicFactor(0);
  const file = TEXTURE_OF[name];
  if (file) {
    const [brightness, saturation] = GRADE[Object.keys(GRADE).find((k) => file.startsWith(k))];
    const img = await sharp(TEX + file).resize(512, 512, { fit: "inside" }).modulate({ brightness, saturation }).webp({ quality: 80 }).toBuffer();
    m.setBaseColorTexture(doc.createTexture(file).setImage(img).setMimeType("image/webp")).setBaseColorFactor([1, 1, 1, 1]);
  } else m.setBaseColorFactor([...hexToLin(OVERRIDE[name] || color).map((c) => (name.startsWith("Grey") ? Math.min(1, c * 1.7 + 0.01) : c)), 1]);   // the kit's greys are almost black
  if (name.startsWith("Fire")) m.setEmissiveFactor(hexToLin(OVERRIDE[name]));
  return (materials[name] = m);
};
const sizes = {}; let total = 0;
for (const [name, parts] of Object.entries(data)) {
  if (!USE.some((r) => r.test(name))) continue;
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of Object.values(parts)) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]); }
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  const mesh = doc.createMesh(name);
  for (const [matName, p] of Object.entries(parts)) {
    const n = p.pos.length / 3, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (p.pos[i * 3] - cx) * KIT_SCALE; pos[i * 3 + 1] = (p.pos[i * 3 + 1] - min[1]) * KIT_SCALE; pos[i * 3 + 2] = (p.pos[i * 3 + 2] - cz) * KIT_SCALE; }
    const prim = doc.createPrimitive().setMaterial(await materialOf(matName, p.color))
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(p.nrm)).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(p.uv.map((v, i) => (i % 2 ? 1 - v : v)))).setBuffer(buffer));
    mesh.addPrimitive(prim); total += n / 3;
  }
  scene.addChild(doc.createNode(name.toLowerCase()).setMesh(mesh));
  sizes[name.toLowerCase()] = [(max[0] - min[0]) * KIT_SCALE, (max[1] - min[1]) * KIT_SCALE, (max[2] - min[2]) * KIT_SCALE].map((v) => +v.toFixed(2));
}
await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
fs.mkdirSync(new URL("../public/models/", import.meta.url).pathname, { recursive: true });
await io.write(OUT, doc);
fs.writeFileSync(new URL("./.kit-sizes.json", import.meta.url).pathname, JSON.stringify(sizes, null, 0));
console.log(`${Object.keys(sizes).length} pezzi, ${Math.round(total)} triangoli -> ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
