// Converts the FBX pieces of the "Lowpoly Medieval Asset" kit into raw geometry (JSON) for build-kit.mjs.
// The original pack is NOT in the repository: unzip it into assets/sorgenti/Lowpoly_Medieval_Asset first.
// Usage: node tools/convert-kit.mjs            (writes tools/.kit-cache.json)
// It loads every FBX in a headless browser with three.js' FBXLoader and bakes the transforms.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = path.join(ROOT, "../assets/sorgenti/Lowpoly_Medieval_Asset/Asset_Separate_Parts");
const OUT = path.join(ROOT, "tools/.kit-cache.json");
const only = process.argv[2] ? new RegExp(process.argv[2]) : /^(House|Tower|Castle|Closed|Wall_piece|Flags_Banners|Flag_Pole|Tent|Campfire|Wood_|Street_Rock|Weapon_Holder|Trench_Bridge|Ladder)/;
const names = fs.readdirSync(SRC).filter((f) => f.endsWith(".fbx")).map((f) => f.slice(0, -4)).filter((n) => only.test(n)).sort();

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  const file = u.startsWith("/three/") ? path.join(ROOT, "node_modules/three", u.slice(7)) : u.startsWith("/src/") ? path.join(SRC, u.slice(5)) : null;
  if (u === "/") { res.setHeader("content-type", "text/html"); return res.end(`<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>`); }
  if (!file || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
const result = {};
for (const name of names) {
  result[name] = await page.evaluate(async (name) => {
    const THREE = await import("three");
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    const mgr = new THREE.LoadingManager(); mgr.setURLModifier((u) => (/\.(fbx)$/i.test(u) ? u : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="));
    const o = await new FBXLoader(mgr).loadAsync(`/src/${name}.fbx`);
    o.updateMatrixWorld(true);
    const parts = {}; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    o.traverse((m) => {
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const groups = g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
      nm.getNormalMatrix(m.matrixWorld);
      for (const gr of groups) {
        const mt = mats[gr.materialIndex] || mats[0];
        const part = (parts[mt.name] ||= { color: "#" + mt.color.getHexString(), pos: [], nrm: [], uv: [] });
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); part.pos.push(+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3));
          if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); part.nrm.push(+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)); }
          part.uv.push(U ? +U.getX(i).toFixed(4) : 0, U ? +U.getY(i).toFixed(4) : 0);
        }
      }
    });
    return parts;
  }, name);
  process.stdout.write(".");
}
await browser.close(); server.close();
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`\n${names.length} pezzi -> ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
