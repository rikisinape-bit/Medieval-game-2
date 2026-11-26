// Builds web/public/models/natura.glb from the original nature models in assets/models/natura/:
// - keeps only the models the game uses, one named node each (a source "file#Node" takes one object of a file that
//   holds many, e.g. the trees of the Shapespark plants kit, moved to the origin)
// - simplifies trunks/branches a lot and foliage a little
// - drops normal maps, shares identical textures between models, darkens/desaturates them for the dark-fantasy
//   palette, resizes to 512 px and stores them as WebP
// - compresses geometry with meshopt
// Usage: node tools/optimize-nature.mjs
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, weld, simplifyPrimitive, compactPrimitive, mergeDocuments, unpartition, flatten } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const SRC = new URL("../../assets/models/natura/", import.meta.url).pathname;
const OUT = new URL("../public/models/natura.glb", import.meta.url).pathname;

// id -> [file, { materialNamePrefix: target triangle count }]   (default "*" applies to the other materials)
const MODELS = {
  // Trees: Shapespark low-poly plants kit (piante_shapespark.glb), three species (a, b, c) in four sizes (1 = biggest).
  // Already light (370-650 triangles): nothing to simplify.
  ...Object.fromEntries(["a", "b", "c"].flatMap((sp, i) => [1, 2, 3, 4].map((v) => [`albero_${sp}${v}`, [`piante_shapespark#Tree-0${i + 1}-${v}`, {}]]))),
  // pines: only in the snow of the open country (vegetation.js); the kit has none
  pino_1: ["pino_1", { Bark: 120, Leaves: 340 }],
  pino_2: ["pino_2", { Bark: 140, Leaves: 340 }],
  pino_3: ["pino_3", { Bark: 140, Leaves: 300 }],
  contorto_1: ["albero_contorto_1", { Bark: 700, Leaves: 1000 }],
  contorto_2: ["albero_contorto_2", { Bark: 700, Leaves: 900 }],
  morto: ["albero_morto", { Bark: 500 }],
  cespuglio: ["cespuglio", { "*": 260 }],
  cespuglio_fiorito: ["cespuglio_fiorito", { Leaves: 260, Flowers: 90 }],
  felce: ["felce", { "*": 120 }],
  pianta_grande: ["pianta_grande", { "*": 112 }],
  pianta: ["pianta", { "*": 48 }],
  trifoglio: ["trifoglio", { "*": 90 }],
  fiori: ["fiori", { Leaves: 140, Flowers: 45 }],
  petali: ["petali_2", { "*": 15 }],
  erba: ["erba", { "*": 90 }],
  erba_alta: ["erba_alta", { "*": 80 }],
  fungo: ["fungo", { "*": 200 }],
  roccia: ["roccia", { "*": 160 }],
  sasso_tondo: ["sasso_tondo_1", { "*": 60 }],
  sasso_quadro: ["sasso_quadro_2", { "*": 40 }],
  selciato: ["selciato_piccolo", { "*": 150 }],
};
// The Shapespark kit's materials, renamed after the game's scheme (Bark_* / Leaves_*: shadows, colour grading).
const RENAME = { "trunk-01": "Bark_Tree", "branch-1-01": "Leaves_Tree_A1", "branch-1-02": "Leaves_Tree_A2", "branch-2-01": "Leaves_Tree_B1",
  "branch-2-02": "Leaves_Tree_B2", "branch-01": "Leaves_Tree_C1", "branch-02": "Leaves_Tree_C2" };
// Colour grading per texture (by material name prefix, first match): [brightness, saturation, optional R,G,B multipliers]
// (the kit's bark is a grey photo: warmed towards brown like the other trunks)
const GRADE = { Bark_Tree: [1, 0.9, [1.19, 0.95, 0.79]], Leaves_Tree: [0.8, 0.7], Bark_DeadTree: [0.9, 0.5], Bark: [0.72, 0.6], Leaves_TwistedTree: [0.62, 0.8], Leaves_Pine: [0.62, 0.6], Leaves_NormalTree: [0.6, 0.55], Leaves: [0.62, 0.55], Flowers: [0.6, 0.5], Grass: [0.6, 0.55], Mushrooms: [0.75, 0.6], Rocks: [0.75, 0.6], PathRocks: [0.75, 0.5] };
const gradeOf = (name) => GRADE[Object.keys(GRADE).find((k) => name.startsWith(k))] || [0.7, 0.6];

