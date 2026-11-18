// Low-poly human bodies for makeHuman (models.js).
// Every moving part (torso, head, each arm, each leg) is ONE merged geometry with vertex colours and they all share
// ONE material, so a character costs ~7 draw calls whatever the amount of detail. Geometries are cached per look+variant.
//
// The body itself is the low-poly base model (man / woman, bodydata.json): clothes are painted on it or added as
// shells that follow its shape; free pieces (skirts, capes, tabards, hats...) are built with Part().
// Pivots, the fist and the body measures come from the model (bodyGeometries returns them); feet on y = 0.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import BODIES from "./bodydata.json";
import PALADIN from "./paladin.json";
import PALADIN_TEX from "./paladin_albedo.jpg";   // inlined in the code (vite.config: the published page only takes data: images)

// The paladin armour has its own material: its painted texture (UVs of the original model) and a metallic, fairly
// glossy surface so the steel catches the light. Vertex colours carry the dirt towards the ground.
let palReady; export const PALADIN_READY = new Promise((res) => { palReady = res; });   // the texture is decoded (one-shot renders wait for it)
const palTex = new THREE.TextureLoader().load(PALADIN_TEX, () => palReady(), undefined, () => palReady());
palTex.colorSpace = THREE.SRGBColorSpace; palTex.anisotropy = 4;
export const PALADIN_MAT = new THREE.MeshStandardMaterial({ map: palTex, vertexColors: true, roughness: 0.38, metalness: 0.45, flatShading: true, side: THREE.DoubleSide });   // both sides: the inside of a plate is never a hole
// Reflections for the steel: a small "studio" around it (bright soft top, light band at the horizon, dark floor),
// made on the CPU so it works with every renderer of the page (game, menu preview, item pictures).
const studio = (() => {
  const W = 64, H = 32, d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 1 - y / (H - 1), lat = (v - 0.5) * Math.PI;                       // -pi/2 bottom .. pi/2 top
    const sky = 0.55 + 0.45 * Math.sin(Math.max(0, lat)), band = Math.exp(-(((lat - 0.12) / 0.12) ** 2)) * 0.5, floor = 0.16 + 0.1 * (1 + Math.sin(lat));
    const softbox = Math.exp(-(((x / W - 0.3) / 0.07) ** 2) - ((lat - 0.7) / 0.25) ** 2) * 0.6;   // one bright window
    const l = lat > 0 ? sky + band + softbox : floor + band * 0.6, i = (y * W + x) * 4;
    d[i] = Math.min(255, l * 225); d[i + 1] = Math.min(255, l * 225); d[i + 2] = Math.min(255, l * 245); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
})();
PALADIN_MAT.envMap = studio; PALADIN_MAT.envMapIntensity = 1.0;
export function setupPaladinEnv() {}                                            // (kept for callers: nothing to do any more)

export const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

// ---- small deterministic RNG (variation is stable for each NPC id) ----
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rng = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

// ---- palettes (dark, desaturated) ----
export const SKINS = ["#c4a184", "#b08a6b", "#9a7556", "#7c5a40", "#d2b296", "#a88466"];
// hair: black, dark brown, brown, chestnut, light brown, dark blond, red, auburn; greys for the old
export const HAIRS = ["#1a1410", "#2e2218", "#45321f", "#5a3f26", "#76583a", "#93784a", "#6e3418", "#4a2214"];
export const GREYS = ["#6f6a62", "#8d877c", "#a8a298", "#5e5850"];
const MALE_HAIR = ["short", "short", "buzz", "bowl", "long", "ponytail", "receding", "curly", "shaggy", "bald"];
const OLD_HAIR = ["receding", "receding", "bald", "long", "short"];
const FEMALE_HAIR = ["bun", "braid", "twinbraids", "long", "ponytail", "crown"];
const BEARDS = ["none", "none", "stubble", "stubble", "full", "boxed", "pointed", "forked", "goatee", "moustache", "chops", "long"];

// ---- geometry helpers: each piece is converted to non-indexed position+normal+color ----
const _c = new THREE.Color();
// Bake a colour into a geometry. y0 = absolute height of the geometry's origin (for the "dirt towards the ground" tint).
function paint(geo, hex, y0, rand, noise = 0.07, dirt = 0.32) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i += 3) {
    const y = y0 + (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const grime = 1 - dirt * (1 - Math.min(1, Math.max(0, y / 1.1))); // darker near the ground (mud, wear)
    const k = grime * (1 - noise / 2 + rand() * noise);            // per-face variation = worn, dirty cloth
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = _c.r * k; col[(i + j) * 3 + 1] = _c.g * k; col[(i + j) * 3 + 2] = _c.b * k; }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
const place = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  geo.applyMatrix4(M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)));

// A part = list of painted pieces, merged at the end.
export function Part(y0, rand, dirt) {
  const list = [];
  const push = (geo, hex, noise) => { list.push(paint(geo, hex, y0, rand, noise, dirt)); return api; };
  const api = {
    // box w,h,d centred at x,y,z
    box: (w, h, d, hex, x, y, z, rx, ry, rz) => push(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), hex),
    // tapered cylinder from y1 (radius r1) to y2 (radius r2); depth ratio dz flattens it (torso, limbs)
    tube: (r1, r2, y1, y2, hex, x = 0, z = 0, seg = 7, dz = 1, rx = 0, rz = 0) => {
      const h = Math.abs(y2 - y1), top = Math.max(y1, y2);
      const g = new THREE.CylinderGeometry(top === y1 ? r1 : r2, top === y1 ? r2 : r1, h, seg);
      return push(place(g, x, (y1 + y2) / 2, z, rx, 0, rz, 1, 1, dz), hex);
    },
    // ellipsoid (low-poly)
    blob: (rx, ry, rz, hex, x, y, z, w = 7, hseg = 5, rotx = 0) => push(place(new THREE.SphereGeometry(1, w, hseg), x, y, z, rotx, 0, 0, rx, ry, rz), hex),
    // partial sphere shell (hair caps, hoods): theta from the top
    cap: (r, hex, x, y, z, thetaLen, sx = 1, sy = 1, sz = 1, rotx = 0, phiStart = 0, phiLen = Math.PI * 2) =>
      push(place(new THREE.SphereGeometry(r, 8, 5, phiStart, phiLen, 0, thetaLen), x, y, z, rotx, 0, 0, sx, sy, sz), hex),
    cone: (r, h, hex, x, y, z, rx = 0, rz = 0, seg = 6, sx = 1, sz = 1) => push(place(new THREE.ConeGeometry(r, h, seg), x, y, z, rx, 0, rz, sx, 1, sz), hex),
    done: () => { if (!list.length) return null; const g = mergeGeometries(list); list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; },
  };
  return api;
}

// ---- variation for one character ----
export function variantOf(look, seed) {
  const r = rng(hashStr(seed || "x"));
  const female = !!look.female;
  const skin = look.skin || SKINS[Math.floor(r() * SKINS.length)];
  const pick = (list) => list[Math.floor(r() * list.length)];
  const hairCol = look.hairColor || (look.old ? pick(GREYS) : pick(HAIRS));
  const hair = look.hair || (female ? pick(FEMALE_HAIR) : look.old ? pick(OLD_HAIR) : pick(MALE_HAIR));
  const beard = female ? "none" : look.beard || pick(BEARDS);
  const height = (female ? 0.95 : 1) * (0.96 + r() * 0.08);
  const bulk = look.bulk || (0.94 + r() * 0.12);
  const shift = (r() - 0.5) * 0.12; // small colour shift so clothes are not identical
  return { female, skin, hairCol, hair, beard, height, bulk, shift, seed: hashStr(seed || "x") };
}
// Slightly shift a colour's lightness (per-NPC clothes variation).
// Mix two colours (k = 0 -> a, 1 -> b).
export const mixHex = (a, b, k) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
export const tone = (hex, k) => { const c = new THREE.Color(hex); const h = {}; c.getHSL(h); c.setHSL(h.h, h.s * 0.92, Math.min(1, Math.max(0, h.l * (1 + k)))); return `#${c.getHexString()}`; };

