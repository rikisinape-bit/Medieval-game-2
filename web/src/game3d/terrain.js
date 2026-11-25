// The ground of the whole world of Vasilad (2 x 1.5 km: 1 pixel of the user's map = 1 metre), from the layers that
// tools/world-layers.py takes from the map (mondo/): how far each point is from the coast (beaches, the sea floor),
// where mountains and hills are drawn, snow, dry (brown) ground, ice, forests. The height of a point (heightAt) is made
// of them and of a little noise; the places (sites.js FLATS) stand on flat ground at height 0, blending into the land
// around them; under the mine's mountain the ground has a hole (the tunnels go down there).
// It is drawn in tiles of 64 m (a vertex every 2 m) built around the player as it moves and dropped when far away;
// surfaceAt gives the height of the drawn surface itself (the same triangles), so feet stand on it. The sea is a
// plane at SEA_Y following the camera. Roads (sites.js ROADS) are strips of dirt laid on the ground.
import * as THREE from "three";
import COSTA from "./mondo/costa.png";
import RILIEVO from "./mondo/rilievo.png";
import SUOLO from "./mondo/suolo.png";
import ERBA from "./terreno_erba.jpg";
import ERBA_N from "./terreno_erba_n.jpg";
import TERRA from "./terreno_terra.jpg";
import TERRA_N from "./terreno_terra_n.jpg";
import { MAP, SITES, FLATS, MINE_HOLE, inSite, roadWorld } from "./sites";
import { groundMat } from "./ground";

