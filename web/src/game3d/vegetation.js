// The trees of the open country: the forests of the map (its drawn trees: the forest layer) and a few trees scattered on
// its plains; never on the places' ground, on the roads, in the water or on the beach, on steep slopes and cliffs;
// in the snow the user's big trees of 27/11 (TALL: pines, trees under snow, bare ones with snow on their branches; the
// pines also in the great southern forest, among the others). In the forests trees of every size (young ones, middling
// ones, old giants; in the thick of them a second, young tree beside each) and undergrowth: bushes, ferns, big plants,
// tall grass, mushrooms. The other trees are the Shapespark kit's (BROAD: six of its twelve, each model costs its own
// draws) and now and then a dead one.
// Placed a tile (64 m) at a time, always the same (from the tile's number).
// Near the player (NEAR) they are the models, instanced (a dozen draws for all of them), the undergrowth nearer still
// (NEAR_U); farther, up to TREE_FAR, every tree is its own picture seen from where the player is (impostors: one draw
// for all, 2 triangles each; a cone, a ball or a bare trunk only if the pictures cannot be made). Between the two the
// model dissolves into its picture over BAND metres (both drawn, each on the pixels the other leaves), and far away the
// pictures thin out the same way: nothing jumps (since 27/11 the snowy forest's trees too: before, its pines and dead
// trees turned into cones and bare trunks far away). The pines of the snow have a little snow on their needles
// (pino_neve, nature.js). The deeper inside a forest, the taller its trees (growth: the kit's and the dead ones, up to
// the pines' height at the heart of the great forest; the pines are tall already). The old map's trees (Roccanera, the bandits' wood: addFixed) are drawn the same way.
// Their trunks stop whoever walks into them (push); the undergrowth does not.
// More of them since 27/11 (the user: "aggiungi più alberi cespugli e rocce"): groves on the plains (where a slow noise
// says so), bushes, flowering bushes and flowers in the meadows, the undergrowth seen farther (fading in at its edge);
// and the user's stylized rocks (sasso_1..11): where the ground is rocky (hills, the mountains' feet, dry ground) and
// here and there everywhere, now and then a boulder with stones round it; instanced, one draw per model (the small
// ones cast no shadow), fading in at ROCK_R; the big ones stop whoever walks into them, like the trunks. (Not a
// BatchedMesh: without the multi-draw extension, which some phones lack, it draws every rock by itself.)
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { libParts, natureScale, crownShading, frostShading } from "./nature";
import { layersAt, surfaceAt, treeFree, nearRoad, forestDepthAt, SEA_Y } from "./terrain";
import { MAP } from "./sites";

