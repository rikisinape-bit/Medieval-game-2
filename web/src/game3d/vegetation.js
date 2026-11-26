// The trees of the open country: the forests of the map (its drawn trees: the forest layer) and a few trees scattered on
// its plains; never on the places' ground, on the roads, in the water or on the beach, on steep slopes and cliffs;
// in the snow pines and dead trees. In the forests trees of every size (young ones, middling ones, old giants; in the
// thick of them a second, young tree beside each) and undergrowth: bushes, ferns, big plants, tall grass, mushrooms.
// The trees are the Shapespark kit's (BROAD: six of its twelve, each model costs its own draws), the pines only in the snow.
// Placed a tile (64 m) at a time, always the same (from the tile's number).
// Near the player (NEAR) they are the nature pack's trees, instanced (a dozen draws for all of them), the undergrowth
// nearer still (NEAR_U); farther, up to the fog, simple low trees (a cone, a bare trunk, and for the kit's trees their
// own picture on three crossing planes: impostors) that cost almost nothing. Their trunks stop whoever walks into them (push); the undergrowth does not.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { libParts, natureScale, crownShading } from "./nature";
import { layersAt, surfaceAt, treeFree, nearRoad, SEA_Y } from "./terrain";
import { MAP } from "./sites";

const TILE = 64, CELL = 6.4, N = TILE / CELL, NEAR = 48, NEAR_U = 30, SHADE = 28, REBUILD = 5;
const PINES = ["pino_1", "pino_2", "pino_3"], BROAD = ["albero_a1", "albero_b1", "albero_c1", "albero_a2", "albero_b2", "albero_c2"], MODELS = [...PINES, ...BROAD, "morto"];
const UNDER = ["cespuglio", "felce", "pianta_grande", "erba_alta", "fungo"];
const KIND = (id) => (id === "morto" ? 2 : id.startsWith("pino") ? 0 : 1);   // far: cone, ball, bare trunk
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

// The far broad trees (impostors): each model of the kit is drawn once from the side, unlit, into a cell of an atlas;
// far away a tree is three planes crossing on its trunk with that picture, lit and shaded like the near crowns
// (normals out of the trunk and a little up: nature.js crownShading). One draw for all of them, 6 triangles each.
// Returns { mesh, cells: { id: [u, v, du, dv, half width, height] } } (null without a renderer).
function makeImpostors(renderer, ids, max) {
  if (!renderer) return null;
  const CW = 128, CH = 256, cols = 3, rows = Math.ceil(ids.length / cols);
  const rt = new THREE.WebGLRenderTarget(CW * cols, CH * rows, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 100), stage = new THREE.Scene(), cells = {}, used = [];
  const keep = { target: renderer.getRenderTarget(), auto: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt); renderer.setClearColor("#3a4a2c", 0); renderer.clear(); renderer.autoClear = false;   // (a leafy colour under the alpha: no dark rims in the mipmaps)
  ids.forEach((id, i) => {
    const parts = libParts(id), box = new THREE.Box3();
    parts.forEach((p) => { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); });
    const hw = Math.max(-box.min.x, box.max.x) * 1.02, h = box.max.y * 1.02;        // seen from the front, centred on the trunk
    Object.assign(cam, { left: -hw, right: hw, top: h, bottom: 0 }); cam.updateProjectionMatrix();
    cam.position.set(0, 0, box.max.z + 10); cam.lookAt(0, 0, 0);
    stage.clear();
    parts.forEach((p) => { const m = new THREE.MeshBasicMaterial({ map: p.material.map, alphaTest: 0.5, side: THREE.DoubleSide }); used.push(m); stage.add(new THREE.Mesh(p.geometry, m)); });
    const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
    rt.viewport.set(x, y, CW, CH); rt.scissor.set(x, y, CW, CH); rt.scissorTest = true;
    renderer.setRenderTarget(rt); renderer.render(stage, cam);
    cells[id] = [x / rt.width, y / rt.height, CW / rt.width, CH / rt.height, hw, h];
  });
  rt.viewport.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
  stage.clear(); used.forEach((m) => m.dispose());
  renderer.setRenderTarget(keep.target); renderer.autoClear = keep.auto; renderer.setClearColor(keep.color, keep.alpha);
  // three planes 1 wide (x from -0.5 to 0.5) and 1 tall, crossing on the trunk 60 degrees apart
  const geo = mergeGeometries([0, 1, 2].map((k) => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY((k * Math.PI) / 3)));
  const P = geo.attributes.position, N = geo.attributes.normal, n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { n.set(P.getX(i) * 2, 0.2 + P.getY(i) * 0.6, P.getZ(i) * 2).normalize(); N.setXYZ(i, n.x, n.y, n.z); }
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4));
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  crownShading(mat);
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = "attribute vec4 aCell;\n" + sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvMapUv = aCell.xy + vMapUv * aCell.zw;");
  };
  mat.customProgramCacheKey = () => "crown-far";
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  return { mesh, cells };
}

