// Builds web/public/models/castello.glb (the castle of Valdoro, inside) from the raw export of the interior pack
// (assets/sorgenti/interno_castello/castello_raw.glb, made by tools/castle-export.py with Blender's Python from the
// pack's FBX: third-party originals, not in the repository). Keeps only the pieces castle_layout.js uses, welds and
// compresses them (meshopt); the palette texture (33 x 33 px) goes in as it is.
// Usage: node tools/build-castle.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, getBounds, prune, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import fs from "node:fs";
import { PIECES } from "../src/game3d/castle_layout.js";

const SRC = new URL("../../assets/sorgenti/interno_castello/castello_raw.glb", import.meta.url).pathname;
const OUT = new URL("../public/models/castello.glb", import.meta.url).pathname;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
const used = new Set(PIECES.map((p) => p.id));
const scene = doc.getRoot().listScenes()[0];
let kept = 0, tris = 0;
for (const node of scene.listChildren()) {
  if (!used.has(node.getName())) { node.dispose(); continue; }
  kept++;
  for (const p of node.getMesh()?.listPrimitives() || []) tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
}
// a few small props of the pack lie far from their own origin (the books, the inkwell, the skull, the bucket...: 2.6–5 m
// away, one book 2.3 m up): moved onto it, centred and standing at y 0, as the layout places them (the tiles and walls keep
// theirs: it is on purpose, the grid)
const moved = [];
for (const node of scene.listChildren()) {
  const b = getBounds(node), cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  if (Math.hypot(cx, cz) < Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])) continue;
  const t = node.getTranslation();
  node.setTranslation([t[0] - cx, t[1] - (Math.abs(b.min[1]) > 0.5 ? b.min[1] : 0), t[2] - cz]);
  moved.push(node.getName());
}
if (moved.length) console.log("ricentrati:", moved.join(", "));
const missing = [...used].filter((id) => !scene.listChildren().some((n) => n.getName() === id));
if (missing.length) console.warn("mancano nel pacchetto:", missing.join(", "));
await doc.transform(prune(), weld(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
doc.createExtension(EXTMeshoptCompression).setRequired(true);
await io.write(OUT, doc);
console.log(`${kept} pezzi (${Math.round(tris)} triangoli, una volta ciascuno) -> ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
