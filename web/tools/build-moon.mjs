// Builds web/public/models/luna.glb (the moon of the night sky, sky.js) from the raw export of tools/moon-export.py
// (assets/sorgenti/luna/luna_raw.glb, from the user's 3ds Max scene: not in the repository): welded, compressed.
// Usage: node tools/build-moon.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import fs from "node:fs";

const SRC = new URL("../../assets/sorgenti/luna/luna_raw.glb", import.meta.url).pathname;
const OUT = new URL("../public/models/luna.glb", import.meta.url).pathname;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
await doc.transform(prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
doc.createExtension(EXTMeshoptCompression).setRequired(true);
await io.write(OUT, doc);
console.log(`luna -> ${OUT} (${(fs.statSync(OUT).size / 1e3).toFixed(1)} KB)`);
