// The ground of the whole world of Vasilad (2 x 1.5 km: 1 pixel of the user's map = 1 metre), from the layers that
// tools/world-layers.py takes from the map (mondo/): how far each point is from the coast (beaches, the sea floor),
// where mountains and hills are drawn, snow, dry (brown) ground, ice, forests. The height of a point (heightAt) is made
// of them and of a little noise; the places (sites.js FLATS) stand on flat ground at height 0, blending into the land
// around them; under the mine's mountain the ground has a hole (the tunnels go down there).
// It is drawn in tiles of 64 m (a vertex every 2 m) built around the player as it moves and dropped when far away;
// surfaceAt gives the height of the drawn surface itself (the same triangles), so feet stand on it. The sea is a
// plane at SEA_Y following the camera. Roads (sites.js ROADS) are strips of dirt laid on the ground; stone bridges
// (BRIDGES) cross the river, their decks walked on (groundAt). The land has two levels: the central highland (HIGHLAND:
// Roccanera, the hills, the mine, Valdoro, at 0) and the low lands round it (LOW), parted by cliffs where the map draws
// its escarpments and by long slopes elsewhere; everywhere the ground rolls and is bumpy, flat only under the places.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import COSTA from "./mondo/costa.png";
import RILIEVO from "./mondo/rilievo.png";
import SUOLO from "./mondo/suolo.png";
import PENDII from "./mondo/pendii.png";
import ERBA from "./terreno_erba.jpg";
import ERBA_N from "./terreno_erba_n.jpg";
import TERRA from "./terreno_terra.jpg";
import TERRA_N from "./terreno_terra_n.jpg";
import GHIACCIO from "./terreno_ghiaccio.jpg";
import GHIACCIO_N from "./terreno_ghiaccio_n.jpg";
import { MAP, SITES, FLATS, MINE_HOLE, ROADS, BRIDGES, HIGHLAND, STEPS, LOW, VALDORO_HIGH, VALDORO_Y, inSite, roadWorld, mapToWorld } from "./sites";
import { groundMat } from "./ground";
import { waterMaterial } from "./water";

export const SEA_Y = -12.5;
const STEP = 2, TILE = 32;                       // a vertex every 2 m, 32 cells (64 m) a tile
const GW = MAP.w / STEP + 1, GH = MAP.h / STEP + 1;   // vertices of the whole map
const TX = MAP.w / STEP / TILE, TZ = MAP.h / STEP / TILE;
const LOAD_R = 190, DROP_R = 260;                 // tiles nearer than this are built, farther ones dropped
// Beyond SPLIT metres from the camera the ground is the far ground: one coarse mesh of the whole map (a vertex every
// FAR_STEP m, same heights and colours), so hills, mountains and coasts are seen far off. The tiles stop a little after
// SPLIT (a narrow overlap, no gap), the far ground starts at SPLIT.
const SPLIT = 170, FAR_STEP = 16;

// ---- the layers (8 bits, read through a canvas)
let L = null;
async function readImage(src) {
  const img = new Image(); img.src = src;
  await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
}
/** Loads the map's layers (once, before the game starts). */
export async function loadTerrain() {
  if (L) return;
  const [costa, rilievo, suolo, pendii] = await Promise.all([readImage(COSTA), readImage(RILIEVO), readImage(SUOLO), readImage(PENDII)]);
  L = { costa, rilievo, suolo, pendii };
}
// bilinear sample of channel ch of a layer at map pixel (px, py); out of the layer: def
const sample = (lay, px, py, ch, def) => {
  const s = MAP.w / lay.w, u = px / s - 0.5, v = py / s - 0.5;
  if (u < 0 || v < 0 || u > lay.w - 1 || v > lay.h - 1) return def;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i1 = Math.min(i + 1, lay.w - 1), j1 = Math.min(j + 1, lay.h - 1), d = lay.d, W = lay.w;
  const a = d[(j * W + i) * 4 + ch], b = d[(j * W + i1) * 4 + ch], c = d[(j1 * W + i) * 4 + ch], e = d[(j1 * W + i1) * 4 + ch];
  return (a + (b - a) * fu) * (1 - fv) + (c + (e - c) * fu) * fv;
};

