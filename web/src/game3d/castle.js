// The castle of Valdoro, inside: a "room" apart from the world. It stands far away in the world's coordinates (CASTLE,
// a kilometre east of everything: nothing outside is in sight or within the camera's reach there, so nothing outside
// is drawn), and its models (models/castello.glb, made by tools/build-castle.mjs from the interior pack) are downloaded
// the first time one goes in, behind the "Caricamento..." screen (engine.js: through the castle's gate).
// Layout, floors, obstacles and lights: castle_layout.js. The walking rules are plain data, ready before the models:
// a body is kept inside the walkable areas (the floor of the first one that holds it: flat, a dais, the stairs' ramps),
// and the characters find their way from room to room through the places where two areas overlap (the doors). The
// prison cells' doors turn on their hinges; a cell's doorway is walkable only while its door is open (setDoor).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CASTLE } from "./world";
import { PIECES, AREAS, SOLIDS, LIGHTS, FLAMES, SPAWN, EXIT, CELLS, DOOR_PIECE, JAIL } from "./castle_layout";
import { makeFlame } from "./models";

const [OX, OZ] = CASTLE;
const EXT = import.meta.env.VITE_MODEL_EXT || "glb";
const A = AREAS.map((a) => ({ ...a, x0: a.x0 + OX, x1: a.x1 + OX, z0: a.z0 + OZ, z1: a.z1 + OZ, ramp: a.ramp && [a.ramp[0], a.ramp[1] + (a.ramp[0] === "x" ? OX : OZ), a.ramp[2] + (a.ramp[0] === "x" ? OX : OZ), a.ramp[3], a.ramp[4]] }));
const floorOf = (a, x, z) => {
  if (!a.ramp) return a.y;
  const [axis, v0, v1, y0, y1] = a.ramp, t = Math.min(1, Math.max(0, ((axis === "x" ? x : z) - v0) / (v1 - v0)));
  return y0 + (y1 - y0) * t;
};
const opened = new Set();                                    // the cells whose door is open
const ok = (a) => !a.door || opened.has(a.door);               // (a cell's doorway: only while open)
const holds = (a, x, z, m = 0) => ok(a) && x > a.x0 - m && x < a.x1 + m && z > a.z0 - m && z < a.z1 + m;
const near = (a, x, z) => [Math.min(a.x1, Math.max(a.x0, x)), Math.min(a.z1, Math.max(a.z0, z))];

// The doors: where two areas overlap (the middle of the overlap); a graph of areas for the characters' way
const LINKS = A.map(() => []);
A.forEach((a, i) => A.forEach((b, j) => {
  if (j <= i) return;
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  if (x0 > x1 || z0 > z1) return;
  const p = [(x0 + x1) / 2, (z0 + z1) / 2];
  LINKS[i].push([j, p]); LINKS[j].push([i, p]);
}));

export const castleSpawn = { x: SPAWN.x + OX, z: SPAWN.z + OZ, yaw: SPAWN.yaw };
export const castleExit = { x: EXIT.x + OX, z: EXIT.z + OZ };
export const castleSolids = SOLIDS.map((s) => ({ x: s.x + OX, z: s.z + OZ, r: s.r }));
export const inCastle = (x, z) => Math.abs(x - OX) < 60 && Math.abs(z - OZ) < 40;
export const castleCells = CELLS.map((c) => ({ id: c.id, x: c.x + OX, z: c.z + OZ }));      // the middle of each doorway
export const castleJail = { x: JAIL.x + OX, z: JAIL.z + OZ, yaw: JAIL.yaw, cell: JAIL.cell };

// Light anchors for the engine's pool of lights (they exist before the models: the engine gathers them at the start)
export function castleAnchors(scene) {
  LIGHTS.forEach((l) => { const o = new THREE.Object3D(); o.position.set(l.x + OX, l.y, l.z + OZ); o.userData.anchor = { color: l.color, intensity: l.intensity, distance: l.distance }; scene.add(o); });
}

export const castle = {
  inZone: inCastle,
  inside: (x, z, m = 0) => A.some((a) => holds(a, x, z, m)),
  floorY(x, z) {
    for (const a of A) if (holds(a, x, z, 0.05)) return floorOf(a, x, z);
    let best = A[0], bd = Infinity;
    for (const a of A) { if (!ok(a)) continue; const [px, pz] = near(a, x, z), d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = a; } }
    return floorOf(best, ...near(best, x, z));
  },
  roofY(x, z) {
    for (const a of A) if (holds(a, x, z, 0.3)) return a.ceil - 0.3;
    return this.floorY(x, z) + 2;
  },
  constrain(x, z) {
    if (A.some((a) => holds(a, x, z))) return [x, z];
    let bx = x, bz = z, bd = Infinity;
    for (const a of A) { if (!ok(a)) continue; const [px, pz] = near(a, x, z), d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; bx = px; bz = pz; } }
    return [bx, bz];
  },
  // a move from where one is, in steps of at most 0.2 m: a long step (a slow frame, a dodge) must not jump over a shut
  // cell door (the doorway between the corridor and a cell is 0.8 m)
  move(x0, z0, x1, z1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2));
    let x = x0, z = z0;
    for (let i = 0; i < n; i++) [x, z] = this.constrain(x + (x1 - x0) / n, z + (z1 - z0) / n);
    return [x, z];
  },
  // the next door on the way from (x, z) to (tx, tz), or null (same room, or one of them is not in the castle);
  // keys: through the prison cells' shut doors too (a guard who opens them: engine.js)
  route(x, z, tx, tz, keys = false) {
    if (!inCastle(x, z) || !inCastle(tx, tz)) return null;
    const pass = (a) => keys || ok(a);
    const here = (px, pz) => A.map((a, i) => (pass(a) && px > a.x0 - 0.05 && px < a.x1 + 0.05 && pz > a.z0 - 0.05 && pz < a.z1 + 0.05 ? i : -1)).filter((i) => i >= 0);
    const from = here(x, z), to = new Set(here(tx, tz));
    if (!from.length || !to.size || from.some((i) => to.has(i))) return null;
    const prev = new Map(from.map((i) => [i, null])), queue = [...from];
    while (queue.length) {
      const i = queue.shift();
      if (to.has(i)) {
        const way = [];
        for (let k = i; prev.get(k); k = prev.get(k).from) way.unshift(prev.get(k).at);
        for (const p of way) if (Math.hypot(p[0] - x, p[1] - z) > 0.5) return p;
        return null;
      }
      for (const [j, p] of LINKS[i]) if (!prev.has(j) && pass(A[j])) { prev.set(j, { from: i, at: p }); queue.push(j); }
    }
    return null;
  },
  // the prison cells' doors
  setDoor(id, open) { if (open) opened.add(id); else opened.delete(id); },
  doorOpen: (id) => opened.has(id),
  updateDoors(dt) {                                            // (turning towards open or shut)
    for (const c of CELLS) { const g = doors[c.id]; if (g) g.rotation.y += ((opened.has(c.id) ? 0 : Math.PI / 2) - g.rotation.y) * Math.min(1, dt * 4); }
  },
};
const doors = {};