// NEAR: where a grown tree's model has become its picture (NEAR_Y for the young ones, k < 0.8), over BAND metres
const TILE = 64, CELL = 6.4, N = TILE / CELL, NEAR = 34, NEAR_Y = 26, BAND = 9, NEAR_U = 42, SHADE = 28, REBUILD = 5, TREE_FAR = 300, ROCK_R = 130;
const BROAD = ["albero_a1", "albero_b1", "albero_c1", "albero_a2", "albero_b2", "albero_c2"], TALL = ["pino_4m", "pino_neve", "albero_neve", "albero_spoglio_neve"];
const MODELS = [...TALL, ...BROAD, "morto"];
// the trunk's radius (metres at k = 1: what stops a body) of each kind of tree
const TRUNK = { pino_4m: 0.22, pino_neve: 0.22, albero_neve: 0.85, albero_spoglio_neve: 0.7, morto: 0.3 };
// where a tree's model has become its picture, if not at NEAR: the tree under snow, the heaviest (7000 triangles), sooner
const NEAR_OF = { albero_neve: 26 };
const UNDER = ["cespuglio", "felce", "pianta_grande", "erba_alta", "fungo", "cespuglio_fiorito", "fiori"];
// the user's rocks by size: small stones, middling and standing ones, boulders (tools/rocce-glb.py)
const SMALL = ["sasso_1", "sasso_6", "sasso_7", "sasso_10", "sasso_2", "sasso_11"], MID = ["sasso_5", "sasso_8", "sasso_9", "sasso_2"], BIG = ["sasso_3", "sasso_4"];
const ROCKS = Array.from({ length: 11 }, (_, i) => `sasso_${i + 1}`);
const KIND = (id) => (id.startsWith("pino") ? 0 : id === "morto" || id === "albero_spoglio_neve" ? 2 : 1);   // far without pictures: cone, ball, bare trunk
// the great forest of the south (its box on the map): pines among its trees
const southForest = (x, z) => x > -300 && x < 150 && z > 100 && z < 720;
// The deeper inside a forest, the taller the trees (the user, 27/11: "più ci addentriamo e più gli alberi devono essere
// alti ... non tutti così [giovani]"): how deep (0..1) from 10 m inside its edge to 120 m (the heart of the great
// southern forest is 139 m deep, the eastern forests about 50: a little, the groves nothing)...
const deepAt = (x, z) => smooth01((forestDepthAt(x, z) - 10) / 110);
// ...and how much a tree of the kit or a dead one grows there (size k0): at the heart 1.9 times as tall (a middling
// one ~15 m, as tall as the pines), the giants less (~18-21 m), the crowns 0.6 of that wider (deep in a forest trees
// are tall and narrow). [width factor, extra height over it]; the pines are tall already.
function growth(id, k0, g) {
  if (!g || (!BROAD.includes(id) && id !== "morto")) return [1, 1];
  const F = 1.9 - 0.55 * Math.max(0, k0 - 1), hf = 1 + (F - 1) * g, wf = 1 + (F - 1) * g * 0.6;
  return [wf, hf / wf];
}
const TX = Math.ceil(MAP.w / TILE), TZ = Math.ceil(MAP.h / TILE);
const rand = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
// a slow noise (0..1) over the world: where the plains have groves
const groveAt = (x, z) => {
  const u = x / 95 + 31.7, v = z / 95 + 12.3, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  const h = (a, b) => rand(a, b, 77);
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv;
};
// a rock's size (its model's box: height, footprint radius), measured once the models are there
const rockSize = {};

