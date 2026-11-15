// Weapons and shields: low-poly, one merged vertex-coloured mesh each (same technique as body.js).
// Convention (unchanged from the old makeSword): grip at the origin, blade/haft towards +Z.
// Shields: face towards +Z, height along Y, centred on the grip.
import * as THREE from "three";
import { Part, rng } from "./body";

// Slightly glossy material for steel and wood (vertex colours), shared by all weapons and shields.
export const WEAPON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.2 });
const RUNE_GEO = new THREE.BoxGeometry(0.012, 0.018, 0.78);
const GLOW_MAT = new THREE.MeshStandardMaterial({ color: "#3a6ab0", emissive: "#2a5aa8", emissiveIntensity: 1.4, flatShading: true });

const IRON = "#6e7176", STEEL = "#8e9298", BRIGHT = "#a8acb2", DARK = "#2a2e36", LEATHER = "#3a2618", WOOD = "#4e3420", BRASS = "#7a6234", BLACK = "#1c1a1a";

// Builders are authored with the blade/haft along +Y (width = X, thickness = Z); makeWeapon rotates them to +Z.
const blade = (P, len, w, col, y0, edge) => {
  P.tube(w * 0.5, w * 0.62, y0, y0 + len * 0.86, col, 0, 0, 4, 0.24);                       // diamond-section body
  P.cone(w * 0.5, len * 0.14, col, 0, y0 + len * 0.93, 0, 0, 0, 4, 1, 0.24);                 // point
  if (edge) P.box(w * 0.16, len * 0.74, w * 0.2, edge, 0, y0 + len * 0.42, 0);               // fuller
};
const grip = (P, len, col, wrap) => {
  P.tube(0.019, 0.017, -0.02, len, col, 0, 0, 6);
  if (wrap) for (let y = 0.01; y < len - 0.01; y += 0.04) P.tube(0.021, 0.021, y, y + 0.012, wrap, 0, 0, 6);
};
const BUILDERS = {
  // Pugnale: short narrow blade, small guard, round pommel
  pugnale: (P) => { grip(P, 0.1, LEATHER); P.blob(0.026, 0.026, 0.026, IRON, 0, -0.035, 0, 6, 4); P.box(0.11, 0.022, 0.026, IRON, 0, 0.11, 0); blade(P, 0.3, 0.04, STEEL, 0.12); },
  // Spada corta: plain iron, straight guard, disc pommel
  corta: (P) => { grip(P, 0.13, LEATHER, "#2a1a10"); P.tube(0.034, 0.034, -0.05, -0.022, IRON, 0, 0, 7, 0.5); P.box(0.19, 0.026, 0.03, IRON, 0, 0.145, 0); blade(P, 0.62, 0.05, IRON, 0.16, "#55585e"); },
  // Ascia da guerra: long haft, bearded blade, back spike
  ascia: (P) => {
    P.tube(0.026, 0.022, -0.08, 0.72, WOOD, 0, 0, 6);
    for (let y = 0.0; y < 0.16; y += 0.04) P.tube(0.028, 0.028, y, y + 0.014, LEATHER, 0, 0, 6);
    P.box(0.05, 0.1, 0.05, IRON, 0, 0.64, 0);                                                  // eye of the head
    P.box(0.16, 0.08, 0.024, STEEL, 0.1, 0.66, 0);                                             // cheek
    P.box(0.05, 0.2, 0.022, BRIGHT, 0.185, 0.62, 0);                                            // bearded edge
    P.cone(0.025, 0.1, IRON, -0.07, 0.66, 0, 0, Math.PI / 2, 4);                               // back spike
    P.cone(0.018, 0.06, IRON, 0, 0.73, 0, 0, 0, 4);                                            // top spike
  },
  // Spada lunga: steel, longer grip, angled quillons, wheel pommel
  lunga: (P) => {
    grip(P, 0.2, LEATHER, "#2a1a10"); P.tube(0.04, 0.04, -0.055, -0.025, STEEL, 0, 0, 8, 0.45);
    P.box(0.14, 0.026, 0.032, STEEL, 0.065, 0.215, 0, 0, 0, 0.2); P.box(0.14, 0.026, 0.032, STEEL, -0.065, 0.215, 0, 0, 0, -0.2);
    blade(P, 0.88, 0.054, BRIGHT, 0.23, "#6e7278");
  },
  // Spadone di Valdoro: two-handed, ricasso, wide brass guard with quillon blocks, big pommel
  spadone: (P) => {
    grip(P, 0.3, "#2a1810", BRASS); P.blob(0.045, 0.04, 0.045, BRASS, 0, -0.06, 0, 7, 5);
    P.box(0.36, 0.03, 0.04, BRASS, 0, 0.32, 0); [-1, 1].forEach((s) => P.box(0.04, 0.05, 0.05, BRASS, s * 0.18, 0.33, 0));
    P.box(0.05, 0.12, 0.022, STEEL, 0, 0.4, 0);                                                // ricasso
    [-1, 1].forEach((s) => P.cone(0.02, 0.05, BRASS, s * 0.045, 0.44, 0, 0, -s * Math.PI / 2, 4));   // parrying lugs
    blade(P, 1.12, 0.072, BRIGHT, 0.34, "#7a7e84");
  },
  // Lama di Roccanera: blackened steel, swept guard, gold accents (glowing runes added separately)
  "di Roccanera": (P) => {
    grip(P, 0.24, BLACK, "#6a5428"); P.cone(0.04, 0.09, "#6a5428", 0, -0.07, 0, Math.PI, 0, 4);
    [-1, 1].forEach((s) => P.box(0.16, 0.03, 0.035, DARK, s * 0.075, 0.27, 0, 0, 0, s * 0.45));
    P.blob(0.03, 0.03, 0.03, "#6a5428", 0, 0.26, 0, 6, 4);
    blade(P, 1.0, 0.062, DARK, 0.28);
  },
};
const cache = new Map();
const ALIAS = { short: "corta", long: "lunga" };
// Weapon by sword key ("pugnale", "corta", "ascia", "lunga", "spadone", "di Roccanera").
export function makeWeapon(key) {
  key = ALIAS[key] || key;
  if (!BUILDERS[key]) key = "corta";
  if (!cache.has(key)) { const P = Part(1.5, rng(7), 0); BUILDERS[key](P); cache.set(key, P.done().rotateX(Math.PI / 2)); }
  const g = new THREE.Group();
  const m = new THREE.Mesh(cache.get(key), WEAPON_MAT); m.castShadow = true; g.add(m);
  if (key === "di Roccanera") { const rune = new THREE.Mesh(RUNE_GEO, GLOW_MAT); rune.position.z = 0.7; g.add(rune); }   // glowing fuller
  g.userData.weapon = key;
  return g;
}