// ---------------------------------------------------------------------------------------------------------------
// Base bodies (man / woman) from the low-poly model in assets/models/personaggi/corpo_base, prepared by tools/build-bodies.mjs:
// arms lowered along the sides, fists closed, split into the rigid parts the game animates. Each part is in the
// local space of its pivot; RIG gives the pivots, the fist (grip point + axis, in the arm's space) and body measures.
// ---------------------------------------------------------------------------------------------------------------
const BASE = {};
function baseBody(female) {
  const k = female ? "f" : "m";
  if (BASE[k]) return BASE[k];
  const src = BODIES[k], parts = {};
  for (const [name, p] of Object.entries(src.parts)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p.p, 3)); g.setIndex(p.i); g.computeVertexNormals();   // smooth normals: used to inflate clothes
    parts[name] = { pos: g.attributes.position.array, nrm: g.attributes.normal.array, idx: p.i, t: p.t, piv: src.rig.pivots[name] };
  }
  const R = src.rig;
  // A few landmarks measured on the parts themselves.
  // Middle of the arm's vertices around t (0 shoulder .. 1 wrist); the window widens until it finds some (low poly).
  const armAt = (t) => { const P = parts.armR; for (let w = 0.05; w < 1; w += 0.05) { const s = [0, 0, 0]; let n = 0; for (let i = 0; i < P.t.length; i++) if (Math.abs(P.t[i] - t) < w) { s[0] += P.pos[i * 3]; s[1] += P.pos[i * 3 + 1]; s[2] += P.pos[i * 3 + 2]; n++; } if (n >= 3) return s.map((x) => x / n); } return [0, -0.3, 0]; };
  const elbow = armAt(0.5), wrist = armAt(1.0), fore = elbow.map((e, i) => e + (wrist[i] - e) * 0.55);
  const kneeY = R.pivots.shinR[1];
  // the foot: box around the leg's vertices below the ankle (leg space)
  const L = parts.shinR, fy = -kneeY + 0.09, fp = [];
  for (let i = 0; i < L.pos.length / 3; i++) if (L.pos[i * 3 + 1] < fy) fp.push([L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2]]);
  const ext = (k, f) => f(...fp.map((p) => p[k]));
  const foot = { x: (ext(0, Math.min) + ext(0, Math.max)) / 2, y: (ext(1, Math.min) + fy) / 2, z: (ext(2, Math.min) + ext(2, Math.max)) / 2, w: ext(0, Math.max) - ext(0, Math.min), h: fy - ext(1, Math.min), d: ext(2, Math.max) - ext(2, Math.min) };
  return (BASE[k] = { parts, rig: R, elbow, wrist, fore, kneeY, foot, armAt });
}
// Torso measures at height y: half width, back and front (z), interpolated from the 5 cm profile.
const profileAt = (R, y) => {
  const T = R.torso; if (y <= T[0][0]) return T[0]; if (y >= T[T.length - 1][0]) return T[T.length - 1];
  for (let i = 1; i < T.length; i++) if (T[i][0] >= y) { const a = T[i - 1], b = T[i], k = (y - a[0]) / (b[0] - a[0]); return a.map((v, j) => v + (b[j] - v) * k); }
};
// Ray from the front onto the head mesh: z of the face at (x, y) (head space). Used to lay eyes, brows, mouth on it.
function faceZ(B, x, y) {
  const P = B.parts.head, p = P.pos, I = P.idx; let best = -1;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const x0 = p[a], y0 = p[a + 1], x1 = p[b], y1 = p[b + 1], x2 = p[c], y2 = p[c + 1];
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(d) < 1e-9) continue;
    const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d, l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d, l2 = 1 - l0 - l1;
    if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
    best = Math.max(best, l0 * p[a + 2] + l1 * p[b + 2] + l2 * p[c + 2]);
  }
  return best;
}

/**
 * One body part as a painted mesh. colorOf(x, y, z, t) -> hex or null (skip the triangle); x,y,z = triangle centre in
 * the character's space (feet on y = 0), t = position along the arm (0 shoulder, 1 wrist, > 1 hand).
 * d > 0 inflates the triangles along the normals: a shell that follows the body (clothes, armour).
 * bulk widens torso and limbs (x/z). The result is in the part's local space, like the pieces of Part().
 */
