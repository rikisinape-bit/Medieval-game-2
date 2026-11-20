// World items (makeItem) and NPC hand tools (makeTool) in the same low-poly style as bodies and weapons:
// one merged vertex-coloured mesh per item, geometry cached per id, shared material.
// Items are authored resting on the ground (y = 0); tools are authored with the grip point at the origin and the
// handle/head towards +Z (like weapons), so they sit in the same palm position.
import * as THREE from "three";
import { Part, rng, PALADIN_MAT } from "./body";
import { WEAPON_MAT } from "./weapons";
import PALADIN from "./paladin.json";
import BODIES from "./bodydata.json";

const GLOW = {};
const glowMat = (c) => (GLOW[c] ||= new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, flatShading: true }));

const WOOD = "#4e3420", DWOOD = "#3a2618", IRON = "#5e6166", STEEL = "#8e9298", LEATHER = "#4a3020", ROPE = "#8a7650", CLOTH = "#6e6552", CORK = "#7a5a38";

// ---- builders: P = Part (box, tube, blob, cap, cone). Return optional glow parts [geometry, colour, x, y, z]. ----
const potion = (P, r, h, liquid) => {
  P.tube(r * 0.95, r * 1.1, 0.01, h * 0.62, liquid);                           // round belly (liquid seen through glass)
  P.blob(r * 1.08, r * 0.7, r * 1.08, liquid, 0, h * 0.42, 0, 8, 5);
  P.tube(r * 0.35, r * 0.4, h * 0.6, h * 0.9, "#7c8a86");                       // neck (glass)
  P.tube(r * 0.32, r * 0.3, h * 0.88, h * 1.02, CORK);                          // cork
  P.box(r * 0.9, 0.012, r * 0.9, "#3a2a1c", 0, h * 0.62, 0);                    // string tie
};
const B = {
  // --- food ---
  pane: (P) => { P.blob(0.17, 0.08, 0.1, "#9a6a34", 0, 0.07, 0, 8, 5); [-0.07, 0, 0.07].forEach((x) => P.box(0.012, 0.012, 0.13, "#c8a060", x, 0.145, 0, 0, 0.3)); },
  formaggio: (P) => { P.tube(0.16, 0.16, 0, 0.11, "#b89a48", 0, 0, 10); P.tube(0.165, 0.165, 0.0, 0.015, "#7a5a28", 0, 0, 10); P.box(0.1, 0.105, 0.02, "#d8c070", 0.08, 0.055, 0.02, 0, 0.6); },
  carne: (P) => { P.blob(0.14, 0.09, 0.1, "#6a2a1a", 0, 0.08, 0, 8, 5); P.blob(0.1, 0.07, 0.08, "#7e3a22", -0.04, 0.12, 0.02, 7, 4); P.tube(0.022, 0.018, 0.0, 0.16, "#d8ccb4", 0.16, 0, 6, 1, 0, Math.PI / 2 + 0.2); P.blob(0.03, 0.03, 0.03, "#d8ccb4", 0.25, 0.1, 0, 6, 4); },
  mela: (P) => { P.blob(0.07, 0.065, 0.07, "#8a2420", 0, 0.065, 0, 8, 6); P.tube(0.006, 0.006, 0.12, 0.155, "#3a2614"); P.box(0.04, 0.005, 0.02, "#3e5a2a", 0.02, 0.15, 0, 0, 0, 0.4); },
  acqua: (P) => { P.blob(0.1, 0.14, 0.07, "#5a4430", 0, 0.14, 0, 8, 5); P.tube(0.025, 0.03, 0.25, 0.31, LEATHER); P.tube(0.022, 0.02, 0.3, 0.34, CORK); P.box(0.22, 0.012, 0.012, "#2a1c12", 0, 0.24, 0.06); },
  vino: (P) => { P.tube(0.06, 0.065, 0.0, 0.2, "#1e1a24", 0, 0, 8); P.tube(0.06, 0.022, 0.2, 0.27, "#1e1a24", 0, 0, 8); P.tube(0.02, 0.02, 0.27, 0.34, "#1e1a24"); P.tube(0.022, 0.021, 0.33, 0.37, "#5a1a20"); P.box(0.07, 0.07, 0.005, "#a89a78", 0, 0.1, 0.064); },
  erbe: (P) => { [[-0.03, 0.2], [0.03, -0.25], [0, 0], [0.05, 0.4], [-0.05, -0.4]].forEach(([x, a]) => P.tube(0.006, 0.006, 0.0, 0.26, "#3e5230", x, 0, 4, 1, 0, a * 0.3)); [[-0.05, 0.25], [0.05, 0.24], [0, 0.29], [0.08, 0.2], [-0.08, 0.21]].forEach(([x, y]) => P.blob(0.035, 0.02, 0.025, "#4e6a38", x, y, 0, 5, 3)); P.tube(0.03, 0.03, 0.06, 0.09, ROPE); },
  pozione: (P) => potion(P, 0.075, 0.22, "#7a1420"),
  pozione_grande: (P) => potion(P, 0.11, 0.3, "#8a1424"),
  // --- valuables ---
  oro: (P) => { [[0, 0, 0], [0.07, 0, 0.05], [-0.06, 0, 0.05], [0.01, 0.018, 0.02], [-0.02, 0.036, 0.0], [0.05, 0, -0.06]].forEach(([x, y, z]) => P.tube(0.045, 0.045, y, y + 0.016, "#a8822e", x, z, 9)); P.blob(0.08, 0.07, 0.07, LEATHER, -0.12, 0.06, -0.06, 7, 5); P.tube(0.03, 0.02, 0.11, 0.15, LEATHER, -0.12, -0.06, 6); },
  argento: (P) => { P.blob(0.16, 0.1, 0.13, "#4e4a46", 0, 0.08, 0, 6, 4); [[0.04, 0.16, 0.02, 0.2], [-0.05, 0.15, -0.02, -0.3], [0.0, 0.17, -0.05, 0.1]].forEach(([x, y, z, r]) => P.cone(0.035, 0.12, "#b8c4d0", x, y, z, r, r, 5)); },
  gemma: (P) => { P.blob(0.09, 0.05, 0.08, "#3e3a36", 0, 0.04, 0, 6, 4); [[0, 0.11, 0, 0], [0.04, 0.09, 0.02, -0.4], [-0.035, 0.085, -0.01, 0.45]].forEach(([x, y, z, r]) => P.cone(0.03, 0.11, "#2e8a7a", x, y, z, 0, r, 6)); return [[new THREE.OctahedronGeometry(0.025, 0), "#3ab0a0", 0, 0.12, 0]]; },
  libro: (P) => { P.box(0.24, 0.05, 0.32, "#4a1e16", 0, 0.025, 0); P.box(0.22, 0.04, 0.3, "#c8bc9a", 0.01, 0.026, 0); P.box(0.24, 0.012, 0.32, "#4a1e16", 0, 0.056, 0); P.box(0.05, 0.016, 0.06, "#7a6232", 0.12, 0.04, 0); P.box(0.07, 0.008, 0.07, "#7a6232", 0, 0.064, 0, 0, Math.PI / 4); },
  chiave_celle: (P) => {     // a big iron key lying flat: the ring, the shaft, the bit with two teeth
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; P.box(0.016, 0.016, 0.034, "#6a5848", -0.13 + Math.cos(a) * 0.05, 0.008, Math.sin(a) * 0.05, 0, -a); }
    P.box(0.2, 0.016, 0.02, IRON, 0, 0.008, 0); P.box(0.016, 0.02, 0.026, "#6a5848", -0.07, 0.01, 0);
    P.box(0.024, 0.016, 0.06, IRON, 0.08, 0.008, 0.035); P.box(0.02, 0.016, 0.04, IRON, 0.045, 0.008, 0.025);
  },
  // --- misc ---
  corda: (P) => { for (let i = 0; i < 3; i++) { const r = 0.15 - i * 0.012; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; P.box(0.04, 0.035, r * 0.66, i % 2 ? ROPE : "#7a6844", Math.cos(a) * r, 0.02 + i * 0.03, Math.sin(a) * r, 0, -a); } } },
  pelliccia: (P) => { P.blob(0.3, 0.025, 0.2, "#4e4438", 0, 0.025, 0, 8, 3); P.blob(0.1, 0.05, 0.07, "#4a4034", 0.32, 0.04, 0, 6, 4); [-1, 1].forEach((s) => { P.cone(0.025, 0.05, "#3a3228", 0.34, 0.09, s * 0.04, 0, 0, 4); P.box(0.14, 0.02, 0.05, "#4e4438", -0.06 + s * 0.08, 0.02, s * 0.2, 0, s * 0.4); }); P.box(0.18, 0.02, 0.04, "#3e362c", -0.38, 0.02, 0, 0, 0.3); },
  torcia: (P) => { P.tube(0.022, 0.026, -0.195, 0.255, DWOOD, 0, 0, 6, 1, Math.PI / 2 - 0.08); P.tube(0.045, 0.036, -0.02, 0.09, "#2a2420", 0, 0.22, 7, 1, Math.PI / 2 - 0.08); P.tube(0.047, 0.047, 0.0, 0.02, ROPE, 0, 0.2, 7, 1, Math.PI / 2 - 0.08); },
  testa_morn: (P) => {                                                           // the bandit chief's head, wrapped in a bloodied sack
    P.blob(0.12, 0.13, 0.13, "#a07a5e", 0, 0.12, 0, 7, 5); P.cap(1, "#1c2016", 0, 0.13, -0.01, 2.1, 0.142, 0.15, 0.146, -0.6);
    P.blob(0.09, 0.05, 0.1, "#1c1410", 0, 0.03, 0.02, 6, 4); [-1, 1].forEach((s) => P.box(0.03, 0.006, 0.01, "#120c0a", s * 0.045, 0.135, 0.125));
    P.blob(0.16, 0.02, 0.14, "#4a1010", 0.03, 0.005, 0.04, 7, 3);
  },
  // --- armour items (folded / lying on the ground) ---
  cuoio: (P) => { P.box(0.42, 0.06, 0.5, "#4a3220", 0, 0.03, 0); P.box(0.012, 0.012, 0.42, "#1e140c", 0, 0.065, 0); [-0.12, 0, 0.12].forEach((z) => P.box(0.1, 0.008, 0.012, "#1e140c", 0, 0.064, z)); [-1, 1].forEach((s) => P.blob(0.1, 0.04, 0.09, "#3e2a1c", s * 0.2, 0.05, -0.2, 6, 3)); },
  maglia: (P) => { P.blob(0.28, 0.06, 0.24, "#62666b", 0, 0.05, 0, 9, 4); for (let i = -2; i <= 2; i++) P.box(0.5 - Math.abs(i) * 0.06, 0.006, 0.012, "#3c3f43", 0, 0.1 - Math.abs(i) * 0.012, i * 0.08); P.blob(0.12, 0.05, 0.1, "#5a5e63", 0.2, 0.08, 0.12, 7, 4); },
  piastre: (P) => { P.blob(0.22, 0.09, 0.26, "#8c9095", 0, 0.06, 0, 8, 4); P.box(0.02, 0.012, 0.42, "#a8acb2", 0, 0.15, 0); [-1, 1].forEach((s) => P.blob(0.1, 0.06, 0.1, "#9a9ea3", s * 0.27, 0.06, -0.15, 7, 4)); P.box(0.3, 0.03, 0.1, "#2c3442", 0, 0.04, 0.27); },
  cappuccio: (P) => { P.cap(1, "#4a3424", 0, 0.0, 0, 1.7, 0.16, 0.13, 0.17, 0.4); P.blob(0.2, 0.025, 0.16, "#4a3424", 0, 0.02, -0.12, 7, 3); },
  elmo_ferro: (P) => { P.cone(0.14, 0.17, "#6a6d72", 0, 0.12, 0, 0, 0, 8); P.tube(0.142, 0.142, 0.0, 0.04, "#4e5156", 0, 0, 8); P.box(0.026, 0.1, 0.02, "#5a5d62", 0, 0.0, 0.14, -0.2); P.tube(0.15, 0.17, 0.0, 0.015, "#3e4146", 0, -0.04, 8); },
  elmo_piastre: (P) => { P.tube(0.14, 0.135, 0.0, 0.25, "#8c9095", 0, 0, 8); P.cap(0.14, "#8c9095", 0, 0.25, 0, 1.57); P.box(0.18, 0.02, 0.02, "#0e0e10", 0, 0.16, 0.135); P.box(0.02, 0.28, 0.02, "#a4a8ae", 0, 0.15, 0.14); },
  // --- tools (also used in NPC hands) ---
  martello: (P) => { P.tube(0.018, 0.016, -0.06, 0.3, DWOOD, 0, 0, 6); P.box(0.06, 0.06, 0.13, "#3a3c40", 0, 0.32, 0.0); P.box(0.065, 0.065, 0.02, "#2e3034", 0, 0.32, 0.07); },
  ascia: (P) => { P.tube(0.02, 0.017, -0.08, 0.5, WOOD, 0, 0, 6); P.box(0.04, 0.07, 0.05, IRON, 0, 0.47, 0); P.box(0.13, 0.08, 0.02, STEEL, 0.07, 0.47, 0); P.box(0.03, 0.12, 0.02, "#a8acb2", 0.135, 0.47, 0); },
  scopa: (P) => { P.tube(0.016, 0.016, -0.3, 0.9, "#6a5034", 0, 0, 5); P.tube(0.03, 0.09, 0.9, 1.15, "#8a7448", 0, 0, 7, 0.45); P.tube(0.032, 0.032, 0.92, 0.95, ROPE, 0, 0, 7, 0.5); },
  secchio: (P) => { P.tube(0.11, 0.09, -0.3, -0.1, WOOD, 0, 0, 9); [-0.27, -0.14].forEach((y) => P.tube(0.112, 0.112, y, y + 0.02, IRON, 0, 0, 9)); P.tube(0.092, 0.092, -0.13, -0.12, "#3a4c5a", 0, 0, 9); [-1, 1].forEach((s) => P.box(0.008, 0.12, 0.008, IRON, s * 0.1, -0.05, 0, 0, 0, s * -0.35)); P.box(0.11, 0.01, 0.01, IRON, 0, 0.005, 0); },
};
// Items that are lying on the ground use the builder as is; for tools in hand the handle must be the grip.
// Tool builders are authored with the handle along +Y and the grip at y = 0, then rotated so the handle points to +Z.
const TOOL_ITEMS = new Set(["martello", "ascia", "scopa"]);

