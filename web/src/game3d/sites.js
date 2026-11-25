// Where the places stand in the world of Vasilad (the user's map, assets/mappa/: 1 pixel = 1 metre, 2048 x 1536).
// The old world was compact and is still authored that way ("legacy" coordinates, world.js): Roccanera's well at 0, 0;
// the forest path going north (-z) to the walls of Valdoro (WZ); the mine's mountain just to the west (CX). On the map
// they lie hundreds of metres apart: each moves as one rigid piece (SITES): which legacy points belong to it (has),
// which legacy point (anchor) goes to which pixel of the map (at), turned by r. The world's origin is still Roccanera's
// well (map pixel MAP.ox, MAP.oz), so Roccanera itself does not move; world x runs east, z south (the map's down).
//   toWorld(lx, lz)  a legacy point → the world (rotWorld: a legacy turn → the world)
//   toLegacy(x, z)   a world point → { x, z, site } in legacy coordinates, or null in the open country between places
//   regionOf/zoneOf  the region of a world point: as before inside the places ("village", "forest", "valdoro", "mine",
//                    "castello"), "wild" outside them
import { WZ, CX, CZ, CASTLE, legacyRegionOf } from "./world";
import { mountainHeight } from "./mountain";

export const MAP = { w: 2048, h: 1536, ox: 860, oz: 708 };
export const mapToWorld = (px, py) => [px - MAP.ox, py - MAP.oz];
export const worldToMap = (x, z) => [x + MAP.ox, z + MAP.oz];

// the turn (about the vertical, three.js' sense) that takes the direction (lx, lz) to (wx, wz)
const turn = ([lx, lz], [wx, wz]) => Math.atan2(wx, wz) - Math.atan2(lx, lz);
const site = (id, anchor, atMap, r, has) => {
  const [ax, az] = mapToWorld(...atMap);
  return { id, anchor, ax, az, r, c: Math.cos(r), s: Math.sin(r), has };
};

// The legacy mine: the mountain and the ground in front of its portal (the rock face, the lantern)
const inMine = (x, z) => { const dx = x - CX, dz = z - CZ; return dx > -34 && dx < 21.5 && Math.abs(dz) < 31 && (mountainHeight(x, z) > 0 || (dx > 12 && Math.abs(dz) < 17)); };
const V_AT = [1132, 940], M_AT = [1170, 615], B_AT = [902, 1000];   // Valdoro's square, the mine's mountain, the forest's middle
export const SITES = {
  // Valdoro (and the ground before its gate, with the knights): its square on the castle of the map, the gate facing
  // Roccanera, the castle's keep towards the sea.
  valdoro: site("valdoro", [0, WZ - 18], V_AT, turn([0, -1], mapToWorld(...V_AT)), (x, z) => z < WZ + 10 && z > -165 && Math.abs(x) < 46),
  // The forest of the bandits (its path, the camp): no longer before Valdoro's gate, but in the great forest south-west
  // of it, on the road from the hills to the western bridge (towards Dimirot); one walks its path southwards.
  bosco: site("bosco", [0, -62], B_AT, turn([0, -1], [-0.12, 0.99]), (x, z) => z < -29 && z >= WZ + 10 && Math.abs(x) < 46),
  // The mine: its mountain on the map's, the portal turned towards Roccanera
  miniera: site("miniera", [CX, CZ], M_AT, turn([1, 0], mapToWorld(...M_AT).map((v) => -v)), inMine),
};
const MOVED = [SITES.valdoro, SITES.bosco, SITES.miniera];
const inCastle = (x, z) => Math.abs(x - CASTLE[0]) < 300 && Math.abs(z - CASTLE[1]) < 300;
const inRoccanera = (x, z) => Math.hypot(x, z) < 90 && !SITES.valdoro.has(x, z) && !SITES.bosco.has(x, z) && !SITES.miniera.has(x, z);