const steep = (x, z) => Math.hypot(surfaceAt(x + 1.5, z) - surfaceAt(x - 1.5, z), surfaceAt(x, z + 1.5) - surfaceAt(x, z - 1.5)) / 3;
// The trees of a tile [{ x, y, z, id, ry, k, r }] and its undergrowth [{ x, y, z, id, ry, k }]
function tileTrees(ti, tj) {
  const trees = [], under = [], rocks = [], x0 = ti * TILE - MAP.ox, z0 = tj * TILE - MAP.oz;
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const seed = (tj * TX + ti) * 128 + b * N + a, ly = layersAt(x0 + (a + 0.5) * CELL, z0 + (b + 0.5) * CELL);
    if (ly.ice > 0.3) continue;
    const thick = ly.forest > 0.45 && ly.snow < 0.5;
    const grove = smooth01((groveAt(x0 + (a + 0.5) * CELL, z0 + (b + 0.5) * CELL) - 0.52) / 0.24);   // (0..1: a grove of the plains)
    for (let n = 0; n < (thick ? 2 : 1); n++) {                            // (in the thick of a forest: a young tree too)
      const s2 = seed * 3 + n;
      const x = x0 + (a + 0.5 + (rand(s2, 1, 7) - 0.5) * 0.9) * CELL, z = z0 + (b + 0.5 + (rand(s2, 2, 7) - 0.5) * 0.9) * CELL;
      let p = n ? (ly.forest - 0.45) * 1.5 : ly.forest > 0.05 ? Math.min(0.78, 0.08 + ly.forest * 1.05) : 0.03 + grove * 0.16;
      if (ly.snow > 0.5 && ly.forest < 0.3) p *= 0.15;                     // (the snow: only its forest)
      if (ly.mount > 0.3) p *= Math.max(0, 1 - (ly.mount - 0.3) * 2.5);    // none high on the mountains
      if (rand(s2, 3, 7) > p) continue;
      const y = surfaceAt(x, z);
      if (y < SEA_Y + 0.9 || !treeFree(x, z) || nearRoad(x, z, 4.5) || steep(x, z) > 0.65) continue;
      const r = rand(s2, 4, 7), deep = ly.forest > 0.3 && ly.snow < 0.5 ? deepAt(x, z) : 0;
      // in the snow: pines most, trees under snow, bare ones; in the great southern forest a pine every three or four
      const id = ly.snow > 0.5 ? (r < 0.6 ? "pino_neve" : r < 0.8 ? "albero_neve" : "albero_spoglio_neve")
        : ly.forest > 0.35 && r >= 0.96 ? "morto" : !n && ly.forest > 0.35 && southForest(x, z) && rand(s2, 8, 7) < 0.3 ? "pino_4m" : BROAD[Math.floor(r * 61) % BROAD.length];
      // sizes: young ones beside the others; in the forests small, middling and old giants; on the plains grown trees;
      // the big ones of 27/11 from a little smaller than their model to half again as big (pines), a fifth (the others)
      // (deep in a forest fewer small trees of the kit and more giants: their sizes pushed up)
      const sz = TALL.includes(id) ? rand(s2, 5, 7) : rand(s2, 5, 7) ** (1 / (1 + deep * 0.8));
      const k0 = TALL.includes(id) ? (id.startsWith("pino") ? 0.75 + sz * 0.75 : 0.8 + sz * 0.4)
        : n ? 0.42 + sz * 0.3 : ly.forest > 0.3 ? (sz < 0.25 ? 0.55 + sz * 0.9 : sz < 0.78 ? 0.85 + (sz - 0.25) * 0.66 : 1.3 + (sz - 0.78) * 2.8) : 0.85 + sz * 0.6;
      // (deep in a forest taller; k: its width, h: its height over that; still young if it was born small)
      const [gw, h] = growth(id, k0, deep), k = k0 * gw;
      trees.push({ x, y, z, id, ry: rand(s2, 6, 7) * Math.PI * 2, k, h, young: k0 < 0.8, r: (TRUNK[id] || 0.4) * k });
    }
    // the undergrowth: thick in the forests (the more the thicker), here and there on the plains
    const f = ly.snow > 0.5 || ly.mount > 0.5 ? 0 : ly.forest;
    const nu = f > 0.3 ? 2 + (rand(seed, 9, 7) < f ? 1 : 0) + (rand(seed, 10, 7) < f - 0.4 ? 1 : 0) : (rand(seed, 9, 7) < 0.3 + grove * 0.4 ? 1 : 0) + (rand(seed, 10, 7) < grove * 0.5 ? 1 : 0);
    for (let u = 0; u < nu; u++) {
      const s3 = seed * 7 + u + 11;
      const x = x0 + (a + rand(s3, 1, 9)) * CELL, z = z0 + (b + rand(s3, 2, 9)) * CELL, y = surfaceAt(x, z);
      if (y < SEA_Y + 0.9 || !treeFree(x, z) || nearRoad(x, z, 3.2) || steep(x, z) > 0.8) continue;
      const r = rand(s3, 3, 9);
      const id = f > 0.3 ? (r < 0.34 ? "cespuglio" : r < 0.7 ? "felce" : r < 0.84 ? "pianta_grande" : r < 0.95 ? "erba_alta" : "fungo")
        : ly.snow > 0.5 ? "cespuglio" : r < 0.42 ? "cespuglio" : r < 0.62 ? "erba_alta" : r < 0.82 ? "cespuglio_fiorito" : "fiori";   // (the meadows: in flower)
      const k = (id === "felce" ? 1.0 : id === "cespuglio" ? 0.9 : 0.8) + rand(s3, 4, 9) * 0.6;
      under.push({ x, y, z, id, ry: rand(s3, 5, 9) * Math.PI * 2, k });
    }
    // the rocks: many where the ground is rocky, a few everywhere; a boulder now and then, stones round it
    const rocky = Math.min(1, ly.hill * 0.6 + ly.foot * 1.0 + ly.dry * 0.3 + ly.mount * 0.5);
    const sr = seed * 13 + 5;
    if (rand(sr, 1, 11) < 0.028 + rocky * 0.3 + (ly.forest > 0.3 ? 0.035 : 0)) {
      const x = x0 + (a + rand(sr, 2, 11)) * CELL, z = z0 + (b + rand(sr, 3, 11)) * CELL, y = surfaceAt(x, z);
      if (y >= SEA_Y + 0.9 && treeFree(x, z) && !nearRoad(x, z, 3.4)) {
        const r = rand(sr, 4, 11), big = r < 0.12 + rocky * 0.12, mid = !big && r < 0.42;
        const list = big ? BIG : mid ? MID : SMALL, id = list[Math.floor(rand(sr, 5, 11) * list.length) % list.length];
        const k = big ? 0.9 + rand(sr, 6, 11) * 1.2 : mid ? 0.8 + rand(sr, 6, 11) * 0.7 : 0.8 + rand(sr, 6, 11) * 1.3;
        rocks.push({ x, y, z, id, ry: rand(sr, 7, 11) * Math.PI * 2, k, tilt: (rand(sr, 8, 11) - 0.5) * 0.3 });
        if (big) for (let c = 0, nc = 1 + Math.floor(rand(sr, 9, 11) * 3); c < nc; c++) {
          const an = rand(sr, 10 + c, 11) * Math.PI * 2, dr = (1.6 + rand(sr, 20 + c, 11) * 2) * k, sx = x + Math.sin(an) * dr, sz = z + Math.cos(an) * dr, sy = surfaceAt(sx, sz);
          if (sy < SEA_Y + 0.9 || !treeFree(sx, sz) || nearRoad(sx, sz, 3)) continue;
          rocks.push({ x: sx, y: sy, z: sz, id: SMALL[Math.floor(rand(sr, 30 + c, 11) * SMALL.length) % SMALL.length], ry: rand(sr, 40 + c, 11) * Math.PI * 2, k: 0.8 + rand(sr, 50 + c, 11) * 0.9, tilt: 0 });
        }
      }
    }
  }
  return { trees, under, rocks };
}
const smooth01 = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

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
  if (src.userData.frost) frostShading(m, src.userData.frost);
  // (a clone does not keep its source's own shader changes, e.g. the undergrowth's green: taken from the source)
  const base = Object.hasOwn(m, "onBeforeCompile") ? m.onBeforeCompile : src.onBeforeCompile;
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

