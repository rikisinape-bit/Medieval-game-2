// The trees of the open country: the forests of the map (its drawn trees: the forest layer) and a few trees scattered on
// its plains; never on the places' ground, on the roads, in the water or on the beach, on steep slopes and cliffs;
// in the snow pines and dead trees. In the forests trees of every size (young ones, middling ones, old giants; in the
// thick of them a second, young tree beside each) and undergrowth: bushes, ferns, big plants, tall grass, mushrooms.
// The trees are the Shapespark kit's (BROAD: six of its twelve, each model costs its own draws), the pines only in the snow.
// Placed a tile (64 m) at a time, always the same (from the tile's number).
// Near the player (NEAR) they are the models, instanced (a dozen draws for all of them), the undergrowth nearer still
// (NEAR_U); farther, up to TREE_FAR, the kit's trees are their own picture seen from where the player is (impostors:
// one draw for all, 2 triangles each), pines and dead trees a cone or a bare trunk. Between the two the model dissolves
// into its picture over BAND metres (both drawn, each on the pixels the other leaves), and far away the pictures thin
// out the same way: nothing jumps. The old map's trees (Roccanera, the bandits' wood: addFixed) are drawn the same way.
// Their trunks stop whoever walks into them (push); the undergrowth does not.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { libParts, natureScale, crownShading } from "./nature";
import { layersAt, surfaceAt, treeFree, nearRoad, SEA_Y } from "./terrain";
import { MAP } from "./sites";

// NEAR: where a grown tree's model has become its picture (NEAR_Y for the young ones, k < 0.8), over BAND metres
const TILE = 64, CELL = 6.4, N = TILE / CELL, NEAR = 34, NEAR_Y = 26, BAND = 9, NEAR_U = 30, SHADE = 28, REBUILD = 5, TREE_FAR = 300;
const PINES = ["pino_1", "pino_2", "pino_3"], BROAD = ["albero_a1", "albero_b1", "albero_c1", "albero_a2", "albero_b2", "albero_c2"], MODELS = [...PINES, ...BROAD, "morto"];
const UNDER = ["cespuglio", "felce", "pianta_grande", "erba_alta", "fungo"];
const KIND = (id) => (id === "morto" ? 2 : id.startsWith("pino") ? 0 : 1);   // far: cone, picture (ball without a renderer), bare trunk
const TX = Math.ceil(MAP.w / TILE), TZ = Math.ceil(MAP.h / TILE);
const rand = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