export const SEA_Y = -1.3;
const STEP = 2, TILE = 32;                       // a vertex every 2 m, 32 cells (64 m) a tile
const GW = MAP.w / STEP + 1, GH = MAP.h / STEP + 1;   // vertices of the whole map
const TX = MAP.w / STEP / TILE, TZ = MAP.h / STEP / TILE;
const LOAD_R = 190, DROP_R = 260;                 // tiles nearer than this are built, farther ones dropped

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
  const [costa, rilievo, suolo] = await Promise.all([readImage(COSTA), readImage(RILIEVO), readImage(SUOLO)]);
  L = { costa, rilievo, suolo };
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
/** How much of the places' flat ground is at a world point (1 on it, 0 out in the country). */
export function flatAt(x, z) {
  let w = 0;
  for (const f of FL) {
    const [lx, lz] = f.s ? inSite(f.s, x, z) : [x, z];
    let d;
    if (f.circle) d = Math.hypot(lx - f.circle[0], lz - f.circle[1]) - f.circle[2];
    else { const [x0, z0, x1, z1] = f.box, qx = Math.max(x0 - lx, lx - x1, 0), qz = Math.max(z0 - lz, lz - z1, 0); d = Math.hypot(qx, qz); }
    if (d < f.blend) w = Math.max(w, 1 - smooth(0, f.blend, d));
  }
  return w;
}
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
  };
}
/** The height of the ground at a world point (the smooth one; what is drawn and walked on is surfaceAt). */
export function heightAt(x, z) {
  if (!L) return 0;
  const px = x + MAP.ox, pz = z + MAP.oz, d = sample(L.costa, px, pz, 0, 0) - 128;
  // the coast: the sea floor going down, the beach up to the plains (height 0)
  let h = d < 0 ? Math.max(SEA_Y - 8, SEA_Y + 0.1 + d * 0.14) : SEA_Y + 0.1 + (0 - SEA_Y - 0.1) * smooth(0, 12, d);
  if (d > 4) {
    const inland = smooth(4, 40, d);
    h += (fbm(x / 150, z / 150) * 1.4 + 1.0) * smooth(10, 60, d);                         // the plains roll a little (never down to the sea)
    const hill = sample(L.rilievo, px, pz, 1, 0) / 255;
    if (hill > 0.01) h += 10 * hill ** 1.2 * (0.6 + 0.4 * fbm(x / 60 + 3.3, z / 60)) * inland;
    const m = sample(L.rilievo, px, pz, 0, 0) / 255;
    if (m > 0.01) h += (78 * m ** 1.6 * (0.5 + 0.5 * ridge(x / 95, z / 95)) + 7 * m * fbm(x / 22, z / 22)) * inland;
  }
  const w = flatAt(x, z);
  return w > 0 ? h * (1 - w) : h;
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
/** Water too deep to wade at a world point (the sea; out of the map). */
export const deepWater = (x, z) => surfaceAt(x, z) < SEA_Y - 0.55;

// ---- the material: grass and dry ground by the map's colours, rock on the steep slopes, snow, ice, sand by the sea
const TERRAIN_V = `attribute vec4 aW;
varying vec4 vW;
varying vec3 tWP, tWN;`;
const TERRAIN_F = `uniform sampler2D tGrass, tDirt, tGrassN, tDirtN;
varying vec4 vW;
varying vec3 tWP, tWN;
float tHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float tNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( tHash( i ), tHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( tHash( i + vec2( 0.0, 1.0 ) ), tHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
`;
const TERRAIN_MAP = `
	vec2 tUv = tWP.xz / 1.9;
	vec2 tUvB = mat2( 0.8, -0.6, 0.6, 0.8 ) * tWP.xz / 4.4 + vec2( 0.37, 0.61 );
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
	tCol *= 1.0 - 0.22 * vW.w;                                                      // under the forests
	float tRock = smoothstep( 0.82, 0.62, normalize( tWN ).y );                    // steep: bare rock
	tCol = mix( tCol, mix( tD, vec3( tLum ), 0.35 ) * vec3( 1.08, 1.04, 1.0 ), tRock );
	float tSand = smoothstep( ${(SEA_Y + 0.75).toFixed(2)}, ${(SEA_Y + 0.25).toFixed(2)}, tWP.y );   // by the water: sand
	tCol = mix( tCol, vec3( 0.80, 0.72, 0.54 ) * ( 0.75 + 0.5 * tLum ), tSand * ( 1.0 - tRock ) );
	tCol *= mix( 1.0, 0.55, smoothstep( ${(SEA_Y - 0.2).toFixed(2)}, ${(SEA_Y - 2.5).toFixed(2)}, tWP.y ) );   // under the water: darker
	float tSnow = vW.y * ( 1.0 - tRock * 0.6 );
	tCol = mix( tCol, vec3( 0.9, 0.93, 0.97 ) * ( 0.82 + 0.36 * tLum ), tSnow );
	tCol = mix( tCol, vec3( 0.62, 0.8, 0.9 ) * ( 0.85 + 0.3 * tLum ), vW.z );
	diffuseColor.rgb *= tCol;
	float tRelief = 1.0 - max( vW.y, vW.z ) * 0.8;
`;
const TERRAIN_NORMAL = `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 tMapN = mix( texture2D( tGrassN, tUv ).xyz, texture2D( tDirtN, tUvD ).xyz, clamp( tDry * 0.6 + tRock, 0.0, 1.0 ) ) * 2.0 - 1.0;
	tMapN.xy *= normalScale * tRelief * ( 1.0 - tFar * 0.7 );
	vec3 tN = normalize( tWN ), tT = normalize( cross( vec3( 0.0, 0.0, 1.0 ), tN ) ), tB = cross( tN, tT );
	normal = normalize( ( viewMatrix * vec4( normalize( tT * tMapN.x + tB * tMapN.y + tN * tMapN.z ), 0.0 ) ).xyz );
#endif
`;
let mat = null;
function terrainMat(renderer) {
  if (mat) return mat;
  const L2 = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (src, srgb) => { const t = L2.load(src); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const grass = tex(ERBA, true), dirt = tex(TERRA, true), grassN = tex(ERBA_N), dirtN = tex(TERRA_N);
  // (map and normalMap only switch three.js' code for them on: the terrain samples its own textures)
  mat = new THREE.MeshStandardMaterial({ map: grass, normalMap: grassN, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: grass }, tDirt: { value: dirt }, tGrassN: { value: grassN }, tDirtN: { value: dirtN } });
    sh.vertexShader = TERRAIN_V + "\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvW = aW; tWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; tWN = normal;");
    sh.fragmentShader = TERRAIN_F + sh.fragmentShader.replace("#include <map_fragment>", TERRAIN_MAP).replace("#include <normal_fragment_maps>", TERRAIN_NORMAL);
  };
  mat.customProgramCacheKey = () => "terrain-1";
  return mat;
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

