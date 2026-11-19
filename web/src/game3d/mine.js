// The silver mine: narrow tunnels cut in the rock under the mountain (mountain.js), going down from the portal in the
// rock face and branching into dead ends, their walls studded with silver and other minerals (world.js: MINE_NODES,
// MINE_TUNNELS, MINE_ORES). The rock is the surface of a distance field (each tunnel: a floor sloping from node to node,
// straight walls and a vault, made rough by noise) turned into triangles by marching cubes once, at the start.
// Light: inside the mountain the light of the sky and of the sun fades with the distance from the portal. It is a patch
// of three.js' lighting for every material, by world position (mineSkyAt), so the torches light the tunnels and
// whoever walks in them, while the world outside, seen from inside, keeps its daylight.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { triTable } from "three/addons/objects/MarchingCubes.js";
import { CX, CZ, MINE_NODES, MINE_TUNNELS, MINE_ORES } from "./world";
import { vnoise3 } from "./body";
import { makeFlame } from "./models";
import ROCCIA from "./terreno_terra.jpg";

const PX = CX + 17;                                   // the portal, in the rock face
const ZONE = { x0: CX - 14.3, x1: PX + 0.05, hz: 13.6, top: 4.2 };
const f1 = (v) => v.toFixed(2);

// ---- Light inside the mountain (every lit material: Lambert, Phong, Standard, Toon) ----
const SKY_GLSL = `
float mineSkyAt( vec3 w ) {
	vec3 d = w - vec3( ${f1(PX)}, 1.4, ${f1(CZ)} );
	if ( d.x > - 0.04 || w.x < ${f1(ZONE.x0)} || w.y > ${f1(ZONE.top)} || abs( d.z ) > ${f1(ZONE.hz)} || ( d.x > - 5.4 && abs( d.z ) > 2.5 ) ) return 1.0;
	return mix( 0.085, 1.0, exp( - length( d ) * 0.42 ) );
}
`;
{
  const SC = THREE.ShaderChunk, DIR = "getDirectionalLightInfo( directionalLight, directLight );";
  if (!SC.lights_pars_begin.includes("mineSkyAt")) {
    if (!SC.lights_fragment_begin.includes(DIR)) console.warn("mine.js: three.js lighting changed, the sun is not shut out of the mine");
    SC.lights_pars_begin = SKY_GLSL + SC.lights_pars_begin;
    SC.lights_fragment_begin = "float mineSky = mineSkyAt( cameraPosition + transpose( mat3( viewMatrix ) ) * ( - vViewPosition ) );\n"
      + SC.lights_fragment_begin.replace(DIR, `${DIR} directLight.color *= mineSky * mineSky;`);
    SC.lights_fragment_end = `
#if defined( RE_IndirectDiffuse )
	irradiance *= mineSky; iblIrradiance *= mineSky;
#endif
#if defined( RE_IndirectSpecular )
	radiance *= mineSky;
#endif
` + SC.lights_fragment_end;
  }
}

// ---- The tunnels ----
const N = Object.fromEntries(Object.entries(MINE_NODES).map(([k, [x, z, y]]) => [k, { x, z, y }]));
const TUN = MINE_TUNNELS.map(([a, b, w]) => {
  const A = N[a], B = N[b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), hw = w / 2;
  return { a, b, A, B, L, ux: dx / L, uz: dz / L, hw, Hw: 1.45, Ha: hw * 0.95 + 0.05 };
});
const floorOn = (t, u) => t.A.y + (t.B.y - t.A.y) * Math.min(1, Math.max(0, u / t.L));
// signed distance to one tunnel's air (negative inside) and the height above its floor
let lastH = 0;
function sdTunnel(t, x, y, z) {
  const rx = x - t.A.x, rz = z - t.A.z, u = rx * t.ux + rz * t.uz, v = Math.abs(rz * t.ux - rx * t.uz);
  const h = y - floorOn(t, u);
  const qx = v - t.hw, qy = Math.abs(h - t.Hw / 2) - t.Hw / 2;
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);   // straight walls up to Hw
  const vault = (Math.hypot(v / t.hw, (h - t.Hw) / t.Ha) - 1) * Math.min(t.hw, t.Ha);          // the vault above
  lastH = h;
  return Math.max(Math.min(box, vault), -u - t.hw, u - t.L - t.hw);                           // ends: half a width past the nodes
}
// rough rock: noise on walls and vault, almost none on the floor
const rough = (x, y, z, h) => {
  const n = vnoise3(x * 0.85, y * 0.85, z * 0.85) * 0.65 + vnoise3(x * 2.3 + 5.1, y * 2.3, z * 2.3) * 0.35;
  const w = Math.min(1, Math.max(0, (h - 0.15) / 0.55));
  return (n - 0.5) * 0.7 * (0.1 + 0.9 * w * w * (3 - 2 * w));
};
function fieldAt(x, y, z) {
  let d = 1e9, h = 0;
  for (const t of TUN) { const s = sdTunnel(t, x, y, z); if (s < d) { d = s; h = lastH; } }
  return d + rough(x, y, z, h);
}