const steep = (x, z) => Math.hypot(surfaceAt(x + 1.5, z) - surfaceAt(x - 1.5, z), surfaceAt(x, z + 1.5) - surfaceAt(x, z - 1.5)) / 3;
// The trees of a tile [{ x, y, z, id, ry, k, r }] and its undergrowth [{ x, y, z, id, ry, k }]
function tileTrees(ti, tj) {
  const trees = [], under = [], x0 = ti * TILE - MAP.ox, z0 = tj * TILE - MAP.oz;
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const seed = (tj * TX + ti) * 128 + b * N + a, ly = layersAt(x0 + (a + 0.5) * CELL, z0 + (b + 0.5) * CELL);
    if (ly.ice > 0.3) continue;
    const thick = ly.forest > 0.45 && ly.snow < 0.5;
    for (let n = 0; n < (thick ? 2 : 1); n++) {                            // (in the thick of a forest: a young tree too)
      const s2 = seed * 3 + n;
      const x = x0 + (a + 0.5 + (rand(s2, 1, 7) - 0.5) * 0.9) * CELL, z = z0 + (b + 0.5 + (rand(s2, 2, 7) - 0.5) * 0.9) * CELL;
      let p = n ? (ly.forest - 0.45) * 1.3 : ly.forest > 0.05 ? Math.min(0.75, 0.06 + ly.forest * 1.05) : 0.022;
      if (ly.snow > 0.5 && ly.forest < 0.3) p *= 0.15;                     // (the snow: only its forest)
      if (ly.mount > 0.3) p *= Math.max(0, 1 - (ly.mount - 0.3) * 2.5);    // none high on the mountains
      if (rand(s2, 3, 7) > p) continue;
      const y = surfaceAt(x, z);
      if (y < SEA_Y + 0.9 || !treeFree(x, z) || nearRoad(x, z, 4.5) || steep(x, z) > 0.65) continue;
      const r = rand(s2, 4, 7), sz = rand(s2, 5, 7);
      const id = ly.snow > 0.5 ? (r < 0.55 ? PINES[Math.floor(r * 5.4) % 3] : "morto")
        : ly.forest > 0.35 && r >= 0.96 ? "morto" : BROAD[Math.floor(r * 61) % BROAD.length];
      // sizes: young ones beside the others; in the forests small, middling and old giants; on the plains grown trees
      const k = n ? 0.42 + sz * 0.3 : ly.forest > 0.3 ? (sz < 0.25 ? 0.55 + sz * 0.9 : sz < 0.78 ? 0.85 + (sz - 0.25) * 0.66 : 1.3 + (sz - 0.78) * 2.8) : 0.85 + sz * 0.6;
      trees.push({ x, y, z, id, ry: rand(s2, 6, 7) * Math.PI * 2, k, r: (id === "morto" ? 0.3 : 0.4) * k });
    }
    // the undergrowth: thick in the forests (the more the thicker), here and there on the plains
    const f = ly.snow > 0.5 || ly.mount > 0.5 ? 0 : ly.forest;
    const nu = f > 0.3 ? 2 + (rand(seed, 9, 7) < f ? 1 : 0) + (rand(seed, 10, 7) < f - 0.4 ? 1 : 0) : rand(seed, 9, 7) < 0.1 ? 1 : 0;
    for (let u = 0; u < nu; u++) {
      const s3 = seed * 7 + u + 11;
      const x = x0 + (a + rand(s3, 1, 9)) * CELL, z = z0 + (b + rand(s3, 2, 9)) * CELL, y = surfaceAt(x, z);
      if (y < SEA_Y + 0.9 || !treeFree(x, z) || nearRoad(x, z, 3.2) || steep(x, z) > 0.8) continue;
      const r = rand(s3, 3, 9);
      const id = f > 0.3 ? (r < 0.34 ? "cespuglio" : r < 0.7 ? "felce" : r < 0.84 ? "pianta_grande" : r < 0.95 ? "erba_alta" : "fungo") : r < 0.55 ? "cespuglio" : "erba_alta";
      const k = (id === "felce" ? 1.0 : id === "cespuglio" ? 0.9 : 0.8) + rand(s3, 4, 9) * 0.6;
      under.push({ x, y, z, id, ry: rand(s3, 5, 9) * Math.PI * 2, k });
    }
  }
  return { trees, under };
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

// ---- the hand-over between near and far (all the trees' materials here): the distance of the tree's foot from the
// camera, a fixed screen pattern; the model keeps the pixels the far form leaves, and the other way round
const FADE_F = `varying float vTreeD;
float treeDither() { return fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ); }`;
const NEAR_CUT = (nd) => `if ( treeDither() < smoothstep( ${nd - BAND}.0, ${nd}.0, vTreeD ) ) discard;`;
const FAR_CUT = (nd) => `if ( treeDither() >= smoothstep( ${nd} - ${BAND}.0, ${nd}, vTreeD ) ) discard;`;
// far away (the last 60 m before TREE_FAR) the far forms shrink to nothing, from their foot: no dots, no jump
const FAR_SHRINK = `( 1.0 - smoothstep( ${TREE_FAR - 60}.0, ${TREE_FAR}.0, distance( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz, cameraPosition.xz ) ) )`;
// a copy of a material whose instances fade in or out with their distance (its own changes kept, e.g. the crowns');
// nd: the distance where a model has become its far form
function fading(src, far, key, nd = NEAR) {
  const m = src.clone();
  if (src.userData.crown) crownShading(m);
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vTreeD;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + (far ? `\n\ttransformed *= ${FAR_SHRINK};` : ""))
      .replace("#include <project_vertex>", "#include <project_vertex>\n\tvTreeD = distance( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz, cameraPosition.xz );");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FADE_F)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\t" + (far ? FAR_CUT(`${nd}.0`) : NEAR_CUT(nd)));
  };
  m.customProgramCacheKey = () => `${key}-${far ? "far" : "near"}-${nd}`;
  return m;
}