/** The ground, the sea and the roads: call update(camera position) every frame. */
export function createTerrain(scene, renderer) {
  const material = terrainMat(renderer), tiles = new Map(), group = new THREE.Group();
  group.userData.world = true; scene.add(group);
  // the sea: a wide plane following the camera, a little rippled
  const seaMat = new THREE.MeshStandardMaterial({ color: "#2d5566", roughness: 0.32, metalness: 0.05, transparent: true, opacity: 0.86 });
  seaMat.onBeforeCompile = (sh) => {
    sh.uniforms.sTime = { value: 0 }; seaMat.userData.sh = sh;
    sh.vertexShader = "varying vec3 sWP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tsWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    sh.fragmentShader = "uniform float sTime;\nvarying vec3 sWP;\n" + sh.fragmentShader.replace("#include <normal_fragment_maps>", `
	vec2 sP = sWP.xz * 0.35;
	vec3 sN = normalize( vec3( sin( sP.x * 1.3 + sTime * 1.1 ) * 0.06 + sin( sP.y * 1.9 - sTime * 0.8 + sP.x * 0.4 ) * 0.05, 1.0,
		cos( sP.y * 1.1 + sTime * 0.9 ) * 0.06 + sin( sP.x * 2.3 + sTime * 1.3 + sP.y * 0.6 ) * 0.04 ) );
	normal = normalize( ( viewMatrix * vec4( sN, 0.0 ) ).xyz );`);
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; sea.renderOrder = 1; sea.userData.world = true;
  scene.add(sea);
  // the roads: a strip of dirt following the ground (a little above it), 3.4 m wide, smoothed between the points
  const roadMat = groundMat(renderer, "terra", { scale: 2.6, tint: "#efe6d8", vary: 0.12, dry: 0 });
  roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -2; roadMat.polygonOffsetUnits = -2;
  const roads = ["valdoro", "miniera"].map((id) => {
    const pts = roadWorld(id).map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), len = curve.getLength(), n = Math.max(2, Math.round(len / 2));
    const half = 1.7, ps = [], idx = [], uv = [];
    for (let k = 0; k <= n; k++) {
      const p = curve.getPointAt(k / n), t = curve.getTangentAt(k / n), sx = -t.z, sz = t.x, l = Math.hypot(sx, sz) || 1;
      [-1, -0.5, 0, 0.5, 1].forEach((f) => { const x = p.x + (sx / l) * half * f, z = p.z + (sz / l) * half * f; ps.push(x, surfaceAt(x, z) + 0.05, z); uv.push(0, 0); });
      if (k) for (let c = 0; c < 4; c++) { const a = (k - 1) * 5 + c, b = a + 5; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // (facing up)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, roadMat); m.receiveShadow = true; m.userData.world = true; scene.add(m);
    return { id, mesh: m, points: Array.from({ length: n + 1 }, (_, k) => curve.getPointAt(k / n)) };
  });
  let ct = -1, cj = -1;
  const t0 = performance.now();
  return {
    group, sea, roads,
    /** Builds the tiles near p (all of them at once with `all`), drops the far ones; moves the sea. far: beyond it
     *  (the fog) the tiles are not drawn. */
    update(p, dt = 0, all = false, far = Infinity) {
      seaMat.userData.sh && (seaMat.userData.sh.uniforms.sTime.value = (performance.now() - t0) / 1000);
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
          else if (m) m.visible = d - TILE * STEP * 0.71 < far;
        });
      }
    },
    count: () => tiles.size,
  };
}