// Marching cubes over the zone: one vertex per crossed grid edge (shared), triangles from the classic table.
function tunnelGeometry() {
  const S = 0.34, X0 = ZONE.x0, Z0 = CZ - ZONE.hz, Y0 = -8.9;
  const nx = Math.ceil((ZONE.x1 - X0) / S) + 1, nz = Math.ceil((2 * ZONE.hz) / S) + 1, ny = Math.ceil((ZONE.top - Y0) / S) + 1;
  const gx = (i) => Math.min(X0 + i * S, ZONE.x1), gy = (j) => Y0 + j * S, gz = (k) => Z0 + k * S;
  const F = new Float32Array(nx * ny * nz).fill(1), H = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  for (const t of TUN) {                                          // each tunnel only where it can be
    const r = t.hw + 0.9, xs = [t.A.x, t.B.x], zs = [t.A.z, t.B.z];
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - r - X0) / S)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + r - X0) / S));
    const k0 = Math.max(0, Math.floor((Math.min(...zs) - r - Z0) / S)), k1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) + r - Z0) / S));
    const j0 = Math.max(0, Math.floor((Math.min(t.A.y, t.B.y) - 0.8 - Y0) / S)), j1 = Math.min(ny - 1, Math.ceil((Math.max(t.A.y, t.B.y) + t.Hw + t.Ha + 0.8 - Y0) / S));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = sdTunnel(t, gx(i), gy(j), gz(k)), q = id(i, j, k);
      if (d < F[q]) { F[q] = d; H[q] = lastH; }
    }
  }
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = id(i, j, k);
    if (F[q] < 0.9) F[q] += rough(gx(i), gy(j), gz(k), H[q]);
  }
  const pos = [], idx = [], edgeVert = new Map();
  // the 12 edges of a cell: [corner a, corner b, axis, offset of the edge's start (di, dj, dk)]
  const C = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const E = [[0, 1, 0], [1, 2, 1], [3, 2, 0], [0, 3, 1], [4, 5, 0], [5, 6, 1], [7, 6, 0], [4, 7, 1], [0, 4, 2], [1, 5, 2], [2, 6, 2], [3, 7, 2]];
  const val = new Float32Array(8);
  const vertex = (i, j, k, e) => {
    const [a, b, axis] = E[e], ca = C[a], cb = C[b];
    const key = id(i + ca[0], j + ca[1], k + ca[2]) * 3 + axis;
    let v = edgeVert.get(key);
    if (v === undefined) {
      const t = val[a] / (val[a] - val[b]);
      const x = gx(i + ca[0]) + (gx(i + cb[0]) - gx(i + ca[0])) * t, y = gy(j + ca[1]) + (gy(j + cb[1]) - gy(j + ca[1])) * t, z = gz(k + ca[2]) + (gz(k + cb[2]) - gz(k + ca[2])) * t;
      v = pos.length / 3; pos.push(x, y, z); edgeVert.set(key, v);
    }
    return v;
  };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let cube = 0;
    for (let c = 0; c < 8; c++) { val[c] = F[id(i + C[c][0], j + C[c][1], k + C[c][2])]; if (val[c] < 0) cube |= 1 << c; }
    if (cube === 0 || cube === 255) continue;
    for (let o = cube * 16; triTable[o] !== -1; o += 3) idx.push(vertex(i, j, k, triTable[o]), vertex(i, j, k, triTable[o + 1]), vertex(i, j, k, triTable[o + 2]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the faces must look into the air: check on the floor of the first tunnel
  const n = g.attributes.normal, p = g.attributes.position;
  let up = 0;
  for (let v = 0; v < p.count; v++) if (Math.abs(p.getY(v) - N.E1.y) < 0.15 && Math.abs(p.getZ(v) - CZ) < 0.5 && p.getX(v) > N.E1.x) up += n.getY(v);
  if (up < 0) { for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

// Split by triangle into the mouth (seen from outside) and the depths (drawn only near the mine).
function splitGeometry(g, inMouth) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index.array, parts = [[], []];
  for (let q = 0; q < ix.length; q += 3) parts[inMouth((p.getX(ix[q]) + p.getX(ix[q + 1]) + p.getX(ix[q + 2])) / 3) ? 0 : 1].push(ix[q], ix[q + 1], ix[q + 2]);
  return parts.map((list) => {
    const out = new THREE.BufferGeometry(), map = new Map(), P = [], Nn = [], I = [];
    for (const v of list) {
      let w = map.get(v);
      if (w === undefined) { w = P.length / 3; map.set(v, w); P.push(p.getX(v), p.getY(v), p.getZ(v)); Nn.push(n.getX(v), n.getY(v), n.getZ(v)); }
      I.push(w);
    }
    out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(Nn, 3)); out.setIndex(I);
    out.computeBoundingSphere();
    return out;
  });
}

// From a point in the air towards a wall: where the rock starts and the wall's normal (into the air).
function wallHit(x, y, z, dx, dy, dz, max = 3.5) {
  let t = 0;
  while (t < max && fieldAt(x + dx * t, y + dy * t, z + dz * t) < 0) t += 0.06;
  if (t >= max) return null;
  let a = t - 0.06, b = t;
  for (let s = 0; s < 6; s++) { const m = (a + b) / 2; if (fieldAt(x + dx * m, y + dy * m, z + dz * m) < 0) a = m; else b = m; }
  const px = x + dx * b, py = y + dy * b, pz = z + dz * b, e = 0.05;
  const nx = fieldAt(px - e, py, pz) - fieldAt(px + e, py, pz), ny = fieldAt(px, py - e, pz) - fieldAt(px, py + e, pz), nz = fieldAt(px, py, pz - e) - fieldAt(px, py, pz + e);
  const l = Math.hypot(nx, ny, nz) || 1;
  return { p: new THREE.Vector3(px, py, pz), n: new THREE.Vector3(nx / l, ny / l, nz / l) };
}
// a point on a tunnel: how far along (0..1), across (-1..1 of the half width), height above the floor
const onTunnel = (t, k, s = 0, h = 0) => { const u = t.L * k; return new THREE.Vector3(t.A.x + t.ux * u - t.uz * s * t.hw, floorOn(t, u) + h, t.A.z + t.uz * u + t.ux * s * t.hw); };
const sideways = (t, side) => new THREE.Vector3(-t.uz * side, 0, t.ux * side);

let sd = 9173;
const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// a crystal: a long octahedron pointing along dir from p
function crystal(p, dir, len, wid) {
  const g = new THREE.OctahedronGeometry(1, 0);
  _q.setFromUnitVectors(_up, dir);
  _m.compose(p.clone().addScaledVector(dir, len * 0.45), _q, _s.set(wid, len * 0.6, wid));
  return g.applyMatrix4(_m);
}
const tilt = (n, k) => n.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(k)).normalize();

