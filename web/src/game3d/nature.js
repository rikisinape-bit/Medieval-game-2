// Nature models (trees, bushes, grass, rocks...) from one optimised GLB (tools/optimize-nature.mjs).
// The world is split into chunks of CHUNK metres; inside a chunk everything that shares a material is merged into
// one mesh, so a chunk costs a handful of draw calls whatever grows in it, and off-screen chunks are culled.
// If the file cannot be loaded the game keeps its procedural trees.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The published artifact page cannot serve .glb: `npm run build:artifact` ships it as a JS module (base64).
const EXT = import.meta.env.VITE_MODEL_EXT || "glb";
const CHUNK = 20;
// Only these materials cast shadows (trees and rocks); the undergrowth does not.
const CASTS = /^(Bark|Leaves_Pine|Leaves_NormalTree|Leaves_TwistedTree|Rocks)/;

// Size of each model in the game (the originals are much bigger) and whether it casts shadows.
export const NATURE = {
  pino_1: { s: 0.72, shadow: true }, pino_2: { s: 0.68, shadow: true }, pino_3: { s: 0.8, shadow: true },
  albero_1: { s: 0.72, shadow: true }, albero_2: { s: 0.62, shadow: true }, albero_3: { s: 0.72, shadow: true },
  contorto_1: { s: 0.62, shadow: true }, contorto_2: { s: 0.56, shadow: true }, morto: { s: 0.5, shadow: true },
  cespuglio: { s: 0.8 }, cespuglio_fiorito: { s: 0.75 }, felce: { s: 0.13 }, pianta_grande: { s: 0.8 }, pianta: { s: 0.8 },
  trifoglio: { s: 0.45 }, fiori: { s: 0.4 }, petali: { s: 0.7 }, erba: { s: 0.6 }, erba_alta: { s: 0.42 }, fungo: { s: 0.55 },
  roccia: { s: 0.5, shadow: true }, sasso_tondo: { s: 1 }, sasso_quadro: { s: 1 }, selciato: { s: 1 },
};

let lib = null, natureOk = false, kitOk = false;
export const hasNature = () => natureOk;
export const hasKit = () => kitOk;

// Loads one GLB (or its base64 JS module in the published page) and returns { id: [{ geometry, material }] }.
async function loadLib(name, { keepNormals = false, castAll = false } = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  if (EXT === "js") {
    const { default: b64 } = await import(/* @vite-ignore */ new URL(`models/${name}.js`, document.baseURI).href);
    gltf = await loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
  } else gltf = await loader.loadAsync(`models/${name}.glb`);
  const mats = new Map();
  // Cheaper Lambert materials; foliage uses a hard alpha cut-out (no sorting problems, no overdraw blending).
  const convert = (m) => {
    if (!mats.has(m)) {
      const cut = m.transparent || m.alphaTest > 0 || /Leaves|Flowers|Grass/.test(m.name);
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      const lm = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, emissive: m.emissive, alphaTest: cut ? 0.5 : 0, side: cut ? THREE.DoubleSide : THREE.FrontSide, name: (castAll ? "Kit_" : "") + m.name });
      lm.userData.cast = castAll || CASTS.test(m.name);
      mats.set(m, lm);
    }
    return mats.get(m);
  };
  // Attributes are stored quantised (normalised integers): turn them into floats before baking transforms.
  const floatAttr = (src, size) => { const out = new Float32Array(src.count * size); for (let i = 0; i < src.count; i++) { out[i * size] = src.getX(i); out[i * size + 1] = src.getY(i); if (size === 3) out[i * size + 2] = src.getZ(i); } return new THREE.BufferAttribute(out, size); };
  const out = {};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.children.forEach((node) => {
    const parts = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.geometry, geo = new THREE.BufferGeometry();
      geo.setIndex(src.index);
      geo.setAttribute("position", floatAttr(src.attributes.position, 3));
      geo.setAttribute("uv", src.attributes.uv ? floatAttr(src.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      if (keepNormals && src.attributes.normal) geo.setAttribute("normal", floatAttr(src.attributes.normal, 3));
      geo.applyMatrix4(o.matrixWorld);
      if (!geo.attributes.normal) geo.computeVertexNormals(); else geo.normalizeNormals();
      parts.push({ geometry: geo, material: convert(o.material) });
    });
    if (parts.length) out[node.name] = parts;
  });
  return out;
}

