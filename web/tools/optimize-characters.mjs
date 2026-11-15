// Prepares the character GLBs for the web game: keeps only the animations the game uses,
// removes unused data and compresses geometry/animation with meshopt.
// Usage: node tools/optimize-characters.mjs <folder with the original .glb files>
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, meshopt, resample } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import path from "node:path";
import fs from "node:fs";

const SRC = process.argv[2];
const OUT = new URL("../public/models/personaggi/", import.meta.url).pathname;
const FILES = { adventurer: "Adventurer.glb", farmer: "Farmer.glb", king: "King.glb" };
const KEEP = ["Idle", "Idle_Neutral", "Idle_Sword", "Walk", "Run", "Sword_Slash", "HitRecieve", "Death", "Roll", "Interact", "Wave"];

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
fs.mkdirSync(OUT, { recursive: true });
for (const [id, file] of Object.entries(FILES)) {
  const doc = await io.read(path.join(SRC, file));
  for (const a of doc.getRoot().listAnimations()) {
    const name = a.getName().split("|").pop();
    if (KEEP.includes(name)) a.setName(name); else a.dispose();
  }
  await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = path.join(OUT, `${id}.glb`);
  await io.write(out, doc);
  console.log(`${file} -> ${id}.glb  ${(fs.statSync(path.join(SRC, file)).size / 1e6).toFixed(2)} MB -> ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}
