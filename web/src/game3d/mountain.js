// The mountain above the silver mine. The cave (models.js makeCave) is a room at ground level around (CX, CZ);
// this terrain covers it completely, so from outside you see a mountain with a mine portal cut into a rock face.
// Constraints kept by mountainHeight(): above the cave roof everywhere over the cave, above the entrance
// corridor's roof, a vertical cliff around the portal, and nothing in front of it.
import * as THREE from "three";
import { CX, CZ } from "./world";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wave = (x, z) => Math.sin(x * 0.37 + 1.3) * Math.cos(z * 0.33 + 0.7) * 0.6 + Math.sin(x * 0.15 + z * 0.23) * 0.4;   // -1..1, smooth
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };            // 0..1

const EAST = 17.1;            // the rock face with the portal is at CX + 17
// Terrain height at a world position (0 outside the mountain).
export function mountainHeight(x, z) {
  const dx = x - CX, dz = z - CZ, az = Math.abs(dz);
  if (dx > EAST + 0.01) return 0;
  const r = Math.hypot((dx + 3) / 25, dz / 27);
  let h = r >= 1 ? 0 : 29 * Math.pow(1 - r, 1.3) * (0.85 + 0.25 * wave(x, z));
  const r2 = Math.hypot((dx + 13) / 12, (dz - 13) / 12);                       // second, lower peak
  if (r2 < 1) h = Math.max(h, 17 * Math.pow(1 - r2, 1.1) + h * 0.35);
  const r3 = Math.hypot((dx + 6) / 10, (dz + 15) / 10);                        // shoulder to the north
  if (r3 < 1) h = Math.max(h, 12 * Math.pow(1 - r3, 1.1) + h * 0.3);
  if (Math.abs(dx) <= 14 && az <= 14) h = Math.max(h, 7.7 + hash(x, z) * 1.4); // always above the cave roof (y 7.3)
  if (dx > 14) {                                                               // east side: rock face
    h *= Math.sqrt(clamp((16.9 - dx) / 2.9, 0, 1));
    if (az <= 6 && dx <= 16.95) h = Math.max(h, 7.6 + hash(x, z) * 0.9);       // cliff around the portal
  }
  if (dx >= 14 && az <= 2) h = 7.6;                                            // lip above the portal (rock block below, see makeCave)
  if (dx >= EAST - 0.05 && az > 2) h = 0;                                      // foot of the cliff
  return h;
}

const ROCK = ["#3d3f38", "#45423c", "#4c4944", "#5c5a56", "#77756f"];
export function makeMountain() {
  const xs = [], zs = [];
  for (let d = -30; d <= 14; d += 2) xs.push(d);
  xs.push(16, 16.9, EAST);
  for (let d = -30; d <= 30; d += 2) zs.push(d);
  // vertices: a little horizontal jitter away from the cave and the portal, for a craggy look
  const V = xs.map((dx) => zs.map((dz) => {
    const free = dx < 12 && (Math.abs(dx) > 16 || Math.abs(dz) > 16);
    const x = CX + dx + (free ? (hash(dx, dz) - 0.5) * 1.1 : 0), z = CZ + dz + (free ? (hash(dz, dx) - 0.5) * 1.1 : 0);
    let y = mountainHeight(CX + dx, CZ + dz);
    if (free && y > 1) y *= 0.9 + hash(dx * 3, dz * 7) * 0.22;
    return [x, y, z];
  }));
  const pos = [], col = [], c = new THREE.Color(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  const tri = (A, B, C) => {
    if (A[1] <= 0 && B[1] <= 0 && C[1] <= 0) return;                            // flat ground: nothing to draw
    p.set(...A); a.set(...B).sub(p); b.set(...C).sub(p); n.crossVectors(a, b);
    const T = n.y < 0 ? [A, C, B] : [A, B, C];
    const hAvg = (A[1] + B[1] + C[1]) / 3, slope = 1 - Math.abs(n.normalize().y);
    // colour: moss low on gentle ground, dark rock on the flanks, pale stone near the peaks
    if (hAvg < 3.5 && slope < 0.45) c.set("#3a4430");
    else c.set(ROCK[clamp(Math.floor(hAvg / 6.5), 0, 4)]);
    const k = 0.86 + hash(hAvg * 9.1, A[0] + C[2]) * 0.24 - slope * 0.12;
    for (const v of T) { pos.push(...v); col.push(c.r * k, c.g * k, c.b * k); }
  };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const A = V[i][j], B = V[i + 1][j], C = V[i + 1][j + 1], D = V[i][j + 1];
    if ((i + j) % 2) { tri(A, B, C); tri(A, C, D); } else { tri(A, B, D); tri(B, C, D); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true;
  m.userData.tris = pos.length / 9;
  return m;
}
