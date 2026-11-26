// Builds web/public/models/cibo.glb (the foods of the user's models: bread, ham, tomato, potato) from the raw export of
// tools/food-export.py (assets/sorgenti/cibo/cibo_raw.glb: not in the repository): welded, merged by material,
// compressed (meshopt); the potato's texture as it is (256 px JPEG). Usage: node tools/build-food.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import fs from "node:fs";

const SRC = new URL("../../assets/sorgenti/cibo/cibo_raw.glb", import.meta.url).pathname;
const OUT = new URL("../public/models/cibo.glb", import.meta.url).pathname;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
for (const n of doc.getRoot().listScenes()[0].listChildren()) {
  let tris = 0; for (const p of n.getMesh()?.listPrimitives() || []) tris += p.getIndices().getCount() / 3;
  console.log(n.getName(), Math.round(tris), "triangoli");
}
await doc.transform(prune(), weld(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
doc.createExtension(EXTMeshoptCompression).setRequired(true);
await io.write(OUT, doc);
console.log(`cibo -> ${OUT} (${(fs.statSync(OUT).size / 1e3).toFixed(1)} KB)`);
