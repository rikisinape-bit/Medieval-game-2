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
const CASTS = /^(Bark|Snow|Leaves_Tree|Leaves_Pine|Leaves_NormalTree|Leaves_TwistedTree|Rocks)/;
// Leaf cards of the Shapespark trees and of the user's pine: shaded as one rounded crown (crownNormals, crownShading;
// material.userData.crown).
const CROWN = /^Leaves_(Tree|Pine4m)/;

// Size of each model in the game (the originals are much bigger) and whether it casts shadows.
export const NATURE = {
  // trees of the Shapespark kit: species a, b, c; sizes 1-4 (1 = biggest). Already at real scale (4.6-7.9 m).
  ...Object.fromEntries(["a", "b", "c"].flatMap((sp) => [1, 2, 3, 4].map((v) => [`albero_${sp}${v}`, { s: 1, shadow: true }]))),
  // the user's trees of 27/11, big (looking up in their woods little sky is left): a pine of 12.4 m, a tree under snow
  // of 9.6 m (12.5 m wide), a bare one with snow on its branches of 9.7 m
  pino_4m: { s: 2.8, shadow: true }, albero_neve: { s: 6.6, shadow: true }, albero_spoglio_neve: { s: 5, shadow: true },
  pino_neve: { s: 2.8, shadow: true },   // (the same pine with a little snow on its needles: loadNature)
  contorto_1: { s: 0.62, shadow: true }, contorto_2: { s: 0.56, shadow: true }, morto: { s: 0.5, shadow: true },
  cespuglio: { s: 0.8 }, cespuglio_fiorito: { s: 0.75 }, felce: { s: 0.13 }, pianta_grande: { s: 0.8 }, pianta: { s: 0.8 },
  trifoglio: { s: 0.45 }, fiori: { s: 0.4 }, petali: { s: 0.7 }, erba: { s: 0.6 }, erba_alta: { s: 0.42 }, fungo: { s: 0.55 },
  roccia: { s: 0.5, shadow: true }, sasso_tondo: { s: 1 }, sasso_quadro: { s: 1 }, selciato: { s: 1 },
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`sasso_${i + 1}`, { s: 1, shadow: true }])),   // the user's rocks (real size)
};

let lib = null, natureOk = false, kitOk = false, propsOk = false;
export const hasNature = () => natureOk;
export const hasKit = () => kitOk;
export const hasProps = () => propsOk;

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
      if (CROWN.test(m.name)) crownShading(lm);
      // the snow on the user's trees of 27/11 as bright as the ground's (terrain.js); the crown under snow a soft
      // volume like the leafy ones (snowCrown), which receives no shadows: its clumps would darken each other
      if (m.name === "Snow_Tree") { lm.color.multiplyScalar(1.45); lm.userData.noShadow = true; }
      if (m.name === "Snow_BareTree") lm.color.multiplyScalar(1.15);
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
    crownNormals(parts.filter((p) => p.material.userData.crown));
    parts.filter((p) => p.material.name === "Snow_Tree").forEach((p) => snowCrown(p.geometry));
    if (parts.length) out[node.name] = parts;
  });
  return out;
}

// Tree crowns made of leaf cards (Shapespark trees). Lit by the card's own normal, every card facing away from the sun
// turns into a dark smear: the normals point out of the crown instead (gradient of the crown's ellipsoid, a little
// upwards), so the crown is shaded like one soft volume, bright on the sunny side and darker underneath.
function crownNormals(leaves) {
  if (!leaves.length) return;
  const box = new THREE.Box3();
  leaves.forEach(({ geometry }) => { geometry.computeBoundingBox(); box.union(geometry.boundingBox); });
  const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(0.3, 0.3, 0.3));
  const n = new THREE.Vector3();
  leaves.forEach(({ geometry }) => {
    const P = geometry.attributes.position, N = geometry.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      n.set((P.getX(i) - c.x) / (h.x * h.x), (P.getY(i) - c.y) / (h.y * h.y), (P.getZ(i) - c.z) / (h.z * h.z)).normalize();
      n.y += 0.35; n.normalize();
      N.setXYZ(i, n.x, n.y, n.z);
    }
    N.needsUpdate = true;
  });
}
// The user's tree under snow (Snow_Tree): its crown, many small clumps of snow, was reduced to a few thousand
// triangles, whose own normals make it a crumpled heap of light and dark shards. Above its trunk the normals turn,
// gradually, to the crown's rounded volume (as above): a soft snowy crown, its clumps still in its outline.
function snowCrown(geometry) {
  const P = geometry.attributes.position, N = geometry.attributes.normal;
  const box = new THREE.Box3(), v = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  geometry.computeBoundingBox();
  const H = geometry.boundingBox.max.y;
  for (let i = 0; i < P.count; i++) if (P.getY(i) > H * 0.35) box.expandByPoint(v.fromBufferAttribute(P, i));
  const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const t = Math.min(1, Math.max(0, (v.y / H - 0.25) / 0.17)), w = t * t * (3 - 2 * t) * 0.9;
    if (!w) continue;
    e.set((v.x - c.x) / (h.x * h.x), (v.y - c.y) / (h.y * h.y), (v.z - c.z) / (h.z * h.z)).normalize(); e.y += 0.35; e.normalize();
    n.fromBufferAttribute(N, i).lerp(e, w).normalize();
    N.setXYZ(i, n.x, n.y, n.z);
  }
  N.needsUpdate = true;
}
// Shader changes for those crowns: the back of a card keeps the crown normal (no flip), and the alpha cut-out is
// relaxed with distance (mip level), otherwise the far leaves thin out and the crowns look bald. Crowns cast shadows
// but do not receive them (addNature, vegetation.js): inside a crown every card shades the next and the tree turns black.
export function crownShading(mat) {
  mat.userData.crown = true; mat.userData.noShadow = true;
  mat.customProgramCacheKey = () => "crown";
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""))
      .replace("#include <alphatest_fragment>", `{ vec2 t = vMapUv * vec2(textureSize(map, 0)), dx = dFdx(t), dy = dFdy(t);
          diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy)))) * 0.28; }
        #include <alphatest_fragment>`);
  };
}