// Shields. kind "round" = wooden planks, iron rim and boss; "heater" = iron heater shield with a painted field.
const shieldCache = new Map();
export function makeShieldMesh(color, kind = "heater") {
  const k = `${kind}|${color}`;
  if (!shieldCache.has(k)) {
    const P = Part(1.5, rng(11), 0);
    if (kind === "round") {
      // authored lying face-up (+Y), rotated to face +Z below
      for (let i = -2; i <= 2; i++) P.box(0.105, 0.035, 0.56 - Math.abs(i) * 0.07, i % 2 ? color : shade(color, -0.14), i * 0.105, 0, 0);   // planks
      P.tube(0.3, 0.3, -0.03, -0.012, IRON, 0, 0, 12);                                                     // iron rim disc behind
      P.cap(0.075, IRON, 0, 0.012, 0, Math.PI / 2, 1, 0.8, 1);                                              // boss
      [0, 1, 2, 3, 4, 5].forEach((i) => { const a = (i / 6) * Math.PI * 2 + 0.3; P.box(0.022, 0.022, 0.022, IRON, Math.cos(a) * 0.25, 0.022, Math.sin(a) * 0.25); }); // rivets
      P.box(0.04, 0.04, 0.16, LEATHER, 0, -0.05, 0);                                                         // grip strap behind
    } else {
      P.box(0.44, 0.38, 0.04, IRON, 0, 0.1, 0);                                                            // upper part
      P.cone(0.22, 0.36, IRON, 0, -0.27, 0, Math.PI, 0, 4, 1, 0.18);                                       // pointed lower part
      P.box(0.4, 0.34, 0.012, color, 0, 0.1, 0.022);                                                       // painted field
      P.cone(0.2, 0.32, color, 0, -0.25, 0.024, Math.PI, 0, 4, 1, 0.05);
      P.box(0.05, 0.62, 0.014, shade(color, 0.35), 0, -0.02, 0.03);                                        // pale stripe
      P.box(0.4, 0.035, 0.03, STEEL, 0, 0.28, 0.008);                                                      // top rim
      P.box(0.04, 0.16, 0.04, LEATHER, 0, 0, -0.04);                                                       // grip strap behind
    }
    const geo = P.done();
    if (kind === "round") geo.rotateX(Math.PI / 2);
    shieldCache.set(k, geo);
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(shieldCache.get(k), WEAPON_MAT); m.castShadow = true;
  g.add(m);
  return g;
}
const _s = new THREE.Color();
const shade = (hex, k) => { _s.set(hex); const h = {}; _s.getHSL(h); _s.setHSL(h.h, h.s, Math.min(1, Math.max(0, h.l * (1 + k)))); return `#${_s.getHexString()}`; };
// Shield kind of an inventory item.
export const SHIELD_KIND = { scudo_legno: "round", scudo_ferro: "heater" };
