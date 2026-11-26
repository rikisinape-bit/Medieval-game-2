// Ground-cover leaves, like the ones that grow over the rocks of rocks.blend: sprigs of three small leaves, a few
// sprigs to a clump, the clumps instanced in chunks along the edges where bare ground (dirt, paving) meets the meadow.
// Near the camera they are full size; between FADE0 and FADE1 metres they sink into the ground (no popping), and the
// chunks beyond are not drawn at all. They cast no shadow (cheap) but take the sun and the others' shadows.
import * as THREE from "three";
import FOGLIA from "./foglia.jpg";

const CHUNK = 12, FADE0 = 14, FADE1 = 22;

// One clump: SPRIGS sprigs of three leaves within ~0.3 m, each leaf a diamond of 2 triangles folded along its midrib
// (the edges lifted); u runs from the leaf's base to its tip and v across it (foglia.jpg: the midrib along the middle).
function clumpGeometry(SPRIGS = 6) {
  let sd = 4321; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), v = (x, y, z) => new THREE.Vector3(x, y, z), e1 = v(), e2 = v(), fn = v();
  for (let k = 0; k < SPRIGS; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.16, size = 0.8 + r() * 0.45, tint = 0.75 + r() * 0.35;
    const base = v(Math.cos(a) * d, 0.02 + r() * 0.07, Math.sin(a) * d), yaw0 = r() * Math.PI * 2;
    for (let j = 0; j < 3; j++) {
      const yaw = yaw0 + (j * 2 * Math.PI) / 3 + (r() - 0.5) * 0.6, tilt = 0.25 + r() * 0.5, L = 0.125 * size, W = 0.078 * size;
      const dir = v(Math.cos(yaw), 0, Math.sin(yaw));
      const axis = dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(up, Math.sin(tilt));   // along the leaf
      const lat = v().crossVectors(up, dir).normalize();                                             // across it
      const n = v().crossVectors(lat, axis).normalize();                                             // its face (up)
      if (n.y < 0) n.negate();
      // point at (u along, s across -1..1), the edges lifted a little (fold), the tip drooping
      const P = (u, s, lift) => base.clone().addScaledVector(axis, u * L).addScaledVector(lat, (s * W) / 2).addScaledVector(n, lift).addScaledVector(up, -0.3 * u * u * L * Math.cos(tilt));
      const pts = [[P(0, 0, 0), 0, 0.45, 0.42], [P(0.42, -1, 0.16 * W), 0.42, 0.06, 0.85], [P(1, 0, 0.03 * W), 1, 0.45, 1], [P(0.42, 1, 0.16 * W), 0.42, 0.84, 0.85]];
      const sn = n.clone().multiplyScalar(0.6).add(up).normalize();   // soft light: mostly the ground's up, a little the leaf's own
      const i0 = pos.length / 3;
      pts.forEach(([p, pu, pv, c]) => { pos.push(p.x, p.y, p.z); nrm.push(sn.x, sn.y, sn.z); uv.push(pu, pv); col.push(c * tint, c * tint, c * tint); });
      // triangles wound so their front faces the leaf's upper side
      [[0, 1, 2], [0, 2, 3]].forEach(([p, q, s]) => {
        const A = pts[p][0], B = pts[q][0], C = pts[s][0];
        fn.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
        idx.push(i0 + p, ...(fn.dot(n) >= 0 ? [i0 + q, i0 + s] : [i0 + s, i0 + q]));
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let shared = null;
function leafParts() {
  if (shared) return shared;
  const map = new THREE.TextureLoader().load(FOGLIA);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, side: THREE.DoubleSide });
  // far clumps sink into the ground before their chunk stops being drawn
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
	vec3 lfAt = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	transformed *= 1.0 - smoothstep( ${FADE0.toFixed(1)}, ${FADE1.toFixed(1)}, distance( lfAt, cameraPosition ) );`);
  };
  mat.customProgramCacheKey = () => "leaves-1";
  return (shared = { geo: clumpGeometry(), mat });
}

/**
 * Adds clumps of leaves: spots [{ x, y, z, ry, k, c }] (k: size, c: 0..1 from yellow-green to blue-green).
 * Returns { count, tris, chunks, meshes, update(x, z) } — update hides the chunks too far from the player at (x, z).
 */
export function addLeaves(scene, spots) {
  const { geo, mat } = leafParts(), byChunk = new Map(), chunks = [];
  for (const s of spots) {
    const key = `${Math.floor(s.x / CHUNK)}|${Math.floor(s.z / CHUNK)}`;
    if (!byChunk.has(key)) byChunk.set(key, []);
    byChunk.get(key).push(s);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  const A = new THREE.Color(0.86, 0.9, 0.5), B = new THREE.Color(0.5, 0.74, 0.52);   // yellow-green .. blue-green
  byChunk.forEach((list) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      mesh.setMatrixAt(i, m.compose(p.set(s.x, s.y || 0, s.z), q.setFromEuler(e.set(0, s.ry, 0)), sc.set(s.k, s.k, s.k)));
      mesh.setColorAt(i, c.copy(A).lerp(B, s.c ?? 0.5).multiplyScalar(s.b ?? 1));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    scene.add(mesh); chunks.push(mesh);
  });
  const reach = FADE1 + 5;   // (the camera can be a few metres behind the player)
  return {
    count: spots.length, tris: (spots.length * geo.index.count) / 3, chunks: chunks.length, meshes: chunks,
    update(x, z) { chunks.forEach((ch) => { const b = ch.boundingSphere; ch.visible = Math.hypot(b.center.x - x, b.center.z - z) - b.radius < reach; }); },
  };
}

// ---- Where they grow: shapes of bare ground (inside test, outline by arc length with its outward normal, top height)
export const circleShape = (cx, cz, r, top = 0) => ({
  top, len: 2 * Math.PI * r, inside: (x, z) => Math.hypot(x - cx, z - cz) < r,
  edge: (s) => { const a = s / r; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; },
});
export const ellipseShape = (cx, cz, rx, rz, top = 0) => ({
  top, len: Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz))), inside: (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1,
  edge(s) { const a = (s / this.len) * Math.PI * 2, nx = Math.cos(a) / rx, nz = Math.sin(a) / rz, l = Math.hypot(nx, nz); return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz, nx / l, nz / l]; },
});
// a rectangle hw x hd (half sizes) turned by ry like the game's objects (local +z goes to (sin ry, cos ry))
export const rectShape = (cx, cz, hw, hd, ry = 0, top = 0) => {
  const co = Math.cos(ry), si = Math.sin(ry), w = (lx, lz) => [cx + co * lx + si * lz, cz - si * lx + co * lz];
  const sides = [[-hw, -hd, 1, 0, 2 * hw, 0, -1], [hw, -hd, 0, 1, 2 * hd, 1, 0], [hw, hd, -1, 0, 2 * hw, 0, 1], [-hw, hd, 0, -1, 2 * hd, -1, 0]];
  return {
    top, len: 4 * (hw + hd),
    inside: (x, z) => { const dx = x - cx, dz = z - cz; return Math.abs(co * dx - si * dz) < hw && Math.abs(si * dx + co * dz) < hd; },
    edge(s) {
      for (const [x0, z0, ux, uz, L, nx, nz] of sides) {
        if (s <= L) { const [x, z] = w(x0 + ux * s, z0 + uz * s), [n1, n2] = w(nx, nz); return [x, z, n1 - cx, n2 - cz]; }
        s -= L;
      }
      return [cx, cz, 0, 1];
    },
  };
};

// value noise 0..1 (thicker and thinner stretches along the edges)
const hash = (x, z) => { const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); };
const noise = (x, z) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
};

/**
 * Spots for the clumps along the outlines of the bare shapes where they meet the meadow: a band from a little over the
 * edge onto the bare ground to ~0.7 m into the grass, thickest near the edge, in patches along it. Where an outline
 * runs over more bare ground (a road joining the square) nothing grows. ok(x, z): a free spot (no house, no prop);
 * groundY(x, z): height of the meadow there. density: tries per metre of outline.
 */
export function edgeSpots(shapes, ok, groundY, { density = 16, rnd = Math.random } = {}) {
  const bareTop = (x, z) => { let t = -1; for (const s of shapes) if (s.top > t && s.inside(x, z)) t = s.top; return t; };
  const spots = [];
  for (const sh of shapes) {
    for (let i = 0, n = Math.round(sh.len * density); i < n; i++) {
      const [ex, ez, nx, nz] = sh.edge(rnd() * sh.len);
      if (bareTop(ex + nx * 0.12, ez + nz * 0.12) >= 0) continue;                      // more bare ground beyond
      if (0.4 + 0.6 * noise(ex * 0.45 + 17.3, ez * 0.45 - 4.1) < rnd()) continue;      // patches
      const t = -0.18 + Math.pow(rnd(), 1.6) * 0.9, x = ex + nx * t, z = ez + nz * t;
      const top = bareTop(x, z);
      if ((t > 0.03 && top >= 0) || !ok(x, z)) continue;
      spots.push({ x, z, y: Math.max(top, groundY(x, z)) - 0.004, ry: rnd() * Math.PI * 2, k: (0.85 + rnd() * 0.4) * (1 - (0.3 * Math.max(0, t)) / 0.72), c: noise(x * 0.8, z * 0.8) * 0.6 + rnd() * 0.4, b: 0.72 + rnd() * 0.3 });
    }
  }
  return spots;
}