// ---- smooth noise (value noise, -1..1)
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return ((a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz) * 2 - 1;
}
const fbm = (x, z) => vnoise(x, z) * 0.6 + vnoise(x * 2.03 + 17.3, z * 2.03 - 5.1) * 0.28 + vnoise(x * 4.1 - 3.7, z * 4.1 + 9.2) * 0.12;
const ridge = (x, z) => 1 - Math.abs(vnoise(x, z)) * 0.7 - Math.abs(vnoise(x * 2.1 + 4.4, z * 2.1 - 2.2)) * 0.3;   // 0..1, sharp crests
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the places' flat ground
const FL = FLATS.map((f) => ({ ...f, s: SITES[f.site] }));
/** How much of the places' flat ground is at a world point (1 on it, 0 out in the country) and its height. */
export function flatAt(x, z) {
  let w = 0, y = 0;
  for (const f of FL) {
    const [lx, lz] = f.s ? inSite(f.s, x, z) : [x, z];
    let d;
    if (f.circle) d = Math.hypot(lx - f.circle[0], lz - f.circle[1]) - f.circle[2];
    else { const [x0, z0, x1, z1] = f.box, qx = Math.max(x0 - lx, lx - x1, 0), qz = Math.max(z0 - lz, lz - z1, 0); d = Math.hypot(qx, qz); }
    if (d < f.blend) { const k = 1 - smooth(0, f.blend, d); if (k > w) { w = k; y = f.y || 0; } }
  }
  return [w, y];
}
/** Whether trees of the open country may grow at a world point: not on the places' ground (nor too near it). */
export function treeFree(x, z) {
  for (const f of FL) {
    const [lx, lz] = f.s ? inSite(f.s, x, z) : [x, z];
    let d;
    if (f.circle) d = Math.hypot(lx - f.circle[0], lz - f.circle[1]) - f.circle[2];
    else { const [x0, z0, x1, z1] = f.box, qx = Math.max(x0 - lx, lx - x1, 0), qz = Math.max(z0 - lz, lz - z1, 0); d = Math.hypot(qx, qz); }
    if (d < (f.trees ?? f.blend * 0.45)) return false;
  }
  return true;
}
const segD = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
// ---- the central highland: inside its outline at 0, outside down at LOW; its edge a cliff near the drawn escarpments
const HL = HIGHLAND.map(([px, py, cliff]) => [...mapToWorld(px, py), !!cliff]);
const HSEG = HL.map((a, i) => { const b = HL[(i + 1) % HL.length]; return { a, b, cliff: a[2] && b[2] }; });
const CLIFFS = HSEG.filter((sg) => sg.cliff);
const inPoly = (x, z) => {
  let inside = false;
  for (let i = 0, j = HL.length - 1; i < HL.length; j = i++) {
    const [xi, zi] = HL[i], [xj, zj] = HL[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
/** How much a world point is up on the highland (1) or down in the low lands (0). */
export function highlandAt(x, z) {
  let d = Infinity, dc = Infinity;
  for (const sg of HSEG) d = Math.min(d, segD(x, z, sg.a, sg.b));
  for (const sg of CLIFFS) dc = Math.min(dc, segD(x, z, sg.a, sg.b));
  const sd = inPoly(x, z) ? d : -d, sharp = 1 - smooth(8, 34, dc), w = 70 + (5 - 70) * sharp;
  return smooth(-w / 2, w / 2, sd + (sharp > 0 ? fbm(x / 9, z / 9) * 2.4 * sharp : 0));   // (the cliff's line a little irregular)
}
// ---- Valdoro's plateau (sites.js VALDORO_HIGH): inside its outline the ground is at VALDORO_Y (barely rolling), the
// hills that were there levelled into it; its sides cliffs where the cracks are drawn, long slopes elsewhere
const VP = VALDORO_HIGH.map(([px, py, cliff]) => [...mapToWorld(px, py), !!cliff]);
const VSEG = VP.map((a, i) => { const b = VP[(i + 1) % VP.length]; return { a, b, cliff: a[2] && b[2] }; });
const VBOX = [Math.min(...VP.map((p) => p[0])) - 50, Math.max(...VP.map((p) => p[0])) + 50, Math.min(...VP.map((p) => p[1])) - 50, Math.max(...VP.map((p) => p[1])) + 50];
function plateauAt(x, z) {
  if (x < VBOX[0] || x > VBOX[1] || z < VBOX[2] || z > VBOX[3]) return 0;
  let d = Infinity, dc = Infinity, inside = false;
  for (const sg of VSEG) { const dd = segD(x, z, sg.a, sg.b); d = Math.min(d, dd); if (sg.cliff) dc = Math.min(dc, dd); }
  for (let i = 0, j = VP.length - 1; i < VP.length; j = i++) {
    const [xi, zi] = VP[i], [xj, zj] = VP[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  const sd = inside ? d : -d, sharp = 1 - smooth(8, 30, dc), w = 64 + (5 - 64) * sharp;
  return smooth(-w / 2, w / 2, sd + (sharp > 0 ? fbm(x / 9 + 3.3, z / 9 - 1.4) * 2.4 * sharp : 0));   // (the cliff's line a little irregular)
}
// ---- the smaller steps: a short steep rise to the high side, its top sloping down again over `fade` metres
const ST = STEPS.map((st) => {
  const pts = st.pts.map(([px, py]) => mapToWorld(px, py)), [hx, hz] = mapToWorld(...st.high), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  let best = 0, bd = Infinity;
  for (let i = 1; i < pts.length; i++) { const dd = segD(hx, hz, pts[i - 1], pts[i]); if (dd < bd) { bd = dd; best = i; } }
  const [ax, az] = pts[best - 1], [bx, bz] = pts[best], sign = Math.sign((bx - ax) * (hz - az) - (bz - az) * (hx - ax)) || 1;
  return { pts, h: st.h, fade: st.fade, sign, x0: Math.min(...xs) - st.fade, x1: Math.max(...xs) + st.fade, z0: Math.min(...zs) - st.fade, z1: Math.max(...zs) + st.fade };
});
function stepAt(x, z) {
  let up = 0;
  for (const st of ST) {
    if (x < st.x0 || x > st.x1 || z < st.z0 || z > st.z1) continue;
    let bd = Infinity, side = 0;
    for (let i = 1; i < st.pts.length; i++) {
      const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i], dd = segD(x, z, st.pts[i - 1], st.pts[i]);
      if (dd < bd) { bd = dd; side = Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax)) * st.sign; }
    }
    const s = side * bd, ends = Math.min(Math.hypot(x - st.pts[0][0], z - st.pts[0][1]), Math.hypot(x - st.pts.at(-1)[0], z - st.pts.at(-1)[1]));
    up = Math.max(up, st.h * smooth(-1.2, 1.8, s) * (s > 0 ? 1 - smooth(1.8, st.fade, s) : 1) * smooth(0, 14, ends));
  }
  return up;
}
// ---- the roads (their drawn lines), so the ground under them is smoother
const RSEG = [], RCELL = new Map();
Object.values(ROADS).forEach((pts) => pts.forEach((p, i) => { if (i) RSEG.push([mapToWorld(...pts[i - 1]), mapToWorld(...p)]); }));
RSEG.forEach((sg, k) => {
  const [[ax, az], [bx, bz]] = sg;
  for (let j = Math.floor((Math.min(az, bz) - 12) / 32); j <= Math.floor((Math.max(az, bz) + 12) / 32); j++)
    for (let i = Math.floor((Math.min(ax, bx) - 12) / 32); i <= Math.floor((Math.max(ax, bx) + 12) / 32); i++) (RCELL.get(`${i}|${j}`) || RCELL.set(`${i}|${j}`, []).get(`${i}|${j}`)).push(k);
});
const roadDist = (x, z) => { let d = 40; for (const k of RCELL.get(`${Math.floor(x / 32)}|${Math.floor(z / 32)}`) || []) d = Math.min(d, segD(x, z, ...RSEG[k])); return d; };
const inHole = (x, z) => {
  const [lx, lz] = inSite(SITES.miniera, x, z);
  let inside = false;
  for (let i = 0, j = MINE_HOLE.length - 1; i < MINE_HOLE.length; j = i++) {
    const [xi, zi] = MINE_HOLE[i], [xj, zj] = MINE_HOLE[j];
    if ((zi > lz) !== (zj > lz) && lx < ((xj - xi) * (lz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

/** Distance from the coast at a world point (metres; + inland, - at sea). */
export const coastAt = (x, z) => (L ? sample(L.costa, x + MAP.ox, z + MAP.oz, 0, 0) - 128 : 10);
/** The ground's layers at a world point (0..1): dry, snow, ice, forest, mountain, hill. */
export function layersAt(x, z) {
  const px = x + MAP.ox, pz = z + MAP.oz;
  return {
    dry: sample(L.suolo, px, pz, 1, 0) / 255, snow: sample(L.suolo, px, pz, 0, 0) / 255, ice: sample(L.suolo, px, pz, 2, 0) / 255,
    forest: sample(L.rilievo, px, pz, 2, 0) / 255, mount: sample(L.rilievo, px, pz, 0, 0) / 255, hill: sample(L.rilievo, px, pz, 1, 0) / 255,
    foot: sample(L.pendii, px, pz, 0, 0) / 255,
  };
}
// ---- how deep inside a forest a point is: the distance (metres) from the forest's edge, where the forest layer falls
// under 0.35 (the forests of vegetation.js); 0 outside. A distance transform of the layer, made the first time it is
// asked (two passes over 512 x 384 pixels of 4 m). The great southern forest is 139 m deep at its heart, the eastern
// ones about 50, the groves of the plains about 20.
let FD = null;
function forestDepthField() {
  const lay = L.rilievo, W = lay.w, H = lay.h, d = new Float32Array(W * H), D2 = Math.SQRT2;
  for (let k = 0; k < W * H; k++) d[k] = lay.d[k * 4 + 2] > 89 ? 1e9 : 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (!d[k]) continue;
    let m = d[k];
    if (i > 0) m = Math.min(m, d[k - 1] + 1);
    if (j > 0) { m = Math.min(m, d[k - W] + 1); if (i > 0) m = Math.min(m, d[k - W - 1] + D2); if (i < W - 1) m = Math.min(m, d[k - W + 1] + D2); }
    d[k] = m;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; if (!d[k]) continue;
    let m = d[k];
    if (i < W - 1) m = Math.min(m, d[k + 1] + 1);
    if (j < H - 1) { m = Math.min(m, d[k + W] + 1); if (i < W - 1) m = Math.min(m, d[k + W + 1] + D2); if (i > 0) m = Math.min(m, d[k + W - 1] + D2); }
    d[k] = m;
  }
  return { w: W, h: H, d };
}
/** How deep inside a forest a world point is (metres from its edge; 0 outside the forests). */
export function forestDepthAt(x, z) {
  if (!L) return 0;
  FD ||= forestDepthField();
  const s = MAP.w / FD.w, u = (x + MAP.ox) / s - 0.5, v = (z + MAP.oz) / s - 0.5;
  if (u < 0 || v < 0 || u > FD.w - 1 || v > FD.h - 1) return 0;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i1 = Math.min(i + 1, FD.w - 1), j1 = Math.min(j + 1, FD.h - 1), d = FD.d, W = FD.w;
  const a = d[j * W + i], b = d[j * W + i1], c = d[j1 * W + i], e = d[j1 * W + i1];
  return ((a + (b - a) * fu) * (1 - fv) + (c + (e - c) * fu) * fv) * s;
}
/** The height of the ground at a world point (the smooth one; what is drawn and walked on is surfaceAt). */
export function heightAt(x, z) {
  if (!L) return 0;
  const px = x + MAP.ox, pz = z + MAP.oz, d = sample(L.costa, px, pz, 0, 0) - 128;
  // the land's level: the highland's (its places at 0) or the low lands'; the swells below bring each to its middle
  const base = -1.6 + LOW * (1 - highlandAt(x, z));
  let h;
  if (d < 0) h = Math.max(SEA_Y - 12, SEA_Y - 0.25 + d * 0.32);                         // under the water: deep soon
  else h = SEA_Y + 0.15 + (base - SEA_Y - 0.15) * smooth(0, 8 + (base - SEA_Y) * 2.2, d);   // the shore up to the land
  if (d > 2) {
    const inland = smooth(2, 40, d), road = 1 - smooth(3.5, 10, roadDist(x, z));
    // towards the mountains and the hills the ground climbs long before them, rougher and rougher (their feet)
    const foot = sample(L.pendii, px, pz, 0, 0) / 255, footH = sample(L.pendii, px, pz, 1, 0) / 255, rough = 1 + foot * 1.8 + footH * 1.1;
    h += (foot ** 1.15 * 24 + footH ** 1.2 * 6) * (0.65 + 0.35 * fbm(x / 55 + 1.7, z / 55 + 4.2)) * inland;
    if (foot > 0.05) h += (ridge(x / 46 + 2.2, z / 46 - 7.1) - 0.55) * 6 * foot * inland;     // (crests and gullies)
    // the ground is never flat: long swells, humps, little bumps (fewer on the roads)
    h += (fbm(x / 140, z / 140) * 2.2 + 1.6) * smooth(6, 50, d);
    h += (fbm(x / 38 + 7.7, z / 38 - 2.1) * 1.9 * rough * (1 - road * 0.6) + (vnoise(x / 12.5, z / 12.5) * 0.5 * rough + vnoise(x / 5.5 + 3.1, z / 5.5 - 8.4) * 0.16) * (1 - road)) * inland;
    const hill = sample(L.rilievo, px, pz, 1, 0) / 255;
    if (hill > 0.01) h += 10 * hill ** 1.2 * (0.6 + 0.4 * fbm(x / 60 + 3.3, z / 60)) * inland;
    const m = sample(L.rilievo, px, pz, 0, 0) / 255;
    if (m > 0.01) h += (70 * m ** 1.6 * (0.5 + 0.5 * ridge(x / 95, z / 95)) + 8 * m * fbm(x / 20, z / 20)) * inland;
    h += stepAt(x, z);
  }
  const pw = plateauAt(x, z) * smooth(1, 12, d);                                 // Valdoro's plateau (never over the sea)
  if (pw > 0) h += (VALDORO_Y + fbm(x / 70 + 5.1, z / 70 - 2.7) * 1.2 + vnoise(x / 13, z / 13) * 0.3 - h) * pw;
  const [w, fy] = flatAt(x, z);
  if (w > 0) h += (fy - h) * w;
  return h;
}

// ---- the heights of the grid (computed a tile at a time, when first needed)
const H = new Float32Array(GW * GH), done = new Uint8Array(TX * TZ);
function ensureTile(ti, tj) {
  if (ti < 0 || tj < 0 || ti >= TX || tj >= TZ || done[tj * TX + ti]) return;
  done[tj * TX + ti] = 1;
  for (let j = tj * TILE; j <= (tj + 1) * TILE; j++) for (let i = ti * TILE; i <= (ti + 1) * TILE; i++)
    H[j * GW + i] = heightAt(i * STEP - MAP.ox, j * STEP - MAP.oz);
}
const gridH = (i, j) => {
  if (i < 0 || j < 0 || i >= GW || j >= GH) return SEA_Y - 8;
  ensureTile(Math.min(TX - 1, Math.floor(i / TILE)), Math.min(TZ - 1, Math.floor(j / TILE)));
  return H[j * GW + i];
};
/** The height of the drawn ground at a world point (the same triangles as the tiles). */
export function surfaceAt(x, z) {
  const u = (x + MAP.ox) / STEP, v = (z + MAP.oz) / STEP, i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
  const a = gridH(i, j), b = gridH(i, j + 1), c = gridH(i + 1, j + 1), d = gridH(i + 1, j);
  return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
}
// ---- the bridges: a deck from bank to bank (3 m more on each), rising in the middle
const ARCH = 2.0, HALF = 1.9;                     // the deck's rise in the middle; half the walkable width
const BR = BRIDGES.map((b) => {
  const [ax, az] = mapToWorld(...b.a), [bx, bz] = mapToWorld(...b.b), l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
  return { id: b.id, ax: ax - ux * 3, az: az - uz * 3, ux, uz, L: l + 6, yaw: Math.atan2(ux, uz), hA: null, hB: null };
});
const deckH = (b, t) => {
  if (b.hA === null) { b.hA = surfaceAt(b.ax, b.az) + 0.12; b.hB = surfaceAt(b.ax + b.ux * b.L, b.az + b.uz * b.L) + 0.12; }
  return b.hA + (b.hB - b.hA) * t + ARCH * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
};
const onBridge = (x, z, m = 0) => {
  for (const b of BR) {
    const dx = x - b.ax, dz = z - b.az, t = (dx * b.ux + dz * b.uz) / b.L, lat = -dx * b.uz + dz * b.ux;
    if (t >= 0 && t <= 1 && Math.abs(lat) <= HALF + 0.35 + m) return { b, t, lat };
  }
  return null;
};
/** The ground one stands on at a world point: a bridge's deck, or the drawn ground. */
export function groundAt(x, z) {
  const s = surfaceAt(x, z), o = onBridge(x, z);
  return o ? Math.max(s, deckH(o.b, o.t)) : s;
}
/** On a bridge's deck (between its parapets). */
export const onDeck = (x, z) => { const o = onBridge(x, z); return !!o && Math.abs(o.lat) <= HALF + 0.05; };
/** On a bridge (or right by it): the point kept between its parapets; else null. */
export function bridgeKeep(x, z) {
  const o = onBridge(x, z, 1.2);
  if (!o || Math.abs(o.lat) <= HALF) return null;
  const lat = Math.sign(o.lat) * HALF, along = o.t * o.b.L;
  return [o.b.ax + o.b.ux * along - o.b.uz * lat, o.b.az + o.b.uz * along + o.b.ux * lat];
}
/** Water too deep to wade at a world point (the sea, the river; out of the map), not on a bridge (the ravines are
 *  dry, however deep). */
export const deepWater = (x, z) => coastAt(x, z) < -4.5 && !onBridge(x, z);

// ---- the material: grass and dry ground by the map's colours, rock on the steep slopes, snow, ice, sand by the sea
const TERRAIN_V = `attribute vec4 aW;
varying vec4 vW;
varying vec3 tWP, tWN;`;
const TERRAIN_F = `uniform sampler2D tGrass, tDirt, tGrassN, tDirtN, tIce, tIceN;
varying vec4 vW;
varying vec3 tWP, tWN;
float tHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float tNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( tHash( i ), tHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( tHash( i + vec2( 0.0, 1.0 ) ), tHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
`;
const TERRAIN_MAP = `
	if ( ( distance( tWP.xz, cameraPosition.xz ) < ${SPLIT}.0 ) == T_FAR ) discard;   // (the tiles near, the far ground far)
	vec2 tUv = tWP.xz / 2.4;                                                        // (the grass photo's own size; as the meadows of engine.js)
	vec2 tUvB = mat2( 0.8, -0.6, 0.6, 0.8 ) * tWP.xz / 5.52 + vec2( 0.37, 0.61 );
	vec2 tUvD = tWP.xz / 2.6;
	float tFar = smoothstep( 18.0, 70.0, distance( tWP, cameraPosition ) );
	vec3 tG = mix( texture2D( tGrass, tUv ).rgb, texture2D( tGrass, tUvB ).rgb, smoothstep( 0.3, 0.7, tNoise( tWP.xz * 0.07 ) ) * 0.55 );
	tG = mix( tG, textureLod( tGrass, tUv, 12.0 ).rgb, tFar * 0.6 ) * vec3( 0.97, 1.0, 0.88 );
	vec3 tD = texture2D( tDirt, tUvD ).rgb;
	tD = mix( tD, textureLod( tDirt, tUvD, 12.0 ).rgb, tFar * 0.5 );
	float tLum = dot( tD, vec3( 0.33 ) );
	float tV = tNoise( tWP.xz * 0.03 + 7.1 ) * 0.65 + tNoise( tWP.xz * 0.13 + 3.7 ) * 0.35;
	float tDry = clamp( vW.x * 0.85 + ( tNoise( tWP.xz * 0.045 + 11.3 ) - 0.5 ) * 0.35, 0.0, 1.0 );
	vec3 tCol = mix( tG, mix( tG * vec3( 1.12, 1.0, 0.7 ), tD * vec3( 1.0, 0.92, 0.78 ), 0.55 ), tDry );
	tCol *= 1.0 + 0.16 * ( tV * 2.0 - 1.0 );
	tCol *= 1.0 - 0.4 * smoothstep( 0.05, 0.8, vW.w );                              // under the forests: their shade
	float tRock = smoothstep( 0.82, 0.62, normalize( tWN ).y );                    // steep: bare rock
	tCol = mix( tCol, mix( tD, vec3( tLum ), 0.35 ) * vec3( 1.08, 1.04, 1.0 ), tRock );
	float tSand = smoothstep( ${(SEA_Y + 0.75).toFixed(2)}, ${(SEA_Y + 0.25).toFixed(2)}, tWP.y );   // by the water: sand
	tCol = mix( tCol, vec3( 0.80, 0.72, 0.54 ) * ( 0.75 + 0.5 * tLum ), tSand * ( 1.0 - tRock ) );
	tCol = mix( tCol, vec3( 0.06, 0.18, 0.32 ), smoothstep( ${(SEA_Y + 0.05).toFixed(2)}, ${(SEA_Y - 2.2).toFixed(2)}, tWP.y ) * 0.85 );   // under the water: its colour (water.js)
	float tSnow = vW.y * ( 1.0 - tRock * 0.6 );
	tCol = mix( tCol, vec3( 0.9, 0.93, 0.97 ) * ( 0.82 + 0.36 * tLum ), tSnow );
	// the ice of the north (the user's ICE009, terreno_ghiaccio.jpg): its photo, 6.5 m a tile, a second one across it
	// here and there against the repetition; far off, its average a little lighter and bluer (it reads as ice). Only
	// where there is ice (the photos are not read elsewhere: the phone's work)
	vec2 tUvI = tWP.xz / 6.5;
	vec2 tUvI2 = mat2( 0.94, -0.34, 0.34, 0.94 ) * tWP.xz / 9.7 + vec2( 0.31, 0.77 );
	float tIk2 = smoothstep( 0.35, 0.65, tNoise( tWP.xz * 0.045 + 5.3 ) ) * 0.6;
	float tIceK = smoothstep( 0.18, 0.6, vW.z + ( tNoise( tWP.xz * 0.09 + 2.9 ) - 0.5 ) * 0.3 );
	if ( tIceK > 0.0 ) {
		vec3 tI = mix( texture2D( tIce, tUvI ).rgb, texture2D( tIce, tUvI2 ).rgb, tIk2 ) * vec3( 1.04, 1.07, 1.12 );
		tI = mix( tI, textureLod( tIce, tUvI, 12.0 ).rgb * vec3( 1.22, 1.27, 1.34 ), tFar * 0.7 );
		tCol = mix( tCol, tI, tIceK );
	}
	diffuseColor.rgb *= tCol;
	float tRelief = 1.0 - vW.y * ( 1.0 - tIceK ) * 0.8;
`;
// the ice shines where its photo is smooth (its roughness map, in the blue of its normal map)
const TERRAIN_ROUGH = `#include <roughnessmap_fragment>
	if ( tIceK > 0.0 ) roughnessFactor = mix( roughnessFactor, mix( texture2D( tIceN, tUvI ).b, 1.0, 0.25 + tFar * 0.5 ), tIceK );
`;
const TERRAIN_NORMAL = `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 tMapN = mix( texture2D( tGrassN, tUv ).xyz, texture2D( tDirtN, tUvD ).xyz, clamp( tDry * 0.6 + tRock, 0.0, 1.0 ) ) * 2.0 - 1.0;
	tMapN.xy *= normalScale * tRelief * ( 1.0 - tFar * 0.7 );
	// the ice's own relief (x turned: this frame's tangent is -x, the photo's +x; its z rebuilt: blue is roughness)
	if ( tIceK > 0.0 ) {
		vec2 tIn = mix( texture2D( tIceN, tUvI ).xy, texture2D( tIceN, tUvI2 ).xy, tIk2 ) * 2.0 - 1.0;
		tIn *= vec2( -1.0, 1.0 ) * ( 1.0 - tFar * 0.65 );
		tMapN = mix( tMapN, vec3( tIn, sqrt( max( 0.0, 1.0 - dot( tIn, tIn ) ) ) ), tIceK );
	}
	vec3 tN = normalize( tWN ), tT = normalize( cross( vec3( 0.0, 0.0, 1.0 ), tN ) ), tB = cross( tN, tT );
	normal = normalize( ( viewMatrix * vec4( normalize( tT * tMapN.x + tB * tMapN.y + tN * tMapN.z ), 0.0 ) ).xyz );
#endif
`;
const mats = {};
function terrainMat(renderer, far = false) {
  if (mats[far]) return mats[far];
  const L2 = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (src, srgb) => { const t = L2.load(src); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const grass = tex(ERBA, true), dirt = tex(TERRA, true), grassN = tex(ERBA_N), dirtN = tex(TERRA_N), ice = tex(GHIACCIO, true), iceN = tex(GHIACCIO_N);
  // (map and normalMap only switch three.js' code for them on: the terrain samples its own textures)
  const mat = new THREE.MeshStandardMaterial({ map: grass, normalMap: grassN, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: grass }, tDirt: { value: dirt }, tGrassN: { value: grassN }, tDirtN: { value: dirtN }, tIce: { value: ice }, tIceN: { value: iceN } });
    sh.vertexShader = TERRAIN_V + "\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvW = aW; tWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; tWN = normal;");
    sh.fragmentShader = `#define T_FAR ${far}\n` + TERRAIN_F + sh.fragmentShader.replace("#include <map_fragment>", far ? TERRAIN_MAP : TERRAIN_MAP.replace(`< ${SPLIT}.0`, `< ${SPLIT + 10}.0`))
      .replace("#include <roughnessmap_fragment>", TERRAIN_ROUGH).replace("#include <normal_fragment_maps>", TERRAIN_NORMAL);
  };
  mat.customProgramCacheKey = () => (far ? "terrain-far" : "terrain-1");
  return (mats[far] = mat);
}

// ---- the far ground: the whole map, coarse (heights from heightAt, as the tiles' grid; normals and layers likewise)
function buildFar(material) {
  const nx = MAP.w / FAR_STEP + 1, nz = MAP.h / FAR_STEP + 1, pos = new Float32Array(nx * nz * 3), w = new Float32Array(nx * nz * 4), hs = new Float32Array(nx * nz);
  for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
    const x = a * FAR_STEP - MAP.ox, z = b * FAR_STEP - MAP.oz, k = b * nx + a, ly = layersAt(x, z);
    hs[k] = heightAt(x, z); pos.set([x, hs[k], z], k * 3); w.set([ly.dry, ly.snow, ly.ice, ly.forest], k * 4);
  }
  const H = (a, b) => hs[Math.min(nz - 1, Math.max(0, b)) * nx + Math.min(nx - 1, Math.max(0, a))], nrm = new Float32Array(nx * nz * 3);
  for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
    const gx = H(a - 1, b) - H(a + 1, b), gz = H(a, b - 1) - H(a, b + 1), gy = 2 * FAR_STEP, l = Math.hypot(gx, gy, gz);
    nrm.set([gx / l, gy / l, gz / l], (b * nx + a) * 3);
  }
  const idx = [];
  for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a, q = p + nx, r = q + 1, d = p + 1; idx.push(p, q, d, q, r, d); }   // (facing up)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("aW", new THREE.BufferAttribute(w, 4)); geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(nx * nz * 2), 2));
  geo.setIndex(idx); geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, material); m.matrixAutoUpdate = false;
  return m;
}