// The plate armour and the great helm are the paladin knight's pieces (paladin.json): the cuirass with its pauldrons
// standing on the ground, the helm on the ground.
const PALADIN_ITEMS = { piastre: ["torso", "padR", "padL"], elmo_piastre: ["head"] };
const paladinGeo = (id) => {
  const M = PALADIN.m, PV = BODIES.m.rig.pivots, piv = { torso: [0, 0, 0], head: PV.head, padR: PV.armR, padL: PV.armL };
  const pos = [], uv = [];
  PALADIN_ITEMS[id].forEach((n) => {
    const P = M.parts[n], o = piv[n];
    for (let t = 0; t < P.i.length; t++) { const v = P.i[t]; pos.push(P.p[v * 3] + o[0], P.p[v * 3 + 1] + o[1], P.p[v * 3 + 2] + o[2]); uv.push(P.uv[v * 2], P.uv[v * 2 + 1]); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
  g.computeBoundingBox(); const b = g.boundingBox;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);            // standing on the ground, centred
  g.computeVertexNormals();
  return g;
};

const cache = new Map();
const build = (id) => {
  if (cache.has(id)) return cache.get(id);
  if (PALADIN_ITEMS[id] && PALADIN.m) { const entry = { geo: paladinGeo(id), glow: [] }; cache.set(id, entry); return entry; }
  const P = Part(0.6, rng(id.length * 31 + 5), 0.05);
  const glow = (B[id] || B.pane)(P) || [];
  const entry = { geo: P.done(), glow };
  cache.set(id, entry);
  return entry;
};
const meshOf = (id) => {
  const { geo, glow } = build(id);
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, PALADIN_ITEMS[id] && PALADIN.m ? PALADIN_MAT : WEAPON_MAT); m.castShadow = true; g.add(m);
  glow.forEach(([gg, c, x, y, z]) => { const gm = new THREE.Mesh(gg, glowMat(c)); gm.position.set(x, y, z); g.add(gm); });
  return g;
};
export const hasItemModel = (id) => !!B[id];

// Item lying on the ground. Tools (axe, hammer) are laid down flat.
export function itemModel(id) {
  const g = meshOf(id);
  if (TOOL_ITEMS.has(id)) { g.rotation.set(0, 0.5, Math.PI / 2); g.position.y = 0.03; const w = new THREE.Group(); w.add(g); return w; }
  return g;
}

// Tool held in an NPC's right hand (same palm position and angle as a sword; bread/flask/bucket hang from the hand).
export function toolModel(id) {
  const g = meshOf(id);
  const w = new THREE.Group(); w.add(g);
  if (TOOL_ITEMS.has(id)) g.rotation.x = Math.PI / 2;          // handle +Y -> +Z (blade convention)
  else if (id === "pane" || id === "acqua") g.position.set(0, -0.06, 0.04);
  return w;
}
