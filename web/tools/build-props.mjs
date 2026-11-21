// Builds web/public/models/props.glb (village props: market stalls and table, crates, buckets, carts, lamp post,
// torch on a pole, woodpile, campfire, fence) from the "Medieval Props Minipack 4" GLBs in
// assets/sorgenti/medieval_props_minipack_4/ (third-party originals: not in the repository).
// Each prop becomes a named node (its file name), its parts baked in (the carts' wheels), re-centred on the ground
// (x/z centre, lowest point at y = 0). All props share one material with the pack's texture atlas (darkened a little
// for the game's palette, WebP); the glass of the lamp keeps its own glowing material ("Props_Light").
// Usage: node tools/build-props.mjs
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const SRC = new URL("../../assets/sorgenti/medieval_props_minipack_4/", import.meta.url).pathname;
const OUT = new URL("../public/models/props.glb", import.meta.url).pathname;
const ATLAS = "TextureAtlas_MedievalProps_Minipack_4.png";
// prop -> file it is in (the carts are only in the pack's showcase scene, with their wheels as child nodes)
const PROPS = {
  props_applecrate_A: 0, props_applecrate_B: 0, props_bucket: 0, props_campfire_01: 0, props_emptycrate_A: 0, props_emptycrate_B: 0,
  props_fence_01: 0, props_ironcrate: 0, props_lamppost_01: 0, props_marketTable: 0, props_marketstall_A: 0, props_marketstall_B: 0,
  props_torch_01: 0, props_waterbucket_01: 0, props_woodpile_01: 0, props_cart_01: "props_cart_01", props_cart_02: "props_cart_01",
};

// 4x4 column-major matrices
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function inv(m) {   // general 4x4 inverse
  const a = m, o = new Array(16);
  o[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  o[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  o[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  o[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  o[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  o[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  o[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  o[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  o[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  o[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  o[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  o[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  o[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  o[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  o[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  o[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * o[0] + a[1] * o[4] + a[2] * o[8] + a[3] * o[12];
  return o.map((v) => v / det);
}
const point = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const out = new Document(); const buffer = out.createBuffer(); const scene = out.createScene("props");
out.createExtension(EXTTextureWebP).setRequired(true);
// the atlas, graded like the kit's textures (darker, less saturated: the game's palette)
const atlas = await sharp(SRC + ATLAS).modulate({ brightness: 0.88, saturation: 0.72 }).webp({ quality: 85 }).toBuffer();
const atlasMat = out.createMaterial("Props_Atlas").setRoughnessFactor(1).setMetallicFactor(0)
  .setBaseColorTexture(out.createTexture("props_atlas").setImage(atlas).setMimeType("image/webp"));
const lightMat = out.createMaterial("Props_Light").setRoughnessFactor(0.6).setMetallicFactor(0).setBaseColorFactor([1, 0.68, 0.09, 1]).setEmissiveFactor([1, 0.62, 0.12]);

const docs = {};
const load = async (f) => (docs[f] ||= await io.read(SRC + f + ".glb"));
let total = 0;
for (const [name, file] of Object.entries(PROPS)) {
  const doc = await load(file || name);
  const root = file ? doc.getRoot().listNodes().find((n) => n.getName() === name) : doc.getRoot().listNodes().find((n) => n.getMesh());
  // the prop's own scale stays (the cart is made 1.5 times bigger in its scene), its place and turn do not
  const rootInv = inv(root.getWorldMatrix()), [sx, sy, sz] = root.getScale();
  const S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const parts = { atlas: { pos: [], nrm: [], uv: [] }, light: { pos: [], nrm: [], uv: [] } };
  const take = (node) => {
    const m = node.getMesh();
    if (m) {
      const M = mul(S, mul(rootInv, node.getWorldMatrix())), N = mul(S, mul(rootInv, node.getWorldMatrix())); N[12] = N[13] = N[14] = 0;
      for (const p of m.listPrimitives()) {
        const part = /light/i.test(p.getMaterial()?.getName() || "") ? parts.light : parts.atlas;
        const P = p.getAttribute("POSITION"), Nn = p.getAttribute("NORMAL"), U = p.getAttribute("TEXCOORD_0"), I = p.getIndices();
        const ids = I ? Array.from({ length: I.getCount() }, (_, i) => I.getScalar(i)) : Array.from({ length: P.getCount() }, (_, i) => i);
        const e = [0, 0, 0], u = [0, 0];
        for (const i of ids) {
          part.pos.push(...point(M, P.getElement(i, e)));
          const n = point(N, Nn ? Nn.getElement(i, e) : [0, 1, 0]), l = Math.hypot(...n) || 1; part.nrm.push(n[0] / l, n[1] / l, n[2] / l);
          if (U) { U.getElement(i, u); part.uv.push(u[0], u[1]); } else part.uv.push(0, 0);
        }
      }
    }
    node.listChildren().forEach(take);
  };
  take(root);
  // on the ground, centred
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const part of Object.values(parts)) for (let i = 0; i < part.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], part.pos[i + k]); max[k] = Math.max(max[k], part.pos[i + k]); }
  const c = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
  const mesh = out.createMesh(name);
  for (const [key, part] of Object.entries(parts)) {
    if (!part.pos.length) continue;
    for (let i = 0; i < part.pos.length; i += 3) for (let k = 0; k < 3; k++) part.pos[i + k] -= c[k];
    mesh.addPrimitive(out.createPrimitive().setMaterial(key === "light" ? lightMat : atlasMat)
      .setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(new Float32Array(part.pos)).setBuffer(buffer))
      .setAttribute("NORMAL", out.createAccessor().setType("VEC3").setArray(new Float32Array(part.nrm)).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", out.createAccessor().setType("VEC2").setArray(new Float32Array(part.uv)).setBuffer(buffer)));
    total += part.pos.length / 9;
  }
  scene.addChild(out.createNode(name).setMesh(mesh));
  console.log(name.padEnd(22), (max.map((v, k) => (v - min[k]).toFixed(2)).join(" x ")), "m");
}
await out.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
out.createExtension(EXTMeshoptCompression).setRequired(true);
await io.write(OUT, out);
console.log(`${Object.keys(PROPS).length} oggetti, ${Math.round(total)} triangoli -> ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
