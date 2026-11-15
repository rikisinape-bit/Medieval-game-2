// Low-poly human bodies for makeHuman (models.js).
// Every moving part (torso, head, each arm, each leg) is ONE merged geometry with vertex colours and they all share
// ONE material, so a character costs ~7 draw calls whatever the amount of detail. Geometries are cached per look+variant.
//
// Pivots (must not change, poseHuman and the engine rely on them):
//   hips  y 0.82   shoulders y 1.52   head centre y 1.80   feet on y 0
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

// ---- small deterministic RNG (variation is stable for each NPC id) ----
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

// ---- palettes (dark, desaturated) ----
export const SKINS = ["#c4a184", "#b08a6b", "#9a7556", "#7c5a40", "#d2b296", "#a88466"];
export const HAIRS = ["#1d1814", "#33261b", "#4a3826", "#5e4a33", "#6f6a62", "#8d877c", "#2a1f17"];

// ---- geometry helpers: each piece is converted to non-indexed position+normal+color ----
const _c = new THREE.Color();
// Bake a colour into a geometry. y0 = absolute height of the geometry's origin (for the "dirt towards the ground" tint).
function paint(geo, hex, y0, rand, noise = 0.07) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i += 3) {
    const y = y0 + (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const grime = 0.68 + 0.32 * Math.min(1, Math.max(0, y / 1.1)); // darker near the ground (mud, wear)
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
function Part(y0, rand) {
  const list = [];
  const push = (geo, hex, noise) => { list.push(paint(geo, hex, y0, rand, noise)); return api; };
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

const cache = new Map();
/**
 * Builds (or reuses) the geometries of one character.
 * look: LOOKS entry (+ optional female, hair, beard, sleeves, boots ...), v: variantOf(look, seed)
 * Returns { torso, head, armL, armR, legL, legR, shoulderX, hipX }
 */
export function bodyGeometries(look, v) {
  const key = JSON.stringify([look, v]);
  if (cache.has(key)) return cache.get(key);
  const r = rng(v.seed + 7);
  const F = v.female, B = v.bulk;
  const shoulderX = F ? 0.2 : 0.23 * B, hipX = F ? 0.1 : 0.1 * B;
  const cloth = tone(look.body, v.shift), legs = tone(look.legs, v.shift * 0.5);
  const boots = look.boots || "#2b2119", belt = look.belt || "#2a1c12", skin = v.skin;

  // ---------- TORSO (origin at feet) ----------
  const T = Part(0, r);
  const waist = F ? 0.135 : 0.16 * B, chest = F ? 0.17 : 0.205 * B;
  T.tube(waist, waist + 0.02, 0.86, 1.0, cloth, 0, 0, 8, 0.72);                 // belly / waist
  T.tube(waist + 0.02, chest, 1.0, 1.36, cloth, 0, 0, 8, 0.66);                  // ribcage
  T.tube(chest, shoulderX * 0.6, 1.36, 1.6, cloth, 0, 0, 8, 0.62);              // shoulders slope
  [-1, 1].forEach((s) => T.blob(0.068, 0.05, 0.07, cloth, s * (shoulderX - 0.035), 1.53, 0, 6, 4));   // deltoids
  if (F) T.tube(0.15, 0.165, 1.22, 1.36, cloth, 0, 0.022, 8, 0.72);                // bust (soft band)
  T.tube(0.048, 0.054, 1.56, 1.7, skin, 0, 0.012, 6);                             // neck
  T.tube(waist + 0.03, waist + 0.04, 0.9, 0.97, belt, 0, 0, 8, 0.74);             // belt
  T.box(0.06, 0.05, 0.02, look.buckle || "#6a5a3a", 0, 0.935, waist * 0.72 + 0.01);
  if (F || look.dress) T.tube(F ? 0.16 : 0.18, F ? 0.33 : 0.3, 0.92, 0.06, cloth, 0, 0, 9, 0.85);   // long skirt
  else T.tube(waist + 0.035, waist + 0.07, 0.92, 0.7, cloth, 0, 0, 8, 0.8);       // tunic skirt over the hips
  if (look.apron) T.box(F ? 0.3 : 0.34, 0.62, 0.025, look.apron, 0, 1.0, waist * 0.78 + 0.03);
  if (look.cape) { T.box(shoulderX * 2.1, 1.08, 0.035, look.cape, 0, 1.0, -chest * 0.7 - 0.03, -0.06); T.tube(0.07, 0.1, 1.5, 1.6, look.cape, 0, -0.01, 8, 0.8); }
  if (look.vest) T.tube(waist + 0.035, chest + 0.02, 0.95, 1.4, look.vest, 0, 0, 8, 0.7);
  const torso = T.done();

  // ---------- HEAD (origin = head pivot, y 1.80) ----------
  const H = Part(1.8, r);
  H.blob(0.108, 0.128, 0.12, skin, 0, 0.0, 0);                                   // skull
  H.tube(F ? 0.088 : 0.094, F ? 0.05 : 0.06, -0.03, F ? -0.125 : -0.135, skin, 0, 0.012, 7, 1.0); // jaw → chin
  H.box(0.024, 0.05, 0.03, tone(skin, -0.06), 0, -0.02, 0.116, 0.3);              // nose
  H.box(0.026, 0.014, 0.02, tone(skin, -0.1), 0, -0.046, 0.124);                   // nose tip
  [-1, 1].forEach((s) => {
    H.box(0.026, 0.015, 0.012, "#16110d", s * 0.042, 0.012, 0.11);               // eye
    H.box(0.052, 0.014, 0.02, v.hairCol, s * 0.044, 0.042, 0.108, 0, 0, s * (look.angry ? 0.25 : -0.08)); // brow
    H.box(0.02, 0.048, 0.032, skin, s * 0.11, -0.008, -0.005);                     // ear
  });
  H.box(F ? 0.042 : 0.048, F ? 0.014 : 0.011, 0.01, F ? "#6a3430" : "#4a2a22", 0, -0.08, 0.104); // mouth
  const hc = v.hairCol, hd = look.head;
  const covered = ["hood", "helm", "minerhelm", "hat", "cap", "crown"].includes(hd) && hd !== "crown";
  // hair
  // hair follows the skull shape (scaled unit sphere cap), tilted back so the forehead stays free
  if (v.hair !== "bald" || hd === "crown") H.cap(1, hc, 0, 0.012, -0.012, 1.35, 0.116, 0.136, 0.128, -0.5);
  else H.cap(1, hc, 0, -0.01, -0.012, 0.75, 0.114, 0.13, 0.126, -1.9);                                    // bald: fringe at the back
  if (v.hair === "long" || v.hair === "braid" || v.hair === "shaggy") H.cap(1, hc, 0, v.hair === "shaggy" ? -0.02 : -0.06, -0.03, 1.4, 0.118, v.hair === "shaggy" ? 0.15 : 0.22, 0.12, -1.75);
  if (v.hair === "braid") H.tube(0.025, 0.018, -0.12, -0.42, hc, 0, -0.12, 5);
  if (F && !covered) [-1, 1].forEach((sd) => {                                    // locks framing the face
    const long = v.hair === "long";
    H.box(0.03, long ? 0.26 : 0.13, 0.09, hc, sd * 0.108, long ? -0.07 : -0.005, -0.012, 0, 0, sd * 0.06);
    H.box(0.06, 0.03, 0.05, hc, sd * 0.06, 0.098, 0.085, 0.4, 0, sd * -0.3);    // parted fringe
  });
  if (v.hair === "bun") H.blob(0.05, 0.045, 0.05, hc, 0, 0.06, -0.12);
  // beards
  // beards sit on the jaw below the mouth and along the cheeks, leaving mouth, nose and eyes free
  const beardJaw = (len) => {
    H.tube(0.097, 0.062, -0.088, -0.088 - len, hc, 0, 0.012, 7, 1.0);                 // jaw + chin
    [-1, 1].forEach((sd) => H.box(0.022, 0.07, 0.06, hc, sd * 0.09, -0.05, 0.015));   // sideburns
    H.box(0.075, 0.016, 0.02, hc, 0, -0.064, 0.114);                                   // moustache
    H.box(0.04, 0.01, 0.01, "#3a221c", 0, -0.085, 0.118);                              // mouth on the beard
  };
  if (v.beard === "stubble") H.tube(0.096, 0.061, -0.07, -0.14, tone(skin, -0.28), 0, 0.013, 7, 1.0);
  if (v.beard === "full") beardJaw(0.085);
  if (v.beard === "long") { beardJaw(0.09); H.cone(0.06, 0.14, hc, 0, -0.22, 0.05, Math.PI, 0, 6, 1, 0.7); }
  if (v.beard === "goatee") { H.box(0.04, 0.055, 0.03, hc, 0, -0.12, 0.09); H.box(0.07, 0.016, 0.02, hc, 0, -0.064, 0.114); }
  // headwear (more variety in step 2)
  const hat = look.hat;
  if (hd === "hood") { H.cap(0.14, hat, 0, 0.005, -0.012, 1.95, 1, 1.08, 1.05, -0.6); H.cone(0.06, 0.16, hat, 0, 0.02, -0.15, -2.2); }
  if (hd === "cap") { H.cap(1, hat, 0, 0.025, -0.01, 1.25, 0.122, 0.13, 0.132, -0.25); H.tube(0.12, 0.122, 0.06, 0.085, tone(hat, -0.2), 0, -0.01, 8, 1.06); }
  if (hd === "hat") { H.tube(0.22, 0.22, 0.075, 0.09, hat, 0, 0, 10); H.tube(0.1, 0.12, 0.08, 0.2, hat, 0, 0, 8); }
  if (hd === "minerhelm") { H.cap(0.13, hat, 0, 0.01, 0, 1.6); H.box(0.05, 0.04, 0.03, "#e8d890", 0, 0.08, 0.125); }
  if (hd === "helm") {
    if (look.greatHelm) { H.tube(0.135, 0.13, -0.15, 0.13, hat, 0, 0, 8); H.cap(0.135, hat, 0, 0.13, 0, 1.57); H.box(0.18, 0.02, 0.02, "#0e0e10", 0, 0.03, 0.13); }
    else { H.cap(0.13, hat, 0, 0.02, 0, 1.6); H.tube(0.2, 0.2, 0.03, 0.05, hat, 0, 0, 10); }                  // kettle hat
    if (look.plume) H.box(0.03, 0.12, 0.2, look.plume, 0, 0.22, -0.03);
  }
  if (hd === "crown") { H.tube(0.13, 0.12, 0.08, 0.14, "#8a6a2a", 0, 0, 8); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; H.cone(0.022, 0.06, "#9a7a30", Math.sin(a) * 0.125, 0.17, Math.cos(a) * 0.125, 0, 0, 4); } }
  if (covered && v.hair === "long") H.box(0.21, 0.12, 0.05, hc, 0, -0.12, -0.09);
  const head = H.done();

  // ---------- ARMS (origin = shoulder pivot y 1.52, hanging down -y) ----------
  const arm = (side) => {
    const A = Part(1.52, r);
    const sleeve = look.sleeves === "rolled" ? skin : cloth;
    A.tube(F ? 0.052 : 0.062 * B, F ? 0.046 : 0.054 * B, 0.0, -0.3, cloth, 0, 0, 6);         // upper arm (sleeve)
    A.tube(F ? 0.044 : 0.052 * B, F ? 0.036 : 0.042 * B, -0.3, -0.57, sleeve, 0, 0.01, 6);   // forearm
    if (look.bracers) A.tube(0.05, 0.046, -0.4, -0.56, look.bracers, 0, 0.01, 6);
    if (look.sleeves === "rolled") A.tube(0.058, 0.056, -0.27, -0.33, cloth, 0, 0.005, 6);  // rolled cuff
    A.box(0.075, 0.1, 0.045, skin, 0, -0.63, 0.012);                                         // hand
    A.box(0.022, 0.05, 0.025, skin, side * -0.035, -0.6, 0.035, 0, 0, side * 0.4);            // thumb
    if (look.gloves) A.box(0.082, 0.07, 0.052, look.gloves, 0, -0.6, 0.012);
    return A.done();
  };
  // ---------- LEGS (origin = hip pivot y 0.82) ----------
  const leg = () => {
    const L = Part(0.82, r);
    L.tube(F ? 0.078 : 0.085 * B, F ? 0.058 : 0.062 * B, 0.02, -0.42, legs, 0, 0, 6);      // thigh
    L.tube(F ? 0.056 : 0.06 * B, 0.045, -0.42, -0.6, legs, 0, 0.005, 6);                  // shin
    L.tube(0.056, 0.06, -0.56, -0.8, boots, 0, 0.005, 6);                                  // boot shaft
    L.box(0.1, 0.06, 0.2, boots, 0, -0.79, 0.04);                                          // foot
    if (look.wraps) L.tube(0.062, 0.062, -0.5, -0.56, look.wraps, 0, 0.005, 6);
    return L.done();
  };
  const out = { torso, head, armL: arm(-1), armR: arm(1), legL: leg(), legR: leg(), shoulderX, hipX };
  cache.set(key, out);
  return out;
}