// ---- the tiles
function buildTile(ti, tj, material) {
  const n = TILE + 1, pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3), w = new Float32Array(n * n * 4);
  let deep = true;
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
    const i = ti * TILE + a, j = tj * TILE + b, k = b * n + a, x = i * STEP - MAP.ox, z = j * STEP - MAP.oz, h = gridH(i, j);
    pos.set([x, h, z], k * 3);
    if (h > SEA_Y - 3.5) deep = false;
    const nx = gridH(i - 1, j) - gridH(i + 1, j), nz = gridH(i, j - 1) - gridH(i, j + 1), ny = 2 * STEP, l = Math.hypot(nx, ny, nz);
    nrm.set([nx / l, ny / l, nz / l], k * 3);
    const ly = layersAt(x, z);
    w.set([ly.dry, ly.snow, ly.ice, ly.forest], k * 4);
  }
  if (deep) return null;                                  // (only deep sea: the water covers it)
  const holeTile = Math.hypot((ti + 0.5) * TILE * STEP - MAP.ox - SITES.miniera.ax, (tj + 0.5) * TILE * STEP - MAP.oz - SITES.miniera.az) < 90;
  const idx = [];
  for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
    const p = b * n + a, q = p + n, r = q + 1, d = p + 1;    // a (i, j), b (i, j + 1), c (i + 1, j + 1), d (i + 1, j)
    if (holeTile) {
      const cx = (ti * TILE + a + 0.5) * STEP - MAP.ox, cz = (tj * TILE + b + 0.5) * STEP - MAP.oz;
      if (inHole(cx, cz)) continue;                       // the mine's tunnels go down here
    }
    idx.push(p, q, d, q, r, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("aW", new THREE.BufferAttribute(w, 4));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * n * 2), 2));   // (three.js wants one for the maps)
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}

