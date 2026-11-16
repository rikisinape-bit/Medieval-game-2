import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LOOKS, makeHuman, poseHuman, showTool, makeHorse, makeCarriage, makeHouse, HOUSE_RECTS, CHEST_LOCAL, HOUSE_H, makeTree, makeForge, makeSwordRack, makeStall, makeOreRock, makeWell, makeSword, makeDummy, makeBench, makeWoodpile, makeField, makeCamp, makeSignpost, makeCityWall, makeCave, makeFountain, makeValdoroWalls, makeItem, makeTorch, makeShield, makeLantern, makeViewmodel, makePlayerModel, playerLook, VM_REST, box, at } from "./models";
import { getDialog, applyEffect } from "./dialogs";
import { FZ, WZ, CX, CZ, regionOf, zoneOf, angDiff, SWORDS, NPC_DEFS, OBJECTS, HOUSES, CHESTS, ORES, DUMMIES, PICKUPS, ROUTE, RIDER_ROUTE, PATH, CAMP, LANTERNS } from "./world";
import { ITEMS, SWORD_ITEM, SHOPS, LOOT_OF, dmgReduction, sellPrice, buyPrice, TOOL_OF } from "./items";
import { createAI, FIGHT } from "./ai";
import { createFx } from "./fx";
import { createAudio } from "./audio";
import { repSummary } from "./reputation";
import { SHIELD_KIND } from "./weapons";
import { hasNature, hasKit, addNature, kitObject, kitMaterial, kitHouseTop } from "./nature";
import { makeMountain, mountainHeight } from "./mountain";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY_LEN = 600; // seconds per full day
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const pathDist = (x, z) => Math.min(...PATH.slice(1).map((p, i) => segDist(x, z, PATH[i], p)));