function bodyMesh(B, part, colorOf, { d = 0, bulk = 1, rand, dirt = 0.32, noise = 0.07, edge = d > 0.004 }) {
  const P = B.parts[part], pv = P.piv, sx = part === "head" ? 1 : bulk;
  const out = [], col = [], picked = new Map();          // picked: edge "a_b" -> [a, b, r, g, b] of the triangle that owns it
  const vtx = (j, dd = d) => [P.pos[j * 3] * sx + P.nrm[j * 3] * dd, P.pos[j * 3 + 1] + P.nrm[j * 3 + 1] * dd, P.pos[j * 3 + 2] * sx + P.nrm[j * 3 + 2] * dd];
  for (let i = 0; i < P.idx.length; i += 3) {
    const tri = [P.idx[i], P.idx[i + 1], P.idx[i + 2]], v = tri.map((j) => vtx(j));
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3 + pv[0], cy = (v[0][1] + v[1][1] + v[2][1]) / 3 + pv[1], cz = (v[0][2] + v[1][2] + v[2][2]) / 3 + pv[2];
    const t = P.t ? (P.t[tri[0]] + P.t[tri[1]] + P.t[tri[2]]) / 3 : 0;
    const hex = colorOf(cx, cy, cz, t, Math.min(v[0][1], v[1][1], v[2][1]) + pv[1]);   // last: lowest corner (world)
    if (!hex) continue;
    _c.set(hex);
    const grime = 1 - dirt * (1 - Math.min(1, Math.max(0, cy / 1.1))), k = grime * (1 - noise / 2 + rand() * noise);
    v.forEach((p) => { out.push(...p); col.push(_c.r * k, _c.g * k, _c.b * k); });
    if (edge) for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3], key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (picked.has(key)) picked.set(key, null); else picked.set(key, [a, b, _c.r * k * 0.72, _c.g * k * 0.72, _c.b * k * 0.72]);
    }
  }
  // A shell (hair, beard, armour) gets a wall along its open border, down to the body: it reads as something with a
  // thickness, and you cannot see between it and the skin. Both faces, so it shows from any side.
  if (edge) picked.forEach((e) => {
    if (!e) return;
    const [a, b, r, g, bl] = e, A1 = vtx(a), B1 = vtx(b), A0 = vtx(a, -0.002), B0 = vtx(b, -0.002);
    [A1, B1, B0, A1, B0, A0, A1, B0, B1, A1, A0, B0].forEach((p) => { out.push(...p); col.push(r, g, bl); });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const cache = new Map();
/**
 * Builds (or reuses) the geometries of one character.
 * look: LOOKS entry (+ optional female, hair, beard, sleeves, boots ...), v: variantOf(look, seed)
 * Returns { torso, head, armL, armR, legL, legR (thighs), shinL, shinR, pivots, grip, gripAxis, gripL, gripAxisL, shieldAt }:
 * every part in the local space of its pivot (pivots in the character's space, feet on y = 0).
 */
export function bodyGeometries(look, v) {
  const key = JSON.stringify([look, v]);
  if (cache.has(key)) return cache.get(key);
  const r = rng(v.seed + 7);
  const F = v.female, BK = v.bulk, Bd = baseBody(F), R = Bd.rig, PV = R.pivots;
  const hipY = PV.legR[1], shY = PV.armR[1], neck = R.neck, crotch = R.crotch;
  const waistY = hipY + (F ? 0.07 : 0.045);                       // belt line
  // the paladin armour is worn over dark purple padded cloth, with brown leather gloves (as in its painted texture)
  const PAL_SLIM = 0.012;                                   // how much slimmer the legs are under the paladin plates (build-paladin.mjs uses the same)
  const PAL_CLOTH = "#3b2f48", PAL_GLOVE = "#4e3020", PAL_STEEL = "#9496a8";
  const palArmor = look.armor === "paladin" && !v.female && !!PALADIN.m;
  const cloth = palArmor ? tone(PAL_CLOTH, v.shift) : tone(look.body, v.shift), legs = palArmor ? tone(PAL_CLOTH, v.shift * 0.5) : tone(look.legs, v.shift * 0.5);
  const boots = look.boots || "#2b2119", belt = look.belt || "#2a1c12", skin = v.skin;
  const dirt = look.dirt ?? 0.32, metal = look.metal || "#7c7f84", trim = look.trim;
  // "paladin": the paladin knight's plate armour (paladin.json, fitted on the male body; on a woman: the old plate),
  // worn over a mail shirt.
  const paladin = look.armor === "paladin" && !F && !!PALADIN.m, palHelm = look.head === "paladin" && !F && !!PALADIN.m;
  const plate = look.armor === "plate" || (look.armor === "paladin" && !paladin), gamb = look.armor === "gambeson", leather = look.armor === "leather", mail = look.armor === "mail";
  const torsoCol = plate || mail ? metal : cloth;
  const long = F || look.dress || look.coat === "robe";           // long skirt / robe down to the feet
  const prof = (y, off = 0) => { const p = profileAt(R, y); return { w: p[1] * BK + off, z0: p[2] * BK - off, z1: p[3] * BK + off }; };
  // Elliptic band following the torso from y1 to y2 (off = distance from the body), as a Part tube.
  const band = (Pt, y1, y2, off1, off2, hex, seg = 9) => {
    const a = prof(y1, off1), b = prof(y2, off2), dz = (a.z1 - a.z0) / 2 / a.w;
    Pt.tube(a.w, b.w, y1, y2, hex, 0, (a.z0 + a.z1) / 2, seg, dz);
  };
  const opt = { bulk: BK, rand: r, dirt };
  const pieces = { torso: [], head: [], armL: [], armR: [], legL: [], legR: [], shinL: [], shinR: [], padL: [], padR: [] };
  // A piece of the paladin armour (paladin.json): triangles in the part's space with the texture's UVs; the vertex
  // colour is only the dirt towards the ground (drawn with PALADIN_MAT, separately from the body's mesh).
  const palPieces = {};
  // The skirt and the tassets (the torso piece below the hips) bend with the thighs, or the legs come out through
  // them: skin weights on the body (0) and on four helpers at the hips (models.js), the front one of each leg follows
  // it only forwards, the back one only backwards (1 front right, 2 back right, 3 front left, 4 back left).
  const SKIRT_TOP = PV.legR[1], SKIRT_LOW = PV.legR[1] - 0.12;
  const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const skirtWeights = (x, y, z) => {
    const w = Math.sqrt(sstep(SKIRT_TOP, SKIRT_LOW, y)), f = sstep(PV.legR[2] - 0.04, PV.legR[2] + 0.04, z), rt = sstep(-0.03, 0.03, x);
    const ws = [[0, 1 - w], [1, w * f * rt], [2, w * (1 - f) * rt], [3, w * f * (1 - rt)], [4, w * (1 - f) * (1 - rt)]].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = ws.reduce((s, a) => s + a[1], 0);
    return ws.map(([i, v]) => [i, v / sum]);
  };
  const palPiece = (name) => {
    const P = PALADIN.m.parts[name]; if (!P) return;
    const sx = name === "head" ? 1 : BK, y0 = (name === "head" ? PV.head : name.startsWith("pad") ? PV[name === "padR" ? "armR" : "armL"] : PV[name] || [0, 0, 0])[1];
    const out = { [name]: { pos: [], uv: [], col: [] }, skirt: { pos: [], uv: [], col: [], si: [], sw: [] } };
    for (let t = 0; t < P.i.length; t += 3) {
      const k = (1 - (dirt * 0.45) * (1 - Math.min(1, Math.max(0, (y0 + P.p[P.i[t] * 3 + 1]) / 1.1)))) * (0.97 + r() * 0.06);
      const low = name === "torso" && [0, 1, 2].some((j) => P.p[P.i[t + j] * 3 + 1] < SKIRT_TOP), o = out[low ? "skirt" : name];
      for (let j = 0; j < 3; j++) {
        const v = P.i[t + j], x = P.p[v * 3], y = P.p[v * 3 + 1], z = P.p[v * 3 + 2];
        o.pos.push(x * sx, y, z * sx); o.uv.push(P.uv[v * 2], P.uv[v * 2 + 1]); o.col.push(k, k, k);
        if (low) { const ws = skirtWeights(x, y, z); ws.forEach(([i, wv]) => { o.si.push(i); o.sw.push(wv); }); for (let e = ws.length; e < 4; e++) { o.si.push(0); o.sw.push(0); } }
      }
    }
    Object.entries(out).forEach(([n, o]) => {
      if (!o.pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(o.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(o.col, 3));
      if (o.si) { g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(o.si, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(o.sw, 4)); }
      g.computeVertexNormals(); g.computeBoundingSphere();
      palPieces[n] = g;
    });
  };
  const shell = (part, d, colorOf, o = {}) => pieces[part].push(bodyMesh(Bd, part, colorOf, { ...opt, ...o, d }));

  // ---------- TORSO ----------
  const neckR = F ? 0.055 : 0.065, neckZ = PV.head[2] - 0.015, nk = { w: neckR, z0: neckZ - neckR, z1: neckZ + neckR };   // the neck (the profile there already has the shoulders)
  const isNeck = (y, x = 0) => y > neck - 0.05 && Math.abs(x) < neckR + 0.01;
  shell("torso", 0, (x, y, z) => {
    if (palHelm && isNeck(y, x)) return tone(PAL_CLOTH, -0.1);           // padded coif under the great helm
    if (isNeck(y, x)) return (look.collar || look.cowl) && y < neck - 0.02 ? torsoCol : skin;
    if (y > crotch + 0.04 || long) return y < waistY - 0.03 && !long && !look.coat && !(F || look.dress) ? (plate ? tone(metal, -0.1) : cloth) : torsoCol;
    return legs;
  });
  const T = Part(0, r, dirt);
  // Point on the trunk's surface at height y, across x (front, or back): the profile is taken as an ellipse.
  const surf = (y, x, off = 0, back = false) => { const p = prof(y, off), zc = (p.z0 + p.z1) / 2, rz = (p.z1 - p.z0) / 2, k = Math.sqrt(Math.max(0, 1 - (x / p.w) ** 2)); return back ? zc - rz * k : zc + rz * k; };
  const steel = tone(metal, 0.08), dark = tone(metal, -0.35);
  if (plate) {
    // cuirass: breastplate and backplate over a mail shirt, a raised plackart on the belly, a ridge down the middle
    shell("torso", 0.026, (x, y) => (y > waistY - 0.02 && y < shY + 0.02 && !isNeck(y, x) ? (y > shY - 0.05 ? tone(metal, -0.05) : metal) : null));
    shell("torso", 0.033, (x, y, z) => (z > 0 && y > waistY - 0.02 && y < waistY + 0.13 ? steel : null));
    for (let y = waistY + 0.04; y < shY - 0.04; y += 0.05) T.box(0.02, 0.055, 0.014, tone(metal, 0.2), 0, y, surf(y, 0, 0.032));
    [-1, 1].forEach((sd) => [waistY + 0.03, waistY + 0.2, shY - 0.08].forEach((y) => T.box(0.012, 0.012, 0.01, "#2a2620", sd * prof(y).w * 0.62, y, surf(y, sd * prof(y).w * 0.62, 0.03))));   // rivets
    // faulds: three overlapping lames below the waist, each with a dark edge
    for (let i = 0; i < 3; i++) { const y0 = waistY - 0.02 - i * 0.06; band(T, y0, y0 - 0.07, 0.03 + i * 0.012, 0.045 + i * 0.012, i % 2 ? tone(metal, -0.06) : metal, 11); band(T, y0 - 0.068, y0 - 0.075, 0.046 + i * 0.012, 0.047 + i * 0.012, dark, 11); }
    T.tube(neckR + 0.022, neckR + 0.05, neck - 0.01, neck - 0.07, metal, 0, neckZ, 9, 1.1); T.tube(neckR + 0.05, neckR + 0.075, neck - 0.07, neck - 0.11, tone(metal, -0.08), 0, neckZ - 0.01, 9, 1.15);   // gorget
  }
  if (mail) {                                                      // hauberk: mail shell with rows of rings, leather edging at the neck
    shell("torso", 0.012, (x, y) => (y > crotch - 0.02 && !isNeck(y, x) ? metal : null));
    for (let y = waistY - 0.1; y < shY + 0.02; y += 0.045) shell("torso", 0.015, (x, yy) => (Math.abs(yy - y) < 0.009 ? tone(metal, -0.24) : null));
    T.tube(neckR + 0.018, neckR + 0.04, neck - 0.02, neck - 0.06, "#3a2a1c", 0, neckZ, 9, 1.1);
  }
  if (gamb) {                                                      // padded jacket: thick, quilted in squares, standing collar
    shell("torso", 0.024, (x, y) => (y > crotch - 0.02 && !isNeck(y, x) ? cloth : null));
    const q = tone(cloth, -0.25);
    for (let y = waistY + 0.04; y < shY - 0.02; y += 0.085) band(T, y + 0.006, y - 0.006, 0.026, 0.026, q, 12);
    for (let y = waistY + 0.02; y < shY - 0.06; y += 0.06) [-0.09, -0.03, 0.03, 0.09].forEach((x) => { if (Math.abs(x) < prof(y).w * 0.85 && !(look.tabard && Math.abs(x) < 0.14)) { T.box(0.008, 0.06, 0.008, q, x, y + 0.03, surf(y + 0.03, x, 0.026)); T.box(0.008, 0.06, 0.008, q, x, y + 0.03, surf(y + 0.03, x, 0.026, true)); } });
    T.tube(neckR + 0.02, neckR + 0.045, neck + 0.02, neck - 0.07, tone(cloth, -0.08), 0, neckZ, 9, 1.1);
  }
  if (leather) {                                                   // leather jerkin: studs, lacing, stitched hem
    const lc = look.vest || "#3e2c1e";
    shell("torso", 0.017, (x, y) => (y > waistY - 0.08 && y < shY - 0.005 && !isNeck(y, x) ? (y < waistY - 0.02 ? tone(lc, -0.08) : lc) : null));
    for (let y = waistY + 0.05; y < shY - 0.06; y += 0.07) { T.box(0.05, 0.008, 0.01, "#1e140c", 0, y, surf(y, 0, 0.02)); [-1, 1].forEach((sd) => [0.05, 0.1].forEach((x) => { if (x < prof(y).w * 0.8) T.box(0.012, 0.012, 0.008, "#7a7066", sd * x, y + 0.03, surf(y + 0.03, sd * x, 0.02)); })); }
    T.box(0.012, shY - waistY - 0.08, 0.01, "#1e140c", 0, (shY + waistY) / 2 - 0.02, surf((shY + waistY) / 2, 0, 0.018));
    band(T, waistY - 0.07, waistY - 0.09, 0.022, 0.022, tone(lc, -0.3), 10);
  }
  if (look.vest && !leather) shell("torso", 0.014, (x, y, z) => (y > waistY - 0.06 && y < shY - 0.03 && !isNeck(y, x) && !(z > 0 && Math.abs(x) < 0.035) ? look.vest : null));   // open at the front
  if (look.coat) shell("torso", 0.018, (x, y, z) => (y > waistY - 0.05 && !isNeck(y, x) && !(z > 0 && Math.abs(x) < 0.02 && look.coat !== "robe") ? look.coatColor || cloth : null));
  // lower body: long skirt / robe / coat skirts / tunic hem (free pieces: the legs move inside)
  const hemTop = waistY - 0.03;
  if (F || look.dress) band(T, hemTop, 0.06, 0.02, 0.2, cloth, 10);
  else if (look.coat === "robe") band(T, hemTop, 0.07, 0.03, 0.15, look.coatColor || cloth, 10);
  else if (look.coat) band(T, hemTop, 0.42, 0.03, 0.1, look.coatColor || cloth, 10);
  else if (paladin) {}                                              // the paladin armour has its own skirt and tassets
  else if (mail) { band(T, hemTop, crotch - 0.22, 0.02, 0.06, metal, 10); band(T, crotch - 0.21, crotch - 0.23, 0.065, 0.066, tone(metal, -0.3), 10); }
  else band(T, hemTop, crotch - 0.14, 0.012, 0.05, plate ? tone(metal, -0.1) : cloth, 9);
  if ((look.coat || look.dress || F) && trim) { const lo = look.coat === "robe" ? 0.07 : look.coat ? 0.42 : 0.06, off = look.coat === "robe" ? 0.15 : look.coat ? 0.1 : 0.2; band(T, lo + 0.05, lo, off - 0.005, off + 0.004, trim, 10); }
  if (look.tabard) {                                               // surcoat: follows the chest, panels hanging front and back
    const tw = 0.13, off = plate ? 0.04 : gamb ? 0.03 : mail ? 0.022 : 0.01;
    shell("torso", off, (x, y) => (Math.abs(x) < tw && y > waistY - 0.02 && y < shY - 0.04 ? look.tabard : null));
    [false, true].forEach((back) => {
      const zt = surf(waistY, 0, off + 0.02, back), lo = crotch - 0.26, h = waistY - lo;
      T.box(tw * 2 - 0.02, h, 0.016, look.tabard, 0, (waistY + lo) / 2, zt + (back ? -1 : 1) * h * 0.08, back ? 0.16 : -0.16);
      T.box(tw * 2 - 0.02, 0.025, 0.018, tone(look.tabard, -0.3), 0, lo + 0.012, zt + (back ? -1 : 1) * h * 0.16, back ? 0.16 : -0.16);   // hem
    });
    if (look.emblem) T.box(0.09, 0.09, 0.01, look.emblem, 0, (waistY + shY) / 2, surf((waistY + shY) / 2, 0, off + 0.008), 0, 0, Math.PI / 4);
  }
  // belt, buckle, pouch
  band(T, waistY + 0.028, waistY - 0.028, 0.018, 0.02, belt, 10);
  { const c = prof(waistY, 0.03); T.box(0.05, 0.045, 0.02, look.buckle || "#5a4e36", 0, waistY, c.z1 + 0.005);
    if (look.pouch) T.box(0.08, 0.1, 0.05, look.pouch, c.w * 0.8, waistY - 0.07, (c.z1 + c.z0) / 2 + 0.05, 0, 0.6);
    if (look.satchel) T.box(0.16, 0.14, 0.07, look.satchel, -(c.w + 0.04), waistY - 0.08, -0.01); }
  if (look.apron) { const c = prof(waistY, 0.04), lo = F ? 0.42 : 0.45; T.box(F ? 0.3 : 0.34, waistY - lo, 0.02, look.apron, 0, (waistY + lo) / 2, c.z1 + 0.012 + (waistY - lo) * 0.05, -0.05); }
  if (look.apron && look.apronBib) { const c = prof(1.3, 0.03); T.box(0.24, 0.3, 0.02, look.apron, 0, 1.28, c.z1 + 0.004); }
  if (look.straps) {                                               // bandolier, front and back
    const c = prof(1.22, 0.035);
    T.box(0.045, 0.66, 0.02, look.straps, 0, 1.2, c.z1 - 0.005, 0, 0, 0.62);
    T.box(0.045, 0.66, 0.02, look.straps, 0, 1.2, c.z0 + 0.005, 0, 0, -0.62);
  }
  const dzN = (nk.z1 - nk.z0) / 2 / nk.w;
  if (palHelm) { T.tube(neckR + 0.012, neckR + 0.05, neck + 0.06, neck - 0.07, tone(PAL_CLOTH, -0.05), 0, neckZ, 9, 1.08); }   // padded coif under the great helm
  if (look.collar) T.tube(neckR + 0.02, neckR + 0.11, neck - 0.01, neck - 0.13, look.collar, 0, neckZ - 0.005, 9, Math.max(1, dzN));   // fur / cloth collar
  if (look.cowl) T.tube(neckR + 0.03, neckR + 0.07, neck + 0.03, neck - 0.09, look.cowl, 0, neckZ - 0.01, 9, 1.05);   // hood down, around the neck
  if (look.cape) {
    const cl = look.capeLen || 1.08, top = shY + 0.06, c = prof(shY - 0.05, 0.05);
    T.box(PV.armR[0] * BK * 2.1, cl, 0.03, look.cape, 0, top - cl / 2, c.z0 - 0.02 - cl * 0.06, -0.08);
    [-1, 1].forEach((sd) => T.box(0.1, 0.03, 0.16, look.cape, sd * PV.armR[0] * BK * 0.75, shY + 0.075, (c.z0 + c.z1) / 2 - 0.03, 0, 0, sd * -0.35));   // over the shoulders
  }
  pieces.torso.push(T.done());

  // ---------- HEAD (pivot = centre of the head) ----------
  // Hair, hats and helmets are authored around the old reference skull (radii 0.108 x 0.128 x 0.12, chin -0.135) and
  // fitted to this head; eyes, brows and mouth are laid on the face mesh.
  // (the model's head is boxier than the old ellipsoid: what wraps it is made a little roomier)
  const hm = R.head, kx = (hm.halfW / 0.108) * 1.12, kyT = (hm.top / 0.128) * 1.06, kyB = -hm.chin / 0.135, kz = ((hm.front - hm.back) / 2 / 0.12) * 1.08, cz = (hm.front + hm.back) / 2;
  const fit = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * kx, y * (y > 0 ? kyT : kyB), p.getZ(i) * kz + cz); } g.computeVertexNormals(); return g; };
  const hc = v.hairCol, hd = look.head, hs = v.hair;
  const covered = ["hood", "helm", "minerhelm", "hat", "cap", "kerchief", "coif", "nasal", "leatherhood", "paladin"].includes(hd);
  // Regions of the head mesh (head space: hx across, hy up from the head's centre, f = in front of the head's middle).
  // Landmarks found on the face itself: the tip of the nose is the most forward point of the middle of the face,
  // eyes and mouth are placed from it (the two heads have different proportions).
  if (!Bd.marks) {
    let best = -1, nose = 0;
    for (let y = hm.top - 0.06; y > hm.chin - 0.04; y -= 0.002) { const z = faceZ(Bd, 0, y); if (z > best) { best = z; nose = y; } }
    Bd.marks = { nose, eye: nose + 0.04, mouth: nose - 0.038 };
  }
  const ey = Bd.marks.eye, my = Bd.marks.mouth, noseY = Bd.marks.nose + 0.004, back = hm.back - cz;
  const loc = (x, y, z) => [x, y - PV.head[1], z - PV.head[2] - cz];
  const fringe = F ? 0.046 : 0.052;
  // Where each hairstyle grows: forehead hairline, temples (above or over the ears), nape.
  const HAIRLINE = {
    crop: (hx, hy, f) => (f > 0.035 ? hy > ey + fringe + Math.abs(hx) * 0.12 - (Math.abs(hx) > hm.halfW * 0.72 ? 0.03 : 0) : f > -0.015 ? hy > ey - 0.004 : hy > hm.chin + 0.045),
    low: (hx, hy, f) => (f > 0.035 ? hy > ey + fringe - 0.004 + Math.abs(hx) * 0.1 - (Math.abs(hx) > hm.halfW * 0.72 ? 0.035 : 0) : f > -0.015 ? hy > ey - 0.02 : hy > hm.chin + 0.015),
    slick: (hx, hy, f) => (f > 0.03 ? hy > ey + 0.062 : f > -0.015 ? hy > ey + 0.016 : hy > hm.chin + 0.04),
    bowl: (hx, hy, f) => (f > 0.03 ? hy > ey + 0.03 : f > -0.02 ? hy > ey - 0.002 : hy > hm.chin + 0.03),
    receding: (hx, hy, f) => hy < hm.top - 0.03 && (f < -0.012 ? hy > hm.chin + 0.045 : f < 0.04 && Math.abs(hx) > hm.halfW * 0.6 && hy > ey + 0.008),
    bald: (hx, hy, f) => f < 0.005 && hy < hm.top - 0.045 && hy > hm.chin + 0.035,
  };
  const STYLE = {   // hairline, thickness of the hair (inflated head), colour tweak
    short: ["crop", 0.009], buzz: ["crop", 0.003, -0.25], bowl: ["bowl", 0.016], long: ["low", 0.012], ponytail: ["slick", 0.007],
    receding: ["receding", 0.007], curly: ["crop", 0.012], shaggy: ["low", 0.019], bald: ["bald", 0.005],
    bun: ["crop", 0.008], braid: ["crop", 0.008], twinbraids: ["crop", 0.008], crown: ["crop", 0.008],
  };
  const [lineName, thick, darken = 0] = STYLE[hs] || STYLE.short, hairline = HAIRLINE[lineName];
  const isHair = (x, y, z, t, ymin) => hairline(...loc(x, y, z)) && ymin - PV.head[1] > hm.chin + 0.03;   // no slivers hanging from the neck cut
  const beard = v.beard;
  // beard line: from the corners of the mouth it rises across the cheek to the sideburn in front of the ear
  const jaw = (x, y, z, t, ymin) => { const [hx, hy, f] = loc(x, y, z), ax = Math.abs(hx); return f > -0.012 && ax < hm.halfW * 0.95 && (ymin === undefined || ymin - PV.head[1] > hm.chin - 0.01) && (hy < my - 0.009 || (ax > 0.03 && hy < Math.min(ey - 0.022, my + 0.012 + (ax - 0.03) * 1.1))); };
  const lip = (x, y, z) => { const [hx, hy, f] = loc(x, y, z); return f > 0.02 && Math.abs(hx) < 0.034 && hy > my + 0.004 && hy < noseY - 0.004; };
  const chin = (x, y, z) => { const [hx, hy, f] = loc(x, y, z); return f > 0.0 && hy < my - 0.009 && Math.abs(hx) < 0.045; };
  const cheeks = (x, y, z) => { const [hx, hy, f] = loc(x, y, z), ax = Math.abs(hx); return f > -0.012 && ax > 0.04 && hy < Math.min(ey - 0.022, my + 0.012 + (ax - 0.03) * 1.1) && hy > hm.chin + 0.005; };
  // What each beard covers (shells over the face) and how thick: [region, thickness, chin thickness]
  const BEARD = {
    full: [(x, y, z, t, m) => jaw(x, y, z, t, m) || lip(x, y, z), 0.01, 0.014], boxed: [(x, y, z, t, m) => jaw(x, y, z, t, m) || lip(x, y, z), 0.007, 0.009],
    pointed: [(x, y, z, t, m) => jaw(x, y, z, t, m) || lip(x, y, z), 0.008, 0.012], forked: [(x, y, z, t, m) => jaw(x, y, z, t, m) || lip(x, y, z), 0.01, 0.013],
    long: [(x, y, z, t, m) => jaw(x, y, z, t, m) || lip(x, y, z), 0.011, 0.015], goatee: [(x, y, z) => chin(x, y, z) || lip(x, y, z), 0.01, 0.012],
    moustache: [lip, 0.009, 0],
    chops: [(x, y, z, t, m) => { const [hx, hy, f] = loc(x, y, z); return lip(x, y, z) || (Math.abs(hx) > hm.halfW * 0.55 && f > -0.03 && hy < ey - 0.012 && hy > my - 0.02 && m - PV.head[1] > hm.chin); }, 0.011, 0],
  };
  const bd = BEARD[beard];
  // The skin of the head with soft shading: lighter forehead, eye sockets, nose tip and cheeks a little red,
  // shadow under the jaw, stubble.
  const stub = mixHex(skin, hc, 0.38);
  shell("head", 0, (x, y, z) => {
    const [hx, hy, f] = loc(x, y, z);
    if (palHelm && hy < hm.chin + 0.05) return tone(PAL_CLOTH, -0.1);                                              // coif below the great helm
    if (hy < hm.chin + 0.006 && f < 0.0) return tone(skin, -0.06);                                                    // under the jaw
    if (beard === "stubble" && (jaw(x, y, z) || lip(x, y, z))) return tone(stub, -0.1);
    if (f > 0.02 && Math.abs(hx) > 0.012 && Math.abs(hx) < hm.halfW * 0.72 && hy > ey - 0.012 && hy < ey + 0.022) return tone(skin, -0.06);   // eye sockets
    if (f > 0.06 && Math.abs(hx) < 0.014 && hy > noseY - 0.012 && hy < noseY + 0.01) return mixHex(skin, "#b05a48", 0.12);   // nose tip
    if (f > 0.0 && Math.abs(hx) > 0.03 && hy < ey - 0.012 && hy > my) return mixHex(skin, "#b05a48", 0.05);          // cheeks
    if (look.old && f > 0.02 && hy > ey + 0.035 && hy < ey + 0.07) return tone(skin, -0.08);                          // furrowed brow
    if (f > 0.04 && hy > ey + 0.03) return tone(skin, 0.04);                                                          // forehead catches the light
    return skin;
  });
  const hairHex = darken ? mixHex(hc, skin, 0.35) : hc;
  if (!covered || hs === "long") shell("head", thick, (x, y, z, t, ymin) => (isHair(x, y, z, t, ymin) ? hairHex : null), { noise: 0.16 });   // the hair: the head's own shape, thicker
  if (bd) {
    shell("head", bd[1], (x, y, z, t, m) => (bd[0](x, y, z, t, m) ? hc : null), { noise: 0.16 });
    if (bd[2]) shell("head", bd[2], (x, y, z) => (chin(x, y, z) ? tone(hc, 0.06) : null), { noise: 0.16 });
  }
  // Hair and beard volumes, in head space: tails, braids, buns, curls, the end of the beard.
  const Hx = Part(PV.head[1], r, 0.08), fz0 = (x, y) => faceZ(Bd, x, y);
  const braidChain = (pts, w) => pts.forEach(([x, y, z], i) => Hx.blob(w * (1 - i * 0.04), w * 1.5, w * 0.8, tone(hc, i % 2 ? -0.1 : 0.05), x + (i % 2 ? 0.003 : -0.003), y, z, 5, 4, i % 2 ? 0.35 : -0.35));
  if (!covered) {
    if (hs === "long") {                                                                                          // falling to the shoulders
      Hx.tube(hm.halfW * 0.95, hm.halfW * 1.1, ey + 0.02, hm.chin - 0.14, hc, 0, back * 0.55 + cz, 8, 0.62);
      [-1, 1].forEach((sd) => Hx.box(0.02, 0.17, 0.05, tone(hc, -0.05), sd * (hm.halfW + 0.004), ey - 0.07, cz - 0.03, 0, 0, sd * 0.06));
    }
    if (hs === "ponytail") { const zb = back + cz - 0.008; Hx.box(0.03, 0.016, 0.03, "#2a1e14", 0, ey + (F ? 0.04 : 0.0), zb - 0.01); Hx.tube(0.026, 0.012, ey + (F ? 0.035 : -0.005), ey - (F ? 0.2 : 0.17), hc, 0, zb - 0.025, 6, 1, -0.25); }
    if (hs === "bun") { Hx.blob(0.045, 0.04, 0.042, tone(hc, 0.05), 0, ey + 0.055, back + cz - 0.012, 7, 5); Hx.tube(0.03, 0.03, ey + 0.035, ey + 0.045, "#3a2a1c", 0, back + cz - 0.02, 7); }
    if (hs === "braid") braidChain(Array.from({ length: 11 }, (_, i) => [0, ey - 0.02 - i * 0.024, back + cz - 0.012 - i * 0.003]), 0.015);
    if (hs === "twinbraids") [-1, 1].forEach((sd) => braidChain(Array.from({ length: 10 }, (_, i) => [sd * (hm.halfW * 0.86 - i * 0.002), ey - 0.04 - i * 0.022, cz - 0.02 + i * 0.012]), 0.011));
    if (hs === "crown") for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; Hx.blob(0.014, 0.012, 0.016, tone(hc, i % 2 ? -0.1 : 0.05), Math.sin(a) * hm.halfW * 0.98, ey + 0.05, cz + Math.cos(a) * (hm.front - hm.back) * 0.5 * 0.96 - 0.004, 5, 4); }
    if (hs === "curly") for (let i = 0; i < 14; i++) { const a = i * 2.4, t = 0.25 + (i % 5) * 0.14; Hx.blob(0.022, 0.02, 0.022, tone(hc, (i % 3) * 0.05 - 0.04), Math.sin(a) * hm.halfW * t * 1.6, ey + 0.065 + (1 - t) * 0.045, cz + Math.cos(a) * 0.07 - 0.01, 5, 4); }
    if (hs === "shaggy") for (let i = 0; i < 6; i++) Hx.box(0.04, 0.022, 0.03, tone(hc, -0.05), (i - 2.5) * 0.028, ey + 0.058 + (i % 2) * 0.01, fz0((i - 2.5) * 0.028, ey + 0.058) + 0.012, 0.6, 0, (i - 2.5) * 0.18);   // ragged fringe
    if (hs === "bowl") Hx.box(hm.halfW * 1.7, 0.014, 0.02, tone(hc, -0.08), 0, ey + 0.033, fz0(0, ey + 0.033) + 0.014);   // the straight cut of the fringe
  }
  if (bd) {
    const cy = hm.chin + 0.01, czf = fz0(0, cy + 0.01);
    if (beard === "full") Hx.blob(0.04, 0.022, 0.026, tone(hc, 0.02), 0, cy - 0.004, czf - 0.016, 7, 4);
    if (beard === "pointed") Hx.cone(0.035, 0.075, hc, 0, cy - 0.035, czf - 0.008, Math.PI, 0, 6, 1, 0.8);
    if (beard === "forked") [-1, 1].forEach((sd) => Hx.cone(0.022, 0.07, hc, sd * 0.02, cy - 0.032, czf - 0.008, Math.PI, sd * -0.18, 5, 1, 0.8));
    if (beard === "long") { Hx.cone(0.05, 0.17, hc, 0, cy - 0.075, czf - 0.016, Math.PI, 0, 7, 1.05, 0.7); Hx.box(0.03, 0.012, 0.03, "#3a2a1c", 0, cy - 0.11, czf - 0.012); }
    if (beard === "goatee") Hx.cone(0.022, 0.035, hc, 0, cy - 0.012, czf - 0.004, Math.PI, 0, 5, 1, 0.8);
  }
  { const g = Hx.done(); if (g) pieces.head.push(g); }
  const H = Part(PV.head[1], r, Math.min(0.2, dirt));
  const hat = look.hat;
  if (hd === "hood") { H.cap(1, hat, 0, 0.012, -0.018, 2.0, 0.142, 0.158, 0.15, -0.62); H.cone(0.06, 0.18, hat, 0, 0.03, -0.16, -2.25); H.tube(0.13, 0.17, -0.12, -0.24, hat, 0, -0.015, 8, 0.9); }
  if (hd === "cap") { H.cap(1, hat, 0, 0.025, -0.01, 1.25, 0.122, 0.13, 0.132, -0.25); H.tube(0.12, 0.122, 0.06, 0.085, tone(hat, -0.2), 0, -0.01, 8, 1.06); }
  if (hd === "hat") {
    if (look.hatStyle === "chaperon") { H.cap(1, hat, 0, 0.03, -0.01, 1.4, 0.13, 0.14, 0.14, -0.2); H.tube(0.14, 0.14, 0.06, 0.1, tone(hat, -0.15), 0, 0, 9); H.box(0.05, 0.22, 0.05, hat, 0.09, -0.02, -0.12, 0.2, 0, -0.2); }
    else { H.tube(0.22, 0.23, 0.07, 0.085, hat, 0, 0, 10); H.tube(0.1, 0.122, 0.08, 0.21, hat, 0, 0, 8); H.tube(0.123, 0.124, 0.085, 0.11, tone(hat, -0.25), 0, 0, 8); }
  }
  if (hd === "minerhelm") { H.cap(1, hat, 0, 0.02, 0, 1.55, 0.125, 0.14, 0.135); H.tube(0.135, 0.135, 0.0, 0.02, tone(hat, -0.2), 0, 0, 9); H.tube(0.012, 0.012, 0.13, 0.17, "#d8ccb0", 0, 0.1, 5); H.box(0.016, 0.03, 0.016, "#f0c060", 0, 0.185, 0.1); }
  if (hd === "nasal") {                                                          // conical iron helm with nose guard, mail aventail
    H.cone(0.135, 0.16, hat, 0, 0.1, -0.005, 0, 0, 8, 1, 1.05); H.tube(0.136, 0.136, 0.0, 0.035, tone(hat, -0.2), 0, -0.005, 8, 1.06);
    H.box(0.026, 0.1, 0.02, tone(hat, -0.1), 0, -0.035, 0.13); H.tube(0.128, 0.14, -0.02, -0.15, tone(hat, -0.25), 0, -0.03, 8, 1.0);
  }
  if (hd === "leatherhood") {                                                    // leather hood: face opening rim, cheek flaps, seam, shoulder cape
    H.cap(1, hat, 0, 0.015, -0.015, 2.05, 0.138, 0.152, 0.146, -0.55); H.tube(0.13, 0.19, -0.1, -0.25, hat, 0, -0.015, 8, 0.9);
    H.box(0.17, 0.024, 0.024, tone(hat, -0.3), 0, 0.09, 0.13);
    [-1, 1].forEach((sd) => { H.box(0.028, 0.2, 0.09, tone(hat, -0.1), sd * 0.118, -0.02, 0.06); H.box(0.012, 0.2, 0.012, tone(hat, -0.35), sd * 0.105, -0.02, 0.108); });
  }
  if (hd === "kerchief") { H.cap(1, hat, 0, 0.02, -0.015, 1.5, 0.122, 0.14, 0.132, -0.45); H.cone(0.05, 0.1, hat, 0, -0.04, -0.12, -2.6, 0, 4); }
  if (hd === "coif") { H.cap(1, hat, 0, 0.0, -0.01, 1.75, 0.124, 0.145, 0.134, -0.3); H.tube(0.1, 0.11, -0.08, -0.16, hat, 0, -0.02, 8); }
  if (look.feather) H.box(0.015, 0.16, 0.05, look.feather, -0.09, 0.13, -0.05, -0.5, 0, 0.3);
  if (look.mask) { H.tube(0.1, 0.1, -0.03, -0.15, look.mask, 0, 0.014, 8, 1.03); H.cone(0.04, 0.08, look.mask, 0, -0.14, 0.09, Math.PI, 0, 4); }
  if (hd === "helm") {
    if (look.greatHelm) {
      H.tube(0.135, 0.13, -0.15, 0.13, hat, 0, 0, 8); H.cap(0.135, hat, 0, 0.13, 0, 1.57); H.box(0.18, 0.02, 0.02, "#0e0e10", 0, 0.03, 0.13);
      H.box(0.02, 0.26, 0.02, tone(hat, 0.15), 0, 0.02, 0.135); [-1, 1].forEach((sd) => [0, 1, 2].forEach((i) => H.box(0.012, 0.012, 0.01, "#0e0e10", sd * 0.05, -0.05 - i * 0.03, 0.128)));   // ridge + breaths
    }
    else { H.cap(0.13, hat, 0, 0.02, 0, 1.6); H.tube(0.2, 0.2, 0.03, 0.05, hat, 0, 0, 10); }                  // kettle hat
    if (look.plume) H.box(0.03, 0.12, 0.2, look.plume, 0, 0.22, -0.03);
  }
  if (hd === "crown") { H.tube(0.128, 0.122, 0.07, 0.125, "#7a6028", 0, 0, 8); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; H.cone(0.02, 0.055, "#8a6e30", Math.sin(a) * 0.123, 0.15, Math.cos(a) * 0.123, 0, 0, 4); } H.box(0.025, 0.025, 0.012, "#5a1a20", 0, 0.098, 0.126); }
  if (covered && !palHelm && (hs === "long" || hs === "braid" || hs === "ponytail")) H.box(0.18, 0.12, 0.04, hc, 0, -0.12, -0.11);
  { const g = H.done(); if (g) pieces.head.push(fit(g)); }
  // Face details laid on the face (hidden by full helmets and masks): eyes, lids, brows, nostrils, mouth, ears.
  if (palHelm) palPiece("head");                                       // the paladin's great helm
  const faceHidden = (hd === "helm" && look.greatHelm) || look.mask || palHelm;
  if (!faceHidden) {
    const Fc = Part(PV.head[1], r, 0.05), fz = (x, y) => faceZ(Bd, x, y);
    const ex = hm.halfW * 0.4, iris = ["#3a2818", "#2c3a48", "#38402a", "#4a3220"][v.seed % 4];
    const earsHidden = hs === "long" || (F && (hs === "twinbraids"));
    if ((!covered || hd === "cap" || hd === "hat" || hd === "crown" || hd === "kerchief") && !earsHidden) [-1, 1].forEach((s) => {
      Fc.blob(0.008, 0.02, 0.014, mixHex(skin, "#b05a48", 0.1), s * (hm.halfW - 0.001), ey - 0.03, cz - 0.012, 6, 4);   // ear
      Fc.box(0.004, 0.014, 0.008, tone(skin, -0.32), s * (hm.halfW + 0.005), ey - 0.03, cz - 0.01);                   // ear hole
    });
    [-1, 1].forEach((s) => {
      const z = fz(s * ex, ey);
      Fc.box(0.026, 0.013, 0.008, "#c8bea8", s * ex, ey, z + 0.001);                                       // white of the eye
      Fc.box(0.012, 0.013, 0.006, iris, s * (ex - 0.002), ey - 0.001, z + 0.004);                         // iris
      Fc.box(0.005, 0.006, 0.004, "#0c0907", s * (ex - 0.002), ey - 0.001, z + 0.007);                     // pupil
      Fc.box(0.03, 0.006, 0.01, tone(skin, -0.4), s * ex, ey + 0.009, z + 0.004, look.angry ? 0.2 : 0);    // upper lid
      Fc.box(0.024, 0.003, 0.006, tone(skin, -0.18), s * ex, ey - 0.009, z + 0.002);                       // lower lid
      // brow in two pieces: thicker near the nose, thinner and lower at the end
      const brow = F ? tone(hc, 0.12) : tone(hc, 0.02), by = ey + (F ? 0.027 : 0.025), tilt = look.angry ? 0.35 : F ? -0.1 : -0.03;
      Fc.box(0.022, F ? 0.007 : 0.01, 0.012, brow, s * (ex - 0.008), by + (look.angry ? -0.003 : 0), fz(s * (ex - 0.008), by) + 0.004, 0, 0, s * tilt);
      Fc.box(0.022, F ? 0.005 : 0.007, 0.01, brow, s * (ex + 0.013), by - 0.003, fz(s * (ex + 0.013), by - 0.003) + 0.003, 0, 0, s * (tilt - 0.25));
      if (look.old) Fc.box(0.012, 0.003, 0.004, tone(skin, -0.3), s * (ex + 0.022), ey - 0.008, fz(s * (ex + 0.02), ey - 0.008) + 0.002, 0, 0, s * 0.5);   // crow's feet
    });
    if (look.old) [0.05, 0.062].forEach((dy) => Fc.box(0.05, 0.003, 0.004, tone(skin, -0.25), 0, ey + dy, fz(0, ey + dy) + 0.002));    // forehead lines
    [-1, 1].forEach((s) => Fc.box(0.008, 0.005, 0.006, tone(skin, -0.45), s * 0.008, noseY - 0.006, fz(s * 0.008, noseY - 0.006) + 0.001));   // nostrils
    // the lip surface (not the underside of the nose, which can hang in front of it)
    const lipZ = (y) => fz(0, y) + 0.0015;
    const lipOver = bd ? bd[1] : 0, mz = lipZ(my) + (bd && beard !== "moustache" && beard !== "chops" ? bd[1] : 0);
    // Lips: the face is a flat-shaded "V" in the middle, so each lip is made of two halves turned to follow it
    // (no piece sinks into the face or floats in front of it): upper lip, the line of the mouth, a fuller lower lip.
    const lipCol = F ? "#9a4c46" : mixHex(skin, "#8a4038", bd ? 0.55 : 0.3), lipDark = F ? "#4a2220" : "#3a2420";
    const LW = F ? 0.03 : 0.036, zOff = mz - lipZ(my);
    const lipHalf = (y, h, depth, hex, sd, lift = 0) => {
      const x1 = (sd * LW) / 2, zc = Math.max(fz(0, y), fz(sd * 0.004, y)), ze = fz(x1 * 0.92, y);
      const ang = Math.atan2(zc - ze, LW / 2), len = Math.hypot(LW / 2, zc - ze);
      Fc.box(len, h, depth, hex, x1 / 2, y, (zc + ze) / 2 + zOff + depth / 2 - 0.0008 + lift, 0, sd * ang, 0);
    };
    [-1, 1].forEach((sd) => {
      lipHalf(my + 0.004, F ? 0.0055 : 0.0045, 0.004, lipCol, sd);                    // upper lip
      lipHalf(my, 0.0025, 0.004, lipDark, sd, 0.0006);                                // line of the mouth
      lipHalf(my - 0.0046, F ? 0.0068 : 0.0055, 0.0045, tone(lipCol, 0.1), sd);       // lower lip
    });
    Fc.box(0.005, 0.003, 0.003, tone(lipCol, -0.15), 0, my + 0.0075, Math.max(fz(0, my + 0.009), fz(0.003, my + 0.009)) + zOff + 0.0012);   // the bow in the middle of the upper lip
    if (lipOver) [-1, 1].forEach((sd) => {                                                                // moustache: two halves, the ends droop
      const droop = beard === "moustache" || beard === "chops";
      Fc.box(0.034, 0.012, 0.014, hc, sd * 0.017, my + 0.015, lipZ(my + 0.015) + lipOver + 0.002, 0, 0, sd * -0.12);
      if (droop) Fc.box(0.01, 0.03, 0.012, tone(hc, -0.05), sd * 0.034, my - 0.002, lipZ(my) - 0.004 + lipOver, 0, 0, sd * 0.15);
    });
    pieces.head.push(Fc.done());
  }

  // ---------- ARMS (armour that moves with the arm: pauldrons, couters, gauntlets) ----------
  const arm = (side) => {
    const name = side > 0 ? "armR" : "armL";
    const sleeve = look.sleeves === "rolled" ? skin : cloth;
    const hand = paladin ? PAL_GLOVE : plate ? tone(metal, -0.12) : look.gloves || skin;
    // Under the paladin cuirass the arm's skin on the chest, the back and in the armpit stays with the trunk: turning
    // with the arm (attacks, talking) it came out through the plates, in front of the chest.
    const pv = PV[name], onTrunk = (x, y, z, t) => {
      if (!paladin || t > 0.35) return false;
      const rx = Math.abs((x - pv[0]) / BK + pv[0]), rz = (z - pv[2]) / BK;
      return (y < pv[1] - 0.055 && rx < profileAt(R, y)[1] + 0.015) || (t < 0.25 && Math.abs(rz) > 0.075 && rx < Math.abs(pv[0]) + 0.01);
    };
    shell(name, 0, (x, y, z, t) => (onTrunk(x, y, z, t) ? null : t > 1.0 ? hand : t < 0.45 ? torsoCol : plate || mail ? metal : sleeve));
    if (paladin) {                                                   // ...drawn in the trunk's space (same place at rest)
      const g = bodyMesh(Bd, name, (x, y, z, t) => (onTrunk(x, y, z, t) ? torsoCol : null), { ...opt, d: 0 });
      g.translate(pv[0] * BK, pv[1], pv[2]); pieces.torso.push(g);
    }
    const A = Part(PV.armR[1], r, 0.2), at = (t) => { const p = Bd.armAt(t); return [p[0] * side * BK, p[1], p[2] * BK]; };
    const ring = (t1, t2, r1, r2, hex) => { const a1 = at(t1), a2 = at(t2); A.tube(r1, r2, a1[1], a2[1], hex, (a1[0] + a2[0]) / 2, (a1[2] + a2[2]) / 2, 8); };
    if (plate) {
      shell(name, 0.016, (x, y, z, t) => (t > 0.12 && t < 0.47 ? metal : t > 0.56 && t < 0.98 ? steel : null));                    // rerebrace, vambrace
      A.cap(1, metal, side * 0.015, 0.015, -0.005, 1.75, 0.106, 0.088, 0.104);                                       // pauldron: a dome over the shoulder
      [0.1, 0.2].forEach((t, i) => ring(t, t + 0.1, 0.088 - i * 0.008, 0.09 - i * 0.008, i ? tone(metal, -0.06) : steel));          // ...and its lames
      const e = at(0.5); A.blob(0.048, 0.045, 0.048, steel, e[0], e[1], e[2], 6, 4); A.cone(0.045, 0.02, tone(metal, -0.05), e[0] + side * 0.04, e[1], e[2] - 0.01, 0, side * Math.PI / 2, 6);   // couter + wing
      ring(0.95, 1.08, 0.048, 0.062, tone(metal, -0.05));                                                                           // gauntlet cuff
      shell(name, 0.007, (x, y, z, t) => (t > 1.02 ? hand : null));
    } else if (mail) {
      for (let t0 = 0.08; t0 < 0.82; t0 += 0.09) shell(name, 0.011, (x, y, z, t) => (Math.abs(t - t0) < 0.02 ? tone(metal, -0.26) : null));
      A.cap(1, tone(metal, -0.05), side * 0.012, 0.0, 0, 1.6, 0.095, 0.075, 0.095);
    } else if (gamb) {
      shell(name, 0.016, (x, y, z, t) => (t < 0.97 ? (Math.abs(t - 0.25) < 0.03 || Math.abs(t - 0.6) < 0.03 || Math.abs(t - 0.85) < 0.025 ? tone(cloth, -0.24) : cloth) : null));
      A.cap(1, tone(cloth, -0.06), side * 0.012, 0.0, 0, 1.6, 0.098, 0.08, 0.098);
    } else if (leather) {
      const lc = tone(look.vest || "#3e2c1e", -0.1);
      A.cap(1, lc, side * 0.014, 0.01, 0, 1.7, 0.1, 0.078, 0.1); ring(0.12, 0.22, 0.08, 0.082, tone(lc, 0.08));                   // spaulder
    }
    if (paladin) shell(name, 0.007, (x, y, z, t) => (t > 1.02 ? hand : null));          // steel gauntlet over the fist
    if (look.bracers && !plate && !paladin) { shell(name, 0.013, (x, y, z, t) => (t > 0.64 && t < 0.97 ? look.bracers : null)); [0.7, 0.8, 0.9].forEach((t) => shell(name, 0.016, (x, y, z, tt) => (Math.abs(tt - t) < 0.015 ? tone(look.bracers, -0.3) : null))); }
    if (look.sleeves === "rolled") shell(name, 0.01, (x, y, z, t) => (t > 0.42 && t < 0.5 ? cloth : null));
    if (look.coat && look.sleeves !== "rolled") shell(name, look.coat === "robe" ? 0.03 : 0.024, (x, y, z, t) => (t > 0.78 && t < 0.98 ? look.coatColor || cloth : null));   // wide cuff
    if (look.coat) shell(name, 0.016, (x, y, z, t) => (t < 0.8 ? look.coatColor || cloth : null));
    if (look.gloves && !plate) shell(name, 0.005, (x, y, z, t) => (t > 0.97 && t < 1.08 ? tone(look.gloves, 0.1) : null));   // glove cuff
    pieces[name].push(A.done());
  };
  arm(1); arm(-1);

  // ---------- LEGS ----------
  // ---------- LEGS: thigh + shin (the shin hangs from the knee) ----------
  const kneeY = Bd.kneeY, bootTop = look.tallBoots ? kneeY + 0.06 : 0.3;
  const legCol = (x, y) => (plate ? (y < 0.12 ? tone(metal, -0.1) : tone(metal, -0.08)) : paladin ? (y < 0.1 ? PAL_STEEL : legs) : y < bootTop ? boots : legs);   // paladin: mail chausses under the plates
  const shoe = (name, hex, sole) => {                               // shoe over the bare toes of the model (shin space)
    const L = Part(kneeY, r, dirt), f = Bd.foot, sd = name === "shinR" ? 1 : -1;
    L.box(f.w + 0.012, f.h * 0.75, f.d + 0.012, hex, f.x * sd, f.y - f.h * 0.1, f.z + 0.004);
    L.box(f.w + 0.016, 0.018, f.d + 0.02, sole, f.x * sd, f.y - f.h * 0.45, f.z + 0.006);
    pieces[name].push(L.done());
  };
  const leg = (sd) => {
    const th = sd > 0 ? "legR" : "legL", sh = sd > 0 ? "shinR" : "shinL", hp = PV[th], kp = PV[sh];
    [th, sh].forEach((name) => shell(name, paladin ? -PAL_SLIM : 0, legCol));   // under the paladin plates: slim cloth hose
    // knee joint filler (thigh space): covers the gap behind the knee when it bends
    const kf = paladin ? 0.8 : 1, Kf = Part(hp[1], r, dirt); Kf.blob(R.knee.r * 0.95 * kf, R.knee.r * 1.1 * kf, R.knee.r * 0.95 * kf, legCol(0, kneeY), (kp[0] - hp[0]) * sd * sd, kp[1] - hp[1], kp[2] - hp[2], 7, 5); pieces[th].push(Kf.done());
    if (paladin) return;                                            // the paladin's greaves and sabatons (added below) cover the legs
    if (plate) {                                                    // cuisse with tassets, poleyn with its wing, greave, sabaton
      shell(th, 0.018, (x, y) => (y > kneeY + 0.03 ? metal : null)); shell(sh, 0.018, (x, y) => (y < kneeY - 0.04 && y > 0.1 ? steel : null));
      const Tt = Part(hp[1], r, 0.2), top = prof(crotch + 0.02);
      [0, 1].forEach((i) => Tt.box(0.13, 0.08, 0.02, i ? tone(metal, -0.06) : metal, 0.01 * sd, -0.06 - i * 0.065, (top.z1 - hp[2]) + 0.02 + i * 0.006, -0.12));   // tassets, front of the thigh
      pieces[th].push(Tt.done());
      const Pk = Part(kneeY, r, 0.2); Pk.blob(0.058, 0.055, 0.045, tone(metal, 0.14), 0, 0, 0.05, 6, 4); Pk.cone(0.04, 0.018, metal, sd * 0.05, 0, 0.03, 0, sd * Math.PI / 2, 6);
      Pk.box(0.08, 0.012, 0.09, dark, 0, -0.06, 0.012); pieces[sh].push(Pk.done());
      shoe(sh, tone(metal, -0.08), tone(metal, -0.4));
      const Sb = Part(kneeY, r, 0.2), f = Bd.foot; [0.25, 0.5].forEach((k) => Sb.box(f.w + 0.016, 0.008, 0.008, dark, f.x * sd, f.y + f.h * 0.28, f.z - f.d / 2 + f.d * k)); pieces[sh].push(Sb.done());   // lames of the sabaton
      return;
    }
    shell(sh, 0.01, (x, y) => (y < bootTop ? boots : null)); if (bootTop > kneeY) shell(th, 0.01, (x, y) => (y < bootTop ? boots : null));   // boot
    shoe(sh, tone(boots, -0.05), "#1a1410");
    if (look.tallBoots) [th, sh].forEach((name) => shell(name, 0.018, (x, y) => (y < bootTop + 0.005 && y > bootTop - 0.04 ? tone(boots, 0.15) : null)));   // turned-down cuff
    if (look.wraps) for (let y0 = bootTop + 0.04; y0 < kneeY - 0.02; y0 += 0.05) shell(sh, 0.008, (x, y) => (Math.abs(y - y0) < 0.015 ? look.wraps : null));
  };
  leg(1); leg(-1);
  if (paladin) ["torso", "armR", "armL", "legR", "legL", "shinR", "shinL", "padR", "padL"].forEach(palPiece);

  const merge = (all) => { const list = all.filter((x) => x && x.attributes.position.count); if (!list.length) return null; const g = mergeGeometries(list); list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; };
  const geo = Object.fromEntries(Object.entries(pieces).map(([k, l]) => [k, merge(l)]));
  // The parts are built around the pivots of the unwidened body: shoulders and hips move out with the bulk.
  const wide = (p) => [p[0] * BK, p[1], p[2]];
  const pivots = { ...PV, armR: wide(PV.armR), armL: wide(PV.armL), legR: wide(PV.legR), legL: wide(PV.legL), shinR: wide(PV.shinR), shinL: wide(PV.shinL) };
  const sc = (a) => [a[0] * BK, a[1], a[2] * BK];
  const out = { ...geo, pal: palPieces, pivots, grip: sc(R.grip), gripAxis: R.gripAxis, gripL: sc(R.gripL), gripAxisL: R.gripAxisL, shieldAt: [-Bd.fore[0] * BK - 0.07, Bd.fore[1], Bd.fore[2] * BK + 0.03] };
  cache.set(key, out);
  return out;
}