/** The trees of the open country; update(camera position, fog's far) every frame. renderer: for the far trees' pictures. */
export function createVegetation(scene, renderer) {
  const tiles = new Map(), cells = new Map(), group = new THREE.Group();
  group.userData.world = true; scene.add(group);
  const ok = MODELS.every((id) => libParts(id)), okU = UNDER.filter((id) => libParts(id));
  // near: one instanced mesh for each part of each model
  const near = [];
  if (ok) for (const shade of [true, false]) MODELS.forEach((id) => libParts(id).forEach((pt) => {
    const m = new THREE.InstancedMesh(pt.geometry, pt.material, shade ? 300 : 600);
    m.count = 0; m.frustumCulled = false; m.castShadow = shade; m.receiveShadow = !pt.material.userData.crown;   // (crowns: nature.js)
    group.add(m); near.push({ id, m, s: natureScale(id), shade });
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
  const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const imp = ok ? makeImpostors(renderer, BROAD, 4000) : null;            // (the kit's trees far away: their pictures)
  const far = [0, 1, 2].map((kind) => {
    const m = kind === 1 && imp ? imp.mesh : new THREE.InstancedMesh(farGeometry(kind), farMat, 4000);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = !(kind === 1 && imp);
    group.add(m); return m;
  });
  const aCell = imp?.mesh.geometry.attributes.aCell;
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
  function rebuild(px, pz, fogFar) {
    const R = fogFar + 8, a0 = Math.max(0, Math.floor((px + MAP.ox - R) / TILE)), a1 = Math.min(TX - 1, Math.floor((px + MAP.ox + R) / TILE));
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
      for (const t of tile.trees) {
        const d = Math.hypot(t.x - px, t.z - pz);
        if (d > R) continue;
        q.setFromAxisAngle(UP, t.ry);
        if (d < (t.k < 0.8 ? 30 : NEAR) && ok) {
          const shade = d < SHADE && t.k >= 0.8;
          for (const n of near) {
            if (n.id !== t.id || n.shade !== shade || n.m.count >= n.m.instanceMatrix.count) continue;
            const k = n.s * t.k;
            n.m.setMatrixAt(n.m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(k, k, k)));
          }
        } else {
          const m = far[KIND(t.id)], k = t.k * (FAR_K[t.id] || 1), c = imp?.cells[t.id];
          if (m.count >= m.instanceMatrix.count) continue;
          if (c) {                                                          // an impostor: its picture, as big as the model
            const ks = t.k * natureScale(t.id);
            aCell.setXYZW(m.count, c[0], c[1], c[2], c[3]);
            m.setColorAt(m.count, tint.setScalar(0.92 + (t.ry % 1) * 0.16));
            m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.08, t.z), q, sc.set(c[4] * 2 * ks, c[5] * ks, c[4] * 2 * ks)));
          } else { m.setColorAt(m.count, tint.setScalar(0.82 + (t.ry % 1) * 0.3)); m.setMatrixAt(m.count++, m4.compose(v.set(t.x, t.y - 0.1, t.z), q, sc.set(k, k, k))); }
        }
      }
    }
    near.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; }); low.forEach((n) => { n.m.instanceMatrix.needsUpdate = true; });
    far.forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    if (aCell) aCell.needsUpdate = true;
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