// the roads' points, by cells of 8 m (whether a point is near a road)
const roadCells = new Map();
/** Whether a world point is within r metres of a road. */
export function nearRoad(x, z, r) {
  const ci = Math.floor(x / 8), cj = Math.floor(z / 8), n = Math.ceil(r / 8);
  for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    const list = roadCells.get(`${i}|${j}`);
    if (list) for (const p of list) if (Math.hypot(p.x - x, p.z - z) < r) return true;
  }
  return false;
}
function bridgeMesh(b, stone) {
  const mat = stone || new THREE.MeshStandardMaterial({ color: "#8f8a80", roughness: 0.95 });
  const geos = [], n = Math.max(10, Math.round(b.L / 2)), m4 = new THREE.Matrix4(), e = new THREE.Euler(0, 0, 0, "YXZ");
  const box = (w, h, d, x, y, z, pitch) => { const g = new THREE.BoxGeometry(w, h, d); e.set(pitch, b.yaw, 0); g.applyMatrix4(m4.makeRotationFromEuler(e).setPosition(x, y, z)); geos.push(g); };
  const at = (t) => [b.ax + b.ux * b.L * t, deckH(b, t), b.az + b.uz * b.L * t];
  for (let k = 0; k < n; k++) {
    const [x0, y0, z0] = at(k / n), [x1, y1, z1] = at((k + 1) / n), len = Math.hypot(x1 - x0, y1 - y0, z1 - z0) + 0.06, pitch = -Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
    box(4.7, 0.8, len, mx, my - 0.4, mz, pitch);                                                   // the deck
    [-1, 1].forEach((sd) => box(0.38, 0.95, len, mx + b.uz * 2.16 * sd, my + 0.44, mz - b.ux * 2.16 * sd, pitch));   // parapets
  }
  // piers where the river is under the deck, from its bed up to the deck
  for (const t of b.L > 30 ? [0.27, 0.5, 0.73] : [0.5]) {
    const [x, y, z] = at(t), bed = surfaceAt(x, z);
    if (bed > SEA_Y) continue;
    const h = y - 0.8 - (bed - 0.5);
    box(4.9, h, 2.6, x, bed - 0.5 + h / 2, z, 0);
  }
  const geo = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.world = true;
  return mesh;
}

