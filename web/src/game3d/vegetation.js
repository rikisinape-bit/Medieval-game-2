// The trees of the open country: the forests of the map (its drawn trees: the forest layer) and a few trees scattered on
// its plains; never on the places' ground, on the roads, in the water or on the beach, on steep slopes and cliffs;
// in the snow pines and dead trees. Placed a tile (64 m) at a time, always the same (from the tile's number).
// Near the player (NEAR) they are the nature pack's trees, instanced (a dozen draws for all of them); farther, up to the
// fog, simple low trees (a cone, a ball, a bare trunk) that cost almost nothing. Their trunks stop whoever walks into
// them (push).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { libParts, natureScale } from "./nature";
import { layersAt, surfaceAt, treeFree, nearRoad, SEA_Y } from "./terrain";
import { MAP } from "./sites";

const TILE = 64, CELL = 6.4, N = TILE / CELL, NEAR = 48, SHADE = 30, REBUILD = 5;
const PINES = ["pino_1", "pino_2", "pino_3"], BROAD = ["albero_1", "albero_2", "albero_3"], MODELS = [...PINES, ...BROAD, "morto"];
const KIND = (id) => (id === "morto" ? 2 : id.startsWith("pino") ? 0 : 1);   // far: cone, ball, bare trunk
const TX = Math.ceil(MAP.w / TILE), TZ = Math.ceil(MAP.h / TILE);
const rand = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

// The trees of a tile: [{ x, y, z, id, ry, k, r }]
function tileTrees(ti, tj) {
  const out = [], x0 = ti * TILE - MAP.ox, z0 = tj * TILE - MAP.oz;
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const seed = (tj * TX + ti) * 128 + b * N + a;
    const x = x0 + (a + 0.5 + (rand(seed, 1, 7) - 0.5) * 0.85) * CELL, z = z0 + (b + 0.5 + (rand(seed, 2, 7) - 0.5) * 0.85) * CELL;
    const ly = layersAt(x, z);
    let p = ly.forest > 0.05 ? Math.min(0.75, 0.06 + ly.forest * 1.05) : 0.022;
    if (ly.snow > 0.5 && ly.forest < 0.3) p *= 0.15;                       // (the snow: only its forest)
    if (ly.mount > 0.3) p *= Math.max(0, 1 - (ly.mount - 0.3) * 2.5);      // none high on the mountains
    if (ly.ice > 0.3) p = 0;
    if (rand(seed, 3, 7) > p) continue;
    const y = surfaceAt(x, z);
    if (y < SEA_Y + 0.9 || !treeFree(x, z) || nearRoad(x, z, 4.5)) continue;
    if (Math.hypot(surfaceAt(x + 1.5, z) - surfaceAt(x - 1.5, z), surfaceAt(x, z + 1.5) - surfaceAt(x, z - 1.5)) / 3 > 0.65) continue;   // too steep
    const r = rand(seed, 4, 7);
    const id = ly.snow > 0.5 ? (r < 0.55 ? PINES[Math.floor(r * 5.4) % 3] : "morto")
      : ly.forest > 0.35 ? (r < 0.84 ? PINES[Math.floor(r * 3.56) % 3] : r < 0.96 ? BROAD[Math.floor(r * 37) % 3] : "morto")
        : r < 0.6 ? BROAD[Math.floor(r * 5) % 3] : PINES[Math.floor(r * 7) % 3];
    const k = 0.82 + rand(seed, 5, 7) * 0.45;
    out.push({ x, y, z, id, ry: rand(seed, 6, 7) * Math.PI * 2, k, r: (id === "morto" ? 0.3 : 0.4) * k });
  }
  return out;
}

// the far trees: a cone, a ball, a bare trunk (low, flat-shaded, coloured like the nature pack's)
function farGeometry(kind) {
  const col = (g, c) => { const n = g.attributes.position.count, cl = new THREE.Color(c), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([cl.r, cl.g, cl.b], i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g; };
  const trunk = (h, r) => col(new THREE.CylinderGeometry(r * 0.75, r, h, 5).translate(0, h / 2, 0), "#4a3a2a");
  let parts;
  // a pine: tiers of branches; a broad tree: a clumpy crown
  if (kind === 0) parts = [trunk(2.0, 0.26), col(new THREE.ConeGeometry(2.15, 3.3, 7).translate(0, 3.0, 0), "#30503a"), col(new THREE.ConeGeometry(1.65, 2.9, 7).translate(0, 4.7, 0), "#2d4c35"), col(new THREE.ConeGeometry(1.05, 2.5, 7).translate(0, 6.3, 0), "#33573b")];
  else if (kind === 1) parts = [trunk(2.6, 0.3), col(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 4.3, 0), "#56753c"), col(new THREE.IcosahedronGeometry(1.55, 0).translate(1.1, 3.7, 0.4), "#4e6c37"), col(new THREE.IcosahedronGeometry(1.45, 0).translate(-0.9, 4.8, -0.6), "#5a7a40")];
  else parts = [trunk(7.2, 0.3), col(new THREE.CylinderGeometry(0.06, 0.14, 2.6, 4).rotateZ(0.9).translate(0.9, 5.2, 0), "#4e4034"), col(new THREE.CylinderGeometry(0.05, 0.12, 2.2, 4).rotateZ(-1.0).translate(-0.8, 4.2, 0), "#4e4034")];
  parts = parts.map((g) => { ["uv", "normal"].forEach((n) => g.deleteAttribute(n)); return g; });
  const geo = mergeGeometries(parts);
  geo.computeVertexNormals();
  return geo;
}