// The tunnels as a graph of nodes (for the characters' way through the mine); OUT: in front of the portal, outside.
const OUT = { x: PX + 3.5, z: CZ };
const GRAPH = {};
TUN.forEach((t) => { (GRAPH[t.a] ||= []).push([t.b, t.L]); (GRAPH[t.b] ||= []).push([t.a, t.L]); });
GRAPH.OUT = [["E0", Math.hypot(OUT.x - N.E0.x, OUT.z - N.E0.z)]]; GRAPH.E0.push(["OUT", GRAPH.OUT[0][1]]);

/** Builds the mine into the scene; returns what the engine needs to walk in it. */
export function buildMine(scene) {
  const t0 = performance.now();
  // rock: the photo texture of rocks.blend, laid in world space from the three axes (the tunnels have no uv)
  const tex = new THREE.TextureLoader().load(ROCCIA);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const rockMat = new THREE.MeshLambertMaterial({ color: "#a0968a" });
  rockMat.onBeforeCompile = (sh) => {
    sh.uniforms.rockMap = { value: tex };
    sh.vertexShader = "varying vec3 vMW, vMN;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvMW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vMN = mat3( modelMatrix ) * objectNormal;");
    sh.fragmentShader = "uniform sampler2D rockMap;\nvarying vec3 vMW, vMN;\n" + sh.fragmentShader.replace("#include <map_fragment>", `
	vec3 tw = pow( abs( normalize( vMN ) ), vec3( 4.0 ) ); tw /= tw.x + tw.y + tw.z;
	diffuseColor.rgb *= texture2D( rockMap, vMW.zy * 0.4 ).rgb * tw.x + texture2D( rockMap, vMW.xz * 0.4 ).rgb * tw.y + texture2D( rockMap, vMW.xy * 0.4 ).rgb * tw.z;`);
  };
  rockMat.customProgramCacheKey = () => "mine-rock-1";
  const woodMat = new THREE.MeshLambertMaterial({ color: "#5a3a1e" });
  const silverMat = new THREE.MeshLambertMaterial({ color: "#d4e2f0", emissive: "#4a7aa8", emissiveIntensity: 0.55 });
  const MINERALS = [silverMat, new THREE.MeshLambertMaterial({ color: "#8a4a2a" }), new THREE.MeshLambertMaterial({ color: "#c8a040", emissive: "#5a4010", emissiveIntensity: 0.3 })];

  const near = new THREE.Group(), deep = new THREE.Group();     // deep: hidden when the camera is far from the mine
  scene.add(near, deep);
  const inMouth = (x) => x > PX - 7.5;
  const [mouthGeo, deepGeo] = splitGeometry(tunnelGeometry(), inMouth);
  near.add(new THREE.Mesh(mouthGeo, rockMat)); deep.add(new THREE.Mesh(deepGeo, rockMat));
  // the portal: timber frame, rock above and beside it (the mountain's own rock, see mountain.js) closing the cliff
  const faceMat = new THREE.MeshStandardMaterial({ color: "#46433d", roughness: 1, flatShading: true });
  const portal = [
    [new THREE.BoxGeometry(1.2, 5.15, 4.7), PX - 0.55, 5.18, CZ, faceMat], [new THREE.BoxGeometry(1.2, 2.62, 0.9), PX - 0.55, 1.31, CZ - 1.9, faceMat], [new THREE.BoxGeometry(1.2, 2.62, 0.9), PX - 0.55, 1.31, CZ + 1.9, faceMat],
    [new THREE.BoxGeometry(1.2, 7.75, 2.3), PX - 0.55, 3.875, CZ - 3.5, faceMat], [new THREE.BoxGeometry(1.2, 7.75, 2.3), PX - 0.55, 3.875, CZ + 3.5, faceMat],
    [new THREE.BoxGeometry(0.24, 2.6, 0.24), PX + 0.12, 1.3, CZ - 1.33, woodMat], [new THREE.BoxGeometry(0.24, 2.6, 0.24), PX + 0.12, 1.3, CZ + 1.33, woodMat], [new THREE.BoxGeometry(0.3, 0.3, 3.2), PX + 0.12, 2.68, CZ, woodMat],
  ];
  portal.forEach(([g, x, y, z, m]) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; near.add(o); });
  // a lantern's light at the portal
  const lamp = new THREE.Object3D(); lamp.position.set(PX - 0.6, 2.3, CZ); lamp.userData.anchor = { color: "#ffb050", intensity: 3, distance: 6 }; near.add(lamp);
  // what goes deep (merged by material) and the mouth
  const bag = new Map(), put = (g, m, x) => { const k = `${m.uuid}|${inMouth(x) ? 0 : 1}`; if (!bag.has(k)) bag.set(k, { m, mouth: inMouth(x), list: [] }); bag.get(k).list.push(g); };
  const busy = [];                                              // torches and veins: no decoration on top of them
  const free = (p, r) => !busy.some((b) => b.distanceTo(p) < r);

  // Timbering: two posts and a beam every ~4.5 m, square to the tunnel
  TUN.forEach((t, ti) => {
    if (ti === 0) return;
    for (let u = 1.6; u < t.L - 0.8; u += 4.5) {
      const v = t.hw - 0.24, hv = t.Hw + t.Ha * Math.sqrt(Math.max(0, 1 - (v / t.hw) ** 2)) - 0.14, yaw = Math.atan2(-t.ux, -t.uz);
      const fl = floorOn(t, u), cx = t.A.x + t.ux * u, cz = t.A.z + t.uz * u;
      [-1, 1].forEach((sdn) => { const g = new THREE.BoxGeometry(0.2, hv, 0.2); g.translate(cx - t.uz * v * sdn, fl + hv / 2, cz + t.ux * v * sdn); put(g, woodMat, cx); });
      const beam = new THREE.BoxGeometry(2 * v + 0.2, 0.2, 0.22); beam.rotateY(yaw); beam.translate(cx, fl + hv - 0.08, cz); put(beam, woodMat, cx);
    }
  });

  // Torches on the walls: one in the middle of each tunnel, two in the long ones (none in the entrance), sides taking turns
  const flames = [];
  TUN.forEach((t, ti) => (ti < 1 ? [] : t.L > 7.5 ? [0.28, 0.76] : [0.5]).forEach((k, j) => {
    const side = (ti + j) % 2 ? 1 : -1, c = onTunnel(t, k, 0, 1.75), hit = wallHit(c.x, c.y, c.z, ...sideways(t, side).toArray());
    if (!hit) return;
    const lean = hit.n.clone().multiplyScalar(0.55).add(_up).normalize(), base = hit.p.clone().addScaledVector(hit.n, 0.04);
    const stick = new THREE.CylinderGeometry(0.03, 0.025, 0.55, 6); _q.setFromUnitVectors(_up, lean);
    stick.applyQuaternion(_q).translate(...base.clone().addScaledVector(lean, 0.25).toArray()); put(stick, woodMat, base.x);
    const tip = base.clone().addScaledVector(lean, 0.56), f = makeFlame(1.1);
    f.position.copy(tip); (inMouth(tip.x) ? near : deep).add(f); flames.push(f);
    const a = new THREE.Object3D(); a.position.copy(tip).addScaledVector(hit.n, 0.35); a.userData.anchor = { color: "#ffa040", intensity: 7, distance: 7 };
    (inMouth(tip.x) ? near : deep).add(a);
    busy.push(base);
  }));

  // Silver veins (they can be mined): a dark rock bulge with big crystals; the crystals go when it is worked out
  const ores = MINE_ORES.map(([a, b, k, side]) => {
    const t = TUN.find((x) => x.a === a && x.b === b), c = onTunnel(t, k, 0, 1.15), hit = wallHit(c.x, c.y, c.z, ...sideways(t, side).toArray());
    const g = new THREE.Group(), base = hit.p;
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), rockMat); lump.position.copy(base).addScaledVector(hit.n, -0.12); lump.scale.set(1, 0.8, 1); g.add(lump);
    const crystals = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const dir = tilt(hit.n, 1.1), off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.45);
      crystals.add(new THREE.Mesh(crystal(base.clone().add(off).addScaledVector(hit.n, -0.05), dir, 0.22 + rnd() * 0.22, 0.05 + rnd() * 0.05), silverMat));
    }
    g.add(crystals); g.userData.crystals = crystals;
    deep.add(g); busy.push(base);
    const stand = base.clone().addScaledVector(hit.n, 0.5);
    return { x: stand.x, z: stand.z, y: base.y, mesh: g, depletedUntil: 0 };
  });

  // Minerals all along the walls and the vaults: little clusters of silver (glowing a little), copper and gold
  TUN.forEach((t, ti) => {
    const step = ti === 0 ? 1.4 : 0.55;
    for (let u = 0.6; u < t.L + (ti === 0 ? -1.5 : 0.4); u += step * (0.7 + rnd() * 0.6)) {
      const k = u / t.L, roof = rnd() < 0.18, side = rnd() < 0.5 ? 1 : -1;
      const c = onTunnel(t, k, (rnd() - 0.5) * 0.6, roof ? 1.4 : 0.35 + rnd() * 1.9);
      const d = roof ? new THREE.Vector3(-t.uz * side * 0.3, 1, t.ux * side * 0.3).normalize() : sideways(t, side);
      const hit = wallHit(c.x, c.y, c.z, d.x, d.y, d.z);
      if (!hit || !free(hit.p, 0.8)) continue;
      const kind = rnd(), m = MINERALS[kind < 0.68 ? 0 : kind < 0.9 ? 1 : 2], n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.22);
        put(crystal(hit.p.clone().add(off).addScaledVector(hit.n, -0.03), tilt(hit.n, 0.9), 0.07 + rnd() * 0.12, 0.025 + rnd() * 0.03), m, hit.p.x);
      }
    }
  });
  bag.forEach(({ m, mouth, list }) => { const o = new THREE.Mesh(mergeGeometries(list), m); list.forEach((g) => g.dispose()); (mouth ? near : deep).add(o); });

  // From far away the depths are not drawn: a black curtain stands where they begin
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshBasicMaterial({ color: "#000000" }));
  curtain.position.set(PX - 7.6, 0.5, CZ); curtain.rotation.y = Math.PI / 2; near.add(curtain);
  const tris = [near, deep].reduce((s, gr) => { gr.traverse((o) => { if (o.isMesh) s += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return s; }, 0);
  console.info(`Miniera: ${TUN.length} gallerie, ${Math.round(tris)} triangoli (${Math.round(performance.now() - t0)} ms)`);

  // ---- Walking: the floor and the walls (2D: the tunnels never pass over each other) ----
  const M = 0.42;                                               // how close to a wall a body comes
  const local = (t, x, z) => { const rx = x - t.A.x, rz = z - t.A.z; return [rx * t.ux + rz * t.uz, rz * t.ux - rx * t.uz]; };
  const inZone = (x, z) => x < ZONE.x1 + 0.1 && x > ZONE.x0 && Math.abs(z - CZ) < ZONE.hz;
  const inside = (x, z, m = M) => TUN.some((t) => { const [u, v] = local(t, x, z); return u > -t.hw + m && u < t.L + t.hw - m && Math.abs(v) < t.hw - m; });
  return {
    ores, inZone, inside,
    // floor height (0 outside the mine): the lowest floor of the tunnels there (as the rock is cut)
    floorY(x, z) {
      if (!inZone(x, z)) return 0;
      let y = Infinity, best = Infinity, by = 0;
      for (const t of TUN) {
        const [u, v] = local(t, x, z), f = floorOn(t, u);
        if (u > -t.hw && u < t.L + t.hw && Math.abs(v) < t.hw + 0.3) y = Math.min(y, f);
        const out = Math.max(-u - t.hw, u - t.L - t.hw, Math.abs(v) - t.hw, 0);
        if (out < best) { best = out; by = f; }
      }
      return y === Infinity ? by : y;
    },
    // the nearest point a body can stand on
    constrain(x, z) {
      if (inside(x, z)) return [x, z];
      let bx = x, bz = z, bd = Infinity;
      for (const t of TUN) {
        const [u, v] = local(t, x, z), cu = Math.min(t.L + t.hw - M - 0.01, Math.max(-t.hw + M + 0.01, u)), cv = Math.min(t.hw - M - 0.01, Math.max(-(t.hw - M - 0.01), v));
        const px = t.A.x + t.ux * cu - t.uz * cv, pz = t.A.z + t.uz * cu + t.ux * cv, d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; bx = px; bz = pz; }
      }
      return [bx, bz];
    },
    // Where to walk to reach (tx, tz) along the tunnels: the next node of the shortest way (null: straight is fine).
    // Outside, the way in goes to the front of the portal first, so nobody walks into the mountain.
    route(x, z, tx, tz) {
      const a = inZone(x, z), b = inZone(tx, tz);
      if (!a && !b) return null;
      const ends = (px, pz, isIn) => {
        if (!isIn) {                                                       // outside: by the front of the portal (or straight in, if already there)
          const out = [["OUT", Math.hypot(px - OUT.x, pz - OUT.z)]];
          if (px > PX - 0.2 && px < PX + 6 && Math.abs(pz - CZ) < 2.6) out.push(["E0", Math.hypot(px - N.E0.x, pz - N.E0.z)]);
          return out;
        }
        let ts = TUN.filter((t) => { const [u, v] = local(t, px, pz); return u > -t.hw && u < t.L + t.hw && Math.abs(v) < t.hw; });
        if (!ts.length) ts = [TUN.reduce((best, t) => { const [u, v] = local(t, px, pz), o = Math.max(-u - t.hw, u - t.L - t.hw, Math.abs(v) - t.hw, 0); return o < best.o ? { t, o } : best; }, { t: TUN[0], o: Infinity }).t];
        return ts.flatMap((t) => [[t.a, Math.hypot(px - t.A.x, pz - t.A.z)], [t.b, Math.hypot(px - t.B.x, pz - t.B.z)]]).concat([["_set", ts]]);
      };
      const from = ends(x, z, a), to = ends(tx, tz, b);
      const fromT = a && from.find((e) => e[0] === "_set")[1], toT = b && to.find((e) => e[0] === "_set")[1];
      if (a && b && fromT.some((t) => toT.includes(t))) return null;                 // in the same tunnel: straight
      // shortest way over the nodes (Dijkstra, a dozen nodes)
      const dist = { START: 0 }, prev = {}, done = new Set(), goal = Object.fromEntries(to.filter((e) => e[0] !== "_set"));
      const edges = (k) => (k === "START" ? from.filter((e) => e[0] !== "_set") : GRAPH[k] || []);
      let bestEnd = null, bestCost = Infinity;
      for (;;) {
        let k = null;
        for (const q in dist) if (!done.has(q) && (k === null || dist[q] < dist[k])) k = q;
        if (k === null || dist[k] >= bestCost) break;
        done.add(k);
        if (k in goal && dist[k] + goal[k] < bestCost) { bestCost = dist[k] + goal[k]; bestEnd = k; }
        for (const [q, c] of edges(k)) if (dist[q] === undefined || dist[k] + c < dist[q]) { dist[q] = dist[k] + c; prev[q] = k; }
      }
      if (!bestEnd) return null;
      const way = [];
      for (let k = bestEnd; k !== "START"; k = prev[k]) way.unshift(k);
      // the first node not yet reached
      for (const k of way) {
        const nd = k === "OUT" ? OUT : N[k];
        if (Math.hypot(nd.x - x, nd.z - z) > 0.6) return [nd.x, nd.z];
      }
      return null;
    },
    // how high a camera can go at a point: under the vault, which comes down towards the walls (and the rough rock)
    roofY(x, z) {
      let top = -Infinity;
      for (const t of TUN) {
        const [u, v] = local(t, x, z);
        if (u < -t.hw || u > t.L + t.hw || Math.abs(v) >= t.hw) continue;
        top = Math.max(top, floorOn(t, u) + t.Hw + t.Ha * Math.sqrt(1 - (v / t.hw) ** 2) - 0.4);
      }
      return top === -Infinity ? this.floorY(x, z) + 1.6 : top;
    },
    update(cam) {
      const show = inZone(cam.x, cam.z) || Math.hypot(cam.x - PX, cam.z - CZ) < 24;
      deep.visible = show; curtain.visible = !show;
    },
    flames,
  };
}
