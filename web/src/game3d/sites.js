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
const V_AT = [1132, 940], M_AT = [1170, 615];        // Valdoro's square, the middle of the mine's mountain (map pixels)
export const SITES = {
  // The forest of the bandits and Valdoro behind it, as one piece: the path still ends at the town's gate. Its middle
  // (the square, legacy WZ - 18) on the castle of the map; the path comes from Roccanera (the gate faces it), the
  // castle's keep is towards the sea.
  valdoro: site("valdoro", [0, WZ - 18], V_AT, turn([0, -1], mapToWorld(...V_AT)), (x, z) => z < -29 && z > -165 && Math.abs(x) < 46),
  // The mine: its mountain on the map's, the portal turned towards Roccanera
  miniera: site("miniera", [CX, CZ], M_AT, turn([1, 0], mapToWorld(...M_AT).map((v) => -v)), inMine),
};
const MOVED = [SITES.valdoro, SITES.miniera];
const inCastle = (x, z) => Math.abs(x - CASTLE[0]) < 300 && Math.abs(z - CASTLE[1]) < 300;
const inRoccanera = (x, z) => Math.hypot(x, z) < 90 && !SITES.valdoro.has(x, z) && !SITES.miniera.has(x, z);

/** The site a legacy point belongs to ("roccanera" for anything else of the old world). */
export const siteOf = (lx, lz) => (inCastle(lx, lz) ? "castello" : SITES.valdoro.has(lx, lz) ? "valdoro" : SITES.miniera.has(lx, lz) ? "miniera" : "roccanera");
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
export const regionOf = (x, z) => { const L = toLegacy(x, z); return L ? legacyRegionOf(L.x, L.z) : "wild"; };
export const zoneOf = (x, z) => { const r = regionOf(x, z); return r === "mine" || r === "castello" ? r : "out"; };
/** A legacy point with a turn → [x, z, turn] in the world. */
export const placeWorld = (lx, lz, ry = 0) => { const id = siteOf(lx, lz); return [...toWorld(lx, lz, id), ry + turnOf(lx, lz, id)]; };

// ---- The ground the places stand on: flat (height 0), blending into the country around them over `blend` metres.
// Shapes in each place's legacy coordinates: a circle [cx, cz, r] or a box [x0, z0, x1, z1].
export const FLATS = [
  { site: "roccanera", circle: [0, 0, 52], blend: 30 },
  { site: "valdoro", box: [-42, -160, 42, -27], blend: 24 },
  { site: "miniera", box: [CX - 33, CZ - 32, CX + 25, CZ + 32], blend: 24 },
];
// The ground has a hole where the mine's tunnels go down under its mountain (legacy, like the old meadow's)
export const MINE_HOLE = [[CX - 14, 13.6], [CX + 14, 13.6], [CX + 14, 2.6], [CX + 17, 2.6], [CX + 17, -2.6], [CX + 14, -2.6], [CX + 14, -13.6], [CX - 14, -13.6]].map(([x, z]) => [x, CZ + z]);

// ---- Roads between the places (map pixels; terrain.js lays them on the ground, the messengers ride them)
export const ROADS = {
  // from Roccanera's south-east, over the green hills, to the forest of the bandits (whose path leads to Valdoro)
  valdoro: [[884, 728], [905, 744], [930, 762], [957, 787], [985, 813], [1012, 836], [1038, 858], [1052, 870], ...[toWorld(0, -27)].map(([x, z]) => worldToMap(x, z))],
  // from Roccanera's east to the front of the mine's portal
  miniera: [[886, 705], [915, 701], [960, 690], [1000, 676], [1040, 660], [1075, 646], [1105, 634], ...[toWorld(CX + 25, CZ)].map(([x, z]) => worldToMap(x, z))],
};
export const roadWorld = (id) => ROADS[id].map(([px, py]) => mapToWorld(px, py));
