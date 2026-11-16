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

export const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

// ---- small deterministic RNG (variation is stable for each NPC id) ----
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rng = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

// ---- palettes (dark, desaturated) ----
export const SKINS = ["#c4a184", "#b08a6b", "#9a7556", "#7c5a40", "#d2b296", "#a88466"];
export const HAIRS = ["#1d1814", "#33261b", "#4a3826", "#5e4a33", "#6f6a62", "#8d877c", "#2a1f17"];

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
    done: () => { const g = mergeGeometries(list); list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; },
  };
  return api;
}

// ---- variation for one character ----
export function variantOf(look, seed) {
  const r = rng(hashStr(seed || "x"));
  const female = !!look.female;
  const skin = look.skin || SKINS[Math.floor(r() * SKINS.length)];
  const hairCol = look.hairColor || HAIRS[Math.floor(r() * (look.old ? 2 : 5)) + (look.old ? 4 : 0)];
  const hair = look.hair || (female ? ["bun", "long", "braid"][Math.floor(r() * 3)] : ["short", "short", "shaggy", "bald", "long"][Math.floor(r() * 5)]);
  const beard = female ? "none" : look.beard || ["none", "stubble", "full", "full", "goatee", "long"][Math.floor(r() * 6)];
  const height = (female ? 0.95 : 1) * (0.96 + r() * 0.08);
  const bulk = look.bulk || (0.94 + r() * 0.12);
  const shift = (r() - 0.5) * 0.12; // small colour shift so clothes are not identical
  return { female, skin, hairCol, hair, beard, height, bulk, shift, seed: hashStr(seed || "x") };
}
// Slightly shift a colour's lightness (per-NPC clothes variation).
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
  const mid = (part, test) => { const P = parts[part], s = [0, 0, 0]; let n = 0; for (let i = 0; i < P.pos.length / 3; i++) if (test(i, P)) { s[0] += P.pos[i * 3]; s[1] += P.pos[i * 3 + 1]; s[2] += P.pos[i * 3 + 2]; n++; } return s.map((x) => x / Math.max(1, n)); };
  const elbow = mid("armR", (i, P) => Math.abs(P.t[i] - 0.5) < 0.08), fore = mid("armR", (i, P) => Math.abs(P.t[i] - 0.78) < 0.08);
  const kneeY = R.pivots.legR[1] * 0.5;
  const knee = mid("legR", (i, P) => Math.abs(P.pos[i * 3 + 1] + R.pivots.legR[1] - kneeY) < 0.05);
  // the foot: box around the leg's vertices below the ankle (leg space)
  const L = parts.legR, fy = -R.pivots.legR[1] + 0.09, fp = [];
  for (let i = 0; i < L.pos.length / 3; i++) if (L.pos[i * 3 + 1] < fy) fp.push([L.pos[i * 3], L.pos[i * 3 + 1], L.pos[i * 3 + 2]]);
  const ext = (k, f) => f(...fp.map((p) => p[k]));
  const foot = { x: (ext(0, Math.min) + ext(0, Math.max)) / 2, y: (ext(1, Math.min) + fy) / 2, z: (ext(2, Math.min) + ext(2, Math.max)) / 2, w: ext(0, Math.max) - ext(0, Math.min), h: fy - ext(1, Math.min), d: ext(2, Math.max) - ext(2, Math.min) };
  return (BASE[k] = { parts, rig: R, elbow, fore, knee, kneeY, foot });
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
function bodyMesh(B, part, colorOf, { d = 0, bulk = 1, rand, dirt = 0.32, noise = 0.07 }) {
  const P = B.parts[part], pv = P.piv, sx = part === "head" ? 1 : bulk;
  const out = [], col = [];
  const vtx = (j) => [P.pos[j * 3] * sx + P.nrm[j * 3] * d, P.pos[j * 3 + 1] + P.nrm[j * 3 + 1] * d, P.pos[j * 3 + 2] * sx + P.nrm[j * 3 + 2] * d];
  for (let i = 0; i < P.idx.length; i += 3) {
    const tri = [P.idx[i], P.idx[i + 1], P.idx[i + 2]], v = tri.map(vtx);
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3 + pv[0], cy = (v[0][1] + v[1][1] + v[2][1]) / 3 + pv[1], cz = (v[0][2] + v[1][2] + v[2][2]) / 3 + pv[2];
    const t = P.t ? (P.t[tri[0]] + P.t[tri[1]] + P.t[tri[2]]) / 3 : 0;
    const hex = colorOf(cx, cy, cz, t);
    if (!hex) continue;
    _c.set(hex);
    const grime = 1 - dirt * (1 - Math.min(1, Math.max(0, cy / 1.1))), k = grime * (1 - noise / 2 + rand() * noise);
    v.forEach((p) => { out.push(...p); col.push(_c.r * k, _c.g * k, _c.b * k); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const cache = new Map();
/**
 * Builds (or reuses) the geometries of one character.
 * look: LOOKS entry (+ optional female, hair, beard, sleeves, boots ...), v: variantOf(look, seed)
 * Returns { torso, head, armL, armR, legL, legR, pivots, grip, gripAxis, gripL, gripAxisL, shieldAt }:
 * every part in the local space of its pivot (pivots in the character's space, feet on y = 0).
 */
export function bodyGeometries(look, v) {
  const key = JSON.stringify([look, v]);
  if (cache.has(key)) return cache.get(key);
  const r = rng(v.seed + 7);
  const F = v.female, BK = v.bulk, Bd = baseBody(F), R = Bd.rig, PV = R.pivots;
  const hipY = PV.legR[1], shY = PV.armR[1], neck = R.neck, crotch = R.crotch;
  const waistY = hipY + (F ? 0.07 : 0.045);                       // belt line
  const cloth = tone(look.body, v.shift), legs = tone(look.legs, v.shift * 0.5);
  const boots = look.boots || "#2b2119", belt = look.belt || "#2a1c12", skin = v.skin;
  const dirt = look.dirt ?? 0.32, metal = look.metal || "#7c7f84", trim = look.trim;
  const plate = look.armor === "plate", gamb = look.armor === "gambeson", leather = look.armor === "leather", mail = look.armor === "mail";
  const torsoCol = plate || mail ? metal : cloth;
  const long = F || look.dress || look.coat === "robe";           // long skirt / robe down to the feet
  const prof = (y, off = 0) => { const p = profileAt(R, y); return { w: p[1] * BK + off, z0: p[2] * BK - off, z1: p[3] * BK + off }; };
  // Elliptic band following the torso from y1 to y2 (off = distance from the body), as a Part tube.
  const band = (Pt, y1, y2, off1, off2, hex, seg = 9) => {
    const a = prof(y1, off1), b = prof(y2, off2), dz = (a.z1 - a.z0) / 2 / a.w;
    Pt.tube(a.w, b.w, y1, y2, hex, 0, (a.z0 + a.z1) / 2, seg, dz);
  };
  const opt = { bulk: BK, rand: r, dirt };
  const pieces = { torso: [], head: [], armL: [], armR: [], legL: [], legR: [] };
  const shell = (part, d, colorOf, o = {}) => pieces[part].push(bodyMesh(Bd, part, colorOf, { ...opt, ...o, d }));

  // ---------- TORSO ----------
  const neckR = F ? 0.055 : 0.065, neckZ = PV.head[2] - 0.015, nk = { w: neckR, z0: neckZ - neckR, z1: neckZ + neckR };   // the neck (the profile there already has the shoulders)
  const isNeck = (y, x = 0) => y > neck - 0.05 && Math.abs(x) < neckR + 0.01;
  shell("torso", 0, (x, y, z) => {
    if (isNeck(y, x)) return (look.collar || look.cowl) && y < neck - 0.02 ? torsoCol : skin;
    if (y > crotch + 0.04 || long) return y < waistY - 0.03 && !long && !look.coat && !(F || look.dress) ? (plate ? tone(metal, -0.1) : cloth) : torsoCol;
    return legs;
  });
  const T = Part(0, r, dirt);
  if (plate) {                                                     // breastplate (a shell over the chest), ridge, faulds, gorget
    shell("torso", 0.022, (x, y) => (y > waistY - 0.06 && y < shY + 0.04 && !isNeck(y, x) ? (y < waistY + 0.02 ? tone(metal, -0.12) : metal) : null));
    const c = prof(1.22, 0.03); T.box(0.03, 0.36, 0.03, tone(metal, 0.15), 0, 1.22, c.z1 - 0.005);
    band(T, neck - 0.05, neck - 0.13, 0.025, 0.035, tone(metal, -0.05));
  }
  if (mail) {                                                      // hauberk: shell + rows of rings
    shell("torso", 0.012, (x, y) => (y > crotch && !isNeck(y, x) ? metal : null));
    for (let y = waistY; y < shY; y += 0.06) shell("torso", 0.016, (x, yy) => (Math.abs(yy - y) < 0.012 ? tone(metal, -0.32) : null));
  }
  if (gamb) {                                                      // padded jacket: thick shell + quilting lines
    shell("torso", 0.022, (x, y) => (y > crotch - 0.02 && !isNeck(y, x) ? cloth : null));
    for (let y = waistY + 0.04; y < shY - 0.02; y += 0.09) shell("torso", 0.026, (x, yy) => (Math.abs(yy - y) < 0.014 ? tone(cloth, -0.22) : null));
  }
  if (leather) {                                                   // leather jerkin: shell, laced front, stitched hem
    const lc = look.vest || "#3e2c1e";
    shell("torso", 0.016, (x, y) => (y > waistY - 0.07 && y < shY - 0.01 && !isNeck(y, x) ? (y < waistY - 0.02 ? tone(lc, -0.08) : lc) : null));
    const c = prof(1.2, 0.02); T.box(0.012, 0.36, 0.012, "#1e140c", 0, 1.2, c.z1);
    for (let y = 1.06; y < 1.36; y += 0.07) { const cc = prof(y, 0.02); T.box(0.05, 0.008, 0.01, "#1e140c", 0, y, cc.z1 + 0.004); }
  }
  if (look.vest && !leather) shell("torso", 0.014, (x, y, z) => (y > waistY - 0.06 && y < shY - 0.03 && !isNeck(y, x) && !(z > 0 && Math.abs(x) < 0.035) ? look.vest : null));   // open at the front
  if (look.coat) shell("torso", 0.018, (x, y, z) => (y > waistY - 0.05 && !isNeck(y, x) && !(z > 0 && Math.abs(x) < 0.02 && look.coat !== "robe") ? look.coatColor || cloth : null));
  // lower body: long skirt / robe / coat skirts / tunic hem (free pieces: the legs move inside)
  const hemTop = waistY - 0.03;
  if (F || look.dress) band(T, hemTop, 0.06, 0.02, 0.2, cloth, 10);
  else if (look.coat === "robe") band(T, hemTop, 0.07, 0.03, 0.15, look.coatColor || cloth, 10);
  else if (look.coat) band(T, hemTop, 0.42, 0.03, 0.1, look.coatColor || cloth, 10);
  else if (mail) { band(T, hemTop, crotch - 0.22, 0.02, 0.06, metal, 10); band(T, crotch - 0.21, crotch - 0.23, 0.065, 0.066, tone(metal, -0.3), 10); }
  else band(T, hemTop, crotch - 0.14, 0.012, 0.05, plate ? tone(metal, -0.1) : cloth, 9);
  if ((look.coat || look.dress || F) && trim) { const lo = look.coat === "robe" ? 0.07 : look.coat ? 0.42 : 0.06, off = look.coat === "robe" ? 0.15 : look.coat ? 0.1 : 0.2; band(T, lo + 0.05, lo, off - 0.005, off + 0.004, trim, 10); }
  if (look.tabard) {                                               // surcoat panels, front and back
    const c = prof(1.2, 0.03), h = 1.36 - (crotch - 0.25);
    T.box(0.26, h, 0.02, look.tabard, 0, (1.36 + crotch - 0.25) / 2, c.z1 + 0.012, -0.04);
    T.box(0.26, h, 0.02, look.tabard, 0, (1.36 + crotch - 0.25) / 2, c.z0 - 0.012, 0.04);
    if (look.emblem) T.box(0.1, 0.1, 0.01, look.emblem, 0, 1.22, prof(1.22, 0.03).z1 + 0.03, 0, 0, Math.PI / 4);
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
  if (look.collar) T.tube(neckR + 0.02, neckR + 0.11, neck - 0.01, neck - 0.13, look.collar, 0, neckZ - 0.005, 9, Math.max(1, dzN));   // fur / cloth collar
  if (look.cowl) T.tube(neckR + 0.03, neckR + 0.07, neck + 0.03, neck - 0.09, look.cowl, 0, neckZ - 0.01, 9, 1.05);   // hood down, around the neck
  if (look.cape) {
    const cl = look.capeLen || 1.08, top = shY + 0.06, c = prof(shY - 0.05, 0.05);
    T.box(PV.armR[0] * BK * 2.1, cl, 0.03, look.cape, 0, top - cl / 2, c.z0 - 0.02 - cl * 0.06, -0.08);
    [-1, 1].forEach((sd) => T.box(0.1, 0.03, 0.16, look.cape, sd * PV.armR[0] * BK * 0.75, shY + 0.075, (c.z0 + c.z1) / 2 - 0.03, 0, 0, sd * -0.35));   // over the shoulders
  }
  // shoulders: pauldrons / spaulders (on the torso, over the top of the arm)
  [-1, 1].forEach((sd) => {
    const x = sd * PV.armR[0] * BK, y = shY + 0.02, z = PV.armR[2];
    if (plate) T.blob(0.1, 0.065, 0.1, tone(metal, 0.05), x, y, z, 7, 4);
    else if (leather) T.blob(0.085, 0.05, 0.085, tone(look.vest || "#3e2c1e", -0.1), x, y - 0.005, z, 6, 4);
    else if (mail) T.blob(0.08, 0.05, 0.08, metal, x, y - 0.01, z, 6, 4);
  });
  pieces.torso.push(T.done());

  // ---------- HEAD (pivot = centre of the head) ----------
  // Hair, hats and helmets are authored around the old reference skull (radii 0.108 x 0.128 x 0.12, chin -0.135) and
  // fitted to this head; eyes, brows and mouth are laid on the face mesh.
  // (the model's head is boxier than the old ellipsoid: what wraps it is made a little roomier)
  const hm = R.head, kx = (hm.halfW / 0.108) * 1.12, kyT = (hm.top / 0.128) * 1.06, kyB = -hm.chin / 0.135, kz = ((hm.front - hm.back) / 2 / 0.12) * 1.08, cz = (hm.front + hm.back) / 2;
  const fit = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * kx, y * (y > 0 ? kyT : kyB), p.getZ(i) * kz + cz); } g.computeVertexNormals(); return g; };
  shell("head", 0, () => skin);
  const H = Part(PV.head[1], r, Math.min(0.2, dirt));
  const hc = v.hairCol, hd = look.head;
  const covered = ["hood", "helm", "minerhelm", "hat", "cap", "kerchief", "coif", "nasal", "leatherhood"].includes(hd);
  if (v.hair !== "bald" || hd === "crown") H.cap(1, hc, 0, 0.012, -0.012, 1.35, 0.116, 0.136, 0.128, -0.5);
  else H.cap(1, hc, 0, -0.01, -0.012, 0.75, 0.114, 0.13, 0.126, -1.9);                                    // bald: fringe at the back
  if (v.hair === "long" || v.hair === "braid" || v.hair === "shaggy") H.cap(1, hc, 0, v.hair === "shaggy" ? -0.02 : -0.06, -0.03, 1.4, 0.118, v.hair === "shaggy" ? 0.15 : 0.22, 0.12, -1.75);
  if (v.hair === "braid") H.tube(0.025, 0.018, -0.12, -0.42, hc, 0, -0.12, 5);
  if (F && !covered) [-1, 1].forEach((sd) => {                                    // locks framing the face
    const lng = v.hair === "long";
    H.box(0.03, lng ? 0.26 : 0.13, 0.09, hc, sd * 0.108, lng ? -0.07 : -0.005, -0.012, 0, 0, sd * 0.06);
    H.box(0.06, 0.03, 0.05, hc, sd * 0.06, 0.098, 0.085, 0.4, 0, sd * -0.3);    // parted fringe
  });
  if (v.hair === "bun") H.blob(0.05, 0.045, 0.05, hc, 0, 0.06, -0.12);
  const beardJaw = (len) => {
    H.tube(0.097, 0.062, -0.088, -0.088 - len, hc, 0, 0.012, 7, 1.0);                 // jaw + chin
    [-1, 1].forEach((sd) => H.box(0.012, 0.06, 0.05, hc, sd * 0.088, -0.045, 0.01));   // sideburns
  };
  if (v.beard === "stubble") H.tube(0.096, 0.061, -0.07, -0.14, tone(skin, -0.28), 0, 0.013, 7, 1.0);
  if (v.beard === "full") beardJaw(0.085);
  if (v.beard === "long") { beardJaw(0.09); H.cone(0.06, 0.14, hc, 0, -0.22, 0.05, Math.PI, 0, 6, 1, 0.7); }
  if (v.beard === "goatee") H.box(0.04, 0.055, 0.03, hc, 0, -0.12, 0.09);
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
  if (covered && v.hair === "long") H.box(0.21, 0.12, 0.05, hc, 0, -0.12, -0.09);
  pieces.head.push(fit(H.done()));
  // Face details on the mesh (hidden by full helmets): eyes, brows, mouth, moustache.
  const faceHidden = (hd === "helm" && look.greatHelm) || look.mask;
  if (!faceHidden) {
    const Fc = Part(PV.head[1], r, 0.1), fz = (x, y) => faceZ(Bd, x, y);
    const ey = hm.eye, ex = hm.halfW * 0.42;
    [-1, 1].forEach((s) => Fc.box(0.012, 0.04, 0.026, tone(skin, -0.04), s * (hm.halfW + 0.002), ey - 0.03, cz - 0.012));   // ears
    [-1, 1].forEach((s) => {
      const z = fz(s * ex, ey);
      Fc.box(0.022, 0.012, 0.012, "#16110d", s * ex, ey, z + 0.002);                                       // eye
      Fc.box(0.045, 0.012, 0.016, v.hairCol, s * ex, ey + 0.026, fz(s * ex, ey + 0.026) + 0.004, 0, 0, s * (look.angry ? 0.25 : -0.08));   // brow
    });
    const my = hm.chin * 0.52, mz = fz(0, my);
    Fc.box(F ? 0.036 : 0.04, F ? 0.011 : 0.009, 0.01, F ? "#6a3430" : "#4a2a22", 0, my, mz + 0.002);       // mouth
    if (v.beard === "full" || v.beard === "long" || v.beard === "goatee") Fc.box(0.065, 0.014, 0.018, v.hairCol, 0, my + 0.02, fz(0, my + 0.02) + 0.005);   // moustache
    pieces.head.push(Fc.done());
  }

  // ---------- ARMS ----------
  const arm = (side) => {
    const name = side > 0 ? "armR" : "armL";
    const sleeve = look.sleeves === "rolled" ? skin : cloth;
    const hand = plate ? tone(metal, -0.05) : look.gloves || skin;
    shell(name, 0, (x, y, z, t) => (t > 1.0 ? hand : t < 0.45 ? torsoCol : plate || mail ? metal : sleeve));
    if (plate) { shell(name, 0.016, (x, y, z, t) => (t < 1.02 ? (t > 0.62 ? tone(metal, 0.06) : metal) : null)); }
    if (mail) for (let t0 = 0.08; t0 < 0.9; t0 += 0.1) shell(name, 0.012, (x, y, z, t) => (Math.abs(t - t0) < 0.02 ? tone(metal, -0.3) : null));
    if (gamb) shell(name, 0.016, (x, y, z, t) => (t < 0.97 ? (Math.abs(t - 0.25) < 0.03 || Math.abs(t - 0.6) < 0.03 ? tone(cloth, -0.22) : cloth) : null));
    if (look.bracers && !plate) shell(name, 0.012, (x, y, z, t) => (t > 0.66 && t < 0.98 ? look.bracers : null));
    if (look.sleeves === "rolled") shell(name, 0.01, (x, y, z, t) => (t > 0.42 && t < 0.5 ? cloth : null));
    if (look.coat && look.sleeves !== "rolled") shell(name, look.coat === "robe" ? 0.03 : 0.024, (x, y, z, t) => (t > 0.78 && t < 0.98 ? look.coatColor || cloth : null));   // wide cuff
    if (look.coat) shell(name, 0.016, (x, y, z, t) => (t < 0.8 ? look.coatColor || cloth : null));
    if (look.gloves && !plate) shell(name, 0.005, (x, y, z, t) => (t > 0.97 && t < 1.08 ? tone(look.gloves, 0.1) : null));   // glove cuff
    if (plate) { const A = Part(PV.armR[1], r, 0.2), e = Bd.elbow; A.blob(0.05, 0.045, 0.05, tone(metal, 0.1), e[0] * side, e[1], e[2] - 0.02, 6, 4); pieces[name].push(A.done()); }   // couter
  };
  arm(1); arm(-1);

  // ---------- LEGS ----------
  const bootTop = look.tallBoots ? Bd.kneeY + 0.06 : 0.3;
  const shoe = (name, hex, sole) => {                               // shoe over the bare toes of the model
    const L = Part(PV.legR[1], r, dirt), f = Bd.foot, sd = name === "legR" ? 1 : -1;
    L.box(f.w + 0.012, f.h * 0.75, f.d + 0.012, hex, f.x * sd, f.y - f.h * 0.1, f.z + 0.004);
    L.box(f.w + 0.016, 0.018, f.d + 0.02, sole, f.x * sd, f.y - f.h * 0.45, f.z + 0.006);
    pieces[name].push(L.done());
  };
  const leg = (name) => {
    shell(name, 0, (x, y) => (plate ? (y < 0.12 ? tone(metal, -0.1) : tone(metal, -0.08)) : y < bootTop ? boots : legs));
    if (plate) { shell(name, 0.016, (x, y) => (y < hipY - 0.12 ? (y < 0.13 ? tone(metal, -0.1) : metal) : null)); const L = Part(PV.legR[1], r, 0.2), k = Bd.knee; L.blob(0.055, 0.05, 0.05, tone(metal, 0.1), k[0] * (name === "legR" ? 1 : -1), k[1], k[2] + 0.04, 6, 4); pieces[name].push(L.done()); shoe(name, tone(metal, -0.1), tone(metal, -0.35)); }
    else {
      shell(name, 0.01, (x, y) => (y < bootTop ? boots : null));                                   // boot
      shoe(name, tone(boots, -0.05), "#1a1410");
      if (look.tallBoots) shell(name, 0.018, (x, y) => (y < bootTop + 0.005 && y > bootTop - 0.04 ? tone(boots, 0.15) : null));   // turned-down cuff
      if (look.wraps) for (let y0 = bootTop + 0.04; y0 < Bd.kneeY + 0.02; y0 += 0.05) shell(name, 0.008, (x, y) => (Math.abs(y - y0) < 0.015 ? look.wraps : null));
    }
  };
  leg("legR"); leg("legL");

  const merge = (list) => { const g = mergeGeometries(list); list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; };
  const geo = Object.fromEntries(Object.entries(pieces).map(([k, l]) => [k, merge(l)]));
  // The parts are built around the pivots of the unwidened body: shoulders and hips move out with the bulk.
  const pivots = { ...PV, armR: [PV.armR[0] * BK, PV.armR[1], PV.armR[2]], armL: [PV.armL[0] * BK, PV.armL[1], PV.armL[2]], legR: [PV.legR[0] * BK, PV.legR[1], 0], legL: [PV.legL[0] * BK, PV.legL[1], 0] };
  const sc = (a) => [a[0] * BK, a[1], a[2] * BK];
  const out = { ...geo, pivots, grip: sc(R.grip), gripAxis: R.gripAxis, gripL: sc(R.gripL), gripAxisL: R.gripAxisL, shieldAt: [-Bd.fore[0] * BK - 0.07, Bd.fore[1], Bd.fore[2] * BK + 0.03] };
  cache.set(key, out);
  return out;
}