// ---- the far trees (impostors). At the start each model is drawn from VIEWS sides around it (from the height of
// its foot) into two atlases, a block per model (its VIEWS cells side by side) and a cell per side: its colours
// (unlit) and the directions its leaves and bark face (the model's own normals, nature.js crownNormals: in the tree's
// frame). Far away a tree is one upright quad turned to the camera, with the pictures of the side the camera is on
// (blended with the next one as the camera goes round), lit by the sun and the sky through those normals: exactly like
// its model, which dissolves into it. The big trees of 27/11 have bigger cells (IMP_CELL: about as many pixels a metre as
// the others); the blocks are packed in shelves of the atlas' width, each in the first one with room for it.
// Returns { mesh, at: { id: [block u, block v, cell width u, cell height v, quad width, quad height] } }, or null
// without a renderer.
// (the kit's trees grow deep in the forests: their cells too, from 80 x 160)
const VIEWS = 8, IMP_CELL = { pino_4m: [160, 256], pino_neve: [160, 256], albero_neve: [256, 192], albero_spoglio_neve: [160, 208] }, IMP_KIT = [96, 192];
// the colour under each picture's transparent pixels (the mipmaps blend it into the outline): each tree's own average
const IMP_RIM = { albero_neve: "#c6cbd2", albero_spoglio_neve: "#a1a1a3", pino_4m: "#39392a", pino_neve: "#55554d", morto: "#3a3838" };
const NORMAL_MAT = (map) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map } }, side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying vec2 vUv; void main() { vN = normal; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }",
  fragmentShader: "uniform sampler2D map; varying vec3 vN; varying vec2 vUv; void main() { if ( texture2D( map, vUv ).a < 0.5 ) discard; gl_FragColor = vec4( normalize( vN ) * 0.5 + 0.5, 1.0 ); }",
});
function makeImpostors(renderer, ids, max) {
  if (!renderer) return null;
  const cell = (id) => IMP_CELL[id] || IMP_KIT, W = VIEWS * Math.max(...ids.map((id) => cell(id)[0])), block = {}, shelves = [];
  [...ids].sort((a, b) => cell(b)[1] - cell(a)[1]).forEach((id) => {   // (tallest first)
    const [cw, ch] = cell(id);
    let sh = shelves.find((s) => s.x + cw * VIEWS <= W && ch <= s.h);
    if (!sh) shelves.push((sh = { x: 0, y: shelves.reduce((y, s) => y + s.h, 0), h: ch }));
    block[id] = { x: sh.x, y: sh.y, cw, ch }; sh.x += cw * VIEWS;
  });
  const H = shelves.reduce((y, s) => y + s.h, 0);
  const t0 = performance.now();
  // The two atlases have no depth buffer: they are only read (on a phone too much graphics memory gets the page closed;
  // with one they took ~49 MB, now ~28). Each tree is drawn into two small pictures of its block that have one (tmpC,
  // tmpN, freed at the end), then copied into its place. The mipmaps made once, at the end, not after each picture.
  const opts = { generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rt = new THREE.WebGLRenderTarget(W, H, { ...opts, colorSpace: THREE.SRGBColorSpace }), rtN = new THREE.WebGLRenderTarget(W, H, opts);
  const BW = Math.max(...ids.map((id) => cell(id)[0] * VIEWS)), BH = Math.max(...ids.map((id) => cell(id)[1])), nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const tmpC = new THREE.WebGLRenderTarget(BW, BH, { ...nearest, colorSpace: THREE.SRGBColorSpace }), tmpN = new THREE.WebGLRenderTarget(BW, BH, nearest);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200), stage = new THREE.Scene(), stageN = new THREE.Scene(), at = {}, used = [];
  const keep = { target: renderer.getRenderTarget(), auto: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.autoClear = false;
  // Quads that write exactly what they are given (no blending, alpha too): under the alpha the tree's colour and an
  // upward normal, so the mipmaps blend no dark or odd rims into the far trees (not cleared: a clear colour is
  // multiplied by its alpha, 0, and was black: the thin needles of the pines turned black far away); and the copy of a
  // block into the atlas.
  const quad = (fragmentShader, uniforms) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, fragmentShader, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }" }));
    m.frustumCulled = false; return [m, new THREE.Scene().add(m)];
  };
  const [fill, fillScene] = quad("uniform vec3 c; void main() { gl_FragColor = vec4( c, 0.0 ); }", { c: { value: new THREE.Color() } });
  const [copy, copyScene] = quad("uniform sampler2D t; uniform vec2 s; varying vec2 vUv; void main() { gl_FragColor = texture2D( t, vUv * s ); }", { t: { value: null }, s: { value: new THREE.Vector2() } });
  const UP = new THREE.Color(0.5, 1, 0.5);
  ids.forEach((id) => {
    const parts = libParts(id), b = block[id], bw = b.cw * VIEWS;
    let r = 0, h = 0;
    parts.forEach((p) => {
      const P = p.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { r = Math.max(r, Math.hypot(P.getX(i), P.getZ(i))); h = Math.max(h, P.getY(i)); }
    });
    const hw = r * 1.04; h *= 1.02;                                       // (the quad: centred on the trunk, wide enough for every side)
    stage.clear(); stageN.clear();
    parts.forEach((p) => {
      const mc = new THREE.MeshBasicMaterial({ map: p.material.map, alphaTest: 0.5, side: THREE.DoubleSide }), mn = NORMAL_MAT(p.material.map);
      if (p.material.userData.frost) frostShading(mc, p.material.userData.frost);   // (the snow on the pine's needles in its pictures too)
      used.push(mc, mn); stage.add(new THREE.Mesh(p.geometry, mc)); stageN.add(new THREE.Mesh(p.geometry, mn));
    });
    Object.assign(cam, { left: -hw, right: hw, top: h, bottom: 0 }); cam.updateProjectionMatrix();
    for (const [tmp, target, sc, c] of [[tmpC, rt, stage, IMP_RIM[id] || "#4a5234"], [tmpN, rtN, stageN, UP]]) {
      // the block in the small picture: the colour under the alpha, then the tree from its 8 sides...
      tmp.viewport.set(0, 0, bw, b.ch); tmp.scissor.set(0, 0, bw, b.ch); tmp.scissorTest = true;
      renderer.setRenderTarget(tmp); renderer.clear();
      fill.material.uniforms.c.value.set(c); renderer.render(fillScene, cam);
      for (let v = 0; v < VIEWS; v++) {
        const a = (v / VIEWS) * Math.PI * 2;
        cam.position.set(Math.sin(a) * (hw + 50), 0, Math.cos(a) * (hw + 50)); cam.lookAt(0, 0, 0);
        tmp.viewport.set(v * b.cw, 0, b.cw, b.ch); tmp.scissor.set(v * b.cw, 0, b.cw, b.ch);
        renderer.setRenderTarget(tmp); renderer.render(sc, cam);
      }
      // ...copied into its place in the atlas
      target.viewport.set(b.x, b.y, bw, b.ch); target.scissor.set(b.x, b.y, bw, b.ch); target.scissorTest = true;
      copy.material.uniforms.t.value = tmp.texture; copy.material.uniforms.s.value.set(bw / BW, b.ch / BH);
      renderer.setRenderTarget(target); renderer.render(copyScene, cam);
    }
    at[id] = [b.x / W, b.y / H, b.cw / W, b.ch / H, hw * 2, h];
  });
  [rt, rtN].forEach((t) => {
    t.viewport.set(0, 0, W, H); t.scissorTest = false; t.texture.generateMipmaps = true;
    renderer.setRenderTarget(t); renderer.render(stage.clear(), cam);       // (nothing drawn: the mipmaps made)
  });
  stage.clear(); stageN.clear(); used.forEach((m) => m.dispose());
  [fill, copy].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); tmpC.dispose(); tmpN.dispose();
  if (import.meta.env.DEV) window.__impostors = { ms: Math.round(performance.now() - t0), W, H, rt, rtN, renderer, block };   // dev only (tests)
  renderer.setRenderTarget(keep.target); renderer.autoClear = keep.auto; renderer.setClearColor(keep.color, keep.alpha);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geo.setAttribute("aImp", new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.impN = { value: rtN.texture };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
attribute vec4 aImp;
varying vec2 vQuv; varying vec4 vImp; varying float vView, vYaw, vTreeD, vNearD;`).replace("#include <project_vertex>", `
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
	vQuv = vec2( position.x + 0.5, position.y ); vImp = aImp;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
${FADE_F}
uniform sampler2D impN;
varying vec2 vQuv; varying vec4 vImp; varying float vView, vYaw, vNearD;`)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n\t" + FAR_CUT("vNearD"))
      .replace("#include <map_fragment>", `
	float iv0 = floor( vView ), ivt = vView - iv0, iv1 = mod( iv0 + 1.0, ${VIEWS}.0 );
	vec2 iCell = vQuv * vImp.zw, iUv0 = vImp.xy + vec2( iv0 * vImp.z, 0.0 ) + iCell, iUv1 = vImp.xy + vec2( iv1 * vImp.z, 0.0 ) + iCell;
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
  const nearMat = (src, nd) => { const key = `${src.uuid}|${nd}`; if (!nearMats.has(key)) nearMats.set(key, fading(src, false, (src.userData.crown ? "crown" : "tree") + (src.userData.frost ? `-frost${src.userData.frost}` : ""), nd)); return nearMats.get(key); };
  // grown trees with and without shadows, young ones (no shadows: they stand under the others)
  if (ok) for (const [shade, young] of [[true, false], [false, false], [false, true]]) MODELS.forEach((id) => libParts(id).forEach((pt) => {
    if (young && !BROAD.includes(id)) return;                               // (only the kit's trees have young ones)
    const m = new THREE.InstancedMesh(pt.geometry, nearMat(pt.material, young ? NEAR_Y : NEAR_OF[id] || NEAR), shade ? 300 : young ? 500 : 900);
    m.count = 0; m.frustumCulled = false; m.castShadow = shade; m.receiveShadow = !pt.material.userData.noShadow;   // (crowns: nature.js)
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
    const leaf = /Leaves|Grass/.test(pt.material.name), red = /TwistedTree/.test(pt.material.name), flower = /Flowers/.test(pt.material.name);
    // (fading in over its last BAND metres; the flowers keep their colours)
    const src = leaf && !flower ? green(pt.material, red) : pt.material;
    const m = new THREE.InstancedMesh(pt.geometry, fading(src, false, `under-${leaf && !flower ? (red ? "r" : "g") : pt.material.uuid}`, NEAR_U), 1600);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = true;
    group.add(m); low.push({ id, m, s: natureScale(id) });
  }));
  let imp = null;                                                          // (every tree far away: its pictures)
  try { imp = ok ? makeImpostors(renderer, MODELS, 12000) : null; } catch (e) { console.warn("Sagome degli alberi non fatte: forme semplici", e); }
  // (without them, simple forms: a cone, a ball, a bare trunk; without the models they are everywhere)
  const farMat0 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), farMat = ok ? fading(farMat0, true, "simple") : farMat0;
  const far = imp ? [imp.mesh] : [0, 1, 2].map((kind) => new THREE.InstancedMesh(farGeometry(kind), farMat, 9000));
  far.forEach((m) => { m.count = 0; m.frustumCulled = false; m.receiveShadow = !imp; group.add(m); });
  const aImp = imp?.mesh.geometry.attributes.aImp;
  // (only the instances in use go to the graphics card: thousands of far trees, every few metres)
  const flush = (attr, n) => { if (!attr) return; attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(1, n) * attr.itemSize); attr.needsUpdate = true; };
  // the rocks: an instanced mesh per model (one fading material for all), shadows from the middling and big ones
  const rockMeshes = {};
  const rockIds = ROCKS.filter((id) => libParts(id)?.length);
  if (rockIds.length) {
    const fade = fading(libParts(rockIds[0])[0].material, false, "rock", ROCK_R);
    rockIds.forEach((id) => {
      const g = libParts(id)[0].geometry;
      g.computeBoundingBox(); const bb = g.boundingBox;
      rockSize[id] = { h: bb.max.y - bb.min.y, r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 };
      const m = new THREE.InstancedMesh(g, fade, 700);
      m.count = 0; m.frustumCulled = false; m.castShadow = !SMALL.includes(id) || id === "sasso_2"; m.receiveShadow = true;
      group.add(m); rockMeshes[id] = m;
    });
  }
  const _e = new THREE.Euler();
  const putRock = (t) => {                                                // (sunk a little into the ground, a little tilted)
    const m = rockMeshes[t.id];
    if (!m || m.count >= m.instanceMatrix.count) return;
    const sz = rockSize[t.id], k = t.k;
    m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - sz.h * k * 0.12, t.z), q.setFromEuler(_e.set(t.tilt, t.ry, t.tilt * 0.6)), sc.set(k, k, k)));
  };
  const fixed = [], modelH = {};                                            // the old map's trees (addFixed); (tests) heights
  // (the far ones made as tall as the models they stand for)
  const FAR_K = { pino_4m: 1.64, pino_neve: 1.64, albero_neve: 1.52, albero_spoglio_neve: 1.35, albero_a1: 1.05, albero_b1: 1.05, albero_c1: 1.25, albero_a2: 1.05, albero_b2: 1.1, albero_c2: 1.2, morto: 1.05 };
  const tileOf = (ti, tj) => {
    const key = tj * TX + ti;
    let t = tiles.get(key);
    if (!t) {
      t = tileTrees(ti, tj); tiles.set(key, t);
      // (the rocks high enough to stop a body: with the trunks, a radius of most of their footprint)
      t.rocks.forEach((r) => { const s = rockSize[r.id]; if (s && s.h * r.k > 0.55) { r.r = s.r * r.k * 0.8; t.trees.push(r); } });
      t.trees.forEach((tr) => { const ck = `${Math.floor(tr.x / 8)}|${Math.floor(tr.z / 8)}`; (cells.get(ck) || cells.set(ck, []).get(ck)).push(tr); });
    }
    return t;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  let lx = Infinity, lz = Infinity, lfar = 0, pending = false;
  const counts = { near: 0, far: 0, under: 0, rocks: 0 };
  // one tree: its model near, its far form far, both in the band between (the shaders share the pixels out)
  const place = (t, d) => {
    q.setFromAxisAngle(UP, t.ry);
    const young = (t.young ?? t.k < 0.8) && BROAD.includes(t.id), nd = young ? NEAR_Y : NEAR_OF[t.id] || NEAR, h = t.h || 1;
    if (d < nd + REBUILD + 1 && ok) {
      const shade = d < SHADE && !young && t.k >= 0.8;
      for (const n of near) {
        if (n.id !== t.id || n.shade !== shade || n.young !== young || n.m.count >= n.m.instanceMatrix.count) continue;
        const k = n.s * t.k;
        n.m.setMatrixAt(n.m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(k, k * h, k)));
      }
    }
    if (d > nd - BAND - REBUILD - 1 || !ok) {
      const c = imp?.at[t.id], m = c ? imp.mesh : far[KIND(t.id)];
      if (!m || m.count >= m.instanceMatrix.count) return;
      if (c) {                                                            // its pictures: as big as the model
        const ks = t.k * natureScale(t.id);
        aImp.setXYZW(m.count, c[0], c[1], c[2], c[3]);
        m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(c[4] * ks, c[5] * ks * h, nd)));   // (z: its hand-over distance)
      } else {
        const k = t.k * (FAR_K[t.id] || 1);
        m.setColorAt(m.count, tint.setScalar(0.82 + (t.ry % 1) * 0.3)); m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.1, t.z), q, sc.set(k, k * h, k)));
      }
    }
  };
  function rebuild(px, pz, fogFar) {
    const R = Math.min(fogFar, TREE_FAR) + 8, a0 = Math.max(0, Math.floor((px + MAP.ox - R) / TILE)), a1 = Math.min(TX - 1, Math.floor((px + MAP.ox + R) / TILE));
    const b0 = Math.max(0, Math.floor((pz + MAP.oz - R) / TILE)), b1 = Math.min(TZ - 1, Math.floor((pz + MAP.oz + R) / TILE));
    let made = 0;
    pending = false;
    near.forEach((n) => { n.m.count = 0; }); far.forEach((m) => { m.count = 0; }); low.forEach((n) => { n.m.count = 0; });
    Object.values(rockMeshes).forEach((m) => { m.count = 0; });
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
      for (const t of tile.trees) { if (t.id.startsWith("sasso")) continue; const d = Math.hypot(t.x - px, t.z - pz); if (d <= R) place(t, d); }
      for (const t of tile.rocks) if (Math.hypot(t.x - px, t.z - pz) <= ROCK_R) putRock(t);
    }
    Object.values(rockMeshes).forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    counts.rocks = Object.values(rockMeshes).reduce((s, m) => s + m.count, 0);
    for (const t of fixed) { const d = Math.hypot(t.x - px, t.z - pz); if (d <= R) place(t, d); }
    near.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; }); low.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; });
    far.forEach((m) => { flush(m.instanceMatrix, m.count); flush(m.instanceColor, m.count); });
    flush(aImp, imp?.mesh.count);
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
    /** (tests) The rocks of the tiles already made within r of a point. */
    rocksNear(x, z, r) { const out = []; tiles.forEach((t) => t.rocks.forEach((k) => { if (Math.hypot(k.x - x, k.z - z) < r) out.push(k); })); return out; },
    /** (tests) A tree's height in metres (its model's, scaled). */
    heightOf(t) {
      if (!(t.id in modelH)) { let h = 0; (libParts(t.id) || []).forEach((p) => { p.geometry.computeBoundingBox(); h = Math.max(h, p.geometry.boundingBox.max.y); }); modelH[t.id] = h; }
      return modelH[t.id] * natureScale(t.id) * t.k * (t.h || 1);
    },
    /** (tests) The trees of the tiles already made and the fixed ones within r of a point. */
    treesNear(x, z, r) { const out = []; tiles.forEach((t) => t.trees.forEach((tr) => { if (Math.hypot(tr.x - x, tr.z - z) < r) out.push(tr); })); fixed.forEach((tr) => { if (Math.hypot(tr.x - x, tr.z - z) < r) out.push(tr); }); return out; },
    /** Trees placed by the old map (world coordinates, { x, y, z, id, ry, k }): drawn like these (their collisions are
     *  the engine's obstacles). Ids among MODELS. */
    addFixed(list) {
      fixed.push(...list.filter((t) => MODELS.includes(t.id)).map((t) => {   // (deep in the forest taller, like the others)
        const [gw, h] = growth(t.id, t.k || 1, deepAt(t.x, t.z));
        return gw === 1 ? t : { ...t, k: (t.k || 1) * gw, h, young: (t.k || 1) < 0.8 };
      }));
      lx = Infinity;
    },
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
    /** The trunks [{ x, z, r }] in a box of the world (nav.js: the characters' way round them). */
    trunksIn(x0, z0, x1, z1) {
      const out = [];
      for (let j = Math.floor(z0 / 8); j <= Math.floor(z1 / 8); j++) for (let i = Math.floor(x0 / 8); i <= Math.floor(x1 / 8); i++) {
        const list = cells.get(`${i}|${j}`);
        if (list) for (const t of list) if (t.x > x0 && t.x < x1 && t.z > z0 && t.z < z1) out.push(t);
      }
      return out;
    },
    /** Whether a point is inside a trunk (the camera keeps out of them). */
    blocked(x, z) {
      const list = cells.get(`${Math.floor(x / 8)}|${Math.floor(z / 8)}`);
      return !!list && list.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 0.1);
    },
  };
}