// ---- The models (downloaded once, the first time one goes in) ----
let built = null;
async function loadPieces() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  if (EXT === "js") {
    const { default: b64 } = await import(/* @vite-ignore */ new URL("models/castello.js", document.baseURI).href);
    gltf = await loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
  } else gltf = await loader.loadAsync("models/castello.glb");
  // the pack's palette: 3x3-pixel swatches, read exactly (no blending, no mipmaps); the flames glow
  const mats = new Map();
  const material = (m) => {
    if (!mats.has(m)) {
      const map = m.map; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true; }
      const glow = /Glow/.test(m.name), crystal = /Crystal/.test(m.name);
      mats.set(m, new THREE.MeshLambertMaterial({ map, name: m.name, ...(glow ? { emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 1.3 } : crystal ? { color: "#9cc4ff", emissive: "#3a6ab8", emissiveIntensity: 0.7 } : {}) }));
    }
    return mats.get(m);
  };
  const lib = {};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.children.forEach((node) => {
    const parts = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
      // quantised attributes (meshopt) into plain floats
      for (const k of ["position", "normal", "uv"]) { const a = g.attributes[k]; if (a && (a.normalized || !(a.array instanceof Float32Array))) { const f = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c); g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize)); } }
      g.applyMatrix4(o.matrixWorld);
      parts.push({ geometry: g, material: material(o.material) });
    });
    lib[node.name] = parts;
  });
  return lib;
}

// only the vault of a floor tile (for the tall stairwells)
function ceilingOnly(g) {
  const p = g.attributes.position, idx = g.index ? g.index.array : null, keep = [];
  const n = idx ? idx.length : p.count;
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    if (Math.min(p.getY(a), p.getY(b), p.getY(c)) > 2.5) keep.push(a, b, c);
  }
  const out = g.clone(); out.setIndex(keep); return out;
}

/** Builds the castle (downloading its models the first time). Resolves when it is in the scene. */
export async function buildCastle(scene) {
  if (built) return built;
  built = (async () => {
    const lib = await loadPieces();
    const buckets = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    let tris = 0;
    for (const pc of PIECES) {
      const parts = lib[pc.id];
      if (!parts) { console.warn("castello: manca", pc.id); continue; }
      const k = pc.s ?? 1;
      m.compose(new THREE.Vector3(pc.x + OX, pc.y, pc.z + OZ), q.setFromAxisAngle(Y, (pc.q * Math.PI) / 2), Array.isArray(k) ? s.set(...k) : s.set(k, k, k));
      for (const part of parts) {
        const g = (pc.part === "ceiling" ? ceilingOnly(part.geometry) : part.geometry.clone()).applyMatrix4(m);
        const key = `${pc.room}|${part.material.name}`;
        if (!buckets.has(key)) buckets.set(key, { material: part.material, geos: [] });
        buckets.get(key).geos.push(g.index ? g.toNonIndexed() : g);
      }
    }
    // one mesh per room and material (a few draw calls; rooms out of sight are culled)
    buckets.forEach(({ material, geos }) => {
      const geo = mergeGeometries(geos); geos.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material); mesh.matrixAutoUpdate = false;
      scene.add(mesh); tris += geo.attributes.position.count / 3;
    });
    FLAMES.forEach((f) => { const fl = makeFlame(f.k); fl.position.set(f.x + OX, f.y, f.z + OZ); scene.add(fl); });
    // the cells' barred doors, apart (they turn): about the hinge, shut across the doorway or open into the cell
    for (const c of CELLS) {
      const g = new THREE.Group();
      (lib[DOOR_PIECE] || []).forEach((part) => g.add(new THREE.Mesh(part.geometry, part.material)));
      g.position.set(c.hinge[0] + OX, c.y, c.hinge[1] + OZ); g.rotation.y = opened.has(c.id) ? 0 : Math.PI / 2;
      scene.add(g); doors[c.id] = g;
    }
    console.info(`Castello: ${PIECES.length} pezzi, ${Math.round(tris)} triangoli in ${buckets.size} gruppi`);
    return true;
  })();
  return built;
}
