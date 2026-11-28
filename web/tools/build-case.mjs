// Builds web/public/models/case.glb: the houses of Roccanera (the user's thatched house of 28/11 and its door, made by
// tools/casa-paglia.py into assets/models/architetture/casa_paglia.glb) and the furniture inside them: pieces of the
// castle's interior pack (public/models/castello.glb, made by build-castle.mjs; the same palette texture), copied here
// so the village does not need the castle's file.
// Textures to WebP (the glass keeps its alpha), geometry compressed (meshopt). Usage: node tools/build-case.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from "@gltf-transform/extensions";
import { copyToDocument, dedup, getBounds, meshopt, prune, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import fs from "node:fs";

const SRC = new URL("../../assets/models/architetture/casa_paglia.glb", import.meta.url).pathname;
const CASTLE = new URL("../public/models/castello.glb", import.meta.url).pathname;
const OUT = new URL("../public/models/case.glb", import.meta.url).pathname;
// the furniture of a house (named as in the castle's pack; in case.glb: arredo_<name>)
const FURNITURE = ["Fireplace", "FirewoodStack", "Table_Big", "Table_Small", "Bench", "Stool_round", "Stool_square", "Chair", "Shelf",
  "Barrel_Closed", "Barrel_Open", "Jar_Big", "Bucket", "Bag", "Plate", "Carpet_Red", "Carpet_Green", "Chest_Closed", "Cauldron_Full"];

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
const castle = await io.read(CASTLE);
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
const pieces = castle.getRoot().listNodes().filter((n) => FURNITURE.includes(n.getName()));
const map = copyToDocument(doc, castle, pieces);
// named arredo_<piece> (their own transform kept: the castle's file is quantised, it scales them back)
pieces.forEach((n) => scene.addChild(map.get(n).setName("arredo_" + n.getName())));
const missing = FURNITURE.filter((f) => !pieces.some((n) => n.getName() === f));
if (missing.length) console.warn("non nel castello:", missing.join(", "));

for (const tex of doc.getRoot().listTextures()) {
  if (tex.getMimeType() === "image/webp") continue;
  const alpha = tex.getMimeType() === "image/png" && (await sharp(tex.getImage()).metadata()).hasAlpha;
  tex.setImage(await sharp(tex.getImage()).webp({ quality: alpha ? 88 : 82, alphaQuality: 90 }).toBuffer()).setMimeType("image/webp");
  tex.setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, ".webp"));
}
doc.createExtension(EXTTextureWebP).setRequired(true);
await doc.transform(unpartition(), weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(OUT, doc);

for (const n of scene.listChildren()) {
  const b = getBounds(n), s = b.max.map((v, i) => (v - b.min[i]).toFixed(2));
  let tris = 0; n.traverse((c) => c.getMesh()?.listPrimitives().forEach((p) => { tris += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3; }));
  console.log(n.getName().padEnd(16), "size", s.join(" x "), "min", b.min.map((v) => v.toFixed(2)).join(","), "tris", tris);
}
console.log("case.glb", fs.statSync(OUT).size, "bytes");