// Foliage is made of many separate tufts (leaf cards) that a simplifier cannot merge: thin it out instead by
// dropping whole tufts and enlarging the ones that stay.
function thinTufts(prim, target) {
  const idx = prim.getIndices().getArray(), pos = prim.getAttribute("POSITION"), n = pos.getCount();
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]); parent[find(idx[i + 1])] = a; parent[find(idx[i + 2])] = a; }
  const comps = new Map();
  for (let i = 0; i < idx.length; i += 3) { const c = find(idx[i]); if (!comps.has(c)) comps.set(c, []); comps.get(c).push(i); }
  const list = [...comps.values()], total = idx.length / 3;
  if (total <= target * 1.1 || list.length < 4) return list.length;
  const keep = target / total, grow = Math.min(1.45, 1 / Math.sqrt(keep));
  const out = []; let acc = 0;
  const v = [0, 0, 0];
  for (const tris of list) {
    acc += keep; if (acc < 1) continue; acc -= 1;
    const verts = new Set(); for (const t of tris) { out.push(idx[t], idx[t + 1], idx[t + 2]); verts.add(idx[t]).add(idx[t + 1]).add(idx[t + 2]); }
    const c = [0, 0, 0]; for (const i of verts) { pos.getElement(i, v); c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
    c.forEach((_, k) => (c[k] /= verts.size));
    for (const i of verts) { pos.getElement(i, v); pos.setElement(i, [c[0] + (v[0] - c[0]) * grow, c[1] + (v[1] - c[1]) * grow, c[2] + (v[2] - c[2]) * grow]); }
  }
  prim.getIndices().setArray(new (idx.constructor)(out));
  compactPrimitive(prim);
  return list.length;
}

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const main = new Document();
main.createBuffer();
const scene = main.createScene("natura");
const report = [];
for (const [id, [src, targets]] of Object.entries(MODELS)) {
  const [file, only] = src.split("#");
  const doc = await io.read(`${SRC}${file}.glb`);
  if (only) {                                      // one object of a multi-model file, moved to the origin
    for (const n of doc.getRoot().listScenes()[0].listChildren()) if (n.getName() === only) n.setTranslation([0, 0, 0]); else n.dispose();
    await doc.transform(prune());
    if (!doc.getRoot().listMeshes().length) throw new Error(`${src}: object not found`);
  }
  for (const m of doc.getRoot().listMaterials()) if (RENAME[m.getName()]) m.setName(RENAME[m.getName()]);
  await doc.transform(weld());
  let before = 0, after = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null).setRoughnessFactor(1).setMetallicFactor(0);
    const tris = prim.getIndices().getCount() / 3; before += tris;
    const key = Object.keys(targets).find((k) => k !== "*" && mat.getName().startsWith(k));
    const target = targets[key] ?? targets["*"];
    if (target && tris > target * 1.1) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.05, lockBorder: false });
      if (prim.getIndices().getCount() / 3 > target * 1.25 && !mat.getName().startsWith("Bark")) thinTufts(prim, target);
    }
    after += prim.getIndices().getCount() / 3;
  }
  // one node per model, named with the id, transforms baked into the vertices
  await doc.transform(flatten(), prune());
  doc.getRoot().listScenes()[0].listChildren().forEach((n, i) => n.setName(i ? `${id}_${i}` : id));
  mergeDocuments(main, doc);
  report.push(`${id.padEnd(18)} ${String(before).padStart(6)} -> ${String(Math.round(after)).padStart(5)} tri`);
}
// one scene, one buffer
const root = main.getRoot();
for (const s of root.listScenes()) if (s !== scene) { s.listChildren().forEach((n) => scene.addChild(n)); s.dispose(); }
await main.transform(unpartition(), dedup());

// The leaf textures of the Shapespark trees (their UVs stay inside 0..1) go into one atlas of 512 px cells: one
// material for every crown, so a chunk draws its trees with 2 calls (bark + leaves) instead of up to 7.
// The bark cannot join: its texture repeats along the trunk.
const ATLAS = "Leaves_Tree";
const leafMats = root.listMaterials().filter((m) => m.getName().startsWith(ATLAS + "_")).sort((a, b) => a.getName().localeCompare(b.getName()));
if (leafMats.length) {
  const CELL = 512, PAD = 8, cols = 3, rows = Math.ceil(leafMats.length / cols), W = cols * CELL, H = rows * CELL;
  const tiles = await Promise.all(leafMats.map((m) => sharp(m.getBaseColorTexture().getImage()).resize(CELL - 2 * PAD, CELL - 2 * PAD).png().toBuffer()));
  const atlas = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * CELL + PAD, top: Math.floor(i / cols) * CELL + PAD }))).png().toBuffer();
  const mat = leafMats[0].clone().setName(ATLAS).setBaseColorTexture(main.createTexture(ATLAS).setImage(atlas).setMimeType("image/png"));
  const e = [0, 0];
  leafMats.forEach((m, i) => {
    const su = (CELL - 2 * PAD) / W, sv = (CELL - 2 * PAD) / H, ou = ((i % cols) * CELL + PAD) / W, ov = (Math.floor(i / cols) * CELL + PAD) / H;
    for (const prim of m.listParents().filter((p) => p.propertyType === "Primitive")) {
      const uv = prim.getAttribute("TEXCOORD_0").clone();              // own copy: dedup may share one between trees
      for (let k = 0; k < uv.getCount(); k++) { uv.getElement(k, e); uv.setElement(k, [ou + e[0] * su, ov + e[1] * sv]); }
      prim.setAttribute("TEXCOORD_0", uv).setMaterial(mat);
    }
    m.dispose();
  });
  await main.transform(prune(), dedup());
}

// colour grade + resize every (now unique) texture (the atlas keeps its 512 px cells), store as WebP
main.createExtension(EXTTextureWebP).setRequired(true);
for (const tex of root.listTextures()) {
  const matName = tex.listParents().map((p) => p.getName?.()).find((n) => n && n !== "") || "";
  const [brightness, saturation, rgb] = gradeOf(matName), max = matName === ATLAS ? 1536 : 512;
  let pic = sharp(tex.getImage()).resize(max, max, { fit: "inside" }).modulate({ brightness, saturation });
  if (rgb) { const k = (await sharp(tex.getImage()).metadata()).hasAlpha ? [...rgb, 1] : rgb; pic = sharp(await pic.toBuffer()).linear(k, k.map(() => 0)); }
  const img = await pic.webp({ quality: matName === ATLAS ? 74 : 82, alphaQuality: 90 }).toBuffer();   // (the leaf atlas is big: a little lighter)
  tex.setImage(img).setMimeType("image/webp");
  report.push(`texture ${matName.padEnd(20)} ${(img.length / 1024).toFixed(0)} KB`);
}
await main.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
fs.mkdirSync(new URL("../public/models/", import.meta.url).pathname, { recursive: true });
await io.write(OUT, main);
console.log(report.join("\n"));
console.log(`\n${OUT}: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB`);