// ---- the far kit trees (impostors). At the start each model is drawn from VIEWS sides around it (from the height of
// its foot) into two atlases, a row per model and a cell per side: its colours (unlit) and the directions its leaves
// and bark face (the model's own normals, nature.js crownNormals: in the tree's frame). Far away a tree is one upright
// quad turned to the camera, with the pictures of the side the camera is on (blended with the next one as the camera
// goes round), lit by the sun and the sky through those normals: exactly like its model, which dissolves into it.
// Returns { mesh, at: { id: [row v, quad width, quad height] } }, or null without a renderer.
const VIEWS = 8, CW = 80, CH = 160;
const NORMAL_MAT = (map) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map } }, side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying vec2 vUv; void main() { vN = normal; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
  fragmentShader: "uniform sampler2D map; varying vec3 vN; varying vec2 vUv; void main() { if ( texture2D( map, vUv ).a < 0.5 ) discard; gl_FragColor = vec4( normalize( vN ) * 0.5 + 0.5, 1.0 ); }",
});
function makeImpostors(renderer, ids, max) {
  if (!renderer) return null;
  const rows = ids.length, W = VIEWS * CW, H = rows * CH;
  const opts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
  const rt = new THREE.WebGLRenderTarget(W, H, { ...opts, colorSpace: THREE.SRGBColorSpace }), rtN = new THREE.WebGLRenderTarget(W, H, opts);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200), stage = new THREE.Scene(), stageN = new THREE.Scene(), at = {}, used = [];
  const keep = { target: renderer.getRenderTarget(), auto: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  // (under the alpha: a leafy colour and an upward normal, so the mipmaps get no dark or odd rims)
  renderer.setRenderTarget(rt); renderer.setClearColor("#3a4a2c", 0); renderer.clear();
  renderer.setRenderTarget(rtN); renderer.setClearColor(new THREE.Color(0.5, 1, 0.5), 0); renderer.clear();
  renderer.autoClear = false;
  ids.forEach((id, row) => {
    const parts = libParts(id);
    let r = 0, h = 0;
    parts.forEach((p) => {
      const P = p.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { r = Math.max(r, Math.hypot(P.getX(i), P.getZ(i))); h = Math.max(h, P.getY(i)); }
    });
    const hw = r * 1.04; h *= 1.02;                                       // (the quad: centred on the trunk, wide enough for every side)
    stage.clear(); stageN.clear();
    parts.forEach((p) => {
      const mc = new THREE.MeshBasicMaterial({ map: p.material.map, alphaTest: 0.5, side: THREE.DoubleSide }), mn = NORMAL_MAT(p.material.map);
      used.push(mc, mn); stage.add(new THREE.Mesh(p.geometry, mc)); stageN.add(new THREE.Mesh(p.geometry, mn));
    });
    Object.assign(cam, { left: -hw, right: hw, top: h, bottom: 0 }); cam.updateProjectionMatrix();
    for (let v = 0; v < VIEWS; v++) {
      const a = (v / VIEWS) * Math.PI * 2;
      cam.position.set(Math.sin(a) * (hw + 50), 0, Math.cos(a) * (hw + 50)); cam.lookAt(0, 0, 0);
      const x = v * CW, y = row * CH;
      for (const [target, sc] of [[rt, stage], [rtN, stageN]]) {
        target.viewport.set(x, y, CW, CH); target.scissor.set(x, y, CW, CH); target.scissorTest = true;
        renderer.setRenderTarget(target); renderer.render(sc, cam);
      }
    }
    at[id] = [(row * CH) / H, hw * 2, h];
  });
  [rt, rtN].forEach((t) => { t.viewport.set(0, 0, W, H); t.scissorTest = false; });
  stage.clear(); stageN.clear(); used.forEach((m) => m.dispose());
  renderer.setRenderTarget(keep.target); renderer.autoClear = keep.auto; renderer.setClearColor(keep.color, keep.alpha);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geo.setAttribute("aImp", new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.impN = { value: rtN.texture };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
attribute float aImp;
varying vec2 vQuv; varying float vRow, vView, vYaw, vTreeD, vNearD;`).replace("#include <project_vertex>", `
	vNearD = length( instanceMatrix[ 2 ].xyz );                                                    // (where it takes over from the model)
	vec3 iC = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	vec2 toC = cameraPosition.xz - iC.xz; vTreeD = length( toC ); toC /= max( vTreeD, 0.001 );
	float iS = 1.0 - smoothstep( ${TREE_FAR - 60}.0, ${TREE_FAR}.0, vTreeD );                         // (far away: shrinking to nothing)
	float iW = length( instanceMatrix[ 0 ].xyz ) * iS, iH = length( instanceMatrix[ 1 ].xyz ) * iS;
	vec3 bR = vec3( toC.y, 0.0, - toC.x );
	vec4 mvPosition = viewMatrix * vec4( iC + bR * ( position.x * iW ) + vec3( 0.0, position.y * iH, 0.0 ), 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	vYaw = atan( - instanceMatrix[ 0 ].z, instanceMatrix[ 0 ].x );                                   // (the tree's own turn)
	vView = mod( ( atan( toC.x, toC.y ) - vYaw ) * ${(VIEWS / (Math.PI * 2)).toFixed(6)}, ${VIEWS}.0 );   // (the side the camera is on)
	vQuv = vec2( position.x + 0.5, position.y ); vRow = aImp;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
${FADE_F}
uniform sampler2D impN;
varying vec2 vQuv; varying float vRow, vView, vYaw, vNearD;`)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\t" + FAR_CUT("vNearD"))
      .replace("#include <map_fragment>", `
	float iv0 = floor( vView ), ivt = vView - iv0, iv1 = mod( iv0 + 1.0, ${VIEWS}.0 );
	vec2 iCell = vec2( vQuv.x / ${VIEWS}.0, vQuv.y / ${rows}.0 ), iUv0 = vec2( iv0 / ${VIEWS}.0, vRow ) + iCell, iUv1 = vec2( iv1 / ${VIEWS}.0, vRow ) + iCell;
	vec4 sampledDiffuseColor = mix( texture2D( map, iUv0 ), texture2D( map, iUv1 ), ivt );
	diffuseColor *= sampledDiffuseColor;`)
      .replace("#include <alphatest_fragment>", `
	{ vec2 t = iCell * vec2( textureSize( map, 0 ) ), dx = dFdx( t ), dy = dFdy( t );   // (far away the leaves do not thin out)
	  diffuseColor.a *= 1.0 + max( 0.0, 0.5 * log2( max( dot( dx, dx ), dot( dy, dy ) ) ) ) * 0.28; }
	if ( diffuseColor.a < alphaTest ) discard;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
	{ vec3 nm = normalize( mix( texture2D( impN, iUv0 ).xyz, texture2D( impN, iUv1 ).xyz, ivt ) * 2.0 - 1.0 );   // (in the tree's frame)
	  float cy = cos( vYaw ), sy = sin( vYaw );
	  normal = normalize( ( viewMatrix * vec4( cy * nm.x + sy * nm.z, nm.y, - sy * nm.x + cy * nm.z, 0.0 ) ).xyz ); }`);
  };
  mat.customProgramCacheKey = () => "tree-impostor";
  return { mesh: new THREE.InstancedMesh(geo, mat, max), at };
}

/** The trees of the open country; update(camera position, fog's far) every frame. renderer: for the far trees' pictures. */
export function createVegetation(scene, renderer) {
  const tiles = new Map(), cells = new Map(), group = new THREE.Group();
  group.userData.world = true; scene.add(group);
  const ok = MODELS.every((id) => libParts(id)), okU = UNDER.filter((id) => libParts(id));
  // near: one instanced mesh for each part of each model
  const near = [];
  const nearMats = new Map();                                              // (one fading copy of each material and hand-over)
  const nearMat = (src, nd) => { const key = `${src.uuid}|${nd}`; if (!nearMats.has(key)) nearMats.set(key, fading(src, false, src.userData.crown ? "crown" : "tree", nd)); return nearMats.get(key); };
  // grown trees with and without shadows, young ones (no shadows: they stand under the others)
  if (ok) for (const [shade, young] of [[true, false], [false, false], [false, true]]) MODELS.forEach((id) => libParts(id).forEach((pt) => {
    if (young && !BROAD.includes(id)) return;                               // (only the kit's trees have young ones)
    const m = new THREE.InstancedMesh(pt.geometry, nearMat(pt.material, young ? NEAR_Y : NEAR), shade ? 300 : young ? 500 : 900);
    m.count = 0; m.frustumCulled = false; m.castShadow = shade; m.receiveShadow = !pt.material.userData.crown;   // (crowns: nature.js)
    group.add(m); near.push({ id, m, s: natureScale(id), shade, young });
  }));
  // the undergrowth near the player (no shadows of its own: it is under the trees' already)
  const low = [];
  // (the pack's bushes have the twisted trees' blood-red leaves, its ferns and grass odd tints: in the forests of the
  // open country their leaves are green, as light or dark as they are)
  const green = (mat, red) => {
    const g = mat.clone();
    const lum = red ? "( diffuseColor.r + 0.12 ) * 1.05" : "( dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) ) + 0.08 ) * 1.5";
    g.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>\n\tdiffuseColor.rgb = vec3( 0.36, 0.62, 0.24 ) * ${lum};`); };
    g.customProgramCacheKey = () => `leaf-green-${red ? 1 : 0}`;
    return g;
  };
  okU.forEach((id) => libParts(id).forEach((pt) => {
    const leaf = /Leaves|Grass/.test(pt.material.name), red = /TwistedTree/.test(pt.material.name);
    const m = new THREE.InstancedMesh(pt.geometry, leaf ? green(pt.material, red) : pt.material, 700);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = true;
    group.add(m); low.push({ id, m, s: natureScale(id) });
  }));
  const farMat0 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), farMat = ok ? fading(farMat0, true, "simple") : farMat0;   // (no models: far forms everywhere; pines and dead trees are never young)
  const imp = ok ? makeImpostors(renderer, BROAD, 9000) : null;            // (the kit's trees far away: their pictures)
  const far = [0, 1, 2].map((kind) => {
    const m = kind === 1 && imp ? imp.mesh : new THREE.InstancedMesh(farGeometry(kind), farMat, 9000);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = !(kind === 1 && imp);
    group.add(m); return m;
  });
  const aImp = imp?.mesh.geometry.attributes.aImp;
  const fixed = [];                                                         // the old map's trees (addFixed)
  // (the far ones made as tall as the models they stand for)
  const FAR_K = { pino_1: 1.0, pino_2: 1.1, pino_3: 0.95, albero_a1: 1.05, albero_b1: 1.05, albero_c1: 1.25, albero_a2: 1.05, albero_b2: 1.1, albero_c2: 1.2, morto: 1.05 };
  const tileOf = (ti, tj) => {
    const key = tj * TX + ti;
    let t = tiles.get(key);
    if (!t) {
      t = tileTrees(ti, tj); tiles.set(key, t);
      t.trees.forEach((tr) => { const ck = `${Math.floor(tr.x / 8)}|${Math.floor(tr.z / 8)}`; (cells.get(ck) || cells.set(ck, []).get(ck)).push(tr); });
    }
    return t;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  let lx = Infinity, lz = Infinity, lfar = 0, pending = false;
  const counts = { near: 0, far: 0, under: 0 };
  // one tree: its model near, its far form far, both in the band between (the shaders share the pixels out)
  const place = (t, d) => {
    q.setFromAxisAngle(UP, t.ry);
    const young = t.k < 0.8 && BROAD.includes(t.id), nd = young ? NEAR_Y : NEAR;
    if (d < nd + REBUILD + 1 && ok) {
      const shade = d < SHADE && !young && t.k >= 0.8;
      for (const n of near) {
        if (n.id !== t.id || n.shade !== shade || n.young !== young || n.m.count >= n.m.instanceMatrix.count) continue;
        const k = n.s * t.k;
        n.m.setMatrixAt(n.m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(k, k, k)));
      }
    }
    if (d > nd - BAND - REBUILD - 1 || !ok) {
      const m = far[KIND(t.id)], c = imp?.at[t.id];
      if (m.count >= m.instanceMatrix.count) return;
      if (c) {                                                            // its pictures: as big as the model
        const ks = t.k * natureScale(t.id);
        aImp.setX(m.count, c[0]);
        m.setColorAt(m.count, tint.setScalar(1));
        m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(c[1] * ks, c[2] * ks, nd)));   // (z: its hand-over distance)
      } else {
        const k = t.k * (FAR_K[t.id] || 1);
        m.setColorAt(m.count, tint.setScalar(0.82 + (t.ry % 1) * 0.3)); m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.1, t.z), q, sc.set(k, k, k)));
      }
    }
  };
  function rebuild(px, pz, fogFar) {
    const R = Math.min(fogFar, TREE_FAR) + 8, a0 = Math.max(0, Math.floor((px + MAP.ox - R) / TILE)), a1 = Math.min(TX - 1, Math.floor((px + MAP.ox + R) / TILE));
    const b0 = Math.max(0, Math.floor((pz + MAP.oz - R) / TILE)), b1 = Math.min(TZ - 1, Math.floor((pz + MAP.oz + R) / TILE));
    let made = 0;
    pending = false;
    near.forEach((n) => { n.m.count = 0; }); far.forEach((m) => { m.count = 0; }); low.forEach((n) => { n.m.count = 0; });
    for (let tj = b0; tj <= b1; tj++) for (let ti = a0; ti <= a1; ti++) {
      const cx = (ti + 0.5) * TILE - MAP.ox, cz = (tj + 0.5) * TILE - MAP.oz;
      if (Math.hypot(cx - px, cz - pz) > R + TILE * 0.71) continue;
      if (!tiles.has(tj * TX + ti)) { if (made >= 4) { pending = true; continue; } made++; }   // (a few new tiles a frame)
      const tile = tileOf(ti, tj);
      for (const t of tile.under) {
        if (Math.hypot(t.x - px, t.z - pz) > NEAR_U) continue;
        q.setFromAxisAngle(UP, t.ry);
        for (const n of low) {
          if (n.id !== t.id || n.m.count >= n.m.instanceMatrix.count) continue;
          const k = n.s * t.k;
          n.m.setMatrixAt(n.m.count++, m4.compose(v.set(t.x, t.y - 0.05, t.z), q, sc.set(k, k, k)));
        }
      }
      for (const t of tile.trees) { const d = Math.hypot(t.x - px, t.z - pz); if (d <= R) place(t, d); }
    }
    for (const t of fixed) { const d = Math.hypot(t.x - px, t.z - pz); if (d <= R) place(t, d); }
    near.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; }); low.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; });
    far.forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    if (aImp) aImp.needsUpdate = true;
    counts.near = near.reduce((s, n) => s + n.m.count, 0); counts.far = far.reduce((s, m) => s + m.count, 0); counts.under = low.reduce((s, n) => s + n.m.count, 0);
    for (const [key] of tiles) {                                            // (far behind: forgotten)
      const ti = key % TX, tj = Math.floor(key / TX), cx = (ti + 0.5) * TILE - MAP.ox, cz = (tj + 0.5) * TILE - MAP.oz;
      if (Math.hypot(cx - px, cz - pz) > 420) {
        tiles.get(key).trees.forEach((tr) => { const ck = `${Math.floor(tr.x / 8)}|${Math.floor(tr.z / 8)}`, l = cells.get(ck); if (l) { l.splice(l.indexOf(tr), 1); if (!l.length) cells.delete(ck); } });
        tiles.delete(key);
      }
    }
  }
  return {
    group, counts,
    /** (tests) The trees of the tiles already made and the fixed ones within r of a point. */
    treesNear(x, z, r) { const out = []; tiles.forEach((t) => t.trees.forEach((tr) => { if (Math.hypot(tr.x - x, tr.z - z) < r) out.push(tr); })); fixed.forEach((tr) => { if (Math.hypot(tr.x - x, tr.z - z) < r) out.push(tr); }); return out; },
    /** Trees placed by the old map (world coordinates, { x, y, z, id, ry, k }): drawn like these (their collisions are
     *  the engine's obstacles). Ids among MODELS. */
    addFixed(list) { fixed.push(...list.filter((t) => MODELS.includes(t.id))); lx = Infinity; },
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