// A little snow on a material (the user, 27/11: "ai pini una colorazione un po' più bianca, come se ci fosse un po' di
// neve"): over the whole crown, more on its top and sides than underneath (its normals: trees only turn round, so up
// is up), on the lighter needles (the dark ones stay dark: white specks, not a grey veil), in patches (a random number
// from each corner's place). amount: how much (0..1). Kept in userData.frost: the far pictures and the fading copies
// of vegetation.js put it on again (a copy of a material loses its shader changes).
export function frostShading(mat, amount) {
  mat.userData.frost = amount;
  const prev = Object.hasOwn(mat, "onBeforeCompile") ? mat.onBeforeCompile : null, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vFrostUp, vFrostR;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
	vFrostUp = normalize( normal ).y; vFrostR = fract( sin( dot( position.xz * 7.1 + position.y * 3.3, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFrostUp, vFrostR;")
      .replace("#include <map_fragment>", `#include <map_fragment>
	{ float fl = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	  float fk = ${amount.toFixed(3)} * mix( 0.4, 1.0, smoothstep( -0.3, 0.8, vFrostUp ) ) * smoothstep( 0.01, 0.07, fl ) * ( 0.5 + vFrostR );
	  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.8, 0.84, 0.9 ), min( fk, 0.9 ) ); }`);
  };
  mat.customProgramCacheKey = () => `${key.call(mat)}-frost${amount}`;
  return mat;
}

// Loads the vegetation and the medieval building kit. Either can fail on its own (the game has fallbacks).
export async function loadNature() {
  lib = null; kitOk = false;
  try { lib = await loadLib("natura"); } catch (e) { console.warn("Natura non caricata: restano gli alberi procedurali", e); }
  // the pine of the snow: the user's pine, its needles and branches with a little snow (the same geometry, no download)
  if (lib?.pino_4m) lib.pino_neve = lib.pino_4m.map((p) => {
    if (!/^Leaves/.test(p.material.name)) return p;
    const m = p.material.clone();
    if (p.material.userData.crown) crownShading(m);
    return { geometry: p.geometry, material: frostShading(m, /Branch/.test(m.name) ? 0.3 : 0.45) };
  });
  try { const kit = await loadLib("kit", { keepNormals: true, castAll: true }); lib = { ...(lib || {}), ...kit }; kitOk = true; } catch (e) { console.warn("Kit medievale non caricato: restano gli edifici procedurali", e); }
  // village props (market stalls, crates, buckets, carts, lamp posts, torches, woodpile, campfire, fence: tools/build-props.mjs)
  propsOk = false;
  try { const props = await loadLib("props", { keepNormals: true, castAll: true }); lib = { ...(lib || {}), ...props }; propsOk = true; } catch (e) { console.warn("Oggetti del villaggio non caricati: restano quelli fatti a codice", e); }
  // the foods of the user's models (cibo_pane, cibo_prosciutto, cibo_pomodoro, cibo_patata: tools/build-food.mjs)
  try { const food = await loadLib("cibo", { keepNormals: true, castAll: true }); lib = { ...(lib || {}), ...food }; } catch (e) { console.warn("Cibi non caricati: restano quelli fatti a codice", e); }
  natureOk = !!lib && !!lib.albero_a1;
  return natureOk;
}

/** How a model of the nature pack is scaled when placed (addNature). */
export const natureScale = (id) => NATURE[id]?.s || 1;
/** The parts ({ geometry, material }) of a model of the loaded GLBs (natura, kit, props, cibo), or null. */
export const libParts = (id) => lib?.[id] || null;

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
    mesh.castShadow = !!material.userData.cast; mesh.receiveShadow = !material.userData.noShadow; mesh.matrixAutoUpdate = false;
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

// Centre and size of the part of a piece drawn with one material (e.g. the glass of the lamp post), or null.
export function kitPartBox(id, material) {
  const parts = (lib?.[id] || []).filter((p) => p.material.name === "Kit_" + material); if (!parts.length) return null;
  const b = new THREE.Box3(); parts.forEach((p) => { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox); });
  return { center: b.getCenter(new THREE.Vector3()), size: b.getSize(new THREE.Vector3()) };
}

// One piece as its own object (for things that move, like the castle gate).
export function kitObject(id) {
  const g = new THREE.Group();
  (lib?.[id] || []).forEach((part) => { const m = new THREE.Mesh(part.geometry, part.material); m.castShadow = true; m.receiveShadow = true; g.add(m); });
  return g;
}