/** The trees of the open country; update(camera position, fog's far) every frame. */
export function createVegetation(scene) {
  const tiles = new Map(), cells = new Map(), group = new THREE.Group();
  group.userData.world = true; scene.add(group);
  const ok = MODELS.every((id) => libParts(id));
  // near: one instanced mesh for each part of each model
  const near = [];
  if (ok) for (const shade of [true, false]) MODELS.forEach((id) => libParts(id).forEach((pt) => {
    const m = new THREE.InstancedMesh(pt.geometry, pt.material, shade ? 300 : 600);
    m.count = 0; m.frustumCulled = false; m.castShadow = shade; m.receiveShadow = true;
    group.add(m); near.push({ id, m, s: natureScale(id), shade });
  }));
  const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const far = [0, 1, 2].map((kind) => {
    const m = new THREE.InstancedMesh(farGeometry(kind), farMat, 4000);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = true;
    group.add(m); return m;
  });
  // (the nature pack's models are made a little smaller: as tall as the far ones)
  const FAR_K = { pino_1: 1.0, pino_2: 1.1, pino_3: 0.95, albero_1: 0.8, albero_2: 0.95, albero_3: 0.9, morto: 1.05 };
  const tileOf = (ti, tj) => {
    const key = tj * TX + ti;
    let t = tiles.get(key);
    if (!t) {
      t = tileTrees(ti, tj); tiles.set(key, t);
      t.forEach((tr) => { const ck = `${Math.floor(tr.x / 8)}|${Math.floor(tr.z / 8)}`; (cells.get(ck) || cells.set(ck, []).get(ck)).push(tr); });
    }
    return t;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  let lx = Infinity, lz = Infinity, lfar = 0, pending = false;
  const counts = { near: 0, far: 0 };
  function rebuild(px, pz, fogFar) {
    const R = fogFar + 8, a0 = Math.max(0, Math.floor((px + MAP.ox - R) / TILE)), a1 = Math.min(TX - 1, Math.floor((px + MAP.ox + R) / TILE));
    const b0 = Math.max(0, Math.floor((pz + MAP.oz - R) / TILE)), b1 = Math.min(TZ - 1, Math.floor((pz + MAP.oz + R) / TILE));
    let made = 0;
    pending = false;
    near.forEach((n) => { n.m.count = 0; }); far.forEach((m) => { m.count = 0; });
    for (let tj = b0; tj <= b1; tj++) for (let ti = a0; ti <= a1; ti++) {
      const cx = (ti + 0.5) * TILE - MAP.ox, cz = (tj + 0.5) * TILE - MAP.oz;
      if (Math.hypot(cx - px, cz - pz) > R + TILE * 0.71) continue;
      if (!tiles.has(tj * TX + ti)) { if (made >= 4) { pending = true; continue; } made++; }   // (a few new tiles a frame)
      for (const t of tileOf(ti, tj)) {
        const d = Math.hypot(t.x - px, t.z - pz);
        if (d > R) continue;
        q.setFromAxisAngle(UP, t.ry);
        if (d < NEAR && ok) {
          const shade = d < SHADE;
          for (const n of near) {
            if (n.id !== t.id || n.shade !== shade || n.m.count >= n.m.instanceMatrix.count) continue;
            const k = n.s * t.k;
            n.m.setMatrixAt(n.m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(k, k, k)));
          }
        } else {
          const m = far[KIND(t.id)], k = t.k * (FAR_K[t.id] || 1);
          if (m.count < m.instanceMatrix.count) { m.setColorAt(m.count, tint.setScalar(0.82 + (t.ry % 1) * 0.3)); m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.1, t.z), q, sc.set(k, k, k))); }
        }
      }
    }
    near.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; });
    far.forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    counts.near = near.reduce((s, n) => s + n.m.count, 0); counts.far = far.reduce((s, m) => s + m.count, 0);
    for (const [key] of tiles) {                                            // (far behind: forgotten)
      const ti = key % TX, tj = Math.floor(key / TX), cx = (ti + 0.5) * TILE - MAP.ox, cz = (tj + 0.5) * TILE - MAP.oz;
      if (Math.hypot(cx - px, cz - pz) > 420) {
        tiles.get(key).forEach((tr) => { const ck = `${Math.floor(tr.x / 8)}|${Math.floor(tr.z / 8)}`, l = cells.get(ck); if (l) { l.splice(l.indexOf(tr), 1); if (!l.length) cells.delete(ck); } });
        tiles.delete(key);
      }
    }
  }
  return {
    group, counts,
    /** Moves the near and far trees with the camera (every few metres). */
    update(p, fogFar, force = false) {
      if (force || pending || Math.hypot(p.x - lx, p.z - lz) > REBUILD || Math.abs(fogFar - lfar) > 12) { lx = p.x; lz = p.z; lfar = fogFar; rebuild(p.x, p.z, fogFar); }
    },
    /** A point pushed out of the trunks near it (rad: the body's radius). */
    push(x, z, rad = 0.4) {
      const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const list = cells.get(`${i}|${j}`);
        if (list) for (const t of list) {
          const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), m = t.r + rad;
          if (d < m) { x = t.x + (dx / (d || 1)) * m; z = t.z + (dz / (d || 1)) * m; }
        }
      }
      return [x, z];
    },
    /** Whether a point is inside a trunk (the camera keeps out of them). */
    blocked(x, z) {
      const list = cells.get(`${Math.floor(x / 8)}|${Math.floor(z / 8)}`);
      return !!list && list.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 0.1);
    },
  };
}