/** The ground, the sea, the roads and the bridges: call update(camera position) every frame. opts.stone: the bridges'
 *  material. */
export function createTerrain(scene, renderer, opts = {}) {
  roadCells.clear();
  const material = terrainMat(renderer), tiles = new Map(), group = new THREE.Group();
  group.userData.world = true; scene.add(group);
  const farGround = buildFar(terrainMat(renderer, true)); group.add(farGround);   // (beyond SPLIT: hills, mountains, coasts)
  // the sea: a wide plane following the camera, the user's calm sea on it (water.js); it fills the rivers too
  const seaMat = waterMaterial(renderer, MAP);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), seaMat);   // (as far as the camera sees)
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; sea.renderOrder = 1; sea.userData.world = true;
  scene.add(sea);
  // the roads: a strip of dirt following the ground (a little above it), 3.4 m wide, smoothed between the points
  const roadMat = groundMat(renderer, "terra", { scale: 2.6, tint: "#efe6d8", vary: 0.12, dry: 0 });
  roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -2; roadMat.polygonOffsetUnits = -2;
  const roads = Object.keys(ROADS).map((id) => {
    const pts = roadWorld(id).map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), len = curve.getLength(), n = Math.max(2, Math.round(len / 2));
    const half = 1.7, ps = [], idx = [], uv = [];
    for (let k = 0; k <= n; k++) {
      const p = curve.getPointAt(k / n), t = curve.getTangentAt(k / n), sx = -t.z, sz = t.x, l = Math.hypot(sx, sz) || 1;
      [-1, -0.5, 0, 0.5, 1].forEach((f) => { const x = p.x + (sx / l) * half * f, z = p.z + (sz / l) * half * f; ps.push(x, groundAt(x, z) + 0.05, z); uv.push(0, 0); });
      if (k) for (let c = 0; c < 4; c++) { const a = (k - 1) * 5 + c, b = a + 5; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // (facing up)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, roadMat); m.receiveShadow = true; m.userData.world = true; scene.add(m);
    return { id, mesh: m, points: Array.from({ length: n + 1 }, (_, k) => curve.getPointAt(k / n)) };
  });
  roads.forEach((r) => r.points.forEach((pt) => { const key = `${Math.floor(pt.x / 8)}|${Math.floor(pt.z / 8)}`; (roadCells.get(key) || roadCells.set(key, []).get(key)).push(pt); }));
  // the bridges: stone deck and parapets following its rise, piers down into the river
  BR.forEach((b) => group.add(bridgeMesh(b, opts.stone)));
  let ct = -1, cj = -1;
  const t0 = performance.now();
  return {
    group, sea, roads,
    /** Builds the tiles near p (all of them at once with `all`), drops the far ones; moves the sea. far: beyond it
     *  (the fog) the tiles are not drawn. */
    update(p, dt = 0, all = false, far = Infinity) {
      seaMat.userData.update((performance.now() - t0) / 1000, scene.fog?.color);
      sea.position.x = Math.round(p.x / 32) * 32; sea.position.z = Math.round(p.z / 32) * 32;
      const ti = Math.floor((p.x + MAP.ox) / (TILE * STEP)), tj = Math.floor((p.z + MAP.oz) / (TILE * STEP));
      let budget = all ? Infinity : 2;                    // (a couple of new tiles a frame: no stutter)
      if (ti !== ct || tj !== cj || budget) {
        ct = ti; cj = tj;
        const R = Math.ceil(LOAD_R / (TILE * STEP)) + 1, want = [];
        for (let b = tj - R; b <= tj + R; b++) for (let a = ti - R; a <= ti + R; a++) {
          if (a < 0 || b < 0 || a >= TX || b >= TZ) continue;
          const cx = (a + 0.5) * TILE * STEP - MAP.ox, cz = (b + 0.5) * TILE * STEP - MAP.oz, d = Math.hypot(cx - p.x, cz - p.z);
          if (d < LOAD_R + TILE * STEP * 0.71 && !tiles.has(b * TX + a)) want.push([d, a, b]);
        }
        want.sort((u, v) => u[0] - v[0]);
        for (const [, a, b] of want) {
          if (budget-- <= 0) break;
          const m = buildTile(a, b, material);
          tiles.set(b * TX + a, m);
          if (m) group.add(m);
        }
        tiles.forEach((m, key) => {
          const a = key % TX, b = Math.floor(key / TX), cx = (a + 0.5) * TILE * STEP - MAP.ox, cz = (b + 0.5) * TILE * STEP - MAP.oz, d = Math.hypot(cx - p.x, cz - p.z);
          if (d > DROP_R + TILE * STEP * 0.71) { if (m) { group.remove(m); m.geometry.dispose(); } tiles.delete(key); }
          else if (m) m.visible = d - TILE * STEP * 0.71 < Math.min(far, SPLIT + 10);   // (beyond the split: the far ground)
        });
      }
    },
    count: () => tiles.size,
  };
}
