// Converts the base bodies (male + female, low poly, A-pose) from FBX into raw geometry for build-bodies.mjs.
// Source: assets/models/personaggi/corpo_base/BaseBody.fbx (BaseBody.blend: the same, for Blender) (two meshes: "Body002" = man, "Cube001" = woman).
// Usage: node tools/convert-bodies.mjs           (writes tools/.bodies-cache.json)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = path.join(ROOT, "../assets/models/personaggi/corpo_base/BaseBody.fbx");
const OUT = path.join(ROOT, "tools/.bodies-cache.json");
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const file = u.startsWith("/three/") ? path.join(ROOT, "node_modules/three", u.slice(7)) : u === "/body.fbx" ? SRC : null;
  if (u === "/") { res.setHeader("content-type", "text/html"); return res.end(`<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>`); }
  if (!file || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const result = await page.evaluate(async () => {
  const THREE = await import("three");
  const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
  const o = await new FBXLoader().loadAsync("/body.fbx");
  o.updateMatrixWorld(true);
  const out = {}; const v = new THREE.Vector3();
  o.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, P = g.attributes.position, pos = [];
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(+(v.x / 100).toFixed(4), +(v.y / 100).toFixed(4), +(v.z / 100).toFixed(4)); }  // cm -> m
    out[m.name] = pos;
  });
  return out;
});
await browser.close(); server.close();
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(Object.entries(result).map(([k, p]) => `${k}: ${p.length / 9} triangoli`).join(", "), "->", OUT);
