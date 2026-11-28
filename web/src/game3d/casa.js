// The houses of Roccanera (the user, 28/11): the thatched, half-timbered house of the Pure3d "Medieval" pack
// (models/case.glb, tools/casa-paglia.py and build-case.mjs), T-shaped: a stem 3.1 m wide with the front door in its
// gable, a wing 9.5 m long across its back, a little pantry beside the stem. Everything here is in the house's own
// metres: x across, z towards its front door (+z), y up; the floor at 2 cm. engine.js turns them into the world.
//
//                 z +4.75  ┌──door──┐
//                          │  stem  │        (the stem: x -1.5..1.62)
//              pantry ┌────┤        │
//    (x -2.95..-1.5,  │    ╎        │
//     z -0.27..2.05)  └────┤        │
//       z -1.6 ┌─────────────┘        └───────────┐
//              │  west wing     hearth     east wing │   (x -4.65..4.85)
//       z -4.75└───────────────────────────────────┘
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The walls as boxes [x, z, half width (x), half depth (z)], doorways left open (the front door x -0.51..0.51 in the
// stem's gable, the pantry's opening in the stem's side). The side door the file had in the west wing's front, the
// user had it walled up (28/11: "lascia solo la porta nel corridoio, l'altra toglila": casa-paglia.py).
export const CASA_WALLS = [
  [1.62, 1.6, 0.15, 3.2], [-1.5, -0.78, 0.15, 0.85], [-1.5, 3.18, 0.15, 1.6],                       // the stem's sides
  [1.07, 4.75, 0.56, 0.15], [-1.0, 4.75, 0.5, 0.15],                                                 // its gable, beside the door
  [-2.22, 2.05, 0.73, 0.12], [-2.95, 0.89, 0.12, 1.2], [-2.22, -0.27, 0.73, 0.12],                   // the pantry
  [0.1, -4.75, 4.8, 0.15], [4.85, -3.15, 0.15, 1.65], [-4.65, -3.18, 0.15, 1.6],                    // the wing: back, ends
  [3.24, -1.55, 1.65, 0.15], [-3.08, -1.6, 1.58, 0.15],                                              // its front
];
// Inside (where a point counts as "in the house": the AI's sight, the chest): stem, wing, pantry [x0, x1, z0, z1]
const ROOMS = [[-1.5, 1.62, -1.6, 4.75], [-4.65, 4.85, -4.75, -1.55], [-2.95, -1.5, -0.27, 2.05]];
export const casaInside = (lx, lz, m = 0) => ROOMS.some(([x0, x1, z0, z1]) => lx > x0 - m && lx < x1 + m && lz > z0 - m && lz < z1 + m);
// The whole house with its roof [x0, x1, z0, z1] (what grows or stands around keeps out of it)
export const CASA_ROOF = [-5.55, 6.05, -5.45, 5.45];
// Is the world point (x, z) under the roof of one of these houses ([[x, z, turn], ...]), or within m metres of it?
export const underCasa = (houses, x, z, m = 0) => houses.some(([hx, hz, r]) => {
  const dx = x - hx, dz = z - hz, lx = Math.cos(r) * dx - Math.sin(r) * dz, lz = Math.sin(r) * dx + Math.cos(r) * dz;
  return lx > CASA_ROOF[0] - m && lx < CASA_ROOF[1] + m && lz > CASA_ROOF[2] - m && lz < CASA_ROOF[3] + m;
});
// The door: the hinge [x, z] (the leaf goes along +x from it, 1 m; it opens inwards) and the doorway's middle
export const CASA_DOORS = [{ hinge: [-0.5, 4.73], mid: [0, 4.75] }];
export const CASA_DOOR_Y = 0.1;
// The way in for whoever lives here (from outside the front door to the hearth's carpet), then to their bed
export const CASA_VIA = [[0, 6.3], [0, 3.9], [-0.55, 0.6], [0, -2.5]];
// Beds: the middle, which way the head is (+1: towards +x), where one stands beside it to lie down
export const CASA_BEDS = [{ at: [3.68, -4.05], head: 1, edge: [3.6, -3.05] }, { at: [-3.62, -4.05], head: -1, edge: [-3.55, -3.05] }];
export const CASA_BED_Y = 0.56;
export const CASA_BED_FOOT = 0.85;   // a sleeper's feet (the body's origin) this far from the bed's middle, towards its foot
export const CASA_CHEST = [2.15, -4.3];
// The hearth's fire (a light), the chest and the furniture of the castle's pack (case.glb: "arredo_" + name):
// [name, x, z, turn, scale, y]; solid: circles [x, z, r] and boxes [x, z, hw, hd]
export const CASA_FIRE = [0, 0.85, -3.95];
export const CASA_FURNITURE = [
  ["Fireplace", 0, -4.72, 0, 0.7], ["FirewoodStack", -1.55, -4.05, 0.4, 0.65], ["Carpet_Red", 0, -2.95, Math.PI / 2, 0.45],
  ["Chest_Closed", CASA_CHEST[0], CASA_CHEST[1], 0, 1], ["Shelf", 3.6, -1.95, Math.PI / 2, 0.9],
  ["Table_Small", 0.88, 1.8, 0, 0.78], ["Stool_round", 0.05, 1.15, 0, 1], ["Stool_round", 0.05, 2.45, 0.7, 1], ["Plate", 0.85, 1.35, 0.3, 0.6, 0.65],
  ["Plate", 0.9, 2.3, -0.4, 0.6, 0.65], ["Jar_Big", 1.1, 1.85, 0, 1, 0.65],
  ["Barrel_Closed", -2.42, 1.5, 0, 0.8], ["Barrel_Open", -2.4, 0.55, 0.5, 0.75], ["Bag", -1.95, 1.75, 0.8, 1], ["Bucket", -4.15, -2.15, 0, 1],
  ["Barrel_Closed", -4.1, -2.75, 0.3, 0.75],
];
export const CASA_SOLID_CIRCLES = [[0.05, 1.15, 0.25], [0.05, 2.45, 0.25], [-2.42, 1.5, 0.4], [-2.4, 0.55, 0.38], [-1.55, -4.05, 0.5], [-4.15, -2.15, 0.25], [-4.1, -2.75, 0.38]];
export const CASA_SOLID_BOXES = [[0, -4.25, 0.8, 0.5], [CASA_CHEST[0], CASA_CHEST[1], 0.5, 0.32], [3.6, -1.95, 1.0, 0.3], [0.88, 1.8, 0.47, 1.12],
  [3.68, -4.05, 1.0, 0.52], [-3.62, -4.05, 1.0, 0.52]];   // (the hearth, chest, shelf, table, beds)

// A bed along x (head at +x when head = 1): a frame of the house's planks (wood: their material), a straw mattress, a
// blanket of the given colour, a pillow. Two parts to merge with the rest of the village (nature.js addModel): the
// wood, and the cloth in one material whose colours are the vertices' (cloth: that material, shared by every bed).
export function casaBedParts(wood, cloth, blanket = "#7a2a22", head = 1) {
  const woods = [], cloths = [], col = new THREE.Color();
  const part = (list, w, h, d, x, y, z, c) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x * head, y, z);
    if (c) { col.set(c); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); }
    list.push(g);
  };
  part(woods, 1.96, 0.24, 0.98, 0, 0.26, 0);                                 // the frame
  [[-0.94, -0.45], [-0.94, 0.45], [0.94, -0.45], [0.94, 0.45]].forEach(([x, z]) => part(woods, 0.1, 0.38, 0.1, x, 0.19, z));   // legs
  part(woods, 0.08, 0.95, 1.0, 0.98, 0.5, 0);                                // headboard
  part(woods, 0.08, 0.6, 1.0, -0.98, 0.32, 0);                               // footboard
  part(cloths, 1.86, 0.14, 0.9, 0, 0.44, 0, "#b9a46e");                      // straw mattress
  part(cloths, 1.15, 0.06, 0.94, -0.33, 0.53, 0, blanket);                   // blanket over the feet
  part(cloths, 0.32, 0.1, 0.62, 0.72, 0.55, 0, "#e6dcc6");                   // pillow
  return [{ geometry: mergeGeometries(woods), material: wood }, { geometry: mergeGeometries(cloths), material: cloth }];
}