// Loads the vegetation and the medieval building kit. Either can fail on its own (the game has fallbacks).
export async function loadNature() {
  lib = null; kitOk = false;
  try { lib = await loadLib("natura"); } catch (e) { console.warn("Natura non caricata: restano gli alberi procedurali", e); }
  try { const kit = await loadLib("kit", { keepNormals: true, castAll: true }); lib = { ...(lib || {}), ...kit }; kitOk = true; } catch (e) { console.warn("Kit medievale non caricato: restano gli edifici procedurali", e); }
  natureOk = !!lib && !!lib.pino_1;
  return natureOk;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
/**
 * Adds nature models to the scene. items: [{ id, x, z, ry, k }] (k = extra scale, default 1).
 * meshes (optional array) receives the created chunk meshes. Returns the number of triangles added.
 */
export function addNature(scene, items, meshes = []) {
  if (!lib) return 0;
  const buckets = new Map(); // "chunkX|chunkZ|materialName" -> { material, geos }
  for (const it of items) {
    const parts = lib[it.id];
    if (!parts) continue;
    const k = (NATURE[it.id]?.s || 1) * (it.k || 1);
    _m.compose(_p.set(it.x, it.y || 0, it.z), _q.setFromEuler(_e.set(0, it.ry || 0, 0)), _s.set(k, k, k));
    for (const part of parts) {
      const key = `${Math.floor(it.x / CHUNK)}|${Math.floor(it.z / CHUNK)}|${part.material.name}`;
      if (!buckets.has(key)) buckets.set(key, { material: part.material, geos: [] });
      buckets.get(key).geos.push(part.geometry.clone().applyMatrix4(_m));
    }
  }
  let tris = 0;
  buckets.forEach(({ material, geos }) => {
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = !!material.userData.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    scene.add(mesh); meshes.push(mesh);
    tris += geo.index.count / 3;
  });
  return Math.round(tris);
}

// A kit material by its original name (e.g. "Wall_Tile_03_Mat"), to dress our own geometry in the kit's style.
export const kitMaterial = (name) => {
  for (const parts of Object.values(lib || {})) for (const p of parts) if (p.material.name === "Kit_" + name) return p.material;
  return null;
};

/**
 * Upper part of a kit house, for houses whose ground floor is ours (enterable): everything above `cut` metres is
 * kept (triangles crossing the cut are clipped), then it is fitted on a w x d footprint (x = width, z = depth) and
 * stretched by sy in height, with its base at y = 0. turn: rotate the piece a quarter turn first (front to the side).
 * The footprint is measured on the walls just above the cut, so porches and awnings lower down do not count.
 * Registered under a new id, usable with addNature like any other piece. Returns the id (null without the kit).
 */
export function kitHouseTop(id, { cut, w, d, sy = 1, turn = false }) {
  const key = `${id}@${cut}${turn ? "t" : ""}:${w}x${d}x${sy}`;
  if (!lib?.[id]) return null;
  if (lib[key]) return key;
  // 1. Clip every triangle against the plane y = cut (keep the part above).
  const clipped = lib[id].map(({ geometry, material }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
    const pos = [], nrm = [], uv = [];
    const vert = (i) => ({ p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], u: [U[i * 2], U[i * 2 + 1]] });
    const lerp = (a, b, t) => ({ p: a.p.map((v, k) => v + (b.p[k] - v) * t), n: a.n.map((v, k) => v + (b.n[k] - v) * t), u: a.u.map((v, k) => v + (b.u[k] - v) * t) });
    const emit = (v) => { pos.push(v.p[0], v.p[1] - cut, v.p[2]); nrm.push(...v.n); uv.push(...v.u); };
    for (let i = 0; i < P.length / 3; i += 3) {
      const tri = [vert(i), vert(i + 1), vert(i + 2)], poly = [];
      if (tri.every((v) => v.p[1] >= cut)) { tri.forEach(emit); continue; }
      if (tri.every((v) => v.p[1] < cut)) continue;
      for (let k = 0; k < 3; k++) {                      // Sutherland-Hodgman against one plane
        const a = tri[k], b = tri[(k + 1) % 3], ia = a.p[1] >= cut, ib = b.p[1] >= cut;
        if (ia) poly.push(a);
        if (ia !== ib) poly.push(lerp(a, b, (cut - a.p[1]) / (b.p[1] - a.p[1])));
      }
      for (let k = 1; k + 1 < poly.length; k++) [poly[0], poly[k], poly[k + 1]].forEach(emit);
    }
    return { material, pos, nrm, uv };
  }).filter((c) => c.pos.length);
  // 2. Footprint of the walls just above the cut.
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  clipped.forEach(({ pos }) => { for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] < 0.35) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); } });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const [fw, fd] = turn ? [z1 - z0, x1 - x0] : [x1 - x0, z1 - z0];
  // 3. Centre, turn, scale (non-uniform: normals use the inverse-transpose of the scale).
  const m = new THREE.Matrix4().makeScale(w / fw, sy, d / fd);
  if (turn) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  m.multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
  lib[key] = clipped.map(({ material, pos, nrm, uv }) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex([...Array(pos.length / 3).keys()]);
    geo.applyMatrix4(m); geo.normalizeNormals();
    return { geometry: geo, material };
  });
  return key;
}

// Size [width x, height y, depth z] of a kit piece (metres, before scaling), or null.
export function kitSize(id) {
  const parts = lib?.[id]; if (!parts) return null;
  const b = new THREE.Box3(); parts.forEach((p) => { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); });
  return b.getSize(new THREE.Vector3()).toArray();
}

// One piece as its own object (for things that move, like the castle gate).
export function kitObject(id) {
  const g = new THREE.Group();
  (lib?.[id] || []).forEach((part) => { const m = new THREE.Mesh(part.geometry, part.material); m.castShadow = true; m.receiveShadow = true; g.add(m); });
  return g;
}