/** The site a legacy point belongs to ("roccanera" for anything else of the old world). */
export const siteOf = (lx, lz) => (inCastle(lx, lz) ? "castello" : SITES.valdoro.has(lx, lz) ? "valdoro" : SITES.bosco.has(lx, lz) ? "bosco" : SITES.miniera.has(lx, lz) ? "miniera" : "roccanera");
/** Legacy point → world, by a given site (or the one it belongs to). */
export function toWorld(lx, lz, id = siteOf(lx, lz)) {
  const s = SITES[id];
  if (!s) return [lx, lz];
  const dx = lx - s.anchor[0], dz = lz - s.anchor[1];
  return [s.ax + s.c * dx + s.s * dz, s.az - s.s * dx + s.c * dz];
}
/** How much a legacy point's site is turned in the world. */
export const turnOf = (lx, lz, id = siteOf(lx, lz)) => SITES[id]?.r || 0;
/** A world point in the site's own legacy coordinates (wherever it is). */
export function inSite(s, x, z) {
  const dx = x - s.ax, dz = z - s.az;
  return [s.anchor[0] + s.c * dx - s.s * dz, s.anchor[1] + s.s * dx + s.c * dz];
}
/** A world point → { x, z, site } in legacy coordinates; null where no old place is (the open country). */
export function toLegacy(x, z) {
  for (const s of MOVED) { const [lx, lz] = inSite(s, x, z); if (s.has(lx, lz)) return { x: lx, z: lz, site: s.id }; }
  if (inCastle(x, z)) return { x, z, site: "castello" };
  if (inRoccanera(x, z)) return { x, z, site: "roccanera" };
  return null;
}
// (before Valdoro's walls and at the forest's sides: the open country now, no longer the forest of the old map)
export const regionOf = (x, z) => {
  const L = toLegacy(x, z);
  if (!L) return "wild";
  if (L.site === "valdoro" && L.z >= WZ) return "wild";
  if (L.site === "bosco") return Math.abs(L.x) < 34 ? "forest" : "wild";
  return legacyRegionOf(L.x, L.z);
};
export const zoneOf = (x, z) => { const r = regionOf(x, z); return r === "mine" || r === "castello" ? r : "out"; };
/** A legacy point with a turn → [x, z, turn] in the world. */
export const placeWorld = (lx, lz, ry = 0) => { const id = siteOf(lx, lz); return [...toWorld(lx, lz, id), ry + turnOf(lx, lz, id)]; };

// ---- The ground the places stand on: flat (height 0), blending into the country around them over `blend` metres.
// Shapes in each place's legacy coordinates: a circle [cx, cz, r] or a box [x0, z0, x1, z1].
export const FLATS = [
  { site: "roccanera", circle: [0, 0, 52], blend: 30 },
  { site: "valdoro", box: [-42, -160, 42, WZ + 12], blend: 24 },
  { site: "bosco", box: [-36, WZ + 8, 36, -27], blend: 20, trees: 0.5 },   // (the great forest's trees right up to it)
  { site: "miniera", box: [CX - 33, CZ - 32, CX + 25, CZ + 32], blend: 24 },
];
// The ground has a hole where the mine's tunnels go down under its mountain (legacy, like the old meadow's)
export const MINE_HOLE = [[CX - 14, 13.6], [CX + 14, 13.6], [CX + 14, 2.6], [CX + 17, 2.6], [CX + 17, -2.6], [CX + 14, -2.6], [CX + 14, -13.6], [CX - 14, -13.6]].map(([x, z]) => [x, CZ + z]);

// ---- Roads between the places (map pixels; terrain.js lays them on the ground, the messengers ride them). Where they
// meet a bridge they end at it.
const W2M = (lx, lz, id) => worldToMap(...toWorld(lx, lz, id));
export const ROADS = {
  // from Roccanera's south-east, over the green hills, to Valdoro's gate
  valdoro: [[884, 728], [915, 750], [950, 778], [985, 806], [1020, 836], [1055, 865], [1085, 893], W2M(0, WZ + 10, "valdoro")],
  // from that road, south-west into the great forest, to the bandits' path; from its far end on to the western bridge
  bosco_n: [[985, 806], [965, 835], [945, 868], [925, 905], [913, 937], W2M(0, -27, "bosco")],
  bosco_s: [W2M(0, WZ + 9, "bosco"), [893, 1075], [887, 1120], [882, 1165], [878, 1200], [875.4, 1227.6]],
  // from Valdoro's gate round its walls (west side) down to the northern bridge, and on towards Sulus
  ponte_nord: [W2M(0, WZ + 10, "valdoro"), [1094, 938], [1086, 962], [1092, 990], [1110, 1018], [1135, 1040], [1158, 1054], [1164.9, 1060.2]],
  sulus: [[1182.9, 1100.8], [1186, 1118], [1188, 1138]],
  // beyond the western bridge, towards Dimirot
  dimirot: [[914.6, 1257.9], [925, 1275], [937, 1296]],
  // from Roccanera's east to the front of the mine's portal
  miniera: [[886, 705], [915, 701], [960, 690], [1000, 676], [1040, 660], [1075, 646], [1105, 634], W2M(CX + 25, CZ, "miniera")],
};
export const roadWorld = (id) => ROADS[id].map(([px, py]) => mapToWorld(px, py));
// Stone bridges over the river (map pixels, where it is narrowest by their drawings): from one bank to the other
export const BRIDGES = [{ id: "nord", a: [1164.9, 1060.2], b: [1182.9, 1100.8] }, { id: "ovest", a: [875.4, 1227.6], b: [914.6, 1257.9] }];
// The ravines drawn on the map (map pixels): their middle line, half their width, how deep
export const RAVINES = [
  { pts: [[965, 940], [995, 954], [1025, 967], [1048, 978], [1062, 990]], w: 7, depth: 9 },          // west of Valdoro
  { pts: [[1045, 1024], [1040, 1045], [1032, 1060], [1010, 1070]], w: 2.6, depth: 4 },                   // (its thin crack)
  { pts: [[715, 775], [713, 800], [718, 822], [735, 842], [760, 851], [785, 853], [805, 855]], w: 6, depth: 8 },   // south-west of Roccanera
];
