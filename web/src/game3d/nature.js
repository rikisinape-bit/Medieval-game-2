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

let lib = null;
export const hasNature = () => !!lib;

export async function loadNature() {
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let gltf;
    if (EXT === "js") {
      const { default: b64 } = await import(/* @vite-ignore */ new URL("models/natura.js", document.baseURI).href);
      gltf = await loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
    } else gltf = await loader.loadAsync("models/natura.glb");
    const mats = new Map();
    // Cheaper Lambert materials; foliage uses a hard alpha cut-out (no sorting problems, no overdraw blending).
    const convert = (m) => {
      if (!mats.has(m)) {
        const cut = m.transparent || m.alphaTest > 0 || /Leaves|Flowers|Grass/.test(m.name);
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        mats.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color, alphaTest: cut ? 0.5 : 0, side: cut ? THREE.DoubleSide : THREE.FrontSide, name: m.name }));
      }
      return mats.get(m);
    };
    const out = {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.children.forEach((node) => {
      const parts = [];
      node.traverse((o) => {
        if (!o.isMesh) return;
        // Positions are stored quantised (normalised integers): turn them into floats before baking the transform.
        const geo = o.geometry.clone(), src = geo.attributes.position, pos = new Float32Array(src.count * 3);
        for (let i = 0; i < src.count; i++) { pos[i * 3] = src.getX(i); pos[i * 3 + 1] = src.getY(i); pos[i * 3 + 2] = src.getZ(i); }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const suv = geo.attributes.uv, uv = new Float32Array(suv.count * 2);
        for (let i = 0; i < suv.count; i++) { uv[i * 2] = suv.getX(i); uv[i * 2 + 1] = suv.getY(i); }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        Object.keys(geo.attributes).forEach((k) => { if (!["position", "uv"].includes(k)) geo.deleteAttribute(k); });
        geo.applyMatrix4(o.matrixWorld); geo.computeVertexNormals();
        parts.push({ geometry: geo, material: convert(o.material) });
      });
      if (parts.length) out[node.name] = parts;
    });
    lib = out;
  } catch (e) {
    console.warn("Natura non caricata: restano gli alberi procedurali", e);
    lib = null;
  }
  return !!lib;
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
    mesh.castShadow = CASTS.test(material.name); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    scene.add(mesh); meshes.push(mesh);
    tris += geo.index.count / 3;
  });
  return Math.round(tris);
}