export function createGame(canvas, hooks, saved) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9cc4e4");
  scene.fog = new THREE.Fog("#b8d0e0", 30, 80);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 220);
  scene.add(camera);
  const hemi = new THREE.HemisphereLight("#cfe4ff", "#4a3a22", 0.9);
  const sun = new THREE.DirectionalLight("#fff0d0", 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 140 });
  scene.add(hemi, sun, sun.target);
  const fx = createFx(scene);
  const sfx = createAudio();

  const obstacles = [], rects = [];
  const put = (o, x, z, ry = 0, r = 0) => { at(o, x, o.position.y, z, ry); scene.add(o); if (r) obstacles.push({ x, z, r }); return o; };
  // Trees are only recorded here (position + collision circle); the models are added later, all together.
  const treeSpots = [], S_nature = { tris: 0, count: 0 }, natureMeshes = [];
  const putTree = (pine, x, z, ry = 0, r = 0) => {
    if (mountainHeight(x, z) > 0.4) return;                    // no trees half-buried in the mountain
    treeSpots.push({ pine: !!pine, x, z, ry }); if (r) obstacles.push({ x, z, r });
  };
  const toWorld = (x, z, ry, lx, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: "#5a7a3a", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const square = new THREE.Mesh(new THREE.CircleGeometry(11, 30), new THREE.MeshStandardMaterial({ color: "#9a8a66", roughness: 1 }));
  square.rotation.x = -Math.PI / 2; square.position.y = 0.01; square.receiveShadow = true; scene.add(square);
  [[0, -14, 3, 18], [8, 10, 3, 14], [0, -27, 4, 8], [-22, 0, 16, 3]].forEach(([x, z, w, d]) => put(box(w, 0.02, d, "#8a7a56"), x, z));

  // Houses: hinged doors, interiors, chests, beds
  // Roccanera (option A): our enterable ground floor, upper floors and roof from the kit (cut at the first floor).
  // [kit house, cut height, quarter turn, height stretch, extra turn of the whole top]
  const KIT_TOPS = [["house_03", 1.75, true, 1.25, 0], ["house_04", 1.7, false, 1.25, 0], ["house_05", 2.5, false, 1.1, 0],
    ["house_02", 1.85, true, 1.2, 0], ["house_03", 1.75, true, 1.25, Math.PI], ["house_07", 0.6, false, 1.1, 0]];
  const kitWall = hasKit() && kitMaterial("Wall_Tile_03_Mat"), kitBeam = hasKit() && kitMaterial("Brown_02_Mat");
  const kitHouse = kitWall && kitBeam ? { wall: kitWall, beam: kitBeam } : null, houseTops = [];
  const houses = HOUSES.map(([x, z, r], i) => {
    const stone = i >= 6, top = !stone && kitHouse && KIT_TOPS[i];
    const id = top && kitHouseTop(top[0], { cut: top[1], turn: top[2], sy: top[3], w: 4.7, d: 4.1 });
    if (id) houseTops.push({ id, x, z, y: HOUSE_H + 0.1, ry: r + top[4] });
    const g = put(makeHouse(stone ? "#9a948a" : i % 2 ? "#b89a6a" : "#a8886a", stone ? "#5a3a3a" : i % 3 ? "#7a4a22" : "#5a3a22", stone, id ? kitHouse : null), x, z, r);
    HOUSE_RECTS.forEach(([lx, lz, hw, hd]) => { const [cx, cz] = toWorld(x, z, r, lx, lz); rects.push({ cx, cz, hw, hd, ry: r }); });
    const [dx, dz] = toWorld(x, z, r, 0, 1.9), [chx, chz] = toWorld(x, z, r, CHEST_LOCAL[0], CHEST_LOCAL[1]);
    const [bx, bz] = toWorld(x, z, r, -1.3, -0.9), [ex, ez] = toWorld(x, z, r, -1.3, 0.55), [vx, vz] = toWorld(x, z, r, 0, 3.2), [ix, iz] = toWorld(x, z, r, 0, 0.9);
    const [mx, mz] = toWorld(x, z, r, 0, -1.0), [mex, mez] = toWorld(x, z, r, 0, 0.3);
    const beds = [{ bed: [bx, bz], edge: [ex, ez, r + Math.PI], y: 0.62 }, { bed: [mx, mz], edge: [mex, mez, r + Math.PI], y: 0.2 }];
    return { i, x, z, r, g, door: g.userData.door, dx, dz, chx, chz, beds, via: [[vx, vz], [ix, iz]], open: 0 };
  });
  if (houseTops.length) addNature(scene, houseTops, natureMeshes);
  const houseOf = (x, z) => {
    for (const h of houses) {
      const dx = x - h.x, dz = z - h.z, lx = Math.cos(h.r) * dx - Math.sin(h.r) * dz, lz = Math.sin(h.r) * dx + Math.cos(h.r) * dz;
      if (Math.abs(lx) < 2.2 && Math.abs(lz) < 1.9) return h.i;
    }
    return -1;
  };

  put(makeForge(), 14, -5, 0); obstacles.push({ x: 12.8, z: -6, r: 1 }, { x: 14.6, z: -4.6, r: 0.5 });
  const rack = put(makeSwordRack(), 15.6, -6.5, 0);
  put(makeStall(), -8, 8, Math.PI, 1.6);
  put(makeWell(), 0, 0, 0, 1.2);
  DUMMIES.forEach(([x, z]) => put(makeDummy(), x, z, 0, 0.4));
  put(makeBench(), 8.4, 6.75, 0);
  put(makeWoodpile(), 5.5, -12, 0, 0.7);
  put(makeField(), -10, -4.8, 0);
  put(makeSignpost(), 3.2, -27, Math.PI);
  put(makeSignpost(), -27, -2.4, Math.PI / 2);
  const lanterns = LANTERNS.map(([x, z]) => put(makeLantern(), x, z, 0, 0.3));

  // Forest: wide area with a winding path, random trees, bandit hideouts behind trees
  put(box(66, 0.1, 76, "#3e5a2a"), 0, FZ - 33);
  PATH.slice(1).forEach((p, i) => {
    const a = PATH[i], dx = p[0] - a[0], dz = p[1] - a[1], L = Math.hypot(dx, dz);
    put(box(7, 0.12, L + 3, "#7a6a4a"), (a[0] + p[0]) / 2, (a[1] + p[1]) / 2, Math.atan2(dx, dz));
  });
  put(box(10, 0.115, 9, "#6a5a3a"), CAMP[0], CAMP[1]);
  put(makeCamp(), CAMP[0], CAMP[1], 0, 0.6);
  const banditDefs = NPC_DEFS.filter((d) => d.role === "bandit");
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const treeOk = (x, z) => pathDist(x, z) > 4.6 && Math.hypot(x - CAMP[0], z - CAMP[1]) > 5.5 && !banditDefs.some((d) => Math.hypot(x - d.pos[0], z - d.pos[1]) < 1.3) && !PICKUPS.some((p) => Math.hypot(x - p.x, z - p.z) < 1.2);
  for (let gx = -28; gx <= 28; gx += 4.6) for (let gz = -36; gz > WZ + 3; gz -= 4.6) {
    const x = gx + (rnd() - 0.5) * 3.2, z = gz + (rnd() - 0.5) * 3.2;
    if (treeOk(x, z)) putTree(rnd() < 0.5, x, z, rnd() * 6, 0.8);
  }
  for (let z = -33; z > WZ; z -= 3) [-1, 1].forEach((s) => putTree(z % 2 === 0, s * (31.5 + (z % 3)), z, z, 0.9));
  banditDefs.forEach((d) => { const [px, pz] = [d.routine[0].face[0], d.routine[0].face[1]]; const dx = px - d.pos[0], dz = pz - d.pos[1], L = Math.hypot(dx, dz) || 1; putTree(true, d.pos[0] + (dx / L) * 1.5, d.pos[1] + (dz / L) * 1.5, 0, 0.8); });
  // Wall of Valdoro and the square beyond
  let gate;
  const gateRect = { cx: 0, cz: WZ, hw: 3, hd: 0.6, ry: 0, off: false };
  if (hasKit()) {
    // Castle built from the medieval kit: gatehouse with portcullis, crenellated curtain walls, towers, keep.
    const W1 = 9.74, kit = [];                                   // W1 = length of a wall segment
    const add = (id, x, z, ry = 0, y = 0, k = 1) => kit.push({ id, x, z, ry, y, k });
    add("castle_entrance", 0, WZ);
    [1, 2, 3].forEach((i) => [-1, 1].forEach((sd) => add("castle_wall_01", sd * (6.62 + W1 * (i - 0.5)), WZ)));          // front curtain wall
    [-1, 1].forEach((sd) => {
      add("tower_02", sd * 7.4, WZ + 0.9);                                                                                // gate towers
      add("tower_04", sd * 17.7, WZ + 0.3);                                                                               // where the town walls meet the front
      add("tower_05", sd * 35.6, WZ);                                                                                     // ends of the curtain wall
      [0, 1, 2].forEach((i) => add("castle_wall_01", sd * 17.7, WZ - 1.7 - W1 * (i + 0.5), Math.PI / 2));                 // town side walls
      add("tower_06", sd * 17.7, WZ - 32.2);                                                                              // back corners
      add("tower_13", sd * 17.7, WZ - 16.5);
    });
    [-1.5, -0.5, 0.5, 1.5].forEach((i) => add("castle_wall_01", i * W1, WZ - 32.2));                                      // back wall
    // The keep, behind the back wall
    add("castle_part_019", 0, WZ - 39.5); add("castle_part_013", 0, WZ - 39.5, 0, 10.5);
    add("tower_03", -10.5, WZ - 38.5); add("tower_08", 10.2, WZ - 37.6); add("castle_part_017", 7.2, WZ - 43.5, 0, 0, 1.3); add("castle_part_020", -4, WZ - 46.5);
    addNature(scene, kit, natureMeshes);
    // Portcullis: its own object so it can be raised; the part that goes up inside the gatehouse is clipped away.
    renderer.localClippingEnabled = true;
    const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 7.2)];
    gate = kitObject("closed_gate");
    gate.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.clippingPlanes = clip; } });
    at(gate, 0, 0, WZ - 0.3); scene.add(gate);
    rects.push({ cx: -16.8, cz: WZ, hw: 14.5, hd: 1.7, ry: 0 }, { cx: 16.8, cz: WZ, hw: 14.5, hd: 1.7, ry: 0 },
      { cx: -4.45, cz: WZ, hw: 2.15, hd: 2.6, ry: 0 }, { cx: 4.45, cz: WZ, hw: 2.15, hd: 2.6, ry: 0 });
    gateRect.hw = 2.35;
  } else {
    const wallG = put(makeCityWall(), 0, WZ);
    gate = wallG.userData.gate;
    [-25.5, 25.5].forEach((x) => { const w = box(11, 6, 2, "#8a8478"); at(w, x, 3, WZ); scene.add(w); });
    rects.push({ cx: -17, cz: WZ, hw: 14, hd: 1, ry: 0 }, { cx: 17, cz: WZ, hw: 14, hd: 1, ry: 0 });
    obstacles.push({ x: -3.8, z: WZ + 0.4, r: 1.5 }, { x: 3.8, z: WZ + 0.4, r: 1.5 });
    put(makeValdoroWalls(), 0, WZ);
  }
  rects.push(gateRect);
  put(box(34, 0.13, 30, "#8a8478"), 0, WZ - 16);
  put(makeFountain(), 0, WZ - 16, 0, 2.0);
  [[7.5, WZ - 19.5, Math.PI], [-8.5, WZ - 13.5, Math.PI / 2], [9.5, WZ - 9.5, -Math.PI / 2], [-7.5, WZ - 29.5, 0], [5.5, WZ - 30.5, 0]].forEach(([x, z, r]) => put(makeStall(), x, z, r, 1.6));
  put(makeBench(), -6, WZ - 25.2, 0.3);
  [[-14, WZ - 4], [14, WZ - 4], [-14, WZ - 28], [14, WZ - 28]].forEach(([x, z], i) => putTree(i % 2, x, z, i, 0.9));
  // Mine cave in the western hill
  put(makeCave(), CX, CZ);
  scene.add(makeMountain());                                   // the mountain that covers the mine
  // Rock face on both sides of the portal: nobody walks into the slope
  [-1, 1].forEach((sd) => rects.push({ cx: CX + 15, cz: sd * 9.6, hw: 2.2, hd: 6.9, ry: 0 }));
  [[CX, -12.5, 13, 0.5], [CX, 12.5, 13, 0.5], [CX - 12.5, 0, 0.5, 13], [CX + 12.5, -6.85, 0.5, 5.15], [CX + 12.5, 6.85, 0.5, 5.15], [CX + 14.5, -2.2, 2.5, 0.5], [CX + 14.5, 2.2, 2.5, 0.5]].forEach(([cx, cz, hw, hd]) => rects.push({ cx, cz, hw, hd, ry: 0 }));
  obstacles.push({ x: CX + 6, z: -5, r: 1 });
  const ores = ORES.map(([x, z]) => ({ x, z, mesh: put(makeOreRock(), x, z, x, 1), depletedUntil: 0 }));
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, d = 31 + (i * 7) % 9, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ((z < -27 && Math.abs(x) < 9) || (x < -27 && Math.abs(z) < 14)) continue;
    putTree(i % 3 === 0, x, z, i, 0.9);
  }
  [[-22, 2], [22, -2], [-6, -18], [24, 12], [-20, -22], [20, -24]].forEach(([x, z], i) => putTree(i % 2, x, z, i, 0.9));

  if (import.meta.env.DEV) window.__ri = renderer.info.render;   // dev only: triangles / draw calls of the last frame
  // ---- Vegetation ----
  if (hasNature()) {
    // Tree models from the nature pack, instanced. Same positions and collisions as before.
    let ns = 12345; const nr = () => { ns = (ns * 16807) % 2147483647; return (ns - 1) / 2147483646; };   // own RNG: the tree layout RNG is untouched
    const items = [];
    const inForest = (x, z) => z < -31 && z > WZ && Math.abs(x) < 30;
    treeSpots.forEach((t, i) => {
      const dead = inForest(t.x, t.z) && i % 19 === 7;                              // a few dead trees in the forest
      const id = dead ? "morto" : `${t.pine ? "pino" : "albero"}_${1 + Math.floor(nr() * 3)}`;
      items.push({ id, x: t.x, z: t.z, ry: nr() * 6.28, k: 0.85 + nr() * 0.35 });
    });
    // Landmarks: great twisted trees with blood-red leaves
    [[8.5, -71.5, 1], [-22, -48, 2], [21, -66, 1], [-19, -93, 2], [-23.5, WZ + 9, 1], [25, -37, 2]].forEach(([x, z, v]) => {
      items.push({ id: `contorto_${v}`, x, z, ry: nr() * 6.28, k: 0.9 + nr() * 0.25 }); obstacles.push({ x, z, r: 1.1 });
    });
    // Undergrowth: no collisions (except the big rocks), kept away from paths, houses and other obstacles.
    const freeOf = (x, z, m) => !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + m);
    const scatter = (id, n, pick, ok, kMin = 0.75, kMax = 1.25) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const [x, z] = pick();
        if (!ok(x, z)) continue;
        items.push({ id, x, z, ry: nr() * 6.28, k: kMin + nr() * (kMax - kMin) }); i++;
        if (id === "roccia") obstacles.push({ x, z, r: 0.95 });
      }
    };
    const forestPt = () => [(nr() - 0.5) * 58, -34 - nr() * (-34 - WZ - 4)];
    const offPath = (m) => (x, z) => pathDist(x, z) > m && Math.hypot(x - CAMP[0], z - CAMP[1]) > 5 && freeOf(x, z, 0.5);
    scatter("felce", 70, forestPt, offPath(3.7));
    scatter("cespuglio", 22, forestPt, offPath(4.2));
    scatter("cespuglio_fiorito", 8, forestPt, offPath(4.2));
    scatter("erba", 110, forestPt, offPath(3.4));
    scatter("erba_alta", 60, forestPt, offPath(3.5));
    scatter("pianta_grande", 28, forestPt, offPath(3.5));
    scatter("pianta", 28, forestPt, offPath(3.3));
    scatter("trifoglio", 22, forestPt, offPath(3.4));
    scatter("roccia", 10, forestPt, offPath(5.2), 0.7, 1.3);
    scatter("fungo", 14, () => { const t = treeSpots[Math.floor(nr() * treeSpots.length)], a = nr() * 6.28; return [t.x + Math.cos(a) * 0.75, t.z + Math.sin(a) * 0.75]; }, (x, z) => inForest(x, z) && pathDist(x, z) > 3.5, 0.7, 1.1);
    const pathPt = () => { const i = 1 + Math.floor(nr() * (PATH.length - 1)), t = nr(), a = PATH[i - 1], b = PATH[i]; return [a[0] + (b[0] - a[0]) * t + (nr() - 0.5) * 7, a[1] + (b[1] - a[1]) * t + (nr() - 0.5) * 3]; };
    scatter("sasso_tondo", 40, pathPt, (x, z) => pathDist(x, z) < 3.6 && pathDist(x, z) > 1.2, 0.8, 1.6);
    scatter("sasso_quadro", 40, pathPt, (x, z) => pathDist(x, z) < 3.6 && pathDist(x, z) > 1.2, 0.8, 1.6);
    // Village surroundings (outside the square and the dirt roads)
    const ROADS = [[0, -14, 3, 18], [8, 10, 3, 14], [0, -27, 4, 8], [-22, 0, 16, 3]];
    const villagePt = () => { const a = nr() * 6.28, d = 12.5 + nr() * 17.5; return [Math.cos(a) * d, Math.sin(a) * d]; };
    const villageOk = (m) => (x, z) => !ROADS.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 1 && Math.abs(z - cz) < d / 2 + 1)
      && !HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 4.3) && !(Math.abs(x + 10) < 3 && Math.abs(z + 4.8) < 2.5) && Math.hypot(x - 14, z + 5) > 4.5
      && Math.hypot(x - 12.5, z - 22.5) > 3.5 && Math.hypot(x + 8, z - 8) > 3 && !(x < -24 && Math.abs(z) < 3) && mountainHeight(x - 1.5, z) < 0.1 && freeOf(x, z, m);
    scatter("erba", 55, villagePt, villageOk(0.4));
    scatter("erba_alta", 36, villagePt, villageOk(0.4));
    scatter("cespuglio_fiorito", 9, villagePt, villageOk(1));
    scatter("cespuglio", 4, villagePt, villageOk(1));
    scatter("fiori", 10, villagePt, villageOk(0.5), 0.7, 1.1);
    scatter("petali", 8, villagePt, villageOk(0.5));
    scatter("trifoglio", 18, villagePt, villageOk(0.4));
    scatter("pianta", 14, villagePt, villageOk(0.4));
    scatter("sasso_tondo", 12, villagePt, villageOk(0.3), 0.8, 1.6);
    scatter("roccia", 3, () => { const a = nr() * 6.28, d = 26.5 + nr() * 3.5; return [Math.cos(a) * d, Math.sin(a) * d]; }, villageOk(2), 0.7, 1.1);
    // Valdoro: grass along the walls, flowers by the fountain
    scatter("erba_alta", 12, () => [(nr() < 0.5 ? -1 : 1) * (14.6 + nr() * 0.8), WZ - 3 - nr() * 26], (x, z) => freeOf(x, z, 0.4));
    scatter("fiori", 4, () => { const a = nr() * 6.28; return [Math.cos(a) * 3.1, WZ - 16 + Math.sin(a) * 3.1]; }, () => true, 0.6, 0.9);
    // Paving stones around the well, the fountain and in front of the gate
    const ring = (cx, cz, rad, n) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; items.push({ id: "selciato", x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad, ry: -a + 1.57, k: 0.95 + nr() * 0.2 }); } };
    ring(0, 0, 2.1, 9); ring(0, WZ - 16, 3.4, 12);
    [-1.6, 0, 1.6].forEach((x) => [2.2, 3.5, -2.2].forEach((dz) => items.push({ id: "selciato", x: x + (nr() - 0.5) * 0.3, z: WZ + dz, ry: nr() < 0.5 ? 0 : 1.57, k: 1.3 })));
    S_nature.tris = addNature(scene, items, natureMeshes);
    S_nature.count = items.length;
    console.info(`Vegetazione: ${S_nature.count} elementi, ${S_nature.tris} triangoli in ${natureMeshes.length} gruppi`);
  } else {
    // Fallback: the old procedural trees, baked into one mesh per material.
    const treeG = new THREE.Group();
    treeSpots.forEach((t) => { const o = makeTree(t.pine); at(o, t.x, 0, t.z, t.ry); treeG.add(o); });
    treeG.updateMatrixWorld(true);
    const byMat = new Map();
    treeG.traverse((o) => {
      if (!o.isMesh) return;
      let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      ["uv", "uv1", "uv2"].forEach((a) => g.deleteAttribute(a));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
    });
    byMat.forEach((geos, m) => {
      const merged = new THREE.Mesh(mergeGeometries(geos), m);
      merged.castShadow = true; merged.receiveShadow = true;
      scene.add(merged);
      geos.forEach((g) => g.dispose());
    });
  }

  // Carriage (the coachman is an NPC that sits on it)
  const car = { i: 1, x: ROUTE[0].at[0], z: ROUTE[0].at[1], yaw: -0.6, wait: ROUTE[0].stop, msgT: 0, group: new THREE.Group(), stopped: false };
  car.group.add(makeCarriage());
  [-0.5, 0.5].forEach((dx) => car.group.add(at(makeHorse("#3a2a1a"), dx, 0, 3.6)));
  scene.add(car.group);
  const carObs = [{ x: car.x, z: car.z, r: 1.6 }, { x: car.x, z: car.z, r: 1.1 }];
  obstacles.push(...carObs);
  const carObj = OBJECTS.find((o) => o.id === "carriage");
  const horses = [[4.5, 13.5], [-8, -12]].map(([x, z], i) => ({ id: `horse${i}`, x, z, yaw: 0, mesh: put(makeHorse(i ? "#e8e0d0" : "#6a4426"), x, z) }));

  const sp = saved?.player || {};
  const farAway = Math.abs(sp.z ?? 0) > 150;
  const S = {
    player: { hp: 100, gold: 30, ore: 0, inv: { pane: 1, torcia: 1 }, mounted: null, x: 0, z: 5, yaw: Math.PI, ...sp, ...(farAway ? { x: 0, z: 5, yaw: Math.PI } : {}),
      eq: { hand: sp.eq?.hand || sp.sword || "corta", body: sp.eq?.body || sp.armor || null, head: sp.eq?.head || null, off: sp.eq?.off || null } },
    rep: { village: 0, crown: 0, ...(saved?.rep || {}) },
    known: { crown: 0, ...(saved?.known || {}) },
    flags: { ...(saved?.flags || {}) },
    drops: [...(saved?.drops || [])],
    dayT: saved?.dayT ?? 0.3,
    chests: CHESTS, npcs: {}, gateOpen: false, night: false,
  };
  const P = S.player;
  if (!SWORDS[P.eq.hand]) P.eq.hand = "corta";
  ["body", "head", "off"].forEach((k) => { if (P.eq[k] && !ITEMS[P.eq[k]]) P.eq[k] = null; });
  if (!P.inv || typeof P.inv !== "object") P.inv = {};
  P.mounted = null; delete P.zone; delete P.sword; delete P.armor;
  Object.defineProperty(P, "sword", { get: () => P.eq.hand, set: (v) => { P.eq.hand = v; }, enumerable: false });

  // First-person view model (arms + weapon + off-hand)
  let vm = makeViewmodel(playerLook(P.eq));
  camera.add(vm.g);
  let torchLight = null;
  let view = saved?.view === "third" ? "third" : "first";
  let playerMesh = null;
  const buildPlayerMesh = () => {
    if (playerMesh) scene.remove(playerMesh);
    playerMesh = makePlayerModel(P.eq);
    playerMesh.visible = view === "third";
    scene.add(playerMesh);
  };
  // First person: arms and hands of the rigged player model (head/legs hidden), attached to the camera.
  // The old block arms (vm) remain only as a fallback if the model did not load.
  // One torch light always on the camera (constant light count); its intensity is 0 without a torch.
  const torchLamp = new THREE.PointLight("#ffa040", 0, 14);
  torchLamp.position.set(-0.35, -0.1, -0.45); camera.add(torchLamp);
  const setView = (v) => { view = v; vm.g.visible = v === "first"; if (playerMesh) playerMesh.visible = v === "third"; };
  const equip = () => {
    // First-person arms: same sleeves/armour/gloves as the body, rebuilt whenever the equipment changes.
    camera.remove(vm.g); vm = makeViewmodel(playerLook(P.eq)); camera.add(vm.g);
    torchLight = null; torchLamp.intensity = 0;
    const s = makeSword(0, P.eq.hand);
    s.rotation.x = 2.4; vm.handR.add(s);                                                    // blade up and forward
    if (P.eq.off === "torcia") { const t = makeTorch(false); t.rotation.x = -1.2; vm.handL.add(at(t, 0, -0.02, 0.02)); torchLight = torchLamp; }
    else if (P.eq.off) {                                                                    // shield held low on the left, edge-on, face turned outwards
      const sh = makeShield(ITEMS[P.eq.off].color, SHIELD_KIND[P.eq.off]); sh.scale.setScalar(0.85);
      const w = new THREE.Group(); w.rotation.set(1.85, 0, 0); sh.rotation.y = -1.15; w.add(sh); vm.handL.add(at(w, -0.06, -0.02, 0));
    }
    vm.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    buildPlayerMesh();
    setView(view);
  };
  equip();
  setView(view);

  const npcs = NPC_DEFS.map((d) => {
    const sv = saved?.npcs?.[d.id] || {};
    const n = { hp: 30, dmg: 4, loot: 3, ...d, x: d.pos[0], z: d.pos[1], yaw: 0, hpMax: d.hp || 30, alive: true, looted: false, discovered: false, witnessed: false, cd: 0, state: "idle", k: 0, stagger: 0, flash: 0, kb: 0, ...sv };
    Object.assign(n, { hostile: false, spar: false, panic: 0, alert: 0, actT: null, sleepAt: null });
    if (!n.alive && (sv.deadX == null || Math.abs(sv.deadZ) > 150)) { n.x = d.pos[0]; n.z = d.pos[1]; } else if (!n.alive) { n.x = sv.deadX; n.z = sv.deadZ; }
    // All NPCs use the procedural low-poly humans (body.js); seed = id gives each one stable variation.
    n.mesh = makeHuman({ ...LOOKS[d.look], ...(d.female ? { female: true } : {}), ...(d.old ? { old: true } : {}) }, d.weapon, d.id);
    scene.add(n.mesh);
    if (d.rider) {
      const start = RIDER_ROUTE[d.rider > 0 ? 0 : RIDER_ROUTE.length - 1];
      n.horse = { x: start[0] + 1.5, z: start[1], yaw: 0, mesh: put(makeHorse(d.rider > 0 ? "#2a2218" : "#8a6a4a"), start[0] + 1.5, start[1]) };
      Object.assign(n, { x: n.horse.x, z: n.horse.z, riding: n.alive, ms: n.alive ? "ride" : "dead", ri: d.rider > 0 ? 1 : RIDER_ROUTE.length - 2, dir: d.rider, wait: 0, news: null, beat: 0 });
    }
    S.npcs[d.id] = n;
    return n;
  });

  const picks = [];
  const addPick = (p) => { const m = makeItem(p.item, ITEMS[p.item]?.color); at(m, p.x, 0.05, p.z, p.x * 1.7); scene.add(m); picks.push({ ...p, mesh: m }); };
  PICKUPS.forEach((p) => { if (!S.flags.taken?.[p.id]) addPick({ qty: 1, ...p }); });
  S.drops.forEach((d, i) => addPick({ id: `d${i}`, qty: 1, ...d, drop: true }));

  const input = { x: 0, y: 0 };
  const keys = {};
  let pitch = 0, atkT = -1, combo = 0, queued = false;
  let dodgeT = 0, dodgeCd = 0, iframe = 0, shake = 0, hudT = 0, scanT = 0, prompt = null, dialogOpen = false;
  let paused = false;
  const lerp = (a, b, t) => a + (b - a) * t;
  // phase p 0..1 -> [raise (x, + = up), sweep (y, + = towards the left)]
  const fpSwing = (p) => p < 0.25 ? [lerp(0, 0.45, p / 0.25), lerp(0, -0.45, p / 0.25)]
    : p < 0.65 ? [lerp(0.45, -0.12, (p - 0.25) / 0.4), lerp(-0.45, 0.62, (p - 0.25) / 0.4)]
    : [lerp(-0.12, 0, (p - 0.65) / 0.35), lerp(0.62, 0, (p - 0.65) / 0.35)];
  // Stealth: slower, crouched, and NPCs see the player at shorter range (see ai.sees).
  P.sneak = false;
  const setSneak = (v) => {
    if (v && P.mounted) { say("Non puoi nasconderti a cavallo."); return; }
    P.sneak = !!v;
  };
  let dodgeDir = [0, 0], graceT = 0, region = regionOf(P.x, P.z), lastRegion = region;
  // say: essential message, shown briefly on screen. note: minor message, only written in the menu's diary.
  const say = (t) => t && hooks.onLog(t, false);
  const note = (t) => t && hooks.onLog(t, true);
  const hasShield = () => !!(P.eq.off && ITEMS[P.eq.off].block);

  // Day/night + region atmosphere
  const DAYLOOK = { forest: ["#6a8a78", "#4e6a52", 8, 48, 0.9, 0.6], village: ["#9cc4e4", "#b8d0e0", 30, 80, 1.6, 0.9], valdoro: ["#a8c4dc", "#c0d0dc", 26, 70, 1.5, 0.9] };
  const NIGHT = ["#070a14", "#0a0e1a", 10, 42];
  const MINE = ["#050403", "#050403", 4, 24, 0.05, 0.15];
  const cA = new THREE.Color(), cB = new THREE.Color();
  const atmosphere = (dt) => {
    const el = -Math.cos(S.dayT * Math.PI * 2), dayK = clamp((el + 0.08) * 4, 0, 1), dusk = clamp(1 - Math.abs(el - 0.05) / 0.2, 0, 1);
    S.night = el < 0.05;
    let bg, fog, near, far, si, hi;
    if (region === "mine") [bg, fog, near, far, si, hi] = MINE;
    else {
      const d = DAYLOOK[region];
      cA.set(NIGHT[0]).lerp(cB.set(d[0]), dayK).lerp(cB.set("#d8784a"), dusk * 0.45); bg = cA.clone();
      cA.set(NIGHT[1]).lerp(cB.set(d[1]), dayK); fog = cA.clone();
      near = NIGHT[2] + (d[2] - NIGHT[2]) * dayK; far = NIGHT[3] + (d[3] - NIGHT[3]) * dayK;
      si = d[4] * clamp(el * 2.2, 0, 1); hi = d[5] * (0.12 + 0.88 * dayK);
    }
    const k = Math.min(1, dt * 2.5);
    scene.background.lerp(cA.set(bg), k); scene.fog.color.lerp(cA.set(fog), k);
    scene.fog.near += (near - scene.fog.near) * k; scene.fog.far += (far - scene.fog.far) * k;
    sun.intensity += (si - sun.intensity) * k; hemi.intensity += (hi - hemi.intensity) * k;
    const az = S.dayT * Math.PI * 2;
    sun.position.set(P.x + Math.sin(az) * 30, Math.max(4, el * 40), P.z + 12); sun.target.position.set(P.x, 0, P.z);
    const lan = S.night ? 7 : 0;
    lanterns.forEach((l) => { l.userData.glow.material.emissiveIntensity = S.night ? 1 : 0.1; });
    lightT -= dt;
    if (lightT <= 0) {
      lightT = 0.4;
      // Vegetation chunks hidden beyond the fog are not drawn at all.
      const reach = scene.fog.far + 6;
      natureMeshes.forEach((m) => { const c = m.geometry.boundingSphere; m.visible = Math.hypot(c.center.x - P.x, c.center.z - P.z) - c.radius < reach; });
      const best = anchors.filter((a) => !a.night || lan > 0).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).slice(0, pool.length);
      pool.forEach((l, i) => { const a = best[i]; l.userData.a = a || null; if (a && l.userData.cur !== a) { l.userData.cur = a; l.position.set(a.x, a.y, a.z); l.color.set(a.color); l.distance = a.distance; l.intensity = 0; } });
    }
    pool.forEach((l) => { const a = l.userData.a; l.intensity += ((a ? a.intensity : 0) - l.intensity) * k; });
    if (torchLight) torchLight.intensity += (((S.night || region === "mine") ? 3.5 : 0.5) - torchLight.intensity) * k;
  };
  // Fixed pool of point lights (constant light count = no shader recompiles; 6 instead of ~22 lights).
  scene.updateMatrixWorld(true);
  const anchors = [], wp = new THREE.Vector3();
  scene.traverse((o) => { const a = o.userData.anchor; if (a) { o.getWorldPosition(wp); anchors.push({ ...a, x: wp.x, y: wp.y, z: wp.z }); } });
  const pool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight("#ffb050", 0, 10); scene.add(l); return l; });
  let lightT = 0;
  atmosphere(1);

  const makeHostile = (ids) => ids.forEach((id) => { const n = S.npcs[id]; if (n?.alive) n.hostile = true; });
  const unmountNpc = (n) => { if (n.riding) { n.riding = false; n.ms = "walk"; } };

  const hurtPlayer = (n) => {
    const facing = Math.abs(angDiff(Math.atan2(n.x - P.x, n.z - P.z), P.yaw)) < 1.4;
    if (iframe > 0) { hooks.onFloat("SCHIVATA!", "#a8e07a"); return; }
    let raw = n.spar ? Math.ceil(n.dmg * 0.6) : n.dmg + (n.role === "bandit" && S.night ? 3 : 0);
    if (facing && hasShield()) raw *= 1 - ITEMS[P.eq.off].block;
    const dmg = Math.max(1, Math.round(raw * (1 - dmgReduction(P.eq))));
    P.hp -= dmg; shake = 0.35;
    sfx.hit(0.9);
    fx.burst(P.x + Math.sin(P.yaw) * 0.5, 1.3, P.z + Math.cos(P.yaw) * 0.5, "#a01818", 10, 3);
    hooks.onFloat(`-${dmg}`, "#ff5252");
    if (n.spar && P.hp <= 15) {
      P.hp = 15; n.spar = false; n.hostile = false; n.hp = n.hpMax; n.actT = null;
      say(`${n.name}: "Ancora troppo lento. Riprova quando vuoi."`);
      return;
    }
    if (P.hp <= 0) {
      P.hp = 60; P.gold = Math.floor(P.gold / 2); P.x = 0; P.z = 4;
      dismount(); npcs.forEach((x) => { Object.assign(x, { hostile: false, spar: false, panic: 0, alert: 0, actT: null, state: "idle" }); }); graceT = 10;
      say("Sei stato sconfitto. Ti risvegli accanto al pozzo, derubato di metà dell'oro.");
    }
  };

  const vAt = (x, z) => (zoneOf(x, z) === zoneOf(P.x, P.z) ? Math.max(0, 1 - Math.hypot(x - P.x, z - P.z) / 28) : 0);
  const pitchOf = (n) => (LOOKS[n.look]?.female || n.female ? 560 : n.role === "noble" ? 420 : 290) * (0.9 + Math.random() * 0.2);
  const snd = { scream: (n) => sfx.scream(vAt(n.x, n.z), pitchOf(n)), swing: (n) => sfx.swing(vAt(n.x, n.z) * 0.8) };
  const ai = createAI({ P, S, npcs, say, hurtPlayer, grace: () => graceT, snd, houseOf });

  const dropLoot = (n) => {
    const rolls = [...(LOOT_OF[n.role] || LOOT_OF.villager)];
    if (n.weapon) rolls.push([n.weapon === "long" ? "spada_lunga" : "spada_corta", 0.5]);
    if (SHOPS[n.id]) { const st = SHOPS[n.id].sells; rolls.push([st[Math.floor(Math.random() * st.length)], 0.9], [st[Math.floor(Math.random() * st.length)], 0.6]); }
    const got = rolls.filter(([, c]) => Math.random() < c).map(([id]) => id);
    got.forEach((id, i) => {
      const a = (i / Math.max(1, got.length)) * Math.PI * 2;
      const [x, z] = pushOut(n.x + Math.cos(a) * 0.9, n.z + Math.sin(a) * 0.9);
      const d = { item: id, qty: 1, x, z }; S.drops.push(d); addPick({ id: `d${Date.now()}${i}`, ...d, drop: true });
    });
  };
  const killNpc = (n, seen) => {
    n.alive = false; n.hostile = false; n.spar = false; n.sleepAt = null; n.deadX = n.x; n.deadZ = n.z; unmountNpc(n); n.ms = "dead";
    sfx.scream(vAt(n.x, n.z) * 0.8, pitchOf(n) * 0.8, 0.7, true);
    note(`${n.name} cade a terra.`);
    dropLoot(n);
    if (n.id === "cocchiere") { car.stopped = true; say("La carrozza resta ferma: nessuno la guida più."); }
    if (n.role === "messenger") say("Senza messaggero, le notizie non viaggeranno più su questa strada.");
    if (SHOPS[n.id]) say(`${SHOPS[n.id].title} resterà chiusa per sempre.`);
    if (n.role === "bandit") { S.rep.village += 5; return; }
    if (seen) { n.discovered = true; if (n.guard) S.rep.crown -= 10; else S.rep.village -= 25; }
    else hooks.onFloat("NESSUN TESTIMONE", "#b9a6ff");
  };

  const hitNpc = (n, dmg) => {
    const calm = !n.hostile && n.role !== "bandit";
    n.hp -= dmg; n.flash = 0.15; n.kb = 0.15; shake = Math.max(shake, 0.12);
    sfx.hit(1);
    fx.burst(n.x, 1.3, n.z, "#b01c1c", 12, 3.5);
    hooks.onFloat(`-${dmg}`, "#f0c050");
    unmountNpc(n);
    if (n.spar) {
      if (n.hp <= n.hpMax * 0.35) {
        Object.assign(n, { spar: false, hostile: false, hp: n.hpMax, actT: null, state: "idle" });
        P.gold += 5; S.rep.crown += 3; S.flags.sparWins = (S.flags.sparWins || 0) + 1;
        say(`${n.name} abbassa la spada: "Bel colpo! Ecco 5 monete, te le sei guadagnate."`);
      }
      return;
    }
    if (n.role === "bandit") {
      bandits().forEach((b) => { if (Math.hypot(b.x - n.x, b.z - n.z) < 25) { b.hostile = true; b.goTo = null; } });
      if (enc.state !== "fight") enc.state = "fight";
      if (n.hp <= 0) killNpc(n, true);
      return;
    }
    let seen = false;
    if (calm) {
      seen = ai.crime(n, false);
      if ((seen || n.hp > 0) && !n.witnessed) {
        n.witnessed = true;
        if (n.guard || n.role === "noble") S.rep.crown -= 25; else S.rep.village -= 15;
      }
      if (n.hp > 0) {
        if (n.fights) { n.hostile = true; say(`${n.name}: "Hai scelto la morte!"`); }
        else ai.scream(n, P.x, P.z, "Aiuto! Mi aggrediscono!");
      }
    }
    if (n.hp <= 0) killNpc(n, seen || n.witnessed);
  };

  const playerAttack = () => {
    const target = npcs.filter((n) => {
      if (!n.alive || !ai.sameZone(n)) return false;
      const dx = n.x - P.x, dz = n.z - P.z;
      return Math.hypot(dx, dz) < 2.6 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) < 0.9;
    }).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (!target) return;
    const n = target, dx = n.x - P.x, dz = n.z - P.z;
    const facingMe = Math.abs(angDiff(Math.atan2(-dx, -dz), n.yaw)) < 1.2;
    if (n.hostile && n.fights && n.state === "idle" && n.stagger <= 0 && facingMe && Math.random() < (FIGHT[n.role] || FIGHT.soldier).block) {
      fx.burst(n.x - dx * 0.3, 1.5, n.z - dz * 0.3, "#ffe08a", 8, 3, true);
      sfx.clash(1); hooks.onFloat("BLOCCATO", "#c8c8d4"); n.cd = Math.min(n.cd, 0.25); queued = false; shake = 0.1;
      return;
    }
    const unaware = (!n.hostile && !facingMe && !n.panic) || n.sleepAt;
    let dmg = SWORDS[P.eq.hand].dmg + Math.round(Math.random() * 6);
    if (combo === 3) dmg = Math.round(dmg * 1.5);
    hitNpc(n, unaware ? n.hp : dmg);
    if (unaware && !n.alive) hooks.onFloat("COLPO ALLE SPALLE", "#ff5a4a");
  };

  const mounted = () => horses.find((h) => h.id === P.mounted);
  const dismount = () => { const h = mounted(); if (h) { h.x = P.x + Math.cos(P.yaw) * 1.5; h.z = P.z - Math.sin(P.yaw) * 1.5; } P.mounted = null; };

  // Inventory & equipment
  const give = (id, q = 1) => {
    if (id === "oro") P.gold += q; else if (id === "argento") P.ore += q; else P.inv[id] = (P.inv[id] || 0) + q;
    hooks.onFloat(`+${q > 1 ? `${q} ` : ""}${ITEMS[id]?.name || id}`, "#e8dcc4");
  };
  const take = (id, q = 1) => { P.inv[id] = (P.inv[id] || 0) - q; if (P.inv[id] <= 0) delete P.inv[id]; };
  const equipItem = (id) => {
    const it = ITEMS[id]; if (!it || !P.inv[id]) return;
    if (it.kind === "sword") { P.inv[SWORD_ITEM[P.eq.hand]] = (P.inv[SWORD_ITEM[P.eq.hand]] || 0) + 1; take(id); P.eq.hand = it.sword; }
    else if (it.kind === "armor" || it.kind === "helm" || it.kind === "offhand") { const slot = it.kind === "armor" ? "body" : it.kind === "helm" ? "head" : "off"; if (P.eq[slot]) P.inv[P.eq[slot]] = (P.inv[P.eq[slot]] || 0) + 1; take(id); P.eq[slot] = id; }
    else return;
    equip(); sfx.pick(0.8); note(`Equipaggi: ${it.name}.`);
  };
  const unequip = (slot) => { if (slot === "hand" || !P.eq[slot]) return; P.inv[P.eq[slot]] = (P.inv[P.eq[slot]] || 0) + 1; P.eq[slot] = null; equip(); };
  const consumeItem = (id) => {
    const it = ITEMS[id]; if (!it || !P.inv[id]) return;
    if (it.kind === "food") { if (P.hp >= 100) { note(`Sei già in piena salute: tieni ${it.name} per dopo.`); return; } take(id); P.hp = Math.min(100, P.hp + it.heal); hooks.onFloat(`+${it.heal}`, "#a8e07a"); say(`${it.name}: +${it.heal} vita.`); }
  };
  const dropItem = (id) => {
    let q = 1;
    if (id === "oro") { q = Math.min(10, P.gold); if (q <= 0) return; P.gold -= q; }
    else if (id === "argento") { if (P.ore <= 0) return; P.ore -= 1; }
    else { if (!P.inv[id]) return; take(id); }
    const [x, z] = pushOut(P.x + Math.sin(P.yaw) * 1.2, P.z + Math.cos(P.yaw) * 1.2);
    const d = { item: id, qty: q, x, z };
    S.drops.push(d);
    addPick({ id: `d${Date.now()}`, ...d, drop: true });
    note(`Lasci a terra: ${ITEMS[id].name}${q > 1 ? ` (${q})` : ""}.`);
  };
  const pickUp = (pk) => {
    scene.remove(pk.mesh); picks.splice(picks.indexOf(pk), 1);
    if (pk.drop) { const i = S.drops.findIndex((d) => d.x === pk.x && d.z === pk.z && d.item === pk.item); if (i >= 0) S.drops.splice(i, 1); }
    else S.flags.taken = { ...(S.flags.taken || {}), [pk.id]: true };
    give(pk.item, pk.qty || 1); sfx.pick(1);
    if (pk.owned && !pk.drop && ai.crime(null, true)) { S.rep.village -= 10; say("Ti hanno visto prendere roba non tua!"); }
  };
  const shop = (kind, npcId, id) => {
    const n = S.npcs[npcId], def = SHOPS[npcId];
    if (!n?.alive || !def) return;
    if (kind === "buy") { const p = buyPrice(id, S.rep); if (P.gold < p || !def.sells.includes(id)) return; P.gold -= p; give(id, 1); sfx.pick(0.8); }
    else if (id === "argento") { if (P.ore <= 0 || !def.orePrice) return; P.ore -= 1; P.gold += def.orePrice; hooks.onFloat(`+${def.orePrice} oro`, "#e8c050"); }
    else { if (!P.inv[id] || !def.buys.includes(ITEMS[id].kind)) return; take(id); const p = sellPrice(id); P.gold += p; hooks.onFloat(`+${p} oro`, "#e8c050"); sfx.pick(0.6); }
  };

  const candidates = () => {
    const list = [];
    const near = (x, z, r = 2.6) => Math.hypot(x - P.x, z - P.z) < r;
    const zoneOk = (x, z) => zoneOf(x, z) === zoneOf(P.x, P.z);
    npcs.forEach((n) => { if (zoneOk(n.x, n.z) && near(n.x, n.z, 2.8) && !n.hostile && !n.panic && !(n.alive === false && n.looted) && !(n.role === "bandit" && n.alive && enc.state === "approach")) list.push({ kind: "npc", id: n.id, x: n.x, z: n.z, label: n.alive ? `Parla con ${n.name}` : `Fruga ${n.name}` }); });
    OBJECTS.forEach((o) => { if (near(o.x, o.z, 3)) list.push({ kind: "obj", id: o.id, x: o.x, z: o.z, label: o.label }); });
    houses.forEach((h) => { if (near(h.chx, h.chz, 1.8) && houseOf(P.x, P.z) === h.i) list.push({ kind: "obj", id: `chest${h.i}`, x: h.chx, z: h.chz, label: S.flags.chests?.[h.i] ? "Baule vuoto" : "Apri il baule" }); });
    picks.forEach((pk) => { if (near(pk.x, pk.z, 2.2)) list.push({ kind: "pick", pk, x: pk.x, z: pk.z, label: `Raccogli ${ITEMS[pk.item]?.name || pk.item}${pk.qty > 1 ? ` (${pk.qty})` : ""}` }); });
    if (!P.mounted) horses.forEach((h) => { if (near(h.x, h.z, 2.8)) list.push({ kind: "horse", id: h.id, x: h.x, z: h.z, w: 1.2, label: "Monta a cavallo" }); });
    ores.forEach((o, i) => { if (o.depletedUntil < time && near(o.x, o.z, 2.6)) list.push({ kind: "ore", id: i, x: o.x, z: o.z, label: "Estrai argento" }); });
    if (P.mounted) list.push({ kind: "dismount", id: "d", x: P.x, z: P.z, label: "Smonta da cavallo" });
    const score = (c) => Math.hypot(c.x - P.x, c.z - P.z) + (c.w || 0) + (c.kind === "dismount" ? 0 : Math.abs(angDiff(Math.atan2(c.x - P.x, c.z - P.z), P.yaw)) > 1.1 ? 3 : 0);
    return list.sort((a, b) => score(a) - score(b))[0] || null;
  };

  const api = (targetId) => ({
    targetId, hostile: makeHostile, equip: equipItem, give, take,
    equipIfBetter: (id) => { if (ITEMS[id].dmg > SWORDS[P.eq.hand].dmg) equipItem(id); else note(`${ITEMS[id].name} finisce nello zaino: la tua arma è migliore.`); },
    heal: (v) => { P.hp = Math.min(100, P.hp + v); },
    crime: (theft, victimId) => ai.crime(S.npcs[victimId] || null, theft),
    scream: (id, text) => { const n = S.npcs[id]; if (n?.alive) ai.scream(n, P.x, P.z, text); },
    spar: (id) => { const n = S.npcs[id]; Object.assign(n, { spar: true, hostile: true, hp: n.hpMax, state: "idle", cd: 1 }); },
    shop: (id) => { hooks.openShop(id, SHOPS[id]); },
    robCarriage: () => {
      const drv = S.npcs.cocchiere;
      const drvSees = drv.alive && ai.sees(drv, P.x, P.z, 6);
      if (drvSees) { say(`Il cocchiere grida: "Ladri! Guardie, alla carrozza!"`); ai.alertGuards(car.x, car.z, 30); }
      return ai.crime(null, true) || drvSees;
    },
    forest: (result) => {
      enc.state = result === "fight" ? "fight" : "paid";
      bandits().forEach((b) => { b.goTo = null; if (result === "fight") b.hostile = true; });
    },
  });

  function interact() {
    if (dialogOpen) return;
    const c = candidates();
    if (!c) return;
    if (c.kind === "horse") { P.mounted = c.id; P.sneak = false; note("Monti a cavallo."); return; }
    if (c.kind === "dismount") { dismount(); return; }
    if (c.kind === "pick") { pickUp(c.pk); return; }
    if (c.kind === "ore") { const o = ores[c.id]; o.depletedUntil = time + 45; P.ore += 1; fx.burst(o.x, 1, o.z, "#d8e4f0", 10, 3, true); hooks.onFloat("+1 argento", "#d8e4f0"); return; }
    const d = getDialog(c.id, S);
    if (d) { dialogOpen = true; hooks.openDialog(c.id, d); }
  }

  function choose(id, effect) {
    dialogOpen = false;
    if (effect === "close") {
      if (enc.state === "talk") { api(id).forest("fight"); say(`Capo Morn: "Niente risposta? Allora parlerà la spada!"`); }
      return;
    }
    say(applyEffect(effect, S, api(id)));
  }

  function action(kind) {
    sfx.unlock();
    if (dialogOpen || paused) return;
    if (kind === "interact") interact();
    if (kind === "attack") { if (atkT < 0) { atkT = 0; combo = 1; sfx.swing(0.7); } else if (atkT > 0.12) queued = true; }
    if (kind === "sneak") setSneak(!P.sneak);
    if (kind === "camera") setView(view === "first" ? "third" : "first");
    if (kind === "dodge" && dodgeCd <= 0) {
      const kx = input.x + (keys.d ? 1 : 0) - (keys.a ? 1 : 0), ky = input.y + (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      const f = Math.hypot(kx, ky) > 0.2 ? [kx, ky] : [0, 1];
      const fwx = Math.sin(P.yaw), fwz = Math.cos(P.yaw), rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
      dodgeDir = [fwx * -f[1] + rx * f[0], fwz * -f[1] + rz * f[0]];
      const l = Math.hypot(...dodgeDir) || 1; dodgeDir = [dodgeDir[0] / l, dodgeDir[1] / l];
      dodgeT = 0.3; iframe = 0.4; dodgeCd = 0.8;
      fx.burst(P.x, 0.2, P.z, "#b8a47a", 8, 2.5); sfx.swing(0.35);
    }
  }

  const pushOut = (x, z, rad = 0.4) => {
    for (const o of obstacles) {
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r + rad) { x = o.x + (dx / (d || 1)) * (o.r + rad); z = o.z + (dz / (d || 1)) * (o.r + rad); }
    }
    for (const r of rects) {
      if (r.off) continue;
      const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.ry), s = Math.sin(r.ry);
      let lx = c * dx - s * dz, lz = s * dx + c * dz;
      const px = r.hw + rad - Math.abs(lx), pz = r.hd + rad - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) lx = Math.sign(lx || 1) * (r.hw + rad); else lz = Math.sign(lz || 1) * (r.hd + rad);
      x = r.cx + c * lx + s * lz; z = r.cz - s * lx + c * lz;
    }
    return [x, z];
  };
  // Is a camera point inside a wall? (houses, city walls, cave): keeps the 3rd-person camera out of walls.
  const camBlocked = (x, z) => rects.some((r) => {
    if (r.off) return false;
    const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.ry), s2 = Math.sin(r.ry);
    return Math.abs(c * dx - s2 * dz) < r.hw + 0.15 && Math.abs(s2 * dx + c * dz) < r.hd + 0.15;
  });
  const collide = (x, z) => {
    [x, z] = pushOut(x, z);
    if (z < WZ - 1) return [clamp(x, -15.8, 15.8), Math.max(WZ - 29.8, z)];
    if (z < -24 && Math.abs(x) < 30.5) return [clamp(x, -30, 30), z];
    if (x < -24 && (Math.abs(z) < 2.6 || x < -31)) return [Math.max(-56.5, x), clamp(z, -11, 11)];
    const r = Math.hypot(x, z);
    return r > 31 ? [(x / r) * 31, (z / r) * 31] : [x, z];
  };

  const enc = { state: "idle", rescued: false };
  S.enc = enc;
  const bandits = () => npcs.filter((n) => n.role === "bandit" && n.alive);
  function resetForest() {
    enc.state = "idle"; enc.rescued = false;
    bandits().forEach((b) => Object.assign(b, { goTo: null, hostile: false, state: "idle", hp: b.hpMax, actT: null }));
  }
  // Bandits hidden behind the trees: either an ambush or the boss demanding a toll. Bolder at night.
  function updateEncounter() {
    if (region !== "forest" || dialogOpen) return;
    const bs = bandits(), boss = S.npcs.bandit3;
    if (!bs.length) return;
    if (enc.state === "fight" && !enc.rescued && P.z < FZ - 54 && bs.some((b) => b.hostile)) {
      enc.rescued = true;
      const kn = npcs.find((n) => n.alive && n.id === "brann") || npcs.find((n) => n.alive && n.id === "oswin");
      bs.forEach((b) => Object.assign(b, { hostile: false, goTo: null, state: "idle", actT: null }));
      if (kn) say(`${kn.name}: "Indietro, feccia! Qui comanda la Corona!" I banditi si ritirano nel bosco.`);
      else say("I banditi si fermano ai piedi delle mura e si ritirano nel bosco.");
      return;
    }
    if (enc.state === "idle" && P.z < FZ - 8 && P.z > FZ - 52 && bs.some((b) => Math.hypot(b.x - P.x, b.z - P.z) < (P.sneak ? 8 : 16))) {
      if (boss.alive && Math.random() < (S.night ? 0.2 : 0.5)) {
        enc.state = "approach";
        bs.forEach((b) => { if (b !== boss) { const dx = P.x - b.x, dz = P.z - b.z, d = Math.hypot(dx, dz) || 1; b.goTo = [P.x - (dx / d) * 3.5, P.z - (dz / d) * 3.5]; } });
        say(`${boss.name}: "Fermo lì, viandante! Questa strada ha un pedaggio."`);
      } else {
        enc.state = "fight";
        bs.forEach((b) => { b.hostile = true; b.goTo = null; });
        say(S.night ? "Ombre sbucano da dietro gli alberi! Di notte i banditi non fanno prigionieri!" : "Dei banditi sbucano da dietro gli alberi! È un'imboscata!");
        hooks.onFloat("IMBOSCATA!", "#ff5a4a", true);
        sfx.scream(0.6, 240, 0.6);
      }
    }
    if (enc.state === "approach") {
      if (!boss.alive || boss.hostile) { api(boss.id).forest("fight"); return; }
      const dx = boss.x - P.x, dz = boss.z - P.z, d = Math.hypot(dx, dz) || 1;
      boss.goTo = [P.x + (dx / d) * 1.8, P.z + (dz / d) * 1.8];
      if (d < 2.6) { enc.state = "talk"; dialogOpen = true; hooks.openDialog(boss.id, getDialog(boss.id, S)); }
      else if (d > 26) { api(boss.id).forest("fight"); say(`${boss.name}: "Scappi? Prendetelo!"`); }
    }
  }

  function updateCarriage(dt, time) {
    const drv = S.npcs.cocchiere;
    const fwX = Math.sin(car.yaw), fwZ = Math.cos(car.yaw);
    car.msgT -= dt;
    let moving = false;
    const blocked = Math.hypot(P.x - (car.x + fwX * 4.2), P.z - (car.z + fwZ * 4.2)) < 2.4;
    const driverOn = drv.alive && drv.ms === "seat";
    if (car.stopped || !driverOn) { /* no driver, carriage waits */ }
    else if (car.wait > 0) car.wait -= dt;
    else if (blocked) { if (car.msgT <= 0) { note(`Il cocchiere: "Fatti da parte, villano!"`); car.msgT = 6; } }
    else {
      const s = ROUTE[car.i], dx = s.at[0] - car.x, dz = s.at[1] - car.z, dd = Math.hypot(dx, dz);
      if (dd < 0.4) {
        car.wait = s.stop || 0;
        if (s.msg && Math.hypot(P.x - car.x, P.z - car.z) < 16) note(s.msg);
        car.i = (car.i + 1) % ROUTE.length;
      } else {
        const spd = Math.min(dd, 3 * dt);
        car.x += (dx / dd) * spd; car.z += (dz / dd) * spd;
        car.yaw += angDiff(Math.atan2(dx, dz), car.yaw) * Math.min(1, dt * 2.5);
        moving = true;
        const hb = Math.floor(time * 3.5);
        if (hb !== car.beat) { car.beat = hb; sfx.hoof(vAt(car.x, car.z) * 0.8); }
      }
    }
    at(car.group, car.x, moving ? Math.abs(Math.sin(time * 8)) * 0.04 : 0, car.z, car.yaw);
    carObs[0].x = car.x; carObs[0].z = car.z;
    carObs[1].x = car.x + fwX * 3.6; carObs[1].z = car.z + fwZ * 3.6;
    carObj.x = car.x; carObj.z = car.z;
  }

  // Scripted NPCs: the coachman on his seat, messengers who ride, dismount, talk and ride back.
  const seatOf = () => [car.x + Math.sin(car.yaw) * 1.55, car.z + Math.cos(car.yaw) * 1.55];
  const walkTo = (n, x, z, spd, dt) => { const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz); if (d < 0.3) return true; const s = Math.min(d, spd * dt); n.x += (dx / d) * s; n.z += (dz / d) * s; n.yaw += angDiff(Math.atan2(dx, dz), n.yaw) * Math.min(1, dt * 8); return false; };
  function scriptUpdate(n, dt) {
    const out = { walk: false, mode: null, k: 0, carry: false };
    if (n.id === "cocchiere") {
      const [sx, sz] = seatOf();
      if (n.ms !== "seat") { if (walkTo(n, sx, sz, 2.5, dt)) n.ms = "seat"; else out.walk = true; return out; }
      n.x = sx; n.z = sz; n.yaw = car.yaw; out.mode = "sit"; return out;
    }
    if (n.ms === "walk") { if (walkTo(n, n.horse.x, n.horse.z, 2.6, dt)) { n.riding = true; n.ms = "ride"; } else out.walk = true; return out; }
    if (n.ms === "ride") {
      out.mode = "sit";
      const t = RIDER_ROUTE[n.ri], dx = t[0] - n.x, dz = t[1] - n.z, dd = Math.hypot(dx, dz);
      if (dd < 0.6) {
        const end = n.ri === 0 || n.ri === RIDER_ROUTE.length - 1;
        if (end) { n.riding = false; n.ms = "visit"; n.visitT = 0; n.target = n.ri === 0 ? (S.npcs.alaric.alive ? S.npcs.alaric : S.npcs.soldier1) : (S.npcs.brann.alive ? S.npcs.brann : S.npcs.oswin); n.dir = n.ri === 0 ? 1 : -1; return out; }
        n.ri = clamp(n.ri + n.dir, 0, RIDER_ROUTE.length - 1); return out;
      }
      const spd = Math.min(dd, 7 * dt);
      n.x += (dx / dd) * spd; n.z += (dz / dd) * spd;
      n.yaw += angDiff(Math.atan2(dx, dz), n.yaw) * Math.min(1, dt * 3);
      n.horse.x = n.x; n.horse.z = n.z; n.horse.yaw = n.yaw;
      const hb = Math.floor(time * 4.5);
      if (hb !== n.beat) { n.beat = hb; sfx.hoof(vAt(n.x, n.z) * 0.7); }
      return out;
    }
    if (n.ms === "visit") {
      const tg = n.target, alive = tg?.alive;
      const tx = alive ? tg.x : n.horse.x + 2, tz = alive ? tg.z : n.horse.z;
      if (Math.hypot(tx - n.x, tz - n.z) > 1.6) { walkTo(n, tx, tz, 2.6, dt); out.walk = true; return out; }
      n.yaw += angDiff(Math.atan2(tx - n.x, tz - n.z), n.yaw) * Math.min(1, dt * 6);
      out.mode = "talk"; n.visitT += dt;
      if (!n.said) {
        n.said = true;
        const near = Math.hypot(P.x - n.x, P.z - n.z) < 26;
        if (n.ri === 0) { n.news = S.rep.crown; if (near) note(`${n.name} smonta da cavallo e riferisce a ${alive ? tg.name : "nessuno... il posto di guardia è vuoto"}.`); }
        else if (alive && n.news != null) { const ch = S.known.crown !== n.news; S.known.crown = n.news; n.news = null; if (near) (ch ? say : note)(ch ? `${n.name} smonta e parla con ${tg.name}: a Valdoro ora sanno di te.` : `${n.name} parla con ${tg.name}: nulla di nuovo da Roccanera.`); }
        else if (near) note(`${n.name} cerca i cavalieri alle mura, ma nessuno ascolta.`);
      }
      if (n.visitT > 7) { n.ms = "walk"; n.said = false; n.ri = clamp(n.ri + n.dir, 0, RIDER_ROUTE.length - 1); }
      return out;
    }
    return out;
  }

  const sleepTime = () => S.dayT > 0.84 || S.dayT < 0.21;
  // Each resident of a house gets their own sleeping place (before, two NPCs shared the same bed).
  const bedSlot = {};
  { const count = {}; NPC_DEFS.forEach((d) => { if (d.home == null) return; bedSlot[d.id] = count[d.home] || 0; count[d.home] = bedSlot[d.id] + 1; }); }
  function updateHomes() {
    const night = sleepTime();
    npcs.forEach((n) => {
      if (n.home == null || !n.alive) return;
      const h = houses[n.home];
      if (night && !n.hostile && !n.panic) { if (!n.sleepAt) { const b = h.beds[Math.min(bedSlot[n.id] || 0, h.beds.length - 1)]; n.sleepAt = b.edge; n.sleepVia = h.via; n.viaI = 0; n.bedAt = b.bed; n.bedY = b.y; } }
      else if (!night && n.sleepAt) { n.sleepAt = null; n.exitTo = [h.via[1], h.via[0]]; n.exitI = 0; }
    });
  }

  function updateDoorsAndGate(dt) {
    houses.forEach((h) => {
      const near = Math.hypot(P.x - h.dx, P.z - h.dz) < 2.2 || npcs.some((n) => n.alive && (n.sleepAt || n.exitTo) && Math.hypot(n.x - h.dx, n.z - h.dz) < 2.2 && !(n.sleepAt && n.bedAt && Math.hypot(n.x - n.bedAt[0], n.z - n.bedAt[1]) < 1.6));
      const target = near ? 1.9 : 0;
      if (target && h.open < 0.05) sfx.creak(vAt(h.dx, h.dz));
      h.open += (target - h.open) * Math.min(1, dt * 5);
      h.door.rotation.y = h.open;
    });
    const open = (S.known.crown >= 30 || !!S.flags.gateBribed) && !npcs.some((n) => n.valdoro && n.guard && n.alive && n.hostile);
    if (open !== S.gateOpen) {
      S.gateOpen = open; gateRect.off = open;
      if (Math.hypot(P.x, P.z - WZ) < 45) { sfx.gate(0.8); say(open ? "Le porte di Valdoro si aprono cigolando!" : "Le porte di Valdoro si chiudono con un tonfo."); }
    }
    gate.position.y += ((open ? 5.2 : 0) - gate.position.y) * Math.min(1, dt * 1.2);
  }

  function updateHud(dt) {
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      const foe = npcs.filter((n) => n.alive && n.hostile && n.fights && ai.sameZone(n)).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      rack.children.slice(1).forEach((sw, i) => { sw.visible = i >= (S.flags.rackTaken || 0); });
      const c = dialogOpen || paused ? null : candidates();
      const label = c?.label || null;
      if (label !== prompt) { prompt = label; hooks.onPrompt(label); }
      const wanted = npcs.some((n) => n.alive && n.guard && n.hostile && !n.spar) ? 2 : npcs.some((n) => n.alive && n.alert > 0) ? 1 : 0;
      hooks.onHud({
        hp: P.hp, gold: P.gold, ore: P.ore, eq: { ...P.eq }, inv: { ...P.inv }, rep: { ...S.rep }, known: S.known.crown, gateOpen: S.gateOpen, mounted: !!P.mounted, zone: region, wanted, combo, sneak: !!P.sneak, view,
        dayT: S.dayT, night: S.night, places: repSummary(S),
        foe: foe && Math.hypot(foe.x - P.x, foe.z - P.z) < 14 ? { name: foe.spar ? `${foe.name} (allenamento)` : foe.name, hp: Math.max(0, foe.hp), hpMax: foe.hpMax } : null,
      });
    }
  }

  const clock = new THREE.Clock();
  let raf = 0, time = 0, bobT = 0;
  function frame() {
    const dt = Math.min(0.1, clock.getDelta());
    if (paused) { updateHud(dt); renderer.render(scene, camera); raf = requestAnimationFrame(frame); return; }
    time += dt;
    S.dayT = (S.dayT + dt / DAY_LEN) % 1;
    graceT -= dt;
    region = regionOf(P.x, P.z);
    if (region !== lastRegion) { if (region === "forest" && P.z > FZ - 5) resetForest(); lastRegion = region; }
    atmosphere(dt);
    updateCarriage(dt, time);
    updateHomes();
    updateDoorsAndGate(dt);
    updateEncounter();
    if (keys.arrowleft) P.yaw += dt * 2.2; if (keys.arrowright) P.yaw -= dt * 2.2;
    if (keys.arrowup) pitch = clamp(pitch + dt * 1.5, -1.2, 1.2); if (keys.arrowdown) pitch = clamp(pitch - dt * 1.5, -1.2, 1.2);
    const ix = input.x + (keys.d ? 1 : 0) - (keys.a ? 1 : 0), iy = input.y + (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    const mag = Math.min(1, Math.hypot(ix, iy));
    const fwx = Math.sin(P.yaw), fwz = Math.cos(P.yaw), rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
    let mx = fwx * -iy + rx * ix, mz = fwz * -iy + rz * ix;
    const ml = Math.hypot(mx, mz);
    let moving = false;
    if (!dialogOpen && dodgeT <= 0 && ml > 0.15) {
      mx /= ml; mz /= ml;
      const spd = (P.mounted ? 9 : 4.5) * mag * (atkT >= 0 ? 0.5 : 1) * (P.sneak ? 0.45 : 1);
      [P.x, P.z] = collide(P.x + mx * spd * dt, P.z + mz * spd * dt);
      moving = true; bobT += dt * (P.mounted ? 7 : 9);
    } else [P.x, P.z] = collide(P.x, P.z);
    if (dodgeT > 0) { dodgeT -= dt; [P.x, P.z] = collide(P.x + dodgeDir[0] * 10 * dt, P.z + dodgeDir[1] * 10 * dt); }
    iframe -= dt; dodgeCd -= dt; shake = Math.max(0, shake - dt);
    let k = 0;
    if (atkT >= 0) {
      const prev = atkT; atkT += dt; k = atkT / 0.4;
      if (prev < 0.18 && atkT >= 0.18) playerAttack();
      if (atkT > 0.45) { if (queued && combo < 3) { atkT = 0; combo += 1; sfx.swing(0.8); } else { atkT = -1; combo = 0; } queued = false; }
    }
    const h = mounted();
    if (h) { h.x = P.x; h.z = P.z; h.yaw = P.yaw; }
    const beat = h ? Math.floor(time * 4) : Math.floor((time * 9) / Math.PI);
    if (moving && beat !== P.beat) { if (h) sfx.hoof(0.7); else sfx.step(0.6); }
    P.beat = beat;
    horses.forEach((ho) => at(ho.mesh, ho.x, 0, ho.z, ho.yaw));

    scanT -= dt;
    if (scanT <= 0) { scanT = 0.5; ai.scanBodies(); }
    const seeFar = scene.fog.far + 4;   // characters hidden by the fog are not drawn (the simulation still runs)
    npcs.forEach((n) => {
      n.mesh.visible = Math.hypot(n.x - P.x, n.z - P.z) < seeFar;
      if (n.horse) { at(n.horse.mesh, n.horse.x, 0, n.horse.z, n.horse.yaw); n.horse.mesh.visible = Math.hypot(n.horse.x - P.x, n.horse.z - P.z) < seeFar; }
      if (!n.alive) { at(n.mesh, n.x, 0.25, n.z, n.yaw); n.mesh.rotation.x = -Math.PI / 2; poseHuman(n.mesh, 0, false, "dead"); n.mesh.userData.prop.visible = false; showTool(n.mesh, null); return; }
      n.cd -= dt; n.stagger -= dt; n.flash -= dt;
      const r = n.scripted && !n.hostile && !n.panic ? scriptUpdate(n, dt) : ai.update(n, dt);
      if (!n.riding && !(n.id === "cocchiere" && !n.hostile && !n.panic)) [n.x, n.z] = pushOut(n.x, n.z);
      if (n.scripted && (n.hostile || n.panic)) { unmountNpc(n); if (n.id === "cocchiere") n.ms = "off"; }
      const nt = time + n.pos[0];
      if (r.mode === "sleep") { at(n.mesh, n.bedAt[0], n.bedY ?? 0.62, n.bedAt[1], n.yaw); n.mesh.rotation.x = -Math.PI / 2; poseHuman(n.mesh, 0, false, "sleep"); }
      else {
        const y = poseHuman(n.mesh, nt, r.walk, r.mode, r.k);
        at(n.mesh, n.x, n.riding ? 1.05 : n.ms === "seat" ? 0.35 : y, n.z, n.yaw);
        n.mesh.rotation.x = 0;
        n.mesh.userData.hipL.rotation.z = n.riding ? 0.5 : 0; n.mesh.userData.hipR.rotation.z = n.riding ? -0.5 : 0;
      }
      if (r.mode === "hammer") { const b = Math.floor((nt * 5) / Math.PI); if (b !== n.beat) { n.beat = b; sfx.anvil(vAt(n.x, n.z)); } }
      else if (r.walk) { const b = Math.floor((nt * 9) / Math.PI); if (b !== n.beat) { n.beat = b; sfx.step(vAt(n.x, n.z) * 0.35); } }
      n.mesh.userData.prop.visible = r.carry;
      showTool(n.mesh, TOOL_OF[r.mode] || null);
      n.mesh.scale.setScalar(n.flash > 0 ? 1.08 : 1);
    });
    fx.update(dt);
    ores.forEach((o) => { o.mesh.userData.crystals.visible = o.depletedUntil < time; });
    picks.forEach((pk) => { pk.mesh.position.y = 0.05 + Math.abs(Math.sin(time * 2 + pk.x)) * 0.05; pk.mesh.rotation.y += dt * 0.6; });

    // Camera: first person (view model) or third person (behind and above the shoulders)
    const bob = moving ? Math.sin(bobT) * 0.045 : 0;
    const crouch = P.sneak && !P.mounted ? 0.45 : 0;
    const shk = shake ? (Math.random() - 0.5) * 0.1 : 0;
    const eyeY = (P.mounted ? 2.55 : 1.62) - crouch + bob + shk;
    const lookX = Math.sin(P.yaw) * Math.cos(pitch), lookY = Math.sin(pitch), lookZ = Math.cos(P.yaw) * Math.cos(pitch);
    const sw = Math.sin(Math.min(1, k) * Math.PI);
    if (view === "third") {
      // Player body
      const pm = playerMesh;
      const ny = poseHuman(pm, bobT / 9 * (P.mounted ? 0 : 1), moving && !P.mounted, P.mounted ? "sit" : atkT >= 0 ? "swing" : P.sneak ? "sneak" : null, Math.min(1, k));
      at(pm, P.x, P.mounted ? 1.05 : ny, P.z, P.yaw);
      pm.userData.hipL.rotation.z = P.mounted ? 0.5 : 0; pm.userData.hipR.rotation.z = P.mounted ? -0.5 : 0;
      pm.rotation.x = dodgeT > 0 ? 0.25 : 0;
      // Camera behind the right shoulder; pulled in if a wall is in the way.
      const headY = (P.mounted ? 2.45 : 1.75) - crouch;
      const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
      const want = P.mounted ? 4.2 : 3.0, side = 0.55;
      const bx = -lookX, by = 0.35 - lookY * 0.8, bz = -lookZ;
      let dist = want;
      for (let t = 0.3; t <= want; t += 0.2) {
        const cx = P.x + bx * t + rx * side * (t / want), cz = P.z + bz * t + rz * side * (t / want);
        if (camBlocked(cx, cz)) { dist = Math.max(0.35, t - 0.3); break; }
      }
      const f = dist / want;
      const cx = P.x + bx * dist + rx * side * f, cz = P.z + bz * dist + rz * side * f, cy = Math.max(0.4, headY + 0.7 + by * dist);
      camera.position.set(cx + shk, cy, cz);
      camera.lookAt(P.x + rx * side * f + lookX * 4, headY + lookY * 4, P.z + rz * side * f + lookZ * 4);
    } else {
      camera.position.set(P.x + shk * 0.8, eyeY, P.z);
      camera.lookAt(P.x + lookX, eyeY + lookY, P.z + lookZ);
      // Slash: wind up high on the right, cut down across to the left, recover (mirrored on the 2nd combo hit).
      const side = combo === 2 ? -1 : 1, R = VM_REST.R, L = VM_REST.L;
      const [raise, sweep] = atkT >= 0 ? fpSwing(Math.min(1, k)) : [0, 0];
      vm.armR.rotation.set(R.rx + raise, side * sweep, -side * sweep * 0.5);
      vm.armR.position.set(R.pos[0], R.pos[1] + Math.sin(bobT * 0.5) * 0.01, R.pos[2]);
      vm.armL.rotation.set(L.rx, 0, 0);
      vm.armL.position.set(L.pos[0], L.pos[1] + Math.cos(bobT * 0.5) * 0.01, L.pos[2]);
      vm.g.position.y = bob * 0.5 - (P.sneak && !P.mounted ? 0.03 : 0);
    }

    updateHud(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  const resize = () => {
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
  };
  // Multitouch: every pointer is tracked by its own pointerId. The camera only follows pointers that started
  // outside the on-screen controls (joystick, buttons, panels are marked data-ui), so joystick + look work together.
  const lookers = new Map();
  const onDown = (e) => {
    sfx.unlock();
    if (paused || e.target?.closest?.("[data-ui]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e) => {
    const l = lookers.get(e.pointerId);
    if (!l) return;
    if (!paused) { P.yaw -= (e.clientX - l.x) * 0.005; pitch = clamp(pitch - (e.clientY - l.y) * 0.004, -1.2, 1.2); }
    l.x = e.clientX; l.y = e.clientY;
  };
  const onUp = (e) => { lookers.delete(e.pointerId); };
  const kd = (e) => {
    const kk = e.key.toLowerCase(); keys[kk] = true; sfx.unlock();
    if (e.repeat) return;
    if (kk === "e") action("interact");
    if (kk === "j") action("attack");
    if (kk === "c") action("sneak");
    if (kk === "v") action("camera");
    if (kk === " " || kk === "l") action("dodge");
    if (kk === "i") hooks.onToggleInventory?.();
  };
  const ku = (e) => { keys[e.key.toLowerCase()] = false; };
  const blur = () => { Object.keys(keys).forEach((kk) => { keys[kk] = false; }); };
  window.addEventListener("blur", blur);
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("resize", resize);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    input, action, choose, shop,
    look: (dx, dy) => { P.yaw -= dx * 0.005; pitch = clamp(pitch - dy * 0.004, -1.2, 1.2); },
    closeDialog: () => { dialogOpen = false; },
    setPaused: (v) => { paused = !!v; lookers.clear(); if (paused) Object.keys(keys).forEach((kk) => { keys[kk] = false; }); },
    invAction: (kind, id) => { sfx.unlock(); if (kind === "use") consumeItem(id); else if (kind === "equip") equipItem(id); else if (kind === "drop") dropItem(id); else if (kind === "unequip") unequip(id); },
    getSave: () => ({
      player: { hp: P.hp, gold: P.gold, ore: P.ore, eq: { ...P.eq }, inv: { ...P.inv }, x: P.x, z: P.z, yaw: P.yaw },
      rep: S.rep, known: S.known, flags: S.flags, drops: S.drops, dayT: S.dayT, view,
      npcs: Object.fromEntries(npcs.map((n) => [n.id, { alive: n.alive, looted: n.looted, discovered: n.discovered, witnessed: n.witnessed, hp: n.alive ? n.hpMax : 0, deadX: n.deadX, deadZ: n.deadZ }])),
    }),
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
      renderer.dispose(); sfx.dispose();
    },
  };
}
