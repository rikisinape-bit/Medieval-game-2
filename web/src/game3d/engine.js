import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LOOKS, makeHuman, poseHuman, showTool, makeHorse, makeCarriage, makeHouse, HOUSE_RECTS, CHEST_LOCAL, HOUSE_H, makeTree, makeForge, makeSwordRack, makeStall, makeWell, makeSword, makeDummy, makeCage, makeBench, makeWoodpile, makeField, makeCamp, makeSignpost, makeCityWall, makeFountain, makeValdoroWalls, makeItem, makeTorch, makeShield, makeLantern, makeFlame, makeViewmodel, makePlayerModel, playerLook, VM_REST, poseDeath, followSkirt, DEATH_TIME, saddleY, box, at } from "./models";
import { getDialog, applyEffect, CONTINUES, RANSOM, RANSOM_CAGE } from "./dialogs";
import { FZ, WZ, CX, CZ, angDiff, SWORDS, NPC_DEFS, OBJECTS, HOUSES, CHESTS, DUMMIES, PICKUPS, ROUTE, RIDER_ROUTE, PATH, CAMP, LANTERNS, CASTLE, CAGE, CAGE_GUARDS, CAGE_WATCH } from "./world";
import { ITEMS, SWORD_ITEM, SHOPS, LOOT_OF, dmgReduction, sellPrice, buyPrice, TOOL_OF, TWO_HANDED, SLOW_2H } from "./items";
import { createAI } from "./ai";
import { rng, hashStr, PALADIN_MAT, setupPaladinEnv } from "./body";
import { createFx } from "./fx";
import { createAudio } from "./audio";
import { repSummary } from "./reputation";
import { SHIELD_KIND, LEFT_BELOW } from "./weapons";
import { hasNature, hasKit, hasProps, addNature, kitObject, kitMaterial, kitHouseTop, kitSize, kitPartBox } from "./nature";
import { groundMat } from "./ground";
import { buildMine } from "./mine";
import { castle, buildCastle, castleAnchors, castleSolids, castleSpawn, castleExit, castleCells, castleJail } from "./castle";
import { addLeaves, edgeSpots, circleShape, rectShape, ellipseShape } from "./leaves";
import { makeMountain, mountainHeight } from "./mountain";
import { armRig, solveKey, restPose, mixPose, applyPose, fistFrame, reach, armReach } from "./fparm";
import { createSky, sunDir } from "./sky";
import { shapeOf, tumble, middle, placeMiddle, settle } from "./tumble";
import { regionOf, zoneOf, toWorld as siteToWorld, toLegacy, placeWorld, siteOf, heightOf, SITES, inSite, worldToMap } from "./sites";
import { createTerrain, surfaceAt, groundAt, deepWater, onDeck, bridgeKeep, layersAt, coastAt } from "./terrain";
import { createNav } from "./nav";
import { createWolves } from "./wolves";
import { createGoblin } from "./goblin";
import { createVegetation } from "./vegetation";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY_LEN = 600; // seconds per full day
const solvedBlows = {};   // first-person blows, solved once (fparm.js): the player's arm is the same whatever it wears
const solved2 = {};       // the same for the two-handed swords (both arms)
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const pathDist = (x, z) => Math.min(...PATH.slice(1).map((p, i) => segDist(x, z, PATH[i], p)));

// opts.power: battery saving, 0 off (60 frames a second), 1 medium (45, same graphics), 2 most (30, screen resolution,
// hard-edged shadows); setPower switches it later
export const POWER_FPS = [60, 45, 30];
export function createGame(canvas, hooks, saved, opts = {}) {
  let power = POWER_FPS[opts.power] ? opts.power : 0, saving = power === 2;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  setupPaladinEnv(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, saving ? 1 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = saving ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9cc4e4");
  scene.fog = new THREE.Fog("#b8d0e0", 30, 80);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 640);   // (far: the open country is seen a long way, terrain.js far ground)
  scene.add(camera);
  const hemi = new THREE.HemisphereLight("#cfe4ff", "#4a3a22", 0.9);
  const sun = new THREE.DirectionalLight("#fff0d0", 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 140 });
  scene.add(hemi, sun, sun.target);
  const sky = createSky(scene), _sunV = new THREE.Vector3();          // the sun and the moon going round the sky
  const fx = createFx(scene);
  const sfx = createAudio();
  // Everything below is built in the old map's coordinates (world.js), then each place is moved where the map of
  // Vasilad draws it (sites.js; see "The places move" further down). What is in the scene already does not move.
  const preBuild = new Set(scene.children);
  // the things one can use (well, carriage, the castle's door...) where their place now is
  const OBJS = OBJECTS.map((o) => { const [x, z] = siteToWorld(o.x, o.z); return { ...o, x, z }; });

  const obstacles = [], rects = [];
  const put = (o, x, z, ry = 0, r = 0) => { at(o, x, o.position.y, z, ry); scene.add(o); if (r) obstacles.push({ x, z, r }); return o; };
  // Trees are only recorded here (position + collision circle); the models are added later, all together.
  const treeSpots = [], S_nature = { tris: 0, count: 0 }, natureMeshes = [], oldTrees = [], oldThings = [];   // (oldTrees: drawn by vegetation.js)
  const FAR_THINGS = 220;                                       // the places' things are drawn up to here (atmosphere)
  // gone: a tree that was there before the bandits' camp grew (kept in the list so the forest's random layout does not
  // change, but neither drawn nor solid)
  const putTree = (pine, x, z, ry = 0, r = 0, gone = false) => {
    if (mountainHeight(x, z) > 0.4) return;                    // no trees half-buried in the mountain
    if (z > WZ && z < WZ + 10) return;                         // (before Valdoro's gate: the forest is elsewhere now)
    treeSpots.push({ pine: !!pine, x, z, ry, gone }); if (r && !gone) obstacles.push({ x, z, r });
  };
  const toWorld = (x, z, ry, lx, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
  // pieces of the nature, kit and props packs laid in the old map: moved with their place (sites.js), then merged
  const addNatureL = (items) => {
    const n0 = scene.children.length;
    const tris = addNature(scene, items.map((it) => { const [x, z, ry] = placeWorld(it.x, it.z, it.ry || 0); return { ...it, x, z, ry, y: (it.y || 0) + heightOf(it.x, it.z) }; }), natureMeshes);
    scene.children.slice(n0).forEach((o) => { o.userData.world = true; });
    return tris;
  };
  // The ground (ground.js): grass on the meadows (darker under the trees of the forest), dirt on the square, the roads
  // and the forest path, cracked earth in the bandits' camp, flagstones in Valdoro and before its gate. Laid in world
  // space at their real size.
  const G = {
    meadow: groundMat(renderer, "erba", { scale: 2.4, tint: "#f6ffe2" }), forest: groundMat(renderer, "erba", { scale: 2.4, tint: "#a2ae98", dry: 0.15 }),   // (2.4 m: the grass photo's own size, as in terrain.js)
    square: groundMat(renderer, "terra", { scale: 2.6, tint: "#fff8ee", vary: 0.12, dry: 0 }), road: groundMat(renderer, "terra", { scale: 2.6, tint: "#f6eee2", vary: 0.12, dry: 0 }),
    path: groundMat(renderer, "terra", { scale: 2.6, tint: "#ddd2c2", vary: 0.15, dry: 0 }), camp: groundMat(renderer, "crepe", { scale: 2.6, tint: "#fff0dc", vary: 0.12, dry: 0 }),
    stone: groundMat(renderer, "pietra", { scale: 3.6, tint: "#ffffff", vary: 0.1, dry: 0, mix: 0 }),
  };
  const flat = (geo, m) => { const o = new THREE.Mesh(geo, m); o.receiveShadow = true; return o; };
  // (the ground itself is the terrain of the whole world, terrain.js: laid once the places have moved)
  const square = new THREE.Mesh(new THREE.CircleGeometry(11, 30), G.square);
  square.rotation.x = -Math.PI / 2; square.position.y = 0.01; square.receiveShadow = true; scene.add(square);
  // [x, z, width, depth, turn]: north (to the fields), to the coach's stop, on to the road to Valdoro (south-east), the
  // road to the mine (east)
  const ROADS = [[0, -14, 3, 18], [8, 10, 3, 14], [0, -27, 4, 8], [18.7, 17.2, 3.4, 14.6, 0.93], [18.5, -1.9, 3.4, 15.6, 1.703]];
  const inRoad = (x, z, [cx, cz, w, d, ry = 0], m = 0) => { const dx = x - cx, dz = z - cz, c = Math.cos(ry), sn = Math.sin(ry); return Math.abs(c * dx - sn * dz) < w / 2 + m && Math.abs(sn * dx + c * dz) < d / 2 + m; };
  ROADS.forEach(([x, z, w, d, ry = 0]) => put(flat(new THREE.BoxGeometry(w, 0.02, d), G.road), x, z, ry));

  // Houses: hinged doors, interiors, chests, beds
  // Roccanera (option A): our enterable ground floor, upper floors and roof from the kit (cut at the first floor).
  // [kit house, cut height, quarter turn, height stretch, extra turn of the whole top]
  const KIT_TOPS = [["house_03", 1.75, true, 1.25, 0], ["house_04", 1.7, false, 1.25, 0], ["house_05", 2.5, false, 1.1, 0],
    ["house_02", 1.85, true, 1.2, 0], ["house_03", 1.75, true, 1.25, Math.PI], ["house_07", 0.6, false, 1.1, 0],
    // Valdoro: taller town houses (more stretch: three storeys over the stone ground floor)
    ["house_02", 1.85, true, 1.35, Math.PI], ["house_03", 1.75, true, 1.4, 0], ["house_04", 1.7, false, 1.45, 0], ["house_02", 1.85, true, 1.35, 0]];
  const kitWall = hasKit() && kitMaterial("Wall_Tile_03_Mat"), kitBeam = hasKit() && kitMaterial("Brown_02_Mat");
  const kitHouse = kitWall && kitBeam ? { wall: kitWall, beam: kitBeam } : null, houseTops = [];
  // Valdoro's ground floors are of dressed stone, like the castle (the kit's other wall texture)
  const kitStone = kitHouse && kitMaterial("Wall_Tile_01_Mat"), kitTown = kitStone ? { ...kitHouse, wall: kitStone } : kitHouse;
  const houses = HOUSES.map(([x, z, r], i) => {
    const stone = i >= 6, top = kitHouse && KIT_TOPS[i];
    const id = top && kitHouseTop(top[0], { cut: top[1], turn: top[2], sy: top[3], w: 4.7, d: 4.1 });
    if (id) houseTops.push({ id, x, z, y: HOUSE_H + 0.1, ry: r + top[4] });
    const g = put(makeHouse(stone ? "#9a948a" : i % 2 ? "#b89a6a" : "#a8886a", stone ? "#5a3a3a" : i % 3 ? "#7a4a22" : "#5a3a22", stone, id ? (stone ? kitTown : kitHouse) : null), x, z, r);
    HOUSE_RECTS.forEach(([lx, lz, hw, hd]) => { const [cx, cz] = toWorld(x, z, r, lx, lz); rects.push({ cx, cz, hw, hd, ry: r }); });
    const [dx, dz] = toWorld(x, z, r, 0, 1.9), [chx, chz] = toWorld(x, z, r, CHEST_LOCAL[0], CHEST_LOCAL[1]);
    const [bx, bz] = toWorld(x, z, r, -1.3, -0.9), [ex, ez] = toWorld(x, z, r, -1.3, 0.55), [vx, vz] = toWorld(x, z, r, 0, 3.2), [ix, iz] = toWorld(x, z, r, 0, 0.9);
    const [mx, mz] = toWorld(x, z, r, 0, -1.0), [mex, mez] = toWorld(x, z, r, 0, 0.3);
    const beds = [{ bed: [bx, bz], edge: [ex, ez, r + Math.PI], y: 0.62 }, { bed: [mx, mz], edge: [mex, mez, r + Math.PI], y: 0.2 }];
    return { i, x, z, r, g, door: g.userData.door, dx, dz, chx, chz, beds, via: [[vx, vz], [ix, iz]], open: 0 };
  });
  if (houseTops.length) addNatureL(houseTops);
  // Valdoro: whole kit houses (not enterable) against the town walls, facing the square, with their collisions:
  // tall narrow ones on the side walls, low ones in the corners by the gate. [kit house, x, z, turn, scale]
  const TOWN = [["house_05", 14.05, WZ - 17.1, -Math.PI / 2, 1.3], ["house_05", -14.05, WZ - 17.1, Math.PI / 2, 1.3],
    ["house_07", 12.6, WZ - 3.4, Math.PI, 1.3], ["house_07", -12.6, WZ - 3.4, Math.PI, 1.3]];
  const townKit = hasKit() ? TOWN.filter(([id]) => kitSize(id)) : [];
  if (townKit.length) {
    addNatureL(townKit.map(([id, x, z, ry, k]) => ({ id, x, z, ry, k })));
    townKit.forEach(([id, x, z, ry, k]) => { const [w, , d] = kitSize(id); rects.push({ cx: x, cz: z, hw: (w * k) / 2 - 0.1, hd: (d * k) / 2 - 0.1, ry }); });
  }
  const houseOf = (x, z) => {
    for (const h of houses) {
      const dx = x - h.x, dz = z - h.z, lx = Math.cos(h.r) * dx - Math.sin(h.r) * dz, lz = Math.sin(h.r) * dx + Math.cos(h.r) * dz;
      if (Math.abs(lx) < 2.2 && Math.abs(lz) < 1.9) return h.i;
    }
    return -1;
  };

  put(makeForge(), 14, -5, 0); obstacles.push({ x: 12.8, z: -6, r: 1 }, { x: 14.6, z: -4.6, r: 0.5 });
  const rack = put(makeSwordRack(), 15.6, -6.5, 0);
  // ---- Village props of the Medieval Props pack (props.glb), each kept where the old one was. Without the file: the
  // old ones made in code. A market stall is the pack's awning over its market table, with crates of apples.
  const PROPS = hasProps(), propItems = [];
  const prop = (id, x, z, ry = 0, k = 1, y = 0) => { propItems.push({ id, x, z, ry, k, y }); };
  const propRect = (id, x, z, ry, k = 1, m = 0.05) => { const sz = kitSize(id); if (sz) rects.push({ cx: x, cz: z, hw: (sz[0] * k) / 2 - m, hd: (sz[2] * k) / 2 - m, ry }); };
  const stall = (x, z, r, i) => {
    if (!PROPS) { put(makeStall(), x, z, r, 1.6); return; }
    prop(i % 2 ? "props_marketstall_A" : "props_marketstall_B", x, z, r);
    prop("props_marketTable", ...toWorld(x, z, r, 0, -0.15), r);
    prop(i % 3 ? "props_applecrate_A" : "props_applecrate_B", ...toWorld(x, z, r, -0.55, -0.15), r + 0.2, 1, 0.585);
    prop("props_emptycrate_A", ...toWorld(x, z, r, 0.25, -0.12), r - 0.15, 1, 0.585);
    prop(i % 2 ? "props_ironcrate" : "props_applecrate_B", ...toWorld(x, z, r, 1.3, 0.62), r + 0.5);
    obstacles.push({ x, z, r: 1.6 });
  };
  stall(-8, 8, Math.PI, 0);
  put(makeWell(), 0, 0, 0, 1.2);
  if (PROPS) { prop("props_waterbucket_01", 1.25, -0.95, 0.5); obstacles.push({ x: 1.25, z: -0.95, r: 0.3 }); prop("props_bucket", 12.6, -3.5, 0.3); obstacles.push({ x: 12.6, z: -3.5, r: 0.4 }); }   // bucket at the well, tub at the forge
  DUMMIES.forEach(([x, z]) => put(makeDummy(), x, z, 0, 0.4));
  // Roccanera's cage (world.js CAGE): its walls of bars as obstacles, the doorway's one off while the door is open
  const cage = put(makeCage(CAGE.half, CAGE.door), CAGE.x, CAGE.z);
  const cageDoorRect = { cx: CAGE.x, cz: CAGE.z - CAGE.half, hw: CAGE.door, hd: 0.06, ry: 0, off: false };
  {
    const H = CAGE.half, side = (H - CAGE.door) / 2;
    rects.push({ cx: CAGE.x, cz: CAGE.z + H, hw: H + 0.08, hd: 0.06, ry: 0 }, { cx: CAGE.x - H, cz: CAGE.z, hw: 0.06, hd: H + 0.08, ry: 0 }, { cx: CAGE.x + H, cz: CAGE.z, hw: 0.06, hd: H + 0.08, ry: 0 },
      { cx: CAGE.x - CAGE.door - side, cz: CAGE.z - H, hw: side + 0.08, hd: 0.06, ry: 0 }, { cx: CAGE.x + CAGE.door + side, cz: CAGE.z - H, hw: side + 0.08, hd: 0.06, ry: 0 }, cageDoorRect);
  }
  put(makeBench(), 8.4, 6.75, 0);
  if (PROPS) { prop("props_woodpile_01", 5.5, -12, 0.3); obstacles.push({ x: 5.5, z: -12, r: 0.9 }); prop("props_cart_02", 8.6, -10.4, 0.25); propRect("props_cart_02", 8.6, -10.4, 0.25); }
  else put(makeWoodpile(), 5.5, -12, 0, 0.7);
  put(makeField(), -10, -4.8, 0);
  put(makeSignpost(), 3.2, -27, Math.PI);
  put(makeSignpost(), 25.6, 18.3, 0.93); put(makeSignpost(), 26.4, -5.2, 1.7);   // to Valdoro, to the mine
  // lamp posts: the lamp hangs towards the square (in Valdoro: towards the fountain); its light and its glass (lit at night)
  const lampGlass = PROPS && kitPartBox("props_lamppost_01", "Props_Light"), LAMP_K = 0.85, lampMat = lampGlass && kitMaterial("Props_Light");
  const lanterns = lampGlass ? [] : LANTERNS.map(([x, z]) => put(makeLantern(), x, z, 0, 0.3));
  if (lampGlass) LANTERNS.forEach(([x, z]) => {
    const [tx, tz] = z < WZ ? [0, WZ - 16] : [0, 0], ry = Math.atan2(tx - x, tz - z), c = lampGlass.center;
    prop("props_lamppost_01", x, z, ry, LAMP_K); obstacles.push({ x, z, r: 0.3 });
    const [lx, lz] = toWorld(x, z, ry, c.x * LAMP_K, c.z * LAMP_K), a = new THREE.Object3D();
    a.position.set(lx, c.y * LAMP_K - 0.1, lz); a.userData.anchor = { color: "#ffb050", intensity: 7, distance: 13, night: true }; scene.add(a);
  });

  // Forest: wide area with a winding path, random trees, bandit hideouts behind trees
  put(flat(new THREE.BoxGeometry(66, 0.1, 76), G.forest), 0, FZ - 33);   // forest floor
  const pathBoxes = [];   // [x, z, turn, length]
  PATH.slice(1).forEach((p, i) => {
    const a = PATH[i], dx = p[0] - a[0], dz = p[1] - a[1], L = Math.hypot(dx, dz);
    pathBoxes.push([(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, Math.atan2(dx, dz), L + 3]);
    put(flat(new THREE.BoxGeometry(7, 0.12, L + 3), G.path), (a[0] + p[0]) / 2, (a[1] + p[1]) / 2, Math.atan2(dx, dz));
  });
  // The bandits' camp: a clearing beside the road, three tents round the fire (with a ring of stones), a rack of
  // spears, a palisade with a lookout tower closing it on the north and the east; the side of the road is open.
  // Pieces of the medieval kit (without the kit: the old camp). Morn's places (where he
  // watches the road, where he eats by the fire) and the things lying about stay free.
  const [CX0, CZ0] = CAMP, campKit = hasKit() ? [] : null;
  const inCamp = (x, z) => !!campKit && ((x - CX0 - 1.8) / 8.2) ** 2 + ((z - CZ0 + 1.8) / 7.6) ** 2 < 1;   // the clearing: no trees
  if (campKit) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 28), G.camp);
    ground.rotation.x = -Math.PI / 2; ground.scale.set(7.4, 6.6, 1); ground.position.set(CX0 + 1.8, 0.057, CZ0 - 1.6); ground.receiveShadow = true; scene.add(ground);
    put(makeCamp(true, PROPS), CX0, CZ0, 0, 0.75);                                       // logs, crate, sack, the fire's light
    obstacles.push({ x: CX0 + 3.3, z: CZ0 - 0.4, r: 0.45 });
    if (PROPS) {                                                                         // crates and the bandits' cart (props pack)
      prop("props_ironcrate", CX0 + 3.3, CZ0 - 0.4, 0.3); prop("props_emptycrate_A", CX0 + 3.25, CZ0 - 0.38, -0.2, 1, 0.4);
      prop("props_cart_01", CX0 + 5.0, CZ0 + 4.3, Math.PI / 2 + 0.15); propRect("props_cart_01", CX0 + 5.0, CZ0 + 4.3, Math.PI / 2 + 0.15);
    }
    const kit = (id, dx, dz, ry = 0, k = 1, y = 0) => campKit.push({ id, x: CX0 + dx, z: CZ0 + dz, ry, k, y });
    const solid = (dx, dz, ry, hw, hd) => rects.push({ cx: CX0 + dx, cz: CZ0 + dz, hw, hd, ry });
    if (PROPS) { prop("props_campfire_01", CX0, CZ0, 0.4, 0.9); kit("campfire_01", 0, 0, 0.4, 1.9); }   // stones and logs of the props pack, flames of the kit's
    else {
      kit("campfire_01", 0, 0, 0.4, 2.2);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; kit(i % 2 ? "street_rock_1" : "street_rock_5", Math.cos(a) * 0.72, Math.sin(a) * 0.72, -a, 0.32, -0.015); }
    }
    [["tent_3", 4.4, -3.4, 0.5], ["tent_1", 5.3, 1.9, -0.25], ["tent_2", -0.3, -5.9, 0.05]].forEach(([id, dx, dz, ry]) => { kit(id, dx, dz, ry); obstacles.push({ x: CX0 + dx, z: CZ0 + dz, r: 1.3 }); });
    kit("weapon_holder_01", 2.3, 3.9, Math.PI + 0.5); obstacles.push({ x: CX0 + 2.3, z: CZ0 + 3.9, r: 0.65 });
    // palisade: east side (along z), north side (along x), a slanting piece and the lookout tower at the corner
    const wall = (id, dx, dz, ry, len, k = 1) => { kit(id, dx, dz, ry, k); solid(dx, dz, ry, (len * k) / 2, 0.22); };
    wall("wood_wall_01", 8.4, -1.0, Math.PI / 2, 4.02); wall("wood_wall_02", 8.4, 2.0, Math.PI / 2, 2.03);
    kit("wood_tower", 8.2, -4.1, Math.PI / 2); solid(8.2, -4.1, Math.PI / 2, 0.75, 0.9);
    wall("wood_wall_01", 7.75, -6.5, -1.284, 4.02, 0.8);
    wall("wood_wall_01", 5.3, -8.0, 0, 4.02); wall("wood_wall_01", 1.3, -8.2, 0.05, 4.02);
    wall("wood_wall_02", -1.7, -8.35, 0.08, 2.03);
    [[8.6, 0.0], [6.0, -8.25], [2.6, -8.45], [-2.5, -8.6]].forEach(([dx, dz], i) => kit("wood_wall_support", dx, dz, i ? -Math.PI / 2 : Math.PI));   // props behind the stakes
    addNatureL(campKit);
  } else { put(box(10, 0.115, 9, "#6a5a3a"), CX0, CZ0); put(makeCamp(), CX0, CZ0, 0, 0.6); }
  const banditDefs = NPC_DEFS.filter((d) => d.role === "bandit");
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const treeOk = (x, z) => pathDist(x, z) > 4.6 && Math.hypot(x - CAMP[0], z - CAMP[1]) > 5.5 && !banditDefs.some((d) => Math.hypot(x - d.pos[0], z - d.pos[1]) < 1.3) && !PICKUPS.some((p) => Math.hypot(x - p.x, z - p.z) < 1.2);
  for (let gx = -28; gx <= 28; gx += 4.6) for (let gz = -36; gz > WZ + 3; gz -= 4.6) {
    const x = gx + (rnd() - 0.5) * 3.2, z = gz + (rnd() - 0.5) * 3.2;
    if (treeOk(x, z)) putTree(rnd() < 0.5, x, z, rnd() * 6, 0.8, inCamp(x, z));
  }
  for (let z = -33; z > WZ; z -= 3) [-1, 1].forEach((s) => putTree(z % 2 === 0, s * (31.5 + (z % 3)), z, z, 0.9));
  banditDefs.forEach((d) => { const [px, pz] = [d.routine[0].face[0], d.routine[0].face[1]]; const dx = px - d.pos[0], dz = pz - d.pos[1], L = Math.hypot(dx, dz) || 1; putTree(true, d.pos[0] + (dx / L) * 1.5, d.pos[1] + (dz / L) * 1.5, 0, 0.8); });
  // Wall of Valdoro and the square beyond
  let gate;
  const gateRect = { cx: 0, cz: WZ, hw: 3, hd: 0.6, ry: 0, off: false, gate: "valdoro" };   // (its guards may open it, nav.js)
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
    addNatureL(kit);
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
  // the town's side walls, its back wall and the keep, the ends of the front wall: closed all round
  [-1, 1].forEach((sd) => rects.push({ cx: sd * 17.7, cz: WZ - 16.5, hw: 1.2, hd: 16.6, ry: 0 }, { cx: sd * 34.2, cz: WZ, hw: 3.2, hd: 2.4, ry: 0 }));
  rects.push({ cx: 0, cz: WZ - 32.2, hw: 19, hd: 1.2, ry: 0 }, { cx: 0, cz: WZ - 41.5, hw: 14, hd: 8.2, ry: 0 });
  put(flat(new THREE.BoxGeometry(34, 0.13, 30), G.stone), 0, WZ - 16);                    // Valdoro's flagstones
  put(flat(new THREE.BoxGeometry(10, 0.14, 7), G.stone), 0, WZ + 2.5);                     // and before its gate
  put(makeFountain(), 0, WZ - 16, 0, 2.0);
  // The castle's door, in the back wall of the square (inside: castle.js): a stone frame, a double door of planks and
  // iron, a flame on each side (lit at night). Its guards are in world.js.
  {
    const zf = WZ - 32.2 + (hasKit() ? (kitSize("castle_wall_01")?.[2] ?? 1.6) / 2 : 0.5) + 0.03, g = new THREE.Group();
    const stoneMat = (hasKit() && kitMaterial("Wall_Tile_01_Mat")) || null;
    const stone = (w, h, d, x, y, z) => { const m = stoneMat ? new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat) : box(w, h, d, "#8a8478"); m.castShadow = m.receiveShadow = true; g.add(at(m, x, y, z)); };
    stone(0.55, 3.9, 0.6, -1.85, 1.95, 0.2); stone(0.55, 3.9, 0.6, 1.85, 1.95, 0.2); stone(4.3, 0.65, 0.65, 0, 4.2, 0.2); stone(3.3, 0.1, 0.9, 0, 0.05, 0.4);
    [-1, 1].forEach((sd) => {
      const leaf = new THREE.Group();
      leaf.add(at(box(1.55, 3.55, 0.12, "#4a2e18"), 0, 1.78, 0));
      for (let i = 0; i < 5; i++) leaf.add(at(box(0.025, 3.5, 0.03, "#2e1c0e"), -0.62 + i * 0.31, 1.78, 0.07));   // the planks
      [0.75, 2.75].forEach((y) => leaf.add(at(box(1.5, 0.11, 0.04, "#26262a"), 0, y, 0.08)));                    // iron bands
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12), new THREE.MeshStandardMaterial({ color: "#3a3a3e", roughness: 0.5, metalness: 0.6 }));
      leaf.add(at(ring, -sd * 0.55, 1.45, 0.11));
      g.add(at(leaf, sd * 0.79, 0, 0.12));
    });
    [-1, 1].forEach((sd) => {
      g.add(at(box(0.08, 0.5, 0.08, "#3a2618"), sd * 2.4, 2.75, 0.1));
      const f = makeFlame(0.9); f.position.set(sd * 2.4, 3.05, 0.1); g.add(f);
      const a = new THREE.Object3D(); a.position.set(sd * 2.4, 3.2, 0.5); a.userData.anchor = { color: "#ffb050", intensity: 4, distance: 9, night: true }; g.add(a);
    });
    put(g, 0, zf);
    rects.push({ cx: 0, cz: zf + 0.2, hw: 2.2, hd: 0.35, ry: 0 });
  }
  [[7.5, WZ - 19.5, Math.PI], [-8.5, WZ - 13.5, Math.PI / 2], [9.5, WZ - 9.5, -Math.PI / 2], [-7.5, WZ - 29.5, 0], [5.5, WZ - 30.5, 0]].forEach(([x, z, r], i) => stall(x, z, r, i + 1));
  if (PROPS) { prop("props_cart_01", 4.6, WZ - 26.2, Math.PI / 2 - 0.1); propRect("props_cart_01", 4.6, WZ - 26.2, Math.PI / 2 - 0.1); }
  put(makeBench(), -6, WZ - 25.2, 0.3);
  [[-14, WZ - 4], [14, WZ - 4], [-14, WZ - 28], [14, WZ - 28]].forEach(([x, z], i) => { if (!(hasKit() && i < 2)) putTree(i % 2, x, z, i, 0.9); });   // by the gate: town houses instead
  // The silver mine in the western hill (mine.js): tunnels going down from the portal, silver veins on the walls
  const mineRoot = new THREE.Group(); mineRoot.userData.world = true;
  mineRoot.rotation.y = SITES.miniera.r; { const [mx, mz] = siteToWorld(0, 0, "miniera"); mineRoot.position.set(mx, 0, mz); }
  scene.add(mineRoot);
  const mineL = buildMine(mineRoot);
  // (the same mine, asked with world coordinates)
  const inMine = (x, z) => inSite(SITES.miniera, x, z), fromMine = (x, z) => siteToWorld(x, z, "miniera");
  mineL.ores.forEach((o) => { [o.x, o.z] = fromMine(o.x, o.z); });
  const mine = {
    ores: mineL.ores, flames: mineL.flames,
    inZone: (x, z) => mineL.inZone(...inMine(x, z)), inside: (x, z, m) => mineL.inside(...inMine(x, z), m),
    floorY: (x, z) => mineL.floorY(...inMine(x, z)), roofY: (x, z) => mineL.roofY(...inMine(x, z)),
    constrain: (x, z) => fromMine(...mineL.constrain(...inMine(x, z))),
    route: (x, z, tx, tz) => { const r = mineL.route(...inMine(x, z), ...inMine(tx, tz)); return r && fromMine(...r); },
    update: (cam) => { const [x, z] = inMine(cam.x, cam.z); mineL.update({ x, y: cam.y, z }); },
    keepOut: (x, z) => { const [lx, lz] = inMine(x, z); return fromMine(Math.max(lx, CX + 17.7), lz); },   // (horses stay out)
  };
  // The castle of Valdoro, inside (castle.js): its lights and furniture are known from the start, its models come the
  // first time one goes in. The floor under any point: the castle's, the mine's (0 elsewhere).
  castleAnchors(scene); obstacles.push(...castleSolids);
  const floorY = (x, z) => (castle.inZone(x, z) ? castle.floorY(x, z) : mine.inZone(x, z) ? mine.floorY(x, z) : groundAt(x, z));
  if (import.meta.env.DEV) { window.__mine = mine; window.__castle = castle; }   // dev only (tests)
  mineRoot.add(makeMountain());                               // the mountain that covers the mine
  // Rock face on both sides of the portal and the portal's own sides: nobody walks into the slope
  [-1, 1].forEach((sd) => rects.push({ cx: CX + 15, cz: sd * 9.6, hw: 2.2, hd: 6.9, ry: 0 }, { cx: CX + 16.45, cz: sd * 1.9, hw: 0.6, hd: 0.45, ry: 0 }));
  const ores = mine.ores;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, d = 31 + (i * 7) % 9, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const a2 = Math.atan2(z, x);
    if ((z < -27 && Math.abs(x) < 9) || Math.abs(a2 - 0.72) < 0.27 || Math.abs(a2 + 0.12) < 0.25) continue;
    putTree(i % 3 === 0, x, z, i, 0.9);
  }
  [[-22, 2], [-6, -18], [24, 9], [-20, -22], [20, -24]].forEach(([x, z], i) => putTree(i % 2, x, z, i, 0.9));

  if (propItems.length) addNatureL(propItems);   // all the props in a few meshes (one material, by chunk)
  if (import.meta.env.DEV) window.__ri = renderer.info.render;   // dev only: triangles / draw calls of the last frame
  // ---- Vegetation ----
  if (hasNature()) {
    // Tree models (Shapespark kit), drawn by vegetation.js like the open country's (near models, far pictures: they
    // dissolve into each other instead of jumping). Same positions and collisions as before.
    let ns = 12345; const nr = () => { ns = (ns * 16807) % 2147483647; return (ns - 1) / 2147483646; };   // own RNG: the tree layout RNG is untouched
    const items = [];
    const inForest = (x, z) => z < -31 && z > WZ && Math.abs(x) < 30;
    treeSpots.forEach((t, i) => {
      const dead = inForest(t.x, t.z) && i % 19 === 7;                              // a few dead trees in the forest
      // species a/b/c, mostly the two big sizes (3 and 4 are younger, thinner trees). One draw, as with the old
      // trees, so everything scattered after this (undergrowth, rocks) stays where it was.
      // (only the six models the open country uses: sizes 3 and 4 became smaller trees of sizes 1 and 2)
      const r = dead ? 0 : nr(), size = Math.floor(r * 6), id = dead ? "morto" : `albero_${"abc"[Math.floor(r * 18) % 3]}${[1, 1, 2, 2, 1, 2][size]}`;
      const it = { id, x: t.x, z: t.z, ry: nr() * 6.28, k: (0.85 + nr() * 0.35) * (size >= 4 && !dead ? 0.8 : 1) };
      if (t.gone) return;                                                           // (cut down for the bandits' camp)
      if (dead) items.push(it);
      else { const [x, z, ry] = placeWorld(it.x, it.z, it.ry); oldTrees.push({ ...it, x, z, ry, y: heightOf(it.x, it.z) }); }
    });
    // Landmarks: great twisted trees with blood-red leaves
    [[8.5, -71.5, 1], [-22, -48, 2], [21, -66, 1], [-19, -91, 2], [-23.5, WZ + 15, 1], [25, -37, 2]].forEach(([x, z, v]) => {
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
    const forestPt = () => [(nr() - 0.5) * 58, -34 - nr() * (-34 - WZ - 11)];
    const offPath = (m) => (x, z) => pathDist(x, z) > m && (campKit ? !inCamp(x, z) : Math.hypot(x - CAMP[0], z - CAMP[1]) > 5) && freeOf(x, z, 0.5);
    scatter("felce", 70, forestPt, offPath(3.7));
    scatter("cespuglio", 22, forestPt, offPath(4.2));
    scatter("cespuglio_fiorito", 8, forestPt, offPath(4.2));
    scatter("erba", 110, forestPt, offPath(3.4));
    scatter("erba_alta", 60, forestPt, offPath(3.5));
    scatter("pianta_grande", 28, forestPt, offPath(3.5));
    scatter("pianta", 28, forestPt, offPath(3.3));
    scatter("trifoglio", 22, forestPt, offPath(3.4));
    scatter("roccia", 10, forestPt, offPath(5.2), 0.7, 1.3);
    scatter("fungo", 14, () => { const t = treeSpots[Math.floor(nr() * treeSpots.length)], a = nr() * 6.28; return [t.x + Math.cos(a) * 0.75, t.z + Math.sin(a) * 0.75]; }, (x, z) => inForest(x, z) && pathDist(x, z) > 3.5 && !inCamp(x, z), 0.7, 1.1);
    const pathPt = () => { const i = 1 + Math.floor(nr() * (PATH.length - 1)), t = nr(), a = PATH[i - 1], b = PATH[i]; return [a[0] + (b[0] - a[0]) * t + (nr() - 0.5) * 7, a[1] + (b[1] - a[1]) * t + (nr() - 0.5) * 3]; };
    scatter("sasso_tondo", 40, pathPt, (x, z) => pathDist(x, z) < 3.6 && pathDist(x, z) > 1.2, 0.8, 1.6);
    scatter("sasso_quadro", 40, pathPt, (x, z) => pathDist(x, z) < 3.6 && pathDist(x, z) > 1.2, 0.8, 1.6);
    // none on the flagstones before the gate (taken away afterwards: the random layout of everything else stays the same)
    for (let i = items.length - 1; i >= 0; i--) if (/^sasso_/.test(items[i].id) && Math.abs(items[i].x) < 5.4 && items[i].z < WZ + 6.4) items.splice(i, 1);
    // Village surroundings (outside the square and the dirt roads)
    const villagePt = () => { const a = nr() * 6.28, d = 12.5 + nr() * 17.5; return [Math.cos(a) * d, Math.sin(a) * d]; };
    const villageOk = (m) => (x, z) => !ROADS.some((r) => inRoad(x, z, r, 1))
      && !HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 4.3) && !(Math.abs(x + 10) < 3 && Math.abs(z + 4.8) < 2.5) && Math.hypot(x - 14, z + 5) > 4.5
      && Math.hypot(x - 12.5, z - 22.5) > 3.5 && Math.hypot(x + 8, z - 8) > 3 && mountainHeight(x - 1.5, z) < 0.1 && freeOf(x, z, m);
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
    // Without the kit: a few paving stones of the nature pack around the well, the fountain and in front of the gate
    // (with the kit: real paving, below)
    if (!hasKit()) {
      const ring = (cx, cz, rad, n) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; items.push({ id: "selciato", x: cx + Math.cos(a) * rad, z: cz + Math.sin(a) * rad, ry: -a + 1.57, k: 0.95 + nr() * 0.2 }); } };
      ring(0, 0, 2.1, 9); ring(0, WZ - 16, 3.4, 12);
      [-1.6, 0, 1.6].forEach((x) => [2.2, 3.5, -2.2].forEach((dz) => items.push({ id: "selciato", x: x + (nr() - 0.5) * 0.3, z: WZ + dz, ry: nr() < 0.5 ? 0 : 1.57, k: 1.3 })));
    }
    S_nature.tris = addNatureL(items);
    S_nature.count = items.length;
    console.info(`Vegetazione: ${S_nature.count} elementi, ${S_nature.tris} triangoli in ${natureMeshes.length} gruppi`);
  } else {
    // Fallback: the old procedural trees, baked into one mesh per material.
    const treeG = new THREE.Group();
    treeSpots.forEach((t) => { if (t.gone) return; const o = makeTree(t.pine), [x, z, ry] = placeWorld(t.x, t.z, t.ry); at(o, x, heightOf(t.x, t.z), z, ry); treeG.add(o); });
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
      merged.castShadow = true; merged.receiveShadow = true; merged.userData.world = true;
      scene.add(merged);
      geos.forEach((g) => g.dispose());
    });
  }

  // ---- Paving (selciato) with the kit's flagstones (street_rock_1..6) round the well of Roccanera (Valdoro has its
  // flagstone floor). Laid on a grid with a little play, each stone turned by quarter turns and a little more, scaled
  // to its cell, its top a few cm above the ground and a little higher or lower than the next one (no flicker where two
  // overlap).
  if (hasKit()) {
    let ps = 4242; const pr = () => { ps = (ps * 16807) % 2147483647; return (ps - 1) / 2147483646; };
    const stones = [1, 2, 3, 4, 5, 6].map((i) => { const id = `street_rock_${i}`, sz = kitSize(id); return sz && { id, size: Math.max(sz[0], sz[2]), h: sz[1] }; }).filter(Boolean);
    const paving = [], STEP = 0.8;
    const pave = (x0, x1, z0, z1, inside, top) => {
      for (let x = x0; x <= x1 + 1e-6; x += STEP) for (let z = z0; z <= z1 + 1e-6; z += STEP) {
        const px = x + (pr() - 0.5) * 0.14, pz = z + (pr() - 0.5) * 0.14, st = stones[Math.floor(pr() * stones.length)];
        const ry = Math.floor(pr() * 4) * (Math.PI / 2) + (pr() - 0.5) * 0.25, k = (STEP / st.size) * (0.96 + pr() * 0.12), y = top + 0.03 + pr() * 0.015 - st.h * k;
        if (inside(px, pz)) paving.push({ id: st.id, x: px, z: pz, ry, k, y });
      }
    };
    pave(-3.4, 3.4, -3.4, 3.4, (x, z) => { const d = Math.hypot(x, z); return d > 1.3 && d < 3.3; }, 0.01);   // round the well
    S_nature.paving = addNatureL(paving);
  }

  // ---- Ground-cover leaves (leaves.js) where the dirt, the camp and the flagstones before the gate meet the meadow
  const meadowY = (x, z) => (Math.abs(x) < 33 && z < FZ + 5 && z > FZ - 71 ? 0.05 : Math.hypot(x, z) < 79.5 ? 0 : -1);   // forest floor, meadow, nothing
  const bare = [
    circleShape(0, 0, 11, 0.01),                                                                // Roccanera's square
    ...ROADS.map(([x, z, w, d, ry = 0]) => rectShape(x, z, w / 2, d / 2, ry, 0.01)),
    ...pathBoxes.map(([x, z, ry, L]) => rectShape(x, z, 3.5, L / 2, ry, 0.06)),               // the forest path
    rectShape(0, WZ + 2.5, 5, 3.5, 0, 0.07),                                                    // the flagstones before the gate
    { ...rectShape(0, WZ - 16, 17, 15, 0, 0.065), len: 0 },                                     // Valdoro (its edges are under the walls)
  ];
  if (campKit) bare.push(ellipseShape(CX0 + 1.8, CZ0 - 1.6, 7.4, 6.6, 0.057));
  const solids = rects.map((r) => ({ ...r, c: Math.cos(r.ry), s: Math.sin(r.ry), R: Math.hypot(r.hw, r.hd) + 0.05 }));
  const leafSpot = (x, z) => meadowY(x, z) >= 0 && mountainHeight(x, z) < 0.02 && houseOf(x, z) < 0 && !(Math.abs(x + 10) < 3.3 && Math.abs(z + 4.8) < 2.8)   // (the field)
    && !solids.some((r) => { const dx = x - r.cx, dz = z - r.cz; return Math.abs(dx) < r.R && Math.abs(dz) < r.R && Math.abs(r.c * dx - r.s * dz) < r.hw + 0.05 && Math.abs(r.s * dx + r.c * dz) < r.hd + 0.05; })
    && !obstacles.some((o) => { const dx = x - o.x, dz = z - o.z, rr = o.r * 0.85; return Math.abs(dx) < rr && Math.abs(dz) < rr && dx * dx + dz * dz < rr * rr; });
  let ls = 777; const lr = () => { ls = (ls * 16807) % 2147483647; return (ls - 1) / 2147483646; };
  const t0 = performance.now(), leaves = addLeaves(scene, edgeSpots(bare, leafSpot, meadowY, { rnd: lr }).map((sp) => { const [x, z, ry] = placeWorld(sp.x, sp.z, sp.ry); return { ...sp, x, z, ry, y: (sp.y || 0) + heightOf(sp.x, sp.z) }; }));
  leaves.meshes.forEach((m) => { m.userData.world = true; });
  console.info(`Foglie ai bordi: ${leaves.count} ciuffi, ${Math.round(leaves.tris)} triangoli in ${leaves.chunks} blocchi (${Math.round(performance.now() - t0)} ms)`);
  if (import.meta.env.DEV) window.__leaves = { leaves, add: (spots) => addLeaves(scene, spots), bareAt: (x, z) => bare.some((b) => b.inside(x, z)), meadowY, leafSpot };   // dev only (tests)

  // Carriage (the coachman is an NPC that sits on it)
  const car = { i: 1, x: ROUTE[0].at[0], z: ROUTE[0].at[1], yaw: -0.6, wait: ROUTE[0].stop, msgT: 0, group: new THREE.Group(), stopped: false };
  car.group.add(makeCarriage());
  [-0.5, 0.5].forEach((dx) => car.group.add(at(makeHorse("#3a2a1a"), dx, 0, 3.6)));
  scene.add(car.group);
  const carObs = [{ x: car.x, z: car.z, r: 1.6 }, { x: car.x, z: car.z, r: 1.1 }];
  obstacles.push(...carObs);
  const carObj = OBJS.find((o) => o.id === "carriage");
  const horses = [[4.5, 13.5], [-8, -12]].map(([x, z], i) => ({ id: `horse${i}`, x, z, yaw: 0, mesh: put(makeHorse(i ? "#e8e0d0" : "#6a4426"), x, z) }));

  // ---- The places move to where the map of Vasilad draws them (sites.js): everything built above in the old map's
  // coordinates (models, walls and obstacles, the houses' doors, chests and beds) goes with its place, turned with it.
  // Roccanera (and the castle's rooms) stay where they are.
  {
    const qY = new THREE.Quaternion(), UPY = new THREE.Vector3(0, 1, 0);
    scene.children.forEach((o) => {
      if (preBuild.has(o) || o.userData.world) return;
      const id = siteOf(o.position.x, o.position.z);
      if (!SITES[id]) return;
      [o.position.x, o.position.z] = siteToWorld(o.position.x, o.position.z, id); o.position.y += SITES[id].y;
      o.quaternion.premultiply(qY.setFromAxisAngle(UPY, SITES[id].r)); o.updateMatrix(); o.updateMatrixWorld(true);
    });
    const move = (o, kx, kz) => { const id = siteOf(o[kx], o[kz]); if (!SITES[id]) return 0; [o[kx], o[kz]] = siteToWorld(o[kx], o[kz], id); return SITES[id].r; };
    rects.forEach((r) => { r.ry += move(r, "cx", "cz"); });
    oldThings.push(...scene.children.filter((o) => !preBuild.has(o) && !o.userData.world));   // (drawn only near: atmosphere)
    obstacles.forEach((o) => move(o, "x", "z"));
    houses.forEach((h) => {
      const id = siteOf(h.x, h.z); if (!SITES[id]) return;
      const W = ([x, z]) => siteToWorld(x, z, id), r = SITES[id].r;
      [h.x, h.z] = W([h.x, h.z]); h.r += r; [h.dx, h.dz] = W([h.dx, h.dz]); [h.chx, h.chz] = W([h.chx, h.chz]);
      h.via = h.via.map(W); h.beds.forEach((b) => { b.bed = W(b.bed); b.edge = [...W(b.edge), b.edge[2] + r]; });
    });
  }
  // The ground of the whole world, the sea and the roads (terrain.js)
  const terrain = createTerrain(scene, renderer, { stone: hasKit() ? kitMaterial("Wall_Tile_01_Mat") : null });
  const veg = createVegetation(scene, renderer);                          // the trees of the open country
  veg.addFixed(oldTrees);                                                 // and the old map's (Roccanera, the bandits' wood)
  if (import.meta.env.DEV) window.__veg = veg;                            // dev only (tests)
  if (import.meta.env.DEV) window.__terrain = { terrain, surfaceAt, toWorld: siteToWorld, toLegacy, regionOf, camera };   // dev only (tests)
  // the messengers ride from Ser Alaric's post down the lane, along the road and the forest path to the knights at the gate
  const RIDERS = [[4, 9], [8, 14], [14, 14.2], [21, 19.2], ...terrain.roads.find((r) => r.id === "valdoro").points.filter((_, i) => i % 6 === 3).map((p) => [p.x, p.z]),
    siteToWorld(1.5, WZ + 9, "valdoro")];
  const GATE_W = siteToWorld(0, WZ, "valdoro"), CASTLE_DOOR = siteToWorld(0, WZ - 30, "valdoro");
  // the people of the old map where their place now is: where they stand, where their days take them
  const mapP = (pt) => (pt ? siteToWorld(pt[0], pt[1]) : pt);
  const DEFS = NPC_DEFS.map((d) => ({ ...d, pos: mapP(d.pos), routine: d.routine && d.routine.map((r) => ({ ...r, at: mapP(r.at), face: mapP(r.face) })) }));
  const pickW = (p) => { const [x, z, yaw] = placeWorld(p.x, p.z, p.yaw ?? p.x * 1.7); return { ...p, x, z, yaw }; };

  const sp = saved?.player || {};
  const S = {
    player: { hp: 100, gold: 30, ore: 0, inv: { pane: 1, torcia: 1 }, mounted: null, x: 0, z: 5, yaw: Math.PI, ...sp,
      eq: { hand: sp.eq?.hand || sp.sword || "corta", body: sp.eq?.body || sp.armor || null, head: sp.eq?.head || null, off: sp.eq?.off || null,
        quick: ITEMS[sp.eq?.quick]?.kind === "food" ? sp.eq.quick : null } },
    rep: { village: 0, crown: 0, ...(saved?.rep || {}) },
    known: { crown: 0, ...(saved?.known || {}) },
    flags: { ...(saved?.flags || {}) },
    drops: [...(saved?.drops || [])],
    dayT: saved?.dayT ?? 0.3,
    chests: CHESTS, npcs: {}, gateOpen: false, night: false,
  };
  const P = S.player;
  terrain.update(P, 0, true); veg.update(P, 140, true);                // (the ground and the trees round the player, at once)
  if (!SWORDS[P.eq.hand]) P.eq.hand = "corta";
  if (TWO_HANDED.has(P.eq.hand) && P.eq.off) { P.inv[P.eq.off] = (P.inv[P.eq.off] || 0) + 1; P.eq.off = null; }   // (a save from before: two hands on the sword)
  // (a save from the morning of 27/11: its pork leg is now the ham, the user's model, which tames a wolf)
  if (P.inv.coscia) { P.inv.prosciutto = (P.inv.prosciutto || 0) + P.inv.coscia; delete P.inv.coscia; }
  S.drops.forEach((d) => { if (d.item === "coscia") d.item = "prosciutto"; });
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
    vm.fistR.add(s); vm.sword = s;                                                          // through the fist: blade up and forward
    if (P.eq.off === "torcia") { const t = makeTorch(false); t.rotation.x = Math.PI / 2; vm.fistL.add(t); torchLight = torchLamp; }
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

  // What an NPC carries (and keeps on the body when it dies): the armour and weapons it wears, a few goods of its
  // trade, some random things and its purse. Stable for each NPC (seeded with its id).
  const WEAR = { plate: "piastre", paladin: "piastre", mail: "maglia", leather: "cuoio" };
  const belongings = (d) => {
    const r = rng(hashStr(d.id) + 3), inv = {}, add = (id) => { inv[id] = (inv[id] || 0) + 1; };
    (LOOT_OF[d.role] || LOOT_OF.villager).forEach(([id, c]) => { if (r() < c) add(id); });
    if (d.weapon) add(d.weapon === "long" ? "spada_lunga" : "spada_corta");
    const L = LOOKS[d.look] || {};
    if (WEAR[L.armor]) add(WEAR[L.armor]);
    if (L.head === "paladin" || (L.head === "helm" && L.greatHelm)) add("elmo_piastre"); else if (L.head === "helm" || L.head === "nasal") add("elmo_ferro"); else if (L.head === "leatherhood") add("cappuccio");
    if (L.shield) add(L.shieldKind === "round" ? "scudo_legno" : "scudo_ferro");
    if (SHOPS[d.id]) { const st = SHOPS[d.id].sells; for (let i = 0; i < 3; i++) add(st[Math.floor(r() * st.length)]); }
    if (d.boss) add("testa_morn");
    (d.carries || []).forEach(add);                                      // its own things (the jailer: the cells' key)
    return inv;
  };
  // A body shows only what is still on it: armour, helmet, shield and sword taken by the player disappear from it.
  const helmOf = (L) => (L.head === "paladin" ? "elmo_piastre" : L.head === "helm" ? (L.greatHelm ? "elmo_piastre" : "elmo_ferro") : L.head === "nasal" ? "elmo_ferro" : L.head === "leatherhood" ? "cappuccio" : null);
  const lookOf = (d, inv) => {
    const L = { ...LOOKS[d.look], ...(d.female ? { female: true } : {}), ...(d.old ? { old: true } : {}) };
    if (!inv) return L;
    if (WEAR[L.armor] && !inv[WEAR[L.armor]]) { delete L.armor; delete L.metal; }                    // what was under the armour
    const helm = helmOf(L);
    if (helm && !inv[helm]) { L.head = "hair"; delete L.greatHelm; delete L.plume; delete L.hat; }
    if (L.shield && !inv[L.shieldKind === "round" ? "scudo_legno" : "scudo_ferro"]) delete L.shield;
    return L;
  };
  // What can be seen on someone: the armour, helmet, shield and sword it wears (and Morn's head).
  const wornOf = (d) => { const L = LOOKS[d.look] || {}; return [WEAR[L.armor], helmOf(L), L.shield && (L.shieldKind === "round" ? "scudo_legno" : "scudo_ferro"), d.weapon && (d.weapon === "long" ? "spada_lunga" : "spada_corta"), d.boss && "testa_morn"].filter(Boolean); };
  const weaponOf = (d, inv) => (d.weapon && (!inv || inv[d.weapon === "long" ? "spada_lunga" : "spada_corta"]) ? d.weapon : null);
  const dressBody = (n) => {
    const d = DEFS.find((x) => x.id === n.id), dead = !n.alive;
    if (n.mesh) scene.remove(n.mesh);
    n.mesh = makeHuman(lookOf(d, dead ? n.inv : null), weaponOf(d, dead ? n.inv : null), d.id);
    if (dead && d.boss && !n.inv.testa_morn) n.mesh.userData.headGone = true;                       // the head went to Ser Alaric
    scene.add(n.mesh); n.poseP = null;
  };
  const npcs = DEFS.map((d) => {
    const sv = saved?.npcs?.[d.id] || {};
    const n = { hp: 30, dmg: 4, loot: 3, ...d, x: d.pos[0], z: d.pos[1], yaw: 0, hpMax: d.hp || 30, alive: true, looted: false, discovered: false, witnessed: false, cd: 0, state: "idle", k: 0, stagger: 0, flash: 0, kb: 0, ...sv };
    Object.assign(n, { hostile: false, spar: false, panic: 0, alert: 0, actT: null, sleepAt: null });
    n.inv = sv.inv ? { ...sv.inv } : n.looted ? {} : belongings(d);
    n.purse = sv.purse ?? (n.looted ? 0 : n.loot);
    if (!n.alive && sv.deadX == null) { n.x = d.pos[0]; n.z = d.pos[1]; } else if (!n.alive) { n.x = sv.deadX; n.z = sv.deadZ; }
    // All NPCs use the procedural low-poly humans (body.js); seed = id gives each one stable variation.
    dressBody(n);
    if (d.rider) {
      const start = RIDERS[d.rider > 0 ? 0 : RIDERS.length - 1];
      n.horse = { x: start[0] + 1.5, z: start[1], yaw: 0, mesh: put(makeHorse(d.rider > 0 ? "#2a2218" : "#8a6a4a"), start[0] + 1.5, start[1]) };
      Object.assign(n, { x: n.horse.x, z: n.horse.z, riding: n.alive, ms: n.alive ? "ride" : "dead", ri: d.rider > 0 ? 1 : RIDERS.length - 2, dir: d.rider, wait: 0, news: null, beat: 0 });
    }
    S.npcs[d.id] = n;
    return n;
  });

  const picks = [];
  // Things lying about (picks) are real objects with weight: they lie still where they rest (on the ground; a few on
  // a table: gy); let go or thrown they fall, tumble, bounce a little, tip over or roll (tumble.js: each one with the
  // shape of its model) and are left exactly as they come to rest, on whatever side: never put back upright. Held
  // (the interact button kept down) they are carried in front of you, turned as they were taken. Where and how a
  // thing of the world was left is saved (S.flags.moved: x, z and its turn), a thing you dropped keeps its place in
  // S.drops (ref: x, z, q).
  const GRAV = 9.81, UPV = new THREE.Vector3(0, 1, 0), _cw = new THREE.Vector3(), _cq = new THREE.Quaternion(), _tw = new THREE.Vector3();
  const addPick = (p, ref) => {
    const m = makeItem(p.item, ITEMS[p.item]?.color), shape = shapeOf(p.item, m);
    const pk = { ...p, mesh: m, ref, shape, q: new THREE.Quaternion().setFromAxisAngle(UPV, p.yaw ?? p.x * 1.7), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: true };
    pk.ground = (x, z) => pk.gy ?? floorY(x, z);
    const mv = !p.drop && S.flags.moved?.[p.id];
    if (mv) { pk.x = mv[0]; pk.z = mv[1]; pk.gy = undefined; if (mv.length >= 6) pk.q.set(mv[2], mv[3], mv[4], mv[5]).normalize(); }
    else if (Array.isArray(p.q) && p.q.length === 4) pk.q.set(...p.q).normalize();
    settle(pk, shape, pk.ground);                                      // (lying on its lowest points)
    m.position.set(pk.x, pk.y, pk.z); m.quaternion.copy(pk.q); scene.add(m); picks.push(pk);
    return pk;
  };
  PICKUPS.forEach((p) => { if (!S.flags.taken?.[p.id]) addPick({ qty: 1, ...pickW(p) }); });
  S.drops.forEach((d, i) => addPick({ id: `d${i}`, qty: 1, ...d, drop: true }, d));
  if (import.meta.env.DEV) window.__picks = picks;                  // dev only (tests)
  // let go (or thrown): it flies on as it was moving, turning a little (more the faster it goes)
  const throwPick = (pk, vx, vy, vz) => {
    const a = 1.2 + Math.random() * 2.2 + Math.hypot(vx, vy, vz) * 0.5;
    Object.assign(pk, { rest: false, carried: false, gy: undefined, still: 0, simT: 0 });
    pk.v.set(vx, vy, vz); pk.w.copy(_tw.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(a));
  };
  const savePick = (pk) => {                                         // where (and how) it was left
    const q = pk.q.toArray().map((a) => +a.toFixed(4));
    if (pk.ref) Object.assign(pk.ref, { x: +pk.x.toFixed(2), z: +pk.z.toFixed(2), q });
    else if (!pk.drop) S.flags.moved = { ...(S.flags.moved || {}), [pk.id]: [+pk.x.toFixed(2), +pk.z.toFixed(2), ...q] };
  };
  const keepOut = (x, z) => {                                        // a thing is never inside a wall
    [x, z] = pushOut(x, z, 0.12);
    if (castle.inZone(x, z)) return castle.constrain(x, z);
    return mine.inZone(x, z) ? mine.constrain(x, z) : [x, z];
  };
  const updatePicks = (dt) => {
    for (const pk of picks) {
      if (!pk.carried && !pk.rest) {
        const r = tumble(pk, pk.shape, dt, pk.ground, keepOut);
        if (r.hit > 1 && !(pk.sndT > 0) && vAt(pk.x, pk.z) > 0) { sfx.step(Math.min(0.6, 0.1 + r.hit * 0.08)); pk.sndT = 0.15; }
        if (r.rest) { pk.rest = true; savePick(pk); }
      }
      if (pk.sndT > 0) pk.sndT -= dt;
      pk.mesh.position.set(pk.x, pk.y, pk.z); pk.mesh.quaternion.copy(pk.q);
    }
  };
  castleCells.forEach((c) => castle.setDoor(c.id, !!S.flags.cells?.[c.id]));   // the prison cells: shut, unless opened
  cageDoorRect.off = !!S.flags.cageOpen; cage.userData.door.rotation.y = S.flags.cageOpen ? Math.PI / 2 : 0;   // Roccanera's cage
  if (S.flags.cage) watchCage();                                       // (saved while in it: its keeper keeps watch again)

  const input = { x: 0, y: 0 };
  const keys = {};
  let pitch = 0, atkT = -1, combo = 0, queued = false, blow = 1;   // blow: what the current swing is (1, 2, 3 or "thrust")
  let dodgeT = 0, dodgeCd = 0, iframe = 0, shake = 0, hudT = 0, scanT = 0, prompt = null, dialogOpen = false;
  // Parry (K / Para): a short guard; blocking right at the start is a perfect parry (the enemy staggers, your next blow
  // does double damage). Running (Shift / Corri): faster, but not while sneaking, attacking or parrying.
  // The guard (the parry): up while the button is held (guardHeld); perfect if a blow lands just after it was raised
  // (guardT), else the blow is mostly stopped; every blow stopped costs breath (stamina), more with a two-handed sword;
  // without breath the guard breaks (guardBroken: down until the button is let go). guardK: how far the arms have
  // raised the blade. pStag: the player staggered (a blow of yours perfectly parried by them, the guard broken).
  let guardHeld = false, guarding = false, guardT = 0, guardK = 0, guardBroken = false, pStag = 0, riposteT = 0, running = false, stillT = 0;
  const GUARD = { perfect: 0.2, perfectShield: 0.28, cost: 14, costPerfect: 5, heavy: 1.5, shieldCost: 0.8, through: 0.3, throughShield: 0.15 };
  // Stamina (resistenza, 0..100): running on foot uses it up in about 6 s, a dodge costs 15; it comes back after a
  // moment, walking or (faster) standing still. Out of breath at 0: no running and no dodging until it is back to 30.
  // (On horseback the horse runs: no stamina.)
  P.stamina = 100;
  let winded = false, breathT = 0;
  // Noise (rumore): how far the player's moves are heard (metres): running 11, walking 3.5, sneaking almost nothing,
  // a horse 8 / galloping 16, blows and parries 14 (ai.hear). heardT: someone heard the player (HUD).
  let noiseT = 0, heardT = 0;
  const NOISE = { run: 11, walk: 3.5, sneak: 0.8, horse: 8, gallop: 16, blow: 14 };
  const makeNoise = (x, z, r) => { if (ai.hear(x, z, r) > 0 && (r >= 8 || P.sneak)) heardT = 1.5; };
  const inCombat = () => npcs.some((n) => n.alive && n.hostile && n.fights && ai.sameZone(n) && Math.hypot(n.x - P.x, n.z - P.z) < 14) || wolves.hunting(14) || goblin.hunting(14);
  let paused = false;
  const lerp = (a, b, t) => a + (b - a) * t;
  // First-person blows (fparm.js). The sword never turns around its own length in the fist: the edge is brought onto
  // the cut by turning the arm and the forearm on themselves; the elbow bends and opens, the wrist bends. For each
  // blow, at the top of the wind-up (w) and at the end (e): where the fist is, where the blade points, which way the
  // cut goes and where the elbow points (view space: x right, y up, -z forward); ph: when the wind-up ends and when
  // the blow ends (fraction of the swing). 1: from high right down to the left; 2: backhand from high left down to the
  // right; 3: overhead, the sword raised over the shoulder and brought straight down the middle (the last blow of the
  // combo); thrust (affondo): the fist drawn back to the chest, then the arm shoots out at the target (sneaking, or
  // the counter after a perfect parry).
  // (The blade turns in the plane of the forearm and the edge: a cut across the screen sweeps in a plane that holds
  // the forearm pointing ahead, so at the end of a cut the blade points ahead and to the side, the edge to the side.)
  const FP_BLOWS = {
    1: { w: { hand: [0.38, 0.06, -0.36], blade: [0.35, 0.9, 0.1], cut: [-0.7, -0.7, -0.15], pole: [1, -0.5, 0.2] },
      e: { hand: [-0.08, -0.26, -0.48], blade: [-0.5, -0.5, -0.7], cut: [-0.5, -0.5, 0.7], pole: [0.5, -1, 0] } },
    2: { w: { hand: [0.04, 0.04, -0.4], blade: [-0.55, 0.8, -0.2], cut: [0.7, -0.7, -0.15], pole: [0.3, -1, 0.2] },
      e: { hand: [0.42, -0.26, -0.44], blade: [0.5, -0.5, -0.7], cut: [0.5, -0.5, 0.7], pole: [1, -0.4, 0] } },
    3: { w: { hand: [0.25, 0.13, -0.24], blade: [0.05, 0.7, 0.7], cut: [0, -0.3, -1], pole: [1, 0.1, -0.1] },
      e: { hand: [0.08, -0.3, -0.5], blade: [-0.02, -0.5, -0.85], cut: [0, -1, 0.15], pole: [0.6, -0.8, 0.2] }, ph: [0.3, 0.62] },
    thrust: { w: { hand: [0.3, -0.32, -0.06], blade: [0, 0, -1], cut: [0, -1, 0], pole: [0.1, -0.6, 1] },
      e: { hand: [0.22, -0.13, -0.6], blade: [0, 0.04, -1], cut: [0, -1, 0], pole: [0.6, -1, 0.2] }, ph: [0.32, 0.52] },
  };
  const smooth01 = (x) => x * x * (3 - 2 * x);
  // Stealth: slower, crouched, and NPCs see the player at shorter range (see ai.sees).
  P.sneak = false;
  if (import.meta.env.DEV) { window.__P = P; window.__S = S; }      // dev only: the player and the world state, for tests
  const setSneak = (v) => {
    if (v && P.mounted) { say("Non puoi nasconderti a cavallo."); return; }
    P.sneak = !!v;
    if (P.sneak) running = false;
  };
  let dodgeDir = [0, 0], graceT = 0, region = regionOf(P.x, P.z), lastRegion = region;
  // say: essential message, shown briefly on screen. note: minor message, only written in the menu's diary.
  const say = (t) => t && hooks.onLog(t, false);
  const note = (t) => t && hooks.onLog(t, true);
  const hasShield = () => !!(P.eq.off && ITEMS[P.eq.off].block);

  // Day/night + region atmosphere
  // (the fog of the open places is light and far: hills, mountains and the sea are seen a long way off, hazy)
  // (the places' buildings beyond FAR_THINGS are not drawn: by then the haze already veils them)
  const DAYLOOK = { forest: ["#6a8a78", "#4e6a52", 12, 75, 0.9, 0.6], village: ["#9cc4e4", "#b8d0e0", 40, 440, 1.6, 0.9], valdoro: ["#a8c4dc", "#c0d0dc", 35, 400, 1.5, 0.9], wild: ["#9cc4e4", "#bcd2e2", 45, 520, 1.6, 0.9] };
  const NIGHT = ["#070a14", "#0a0e1a", 10, 42];
  // in the great forests of the open country (the map's): darker, the fog nearer (wildF: how deep in one)
  const SELVA = ["#6f8c7e", "#566e5e", 14, 90, 0.75, 0.55];   // (the leaves above let little sunlight through)
  let wildF = 0;
  // (in the mine the world keeps the village's light: the dark is in the mountain only, see mine.js)
  const cA = new THREE.Color(), cB = new THREE.Color();
  const atmosphere = (dt) => {
    const el = -Math.cos(S.dayT * Math.PI * 2), dayK = clamp((el + 0.08) * 4, 0, 1), dusk = clamp(1 - Math.abs(el - 0.05) / 0.2, 0, 1);
    S.night = el < 0.05;
    if (region === "wild") wildF += (clamp((layersAt(P.x, P.z).forest - 0.35) / 0.4, 0, 1) - wildF) * Math.min(1, dt * 1.5);
    const d = region === "wild" ? DAYLOOK.wild.map((v, i) => (typeof v === "number" ? v + (SELVA[i] - v) * wildF : cB.set(v).lerp(cA.set(SELVA[i]), wildF).getStyle())) : DAYLOOK[region === "mine" || region === "castello" ? "village" : region];
    cA.set(NIGHT[0]).lerp(cB.set(d[0]), dayK).lerp(cB.set("#d8784a"), dusk * 0.45); const bg = cA.clone();
    cA.set(NIGHT[1]).lerp(cB.set(d[1]), dayK); const fog = cA.clone();
    let near = NIGHT[2] + (d[2] - NIGHT[2]) * dayK, far = NIGHT[3] + (d[3] - NIGHT[3]) * dayK;
    if (import.meta.env.DEV && window.__nofog) { near = 4000; far = 8000; }   // dev only: no fog (tests: the whole map from above)
    // the light comes from the sun by day, from the moon by night (sky.js: opposite to it; pale blue, weak): the
    // shadows follow them round the sky
    const L = sunDir(S.dayT, _sunV), byDay = L.y > -0.03;
    if (!byDay) L.negate();
    const si = byDay ? d[4] * clamp(el * 2.2, 0, 1) : 0.32 * clamp(-el * 2.2, 0, 1), hi = d[5] * (0.12 + 0.88 * dayK);
    sun.color.set(byDay ? "#fff0d0" : "#a9bcff");
    const k = Math.min(1, dt * 2.5);
    scene.background.lerp(cA.set(bg), k); scene.fog.color.lerp(cA.set(fog), k);
    scene.fog.near += (near - scene.fog.near) * k; scene.fog.far += (far - scene.fog.far) * k;
    sun.intensity += (si - sun.intensity) * k; hemi.intensity += (hi - hemi.intensity) * k;
    PALADIN_MAT.envMapIntensity = 0.2 + 0.85 * Math.min(1, hemi.intensity / 0.9);   // the steel's reflections follow the daylight
    const gy0 = floorY(P.x, P.z);
    sun.position.set(P.x + L.x * 40, gy0 + Math.max(4, L.y * 40), P.z + L.z * 40); sun.target.position.set(P.x, gy0, P.z);
    const lan = S.night ? 7 : 0;
    lanterns.forEach((l) => { l.userData.glow.material.emissiveIntensity = S.night ? 1 : 0.1; });
    if (lampMat) lampMat.emissiveIntensity = S.night ? 1.2 : 0.12;
    lightT -= dt;
    if (lightT <= 0) {
      lightT = 0.4;
      // Chunks hidden beyond the fog are not drawn at all; buildings and the big twisted and dead trees not beyond
      // FAR_THINGS either (the old camera's reach: the far ground and the trees' pictures go on beyond), the small plants
      // not beyond 130 m and the village props (crates, barrels, carts) not beyond 110 m (too small to see); the old
      // map's other things (houses, lanterns...) like the buildings
      const reach = Math.min(scene.fog.far + 6, FAR_THINGS), reachSmall = Math.min(reach, 130);
      natureMeshes.forEach((m) => { const c = m.geometry.boundingSphere, n = m.material.name; m.visible = Math.hypot(c.center.x - P.x, c.center.z - P.z) - c.radius < (/Props_Atlas/.test(n) ? Math.min(reach, 110) : /^Kit_|TwistedTree|DeadTree/.test(n) ? reach : reachSmall); });
      oldThings.forEach((o) => { o.visible = Math.hypot(o.position.x - P.x, o.position.z - P.z) < reach + 12; });
      leaves.update(P.x, P.z);
      // only the lights that can reach what is around the player (the camera may be a few metres behind)
      const near = anchors.filter((a) => (!a.night || lan > 0) && Math.hypot(a.x - P.x, a.z - P.z) < a.distance + 14);
      const best = near.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).slice(0, pool.length);
      pool.forEach((l, i) => { const a = best[i]; l.userData.a = a || null; if (a && l.userData.cur !== a) { l.userData.cur = a; l.position.set(a.x, a.y, a.z); l.color.set(a.color); l.distance = a.distance; l.intensity = 0; } });
      lightsWanted = best.length > 0 || !!torchLight;
      if (lightsWanted) setLightsOn(true);
    }
    pool.forEach((l) => { const a = l.userData.a; l.intensity += ((a ? a.intensity : 0) - l.intensity) * k; });
    if (torchLight) torchLight.intensity += (((S.night || region === "mine" || region === "castello") ? 3.5 : 0.5) - torchLight.intensity) * k;
    if (!lightsWanted && lightsOn && pool.every((l) => l.intensity < 0.02)) setLightsOn(false);   // faded out: off
  };
  // Fixed pool of point lights (6 instead of ~22 lights). Every point light costs on every pixel even when dark, so
  // all of them (and the torch's) are switched off together when no light is near (the day away from the forge, the
  // fires and the mine): only two light counts, both compiled at the start, so switching never stalls.
  scene.updateMatrixWorld(true);
  const anchors = [], wp = new THREE.Vector3();
  scene.traverse((o) => { const a = o.userData.anchor; if (a) { o.getWorldPosition(wp); anchors.push({ ...a, x: wp.x, y: wp.y, z: wp.z }); } });
  const pool = Array.from({ length: 6 }, () => { const l = new THREE.PointLight("#ffb050", 0, 10); scene.add(l); return l; });
  let lightT = 0, lightsOn = true, lightsWanted = true;
  const setLightsOn = (v) => { if (v !== lightsOn) { lightsOn = v; [...pool, torchLamp].forEach((l) => { l.visible = v; }); } };
  if (import.meta.env.DEV) window.__lights = () => ({ on: lightsOn, wanted: lightsWanted, programs: renderer.info.programs.length });   // dev only (tests)
  atmosphere(1);

  const makeHostile = (ids) => ids.forEach((id) => { const n = S.npcs[id]; if (n?.alive) n.hostile = true; });
  const unmountNpc = (n) => { if (n.riding) { n.riding = false; n.ms = "walk"; } };

  const hurtPlayer = (n) => {
    const facing = Math.abs(angDiff(Math.atan2(n.x - P.x, n.z - P.z), P.yaw)) < 1.4;
    if (iframe > 0) { hooks.onFloat("SCHIVATA!", "#a8e07a"); return; }
    makeNoise(P.x, P.z, NOISE.blow);                                                 // steel on steel, or a blow taken
    let scale = 1;                                                                   // how much of the blow gets through
    if (guarding && facing) {
      const shield = hasShield(), perfect = guardT <= (shield ? GUARD.perfectShield : GUARD.perfect);
      const cost = (perfect ? GUARD.costPerfect : GUARD.cost) * (TWO_HANDED.has(P.eq.hand) ? GUARD.heavy : 1) * (shield ? GUARD.shieldCost : 1);
      fx.burst(P.x + Math.sin(P.yaw) * 0.6, floorY(P.x, P.z) + 1.5, P.z + Math.cos(P.yaw) * 0.6, "#ffe08a", perfect ? 16 : 8, 4, true);
      if (!perfect && P.stamina < cost) {                                             // out of breath: the guard breaks
        guardBroken = true; guarding = false; pStag = 0.5; P.stamina = 0; winded = true; breathT = 0.8; scale = 0.75;
        sfx.clash(0.7); hooks.onFloat("GUARDIA ROTTA!", "#ff8a4a");
      } else {
        P.stamina = Math.max(0, P.stamina - cost); breathT = 0.8; sfx.clash(1);
        if (perfect) {                                                                // at the right moment: it staggers, your answer is strong
          n.stagger = 1.6; n.state = "idle"; n.cd = Math.max(n.cd, 0.6); riposteT = 1.5; shake = 0.15;
          hooks.onFloat("PARATA PERFETTA!", "#9fd0ff");
          return;
        }
        n.cd = Math.max(n.cd, 0.35); shake = 0.1; scale = shield ? GUARD.throughShield : GUARD.through;
        hooks.onFloat("PARATA", "#9fd0ff");
      }
    }
    let raw = n.spar ? Math.ceil(n.dmg * 0.6) : n.dmg + (n.role === "bandit" && S.night ? 3 : 0);
    if (scale < 1) raw *= scale; else if (facing && hasShield()) raw *= 1 - ITEMS[P.eq.off].block;
    const dmg = Math.max(scale < 1 ? 0 : 1, Math.round(raw * (1 - dmgReduction(P.eq))));
    if (!dmg) return;
    P.hp -= dmg; shake = Math.max(shake, scale < 1 ? 0.15 : 0.35);
    if (scale === 1) { sfx.hit(0.9); fx.burst(P.x + Math.sin(P.yaw) * 0.5, floorY(P.x, P.z) + 1.3, P.z + Math.cos(P.yaw) * 0.5, "#a01818", 10, 3); }
    hooks.onFloat(`-${dmg}`, "#ff5252");
    if (n.spar && P.hp <= 15) {
      P.hp = 15; n.spar = false; n.hostile = false; n.hp = n.hpMax; n.actT = null;
      say(`${n.name}: "Ancora troppo lento. Riprova quando vuoi."`);
      return;
    }
    if (P.hp <= 0) {
      // KO in the castle, or by any guard or knight of Valdoro (outside the walls too): into a cell of the castle's prison
      // (if there is a jailer); by Roccanera's guards: into the cage by their training ground (if one of them is alive)
      const jail = S.npcs.carceriere?.alive && (castle.inZone(P.x, P.z) || (n.valdoro && n.guard));
      const caged = !jail && n.guard && !n.valdoro && cageGuards().length > 0;
      P.hp = 60;
      dismount(); npcs.forEach((x) => { Object.assign(x, { hostile: false, spar: false, panic: 0, alert: 0, actT: null, state: "idle" }); }); graceT = 10;
      wolves.calm(); goblin.calm();
      if (jail) { toJail(); return; }
      if (caged) { toCage(); return; }
      P.gold = Math.floor(P.gold / 2); P.x = 0; P.z = 4;
      say("Sei stato sconfitto. Ti risvegli accanto al pozzo, derubato di metà dell'oro.");
    }
  };

  const vAt = (x, z) => (zoneOf(x, z) === zoneOf(P.x, P.z) ? Math.max(0, 1 - Math.hypot(x - P.x, z - P.z) / 28) : 0);
  const pitchOf = (n) => (LOOKS[n.look]?.female || n.female ? 560 : n.role === "noble" ? 420 : 290) * (0.9 + Math.random() * 0.2);
  const snd = { scream: (n) => sfx.scream(vAt(n.x, n.z), pitchOf(n)), swing: (n) => sfx.swing(vAt(n.x, n.z) * 0.8) };
  // ---- The characters' way round things (nav.js; the user, 27/11): whoever chases the player, an alerted guard, a
  // bandit closing in takes the shortest way round houses, walls, trees, rocks and deep water, planned again as the
  // target moves or when it makes no headway (a few plans a frame at most). Doors open for whoever has the right to
  // (the user: "for knights the doors can be opened"): Valdoro's guards go through its shut gate (their way does: the
  // gate is raised for them, gateCall) and, hunting someone, through the castle's door and its prison cells (the jailer's
  // keys: frame()); Roccanera's through the door of their cage. In the mine and the castle: their own ways (route).
  const nav = createNav({
    circles: () => obstacles, boxes: () => rects, trunks: (x0, z0, x1, z1) => veg.trunksIn(x0, z0, x1, z1), wet: deepWater,
    wetNear: (x0, z0, x1, z1) => coastAt((x0 + x1) / 2, (z0 + z1) / 2) < Math.hypot(x1 - x0, z1 - z0) / 2 + 8,
  });
  let navBudget = 0, gateCall = 0;
  const opens = (n, door) => (door === "gabbia" ? CAGE_GUARDS.includes(n.id) : n.valdoro && n.guard);   // (valdoro, celle)
  const inCage = (x, z) => Math.abs(x - CAGE.x) < CAGE.half && Math.abs(z - CAGE.z) < CAGE.half;
  const way = (n, gx, gz) => {
    if (castle.inZone(n.x, n.z) || mine.inZone(n.x, n.z) || castle.inZone(gx, gz) || mine.inZone(gx, gz)) return null;
    if (inCage(n.x, n.z) || inCage(gx, gz)) return null;                  // (in or out of the cage: by its door, chase())
    const w = n.nav || (n.nav = { pts: null, i: 0, at: -9, gx: 0, gz: 0, px: n.x, pz: n.z, pt: time, gates: [] });
    if (time - w.pt > 1) { if (Math.hypot(n.x - w.px, n.z - w.pz) < 0.4) w.at = -9; w.px = n.x; w.pz = n.z; w.pt = time; }   // (no headway: again)
    if ((!w.pts || time - w.at > 0.8 || Math.hypot(gx - w.gx, gz - w.gz) > 2.5) && navBudget > 0) {
      navBudget -= 1;
      const r = nav.path(n.x, n.z, gx, gz, { opens: (g) => opens(n, g) });
      w.pts = r ? r.pts : null; w.gates = r ? r.gates : []; w.i = 0; w.at = time; w.gx = gx; w.gz = gz;
    }
    if (!w.pts) return null;                                                // (no need, or no way: straight on)
    while (w.i < w.pts.length - 1 && Math.hypot(w.pts[w.i][0] - n.x, w.pts[w.i][1] - n.z) < 0.6) w.i += 1;
    if (w.gates.includes("valdoro") && Math.hypot(n.x - GATE_W[0], n.z - GATE_W[1]) < 14) gateCall = 3;   // (the gate on its way: raise it)
    return w.i < w.pts.length - 1 ? w.pts[w.i] : null;                     // (the last leg: straight at the target, which moves)
  };
  // Where a chaser makes for: the player, or (the player on the other side of the castle's door: inside its rooms or out
  // in the square) that door on its own side; d: how far the player is that way. At the door it goes through (frame()).
  // So with Roccanera's cage: in or out by its door (before it, it is opened if shut and the chaser may: frame()).
  const DOOR_OUT = placeWorld(0, WZ - 26.8, 0).slice(0, 2);
  const CAGE_OUT = [CAGE.x, CAGE.z - CAGE.half - 0.8], CAGE_IN = [CAGE.x, CAGE.z - CAGE.half + 0.55];
  const inCageDoor = (x, z) => Math.abs(x - CAGE.x) < 0.42 && z > CAGE_OUT[1] - 0.25 && z < CAGE_IN[1] + 0.25;   // (the strip through its door)
  const chase = (n) => {
    const f = n.foe;                                                      // (for a while: the player's wolf, which bit it)
    if (f && n.foeT > 0 && f.alive && !(f.down > 0) && f.tame && zoneOf(f.x, f.z) === zoneOf(n.x, n.z) && Math.hypot(f.x - n.x, f.z - n.z) < 15) return { x: f.x, z: f.z, d: Math.hypot(f.x - n.x, f.z - n.z), here: true, foe: f };
    const inC = castle.inZone(n.x, n.z), pC = castle.inZone(P.x, P.z);
    if (inC === pC) {
      const nG = inCage(n.x, n.z), pG = inCage(P.x, P.z);
      if (nG !== pG && !S.flags.cage && !inCageDoor(n.x, n.z)) {          // (locked in it: as before, at the bars)
        const [ax, az] = nG ? CAGE_IN : CAGE_OUT;
        return { x: ax, z: az, d: Math.hypot(ax - n.x, az - n.z) + Math.hypot(P.x - ax, P.z - az), here: false };
      }
      return { x: P.x, z: P.z, d: Math.hypot(P.x - n.x, P.z - n.z), here: true };
    }
    const [ax, az] = inC ? [castleExit.x, castleExit.z] : DOOR_OUT, [bx, bz] = inC ? DOOR_OUT : [castleSpawn.x, castleSpawn.z];
    return { x: ax, z: az, d: Math.hypot(ax - n.x, az - n.z) + Math.hypot(P.x - bx, P.z - bz), here: false };
  };
  // A shut door between a chaser and the player, which it may open, opened once it is at it: a prison cell's (Valdoro's
  // guards: the jailer's keys) or the door of Roccanera's cage (its guards). Not the cell or the cage one has been locked
  // in: there they leave you to rot (updateDoorsAndGate).
  const inCell = (c, x, z) => x > c.x + 0.2 && x < c.x + 3.8 && Math.abs(z - c.z) < 1.7;   // (the cells: beyond the bars, x+)
  const openFor = (n, inC) => {
    if (inC && !S.flags.jail && opens(n, "celle")) for (const c of castleCells) {
      if (castle.doorOpen(c.id) || Math.hypot(n.x - c.x, n.z - c.z) > 1.3 || inCell(c, n.x, n.z) === inCell(c, P.x, P.z)) continue;
      setCell(c.id, true); say(`${n.name} apre la cella!`);
    }
    if (!inC && !S.flags.cage && !S.flags.cageOpen && opens(n, "gabbia") && inCage(n.x, n.z) !== inCage(P.x, P.z) && Math.hypot(n.x - CAGE.x, n.z - (CAGE.z - CAGE.half)) < 1.3) {
      setCage(true); say(`${n.name} apre la gabbia!`);
    }
  };
  // (the castle's ways: through the shut prison cells too for a guard hunting someone, who opens them: openFor)
  const route = (x, z, tx, tz, n) => castle.route(x, z, tx, tz, !!n?.hostile && !S.flags.jail && opens(n, "celle")) || mine.route(x, z, tx, tz);
  const ai = createAI({ P, S, npcs, say, hurtPlayer, grace: () => graceT, snd, houseOf, way, chase, route, hurtFoe: (n, f) => wolves.hit(f, Math.max(1, Math.round(n.dmg * 0.8)), n) });
  if (import.meta.env.DEV) { window.__ai = ai; window.__npcs = npcs; window.__nav = nav; }   // dev only (tests)
  // ---- The wolves (wolves.js; the user, 27/11): the pack of the great forest, and the one you may tame. A wolf's body is
  // kept out of walls and deep water, in the castle's rooms and the mine's tunnels like everyone's.
  const placeBody = (x, z, ox, oz) => {
    const inside = castle.inZone(x, z) || mine.inZone(x, z);
    if (!inside && deepWater(x, z)) return [ox, oz];                    // (the castle is off the map: no sea there)
    [x, z] = pushOut(x, z, 0.35);
    if (mine.inZone(x, z)) return mine.constrain(x, z);
    if (castle.inZone(x, z)) return castle.inZone(ox, oz) ? castle.move(ox, oz, x, z) : castle.constrain(x, z);
    return [x, z];
  };
  const wolves = createWolves({
    scene, S, P, floorY, place: placeBody, zoneOf, way, hurtPlayer, say, note, sfx, vAt,
    ground: (x, z) => !deepWater(x, z) && coastAt(x, z) > 4 && !castle.inZone(x, z),
    enemies: () => [...npcs.filter((n) => n.alive && n.hostile && n.fights && !n.spar), ...goblin.foes()],
    biteNpc: (n, dmg, w) => (n.isGoblin ? goblin.hit(dmg, w) : wolfBite(n, dmg)), float: (t, c) => hooks.onFloat(t, c), burst: (...a) => fx.burst(...a), dropAt: (item, x, z) => dropAt(item, x, z),
  });
  if (import.meta.env.DEV) window.__wolves = wolves;                   // dev only (tests)
  // ---- The goblin (goblin.js; the user, 27/11): one, by night only, by the forest under snow of the north-west
  const goblin = createGoblin({
    scene, S, P, floorY, place: placeBody, zoneOf, way, hurtPlayer, say, note, sfx, vAt,
    ground: (x, z) => !deepWater(x, z) && coastAt(x, z) > 4 && !castle.inZone(x, z),
    float: (t, c) => hooks.onFloat(t, c), burst: (...a) => fx.burst(...a), dropAt: (item, x, z, q) => dropAt(item, x, z, q),
    companion: () => wolves.tamed(), hitWolf: (w, dmg, by) => wolves.hit(w, dmg, by),
  });
  if (import.meta.env.DEV) window.__goblin = goblin;                   // dev only (tests)

  const killNpc = (n, seen) => {
    n.alive = false; n.hostile = false; n.spar = false; n.sleepAt = null; n.deadX = n.x; n.deadZ = n.z; unmountNpc(n); n.ms = "dead";
    n.deathT = 0; n.deathKind = Math.floor(Math.random() * DEATH_TIME.length);   // how this one falls (animated in frame())
    sfx.scream(vAt(n.x, n.z) * 0.8, pitchOf(n) * 0.8, 0.7, true);
    note(`${n.name} cade a terra.`);
    if (n.id === "cocchiere") { car.stopped = true; say("La carrozza resta ferma: nessuno la guida più."); }
    if (n.role === "messenger") say("Senza messaggero, le notizie non viaggeranno più su questa strada.");
    if (SHOPS[n.id]) say(`${SHOPS[n.id].title} resterà chiusa per sempre.`);
    if (n.role === "bandit") { S.rep.village += 5; return; }
    if (seen) { n.discovered = true; if (n.guard) S.rep.crown -= 10; else S.rep.village -= 25; }
    else hooks.onFloat("NESSUN TESTIMONE", "#b9a6ff");
  };

  // the player's wolf bites someone fighting the player (wolves.js): no crime in it, no one to blame
  const wolfBite = (n, dmg) => {
    n.hp -= dmg; n.flash = 0.15;
    fx.burst(n.x, floorY(n.x, n.z) + 0.9, n.z, "#b01c1c", 8, 3); sfx.hit(vAt(n.x, n.z) * 0.7);
    unmountNpc(n);
    if (n.hp <= 0) killNpc(n, false);
  };
  // something left on the ground (a wolf's pelt): like a thing you drop
  const dropAt = (item, x, z, qty = 1) => { const d = { item, qty, x: +x.toFixed(2), z: +z.toFixed(2) }; S.drops.push(d); addPick({ id: `d${Date.now()}${S.drops.length}`, ...d, drop: true }, d); };

  const hitNpc = (n, dmg) => {
    const calm = !n.hostile && n.role !== "bandit";
    n.hp -= dmg; n.flash = 0.15; n.kb = 0.15; shake = Math.max(shake, 0.12);
    sfx.hit(1);
    fx.burst(n.x, floorY(n.x, n.z) + 1.3, n.z, "#b01c1c", 12, 3.5);
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

  // The blow of the combo, or a thrust: sneaking (a stab) or right after a perfect parry (the counter).
  const nextBlow = () => (riposteT > 0 || (P.sneak && !P.mounted) ? "thrust" : combo);
  const playerAttack = () => {
    const reach = blow === "thrust" ? 3.0 : 2.6;                                   // the lunge reaches further
    const target = npcs.filter((n) => {
      if (!n.alive || !ai.sameZone(n)) return false;
      const dx = n.x - P.x, dz = n.z - P.z;
      return Math.hypot(dx, dz) < reach && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) < 0.9;
    }).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    // a wild wolf or the goblin nearer than anyone (wolves.js: never yours; goblin.js)
    const wt = [...wolves.targets(), ...goblin.targets()].filter((w) => {
      const dx = w.x - P.x, dz = w.z - P.z;
      return zoneOf(w.x, w.z) === zoneOf(P.x, P.z) && Math.hypot(dx, dz) < reach + 0.3 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) < 0.9;
    }).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (wt && (!target || Math.hypot(wt.x - P.x, wt.z - P.z) < Math.hypot(target.x - P.x, target.z - P.z))) {
      let dmg = SWORDS[P.eq.hand].dmg + Math.round(Math.random() * 6);
      if (combo === 3) dmg = Math.round(dmg * 1.5);
      if (riposteT > 0) { dmg *= 2; riposteT = 0; hooks.onFloat("CONTRATTACCO!", "#ff8a4a"); }
      if (wt.isGoblin) goblin.hit(dmg); else wolves.hit(wt, dmg);
      sfx.hit(1); shake = Math.max(shake, 0.12); makeNoise(wt.x, wt.z, NOISE.blow);
      return;
    }
    if (!target) return;
    const n = target, dx = n.x - P.x, dz = n.z - P.z;
    const facingMe = Math.abs(angDiff(Math.atan2(-dx, -dz), n.yaw)) < 1.2;
    const two = TWO_HANDED.has(P.eq.hand);                                       // a two-handed blow: it breaks guards, it staggers
    const unaware = (!n.hostile && !facingMe && !n.panic) || n.sleepAt;
    let dmg = SWORDS[P.eq.hand].dmg + Math.round(Math.random() * 6);
    if (combo === 3) dmg = Math.round(dmg * 1.5);
    // its guard up (ai.js: raised when it sees your blow coming): just raised, a perfect parry, your blow glances off,
    // you stagger and it answers at once; else most of the blow is stopped, and its guard gives way (posture) blow by
    // blow, faster to a two-handed sword: broken, it staggers
    if (n.blocking && facingMe && n.stagger <= 0) {
      fx.burst(n.x - dx * 0.3, floorY(n.x, n.z) + 1.5, n.z - dz * 0.3, "#ffe08a", 10, 3, true);
      makeNoise(n.x, n.z, NOISE.blow); queued = false;
      if (n.blockPerfect && n.blockT <= 0.4) {
        sfx.clash(1); shake = 0.25; pStag = 0.8; atkT = -1; combo = 0; riposteT = 0;
        n.blocking = false; n.cd = 0; n.riposte = true;
        hooks.onFloat("PARATA PERFETTA!", "#ff9a4a");
        return;
      }
      n.posture = (n.posture ?? 100) - (two ? 45 : 25);
      if (n.posture <= 0) { n.blocking = false; n.posture = 50; sfx.clash(0.8); hooks.onFloat("GUARDIA ROTTA!", "#ffd27a"); hitNpc(n, Math.round(dmg * 0.5)); n.stagger = Math.max(n.stagger, 1.0); }
      else { sfx.clash(0.9); shake = 0.1; hooks.onFloat("PARATO", "#c8c8d4"); hitNpc(n, Math.max(1, Math.round(dmg * 0.25))); n.kb = 0.1; }
      return;
    }
    if (riposteT > 0) { dmg *= 2; riposteT = 0; hooks.onFloat("CONTRATTACCO!", "#ff8a4a"); }
    hitNpc(n, unaware ? n.hp : dmg);
    if (two && n.alive) { n.kb = 0.3; n.stagger = Math.max(n.stagger, 0.3); }
    makeNoise(n.x, n.z, unaware ? 3 : NOISE.blow);                                  // a blow from behind is quiet
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
    // the quick-use slot (button next to Corri, key Q) only points at a kind of food or drink: it stays in the pack
    if (it.kind === "food") { P.eq.quick = id; sfx.pick(0.6); note(`Uso rapido: ${it.name}.`); return; }
    if (it.kind === "offhand" && TWO_HANDED.has(P.eq.hand)) { say(`${ITEMS[SWORD_ITEM[P.eq.hand]].name} si impugna a due mani: per ${it.name} prendi prima un'arma a una mano.`); return; }
    if (it.kind === "sword") {
      P.inv[SWORD_ITEM[P.eq.hand]] = (P.inv[SWORD_ITEM[P.eq.hand]] || 0) + 1; take(id); P.eq.hand = it.sword;
      if (it.two && P.eq.off) { say(`${it.name} si impugna a due mani: ${ITEMS[P.eq.off].name} torna nello zaino.`); P.inv[P.eq.off] = (P.inv[P.eq.off] || 0) + 1; P.eq.off = null; }
    } else if (it.kind === "armor" || it.kind === "helm" || it.kind === "offhand") { const slot = it.kind === "armor" ? "body" : it.kind === "helm" ? "head" : "off"; if (P.eq[slot]) P.inv[P.eq[slot]] = (P.inv[P.eq[slot]] || 0) + 1; take(id); P.eq[slot] = id; }
    else return;
    equip(); sfx.pick(0.8); note(`Equipaggi: ${it.name}.`);
  };
  if (import.meta.env.DEV) window.__equip = (id) => { P.inv[id] = (P.inv[id] || 0) + 1; equipItem(id); };   // dev only (tests)
  const unequip = (slot) => { if (slot === "quick") { P.eq.quick = null; return; } if (slot === "hand" || !P.eq[slot]) return; P.inv[P.eq[slot]] = (P.inv[P.eq[slot]] || 0) + 1; P.eq[slot] = null; equip(); };
  const consumeItem = (id) => {
    const it = ITEMS[id]; if (!it || !P.inv[id]) return;
    if (it.kind === "food") { if (P.hp >= 100) { note(`Sei già in piena salute: tieni ${it.name} per dopo.`); return; } take(id); P.hp = Math.min(100, P.hp + it.heal); hooks.onFloat(`+${it.heal}`, "#a8e07a"); say(`${it.name}: +${it.heal} vita.`); }
  };
  // The quick-use button: eats or drinks one of what is in the quick slot (if there is any left and some life to win).
  const quickUse = () => {
    const id = P.eq.quick, it = ITEMS[id];
    if (!it) { hooks.onFloat("USO RAPIDO VUOTO", "#c8b88a"); note("Metti cibo, acqua o una pozione nell'uso rapido: Menu, Equipaggiamento."); return; }
    if (!P.inv[id]) { hooks.onFloat(`FINITO: ${it.name}`, "#c8b88a"); return; }
    if (P.hp >= 100) { hooks.onFloat("VITA PIENA", "#a8e07a"); return; }
    consumeItem(id); sfx.pick(0.5);
  };
  const dropItem = (id) => {
    let q = 1;
    if (id === "oro") { q = Math.min(10, P.gold); if (q <= 0) return; P.gold -= q; }
    else if (id === "argento") { if (P.ore <= 0) return; P.ore -= 1; }
    else { if (!P.inv[id]) return; take(id); }
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), [x, z] = pushOut(P.x + fx * 0.55, P.z + fz * 0.55, 0.12);
    const d = { item: id, qty: q, x, z };
    S.drops.push(d);
    const pk = addPick({ id: `d${Date.now()}`, ...d, drop: true, yaw: P.yaw }, d);  // from your hand: it falls in front of you
    placeMiddle(pk, pk.shape, _cw.set(x, floorY(P.x, P.z) + 1.15, z)); throwPick(pk, fx * 1.3, 0.6, fz * 1.3);
    note(`Lasci a terra: ${ITEMS[id].name}${q > 1 ? ` (${q})` : ""}.`);
  };
  const pickUp = (pk) => {
    scene.remove(pk.mesh); picks.splice(picks.indexOf(pk), 1);
    if (pk.drop) { const i = pk.ref ? S.drops.indexOf(pk.ref) : S.drops.findIndex((d) => d.x === pk.x && d.z === pk.z && d.item === pk.item); if (i >= 0) S.drops.splice(i, 1); }
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

  // Holding the interact button on a thing lying about or on a body: carried (a thing, in front of you, where you
  // look) or dragged (a body, on the ground); let go, it falls (a thing keeps how it was moving: it can be tossed).
  // A tap does what it always did (pick up, search). The living cannot be moved.
  let holdT = -1, holdC = null, carry = null;
  const canCarry = (c) => !P.mounted && (c?.kind === "pick" || (c?.kind === "npc" && S.npcs[c.id] && !S.npcs[c.id].alive));
  const startCarry = (c) => {
    if (c.kind === "pick") {                                           // (it stays turned as it was, from where you face)
      carry = { pk: c.pk, vx: 0, vy: 0, vz: 0, rel: new THREE.Quaternion().setFromAxisAngle(UPV, -P.yaw).multiply(c.pk.q) };
      Object.assign(c.pk, { carried: true, rest: false, gy: undefined }); sfx.pick(0.4);
    }
    else { const n = S.npcs[c.id]; carry = { n }; n.dragged = true; n.lift = n.lift || 0; n.liftV = 0; sfx.step(0.5); }
    running = false;
  };
  const dropCarry = () => {
    if (!carry) return;
    if (carry.pk) { const v = Math.hypot(carry.vx, carry.vz), k = v > 5 ? 5 / v : 1; throwPick(carry.pk, carry.vx * k, Math.min(4, carry.vy), carry.vz * k); }
    else { carry.n.dragged = false; carry.n.deadX = carry.n.x; carry.n.deadZ = carry.n.z; }
    carry = null;
  };
  const updateCarry = (dt) => {
    if (holdT >= 0 && (holdT += dt) >= 0.35) {                           // held long enough: it is taken
      const c = holdC; holdT = -1; holdC = null;
      if (c && canCarry(c) && !carry && Math.hypot(c.x - P.x, c.z - P.z) < 3) startCarry(c);
    }
    if (carry?.pk) {
      const pk = carry.pk, fy = Math.sin(pitch), cp = Math.cos(pitch), g0 = floorY(P.x, P.z);
      let tx, ty, tz;
      if (view === "first") { tx = P.x + Math.sin(P.yaw) * cp * 0.85; tz = P.z + Math.cos(P.yaw) * cp * 0.85; ty = g0 + 1.38 + fy * 0.85; }
      else { tx = P.x + Math.sin(P.yaw) * 0.7; tz = P.z + Math.cos(P.yaw) * 0.7; ty = g0 + 1.1; }
      [tx, tz] = pushOut(tx, tz, 0.12);
      ty = Math.max(ty, floorY(tx, tz) + 0.15);
      const k = 1 - Math.exp(-dt * 18);
      pk.q.slerp(_cq.setFromAxisAngle(UPV, P.yaw).multiply(carry.rel), k);   // it turns with you
      const c = middle(pk, pk.shape, _cw), ox = c.x, oy = c.y, oz = c.z;      // its middle where you hold it
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z += (tz - c.z) * k;
      placeMiddle(pk, pk.shape, c);
      if (dt > 0) { carry.vx = (c.x - ox) / dt; carry.vy = (c.y - oy) / dt; carry.vz = (c.z - oz) / dt; }
    } else if (carry?.n) {                                               // a body: its middle a little in front of you
      const n = carry.n, tx = P.x + Math.sin(P.yaw) * 1.15, tz = P.z + Math.cos(P.yaw) * 1.15, k = 1 - Math.exp(-dt * 10);
      const cx = n.cx ?? n.x, cz = n.cz ?? n.z;
      let dx = (tx - cx) * k, dz = (tz - cz) * k;
      const [px, pz] = pushOut(n.x + dx, n.z + dz, 0.3); dx = px - n.x; dz = pz - n.z;
      n.x += dx; n.z += dz; if (n.cx != null) { n.cx += dx; n.cz += dz; }
      n.lift += (0.12 - n.lift) * k;
    }
    npcs.forEach((n) => {                                                 // a body let go falls back to the ground
      if (n.alive || n.lift == null) return;
      if (!n.dragged && n.lift > 0) { n.liftV -= GRAV * dt; n.lift = Math.max(0, n.lift + n.liftV * dt); if (!n.lift) { n.liftV = 0; sfx.step(0.5); } }
      if (n.mesh && (n.dragged || n.lift >= 0)) n.mesh.position.set(n.x, floorY(n.x, n.z) + n.lift, n.z);
      if (!n.dragged && !n.lift) n.lift = null;
    });
  };
  const candidates = () => {
    const list = [];
    const near = (x, z, r = 2.6) => Math.hypot(x - P.x, z - P.z) < r;
    const zoneOk = (x, z) => zoneOf(x, z) === zoneOf(P.x, P.z);
    npcs.forEach((n) => {
      const x = n.alive ? n.x : n.cx ?? n.x, z = n.alive ? n.z : n.cz ?? n.z;            // a body: where it lies, not where its feet are
      if (!(zoneOk(x, z) && near(x, z, 2.8) && !n.hostile && !n.panic && !(n.alive === false && n.looted) && !(n.role === "bandit" && n.alive && enc.state === "approach"))) return;
      if (n.alive && P.sneak) { if (!n.riding && near(x, z, 1.9)) list.push({ kind: "steal", id: n.id, x, z, label: `Ruba a ${n.name}` }); return; }   // sneaking: pickpocket instead of talking
      list.push({ kind: "npc", id: n.id, x, z, label: n.alive ? `Parla con ${n.name}` : `Fruga ${n.name} (tieni: trascina)` });
    });
    OBJS.forEach((o) => { if (near(o.x, o.z, 3)) list.push({ kind: "obj", id: o.id, x: o.x, z: o.z, label: o.label }); });
    houses.forEach((h) => { if (near(h.chx, h.chz, 1.8) && houseOf(P.x, P.z) === h.i) list.push({ kind: "obj", id: `chest${h.i}`, x: h.chx, z: h.chz, label: S.flags.chests?.[h.i] ? "Baule vuoto" : "Apri il baule" }); });
    picks.forEach((pk) => { if (!pk.carried && near(pk.x, pk.z, 2.2)) list.push({ kind: "pick", pk, x: pk.x, z: pk.z, label: `Raccogli ${ITEMS[pk.item]?.name || pk.item}${pk.qty > 1 ? ` (${pk.qty})` : ""} (tieni: sposta)` }); });
    if (!P.mounted) horses.forEach((h) => { if (near(h.x, h.z, 2.8)) list.push({ kind: "horse", id: h.id, x: h.x, z: h.z, w: 1.2, label: "Monta a cavallo" }); });
    { const wc = wolves.candidate(near); if (wc) list.push(wc); }        // the wolf that gave in, or yours
    ores.forEach((o, i) => { if (o.depletedUntil < time && near(o.x, o.z, 2.6)) list.push({ kind: "ore", id: i, x: o.x, z: o.z, label: "Estrai argento" }); });
    if (near(CAGE.x, CAGE.z - CAGE.half, 1.8)) {                         // Roccanera's cage: with its key it opens and shuts
      const x = CAGE.x, z = CAGE.z - CAGE.half;
      if (P.inv.chiave_gabbia) list.push({ kind: "cage", id: "gabbia", x, z, label: S.flags.cageOpen ? "Chiudi la gabbia" : "Apri la gabbia" });
      else if (!S.flags.cageOpen) list.push({ kind: "cage", id: "gabbia", x, z, w: 2, label: "Gabbia chiusa a chiave" });
    }
    if (castle.inZone(P.x, P.z)) castleCells.forEach((c) => {           // a cell's door: with the key it opens and shuts
      if (!near(c.x, c.z, 1.8)) return;
      const open = castle.doorOpen(c.id);
      if (P.inv.chiave_celle) list.push({ kind: "cell", id: c.id, x: c.x, z: c.z, label: open ? "Chiudi la cella" : "Apri la cella" });
      else if (!open) list.push({ kind: "cell", id: c.id, x: c.x, z: c.z, w: 2, label: "Cella chiusa a chiave" });   // (the jailer first, if he is near)
    });
    if (P.mounted) list.push({ kind: "dismount", id: "d", x: P.x, z: P.z, label: "Smonta da cavallo" });
    const score = (c) => Math.hypot(c.x - P.x, c.z - P.z) + (c.w || 0) + (c.kind === "dismount" ? 0 : Math.abs(angDiff(Math.atan2(c.x - P.x, c.z - P.z), P.yaw)) > 1.1 ? 3 : 0);
    return list.sort((a, b) => score(a) - score(b))[0] || null;
  };

  const api = (targetId) => ({
    targetId, hostile: makeHostile, equip: equipItem, give, take, wolfOrder: (stay) => wolves.order(stay),
    equipIfBetter: (id) => { if (ITEMS[id].dmg > SWORDS[P.eq.hand].dmg) equipItem(id); else note(`${ITEMS[id].name} finisce nello zaino: la tua arma è migliore.`); },
    heal: (v) => { P.hp = Math.min(100, P.hp + v); },
    free: () => { const j = S.flags.jail; if (j) { setCell(j.cell, true); S.flags.jail = null; } },   // the ransom is paid
    freeCage: () => { if (S.flags.cage) { setCage(true); freeFromCage(); } },
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

  // Conversation close-up: the camera moves in front of the NPC (who turns to the player and talks), framing the
  // face and shoulders on the left of the screen; the choices are on the right (InteractionDialog).
  let talk = null;
  const camFrom = new THREE.Vector3(), camLook = new THREE.Vector3(), _v = new THREE.Vector3(), _cv = new THREE.Vector3();
  // First-person parry: the arm turns around the view axis so the blade lies across the screen, a little higher.
  const FP_PARRY = { turn: 1.3, dx: -0.1, dy: 0.12, dz: 0 };
  const _pq = new THREE.Quaternion(), _fwd = new THREE.Vector3(0, 0, 1);
  // The arm's angles at the keys of a blow, solved the first time the blow is used (the arm's measures do not change
  // with the equipment: the solved keys are kept for every view model).
  const fpRig = () => vm.rig || (vm.rig = armRig(vm.bonesR, vm.fistR));
  const fpKeys = (c) => {
    if (!FP_BLOWS[c]) c = 1;
    if (!solvedBlows.rest) solvedBlows.rest = restPose(VM_REST.R.rx);
    if (!solvedBlows[c]) { const K = FP_BLOWS[c], rig = fpRig(); solvedBlows[c] = { w: solveKey(rig, VM_REST.R.pos, K.w), e: solveKey(rig, VM_REST.R.pos, K.e), ph: K.ph || [0.25, 0.65] }; }
    return solvedBlows[c];
  };
  // Two-handed swords: both fists on the grip, the sword in front of the chest. The right arm's keys (the guard, the
  // parry, the blows: wider and heavier, both hands together) are solved like the others; the left arm's are solved
  // from them (its fist LEFT_BELOW lower on the grip, holding along the blade) and, every frame, the left arm is put
  // exactly on the grip where the right arm has it (fparm.js reach).
  const FP_HOLD2 = {
    rest: { hand: [0.07, -0.12, -0.38], blade: [0.15, 0.85, -0.5], cut: [0, -0.5, -0.85], pole: [0.6, -1, 0.2] },
    block: { hand: [0.02, 0.0, -0.36], blade: [0.95, 0.3, -0.05], cut: [0, 1, 0], pole: [0.8, -0.8, 0.2] },   // the blade across (the point to the right), edge up
  };
  const FP_BLOWS2 = {
    1: { w: { hand: [0.3, 0.14, -0.34], blade: [0.25, 0.75, 0.6], cut: [-0.7, -0.6, -0.3], pole: [1, -0.2, 0.2] },   // over the right shoulder
      e: { hand: [-0.14, -0.3, -0.42], blade: [-0.55, -0.45, -0.7], cut: [-0.5, -0.5, 0.7], pole: [0.4, -1, 0] }, ph: [0.34, 0.66] },
    2: { w: { hand: [-0.1, 0.1, -0.34], blade: [-0.45, 0.75, 0.45], cut: [0.7, -0.6, -0.3], pole: [0.2, -1, 0.4] },   // over the left shoulder
      e: { hand: [0.26, -0.3, -0.42], blade: [0.55, -0.45, -0.7], cut: [0.5, -0.5, 0.7], pole: [1, -0.6, 0] }, ph: [0.34, 0.66] },
    3: { w: { hand: [0.16, 0.36, -0.08], blade: [0.0, 0.2, 0.98], cut: [0, 1, -0.2], pole: [1, 0.2, -0.1] },          // raised over the head
      e: { hand: [0.02, -0.32, -0.48], blade: [0, -0.5, -0.85], cut: [0, -1, 0.15], pole: [0.6, -0.8, 0.2] }, ph: [0.36, 0.66] },
    thrust: { w: { hand: [0.12, -0.3, -0.14], blade: [0, 0.02, -1], cut: [0, -1, 0], pole: [0.3, -0.6, 1] },
      e: { hand: [0.04, -0.16, -0.58], blade: [0, 0.04, -1], cut: [0, -1, 0], pole: [0.6, -1, 0.2] }, ph: [0.34, 0.54] },
  };
  const fpRigL = () => vm.rigL || (vm.rigL = armRig(vm.bonesL, vm.fistL));
  const fp2 = () => {
    if (solved2.rest) return solved2;
    const rigR = fpRig(), rigL = fpRigL(), R = VM_REST.R, L = VM_REST.L;
    const left = (pose, high) => {                                   // the left fist on the grip, under the right one
      const f = fistFrame(rigR, R.pos, pose);
      const key = (sign) => ({ hand: f.pos.clone().addScaledVector(f.blade, -LEFT_BELOW).toArray(), blade: f.blade.toArray(), cut: f.edge.clone().multiplyScalar(sign).toArray(), pole: high ? [-1, 0.2, -0.1] : [-0.8, -0.8, 0.2] });
      if (solved2.sign === undefined) { const a = solveKey(rigL, L.pos, key(1)), b = solveKey(rigL, L.pos, key(-1)); solved2.sign = a.score >= b.score ? 1 : -1; return solved2.sign > 0 ? a : b; }
      return solveKey(rigL, L.pos, key(solved2.sign));
    };
    const both = (K, high = false) => { const r = solveKey(rigR, R.pos, K); return [r, left(r, high)]; };
    const t0 = performance.now();
    [solved2.restR, solved2.restL] = both(FP_HOLD2.rest);
    [solved2.blockR, solved2.blockL] = both(FP_HOLD2.block);
    for (const c of Object.keys(FP_BLOWS2)) { const K = FP_BLOWS2[c], [w, wl] = both(K.w, K.w.hand[1] > 0), [e, el] = both(K.e); solved2[c] = { w, wl, e, el, ph: K.ph }; }
    solved2.rest = true;
    if (import.meta.env.DEV) console.info(`spadone: colpi a due mani risolti in ${Math.round(performance.now() - t0)} ms`);
    return solved2;
  };
  const _r2 = restPose(0), _l2 = restPose(0);
  const fpTwoHands = (k, g, bobR, bobL) => {
    const S2 = fp2(), R = VM_REST.R, L = VM_REST.L;
    if (atkT >= 0) {                                                 // rest -> wind-up -> end of the blow -> rest, both arms
      const c = S2[blow] || S2[1], [p1, p2] = c.ph, p = Math.min(1, k);
      const [a, b, al, bl, t] = p < p1 ? [S2.restR, c.w, S2.restL, c.wl, smooth01(p / p1)] : p < p2 ? [c.w, c.e, c.wl, c.el, smooth01((p - p1) / (p2 - p1))] : [c.e, S2.restR, c.el, S2.restL, smooth01((p - p2) / (1 - p2))];
      mixPose(a, b, t, _r2); mixPose(al, bl, t, _l2);
    } else { mixPose(S2.restR, S2.blockR, g, _r2); mixPose(S2.restL, S2.blockL, g, _l2); }   // guard, or the parry
    vm.armR.position.set(R.pos[0], R.pos[1] + bobR, R.pos[2]);
    applyPose(fpRig(), vm.armR, vm.bonesR, _r2);
    // the left shoulder comes along when the grip is out of its reach (the trunk turns into the wind-up)
    const f = fistFrame(fpRig(), vm.armR.position.toArray(), _r2), G = f.pos.addScaledVector(f.blade, -LEFT_BELOW);
    vm.armL.position.set(L.pos[0], L.pos[1] + bobL, L.pos[2]);
    const T = G.clone().sub(vm.armL.position), far = T.length() - 0.97 * (vm.reachL ??= armReach(fpRigL()));
    if (far > 0) { vm.armL.position.addScaledVector(T.normalize(), Math.min(far, 0.35)); T.copy(G).sub(vm.armL.position); }
    reach(fpRigL(), _l2, T);
    applyPose(fpRigL(), vm.armL, vm.bonesL, _l2);
    if (import.meta.env.DEV) { const got = fistFrame(fpRigL(), [0, 0, 0], _l2).pos; window.__fp.leftErr = Math.max(window.__fp.leftErr || 0, got.distanceTo(T)); }   // dev: the left fist off the grip
  };
  // The arm's pose at swing phase p of blow c: rest -> wind-up -> end of the blow -> rest, joint by joint.
  const _fpPose = restPose(0);
  const fpArm = (p, c) => {
    const k = fpKeys(c), rest = solvedBlows.rest, [p1, p2] = k.ph;
    const [a, b, t] = p < p1 ? [rest, k.w, smooth01(p / p1)] : p < p2 ? [k.w, k.e, smooth01((p - p1) / (p2 - p1))] : [k.e, rest, smooth01((p - p2) / (1 - p2))];
    return mixPose(a, b, t, _fpPose);
  };
  if (import.meta.env.DEV) window.__fp = { get vm() { return vm; }, camera, solvedBlows, FP_BLOWS, fpKeys, fpRig, solveKey, FP_BLOWS2, FP_HOLD2, solved2, fp2 };   // dev only: the first-person arm (tests)
  // The blows are solved one at a time shortly after the start (a few ms each), not at the first swing of each.
  { const todo = Object.keys(FP_BLOWS); const next = () => { if (!todo.length) return; fpKeys(todo.shift()); setTimeout(next, 150); }; setTimeout(next, 2000); }
  function startTalk(id) {
    const n = S.npcs[id];
    if (!n || !n.alive || !n.mesh) { talk = null; return; }
    const want = Math.atan2(P.x - n.x, P.z - n.z);
    camera.getWorldDirection(_v); camLook.copy(camera.position).addScaledVector(_v, 2);
    camFrom.copy(camera.position);
    talk = { n, yaw0: n.yaw, want, t: 0, fov: camera.fov };
    vm.g.visible = false; if (playerMesh) playerMesh.visible = false;
  }
  function endTalk() {
    if (!talk) return;
    camera.fov = talk.fov; camera.updateProjectionMatrix();
    talk = null; setView(view);
  }
  function updateTalk(dt) {
    const T = talk, n = T.n;
    T.t += dt;
    const k = 1 - Math.exp(-dt * 5);
    const still = n.riding || n.ms === "seat" || n.sleepAt;
    if (!still) {                                                        // turn to the player, gesture while talking
      n.yaw += angDiff(T.want, n.yaw) * k;
      at(n.mesh, n.x, floorY(n.x, n.z), n.z, n.yaw); n.mesh.rotation.x = 0;
      n.mesh.userData.atk = null; poseHuman(n.mesh, T.t, false, "talk");
      showTool(n.mesh, null); n.mesh.userData.prop.visible = false;
    }
    const h = n.mesh.userData.variant?.height ?? 1, piv = n.mesh.userData.geo?.pivots.head;
    const headY = n.mesh.position.y + (piv ? piv[1] : 1.75) * h, fx = Math.sin(n.yaw), fz = Math.cos(n.yaw), rx = fz, rz = -fx;   // rx/rz: screen right
    // camera a little to the right of the face, looking past it: the NPC sits on the left third of the frame
    let dist = 1.2, side = 0.34;
    const free = (d, sd) => !camBlocked(n.x + fx * d + rx * sd, n.z + fz * d + rz * sd);
    if (!free(dist, side)) { if (free(dist, -side)) side = -side; else { while (dist > 0.6 && !free(dist, side)) dist -= 0.15; } }
    const tx = n.x + fx * dist + rx * side, ty = headY + 0.06, tz = n.z + fz * dist + rz * side;
    const lx = n.x + rx * side * 0.95 + fx * 0.1, ly = headY - 0.1, lz = n.z + rz * side * 0.95 + fz * 0.1;
    if (!still) n.mesh.userData.head.rotation.y += Math.atan2(side, dist) * 0.8;   // looks at the camera
    camFrom.lerp(_v.set(tx, ty, tz), k); camLook.lerp(_v.set(lx, ly, lz), k);
    camera.position.copy(camFrom); camera.lookAt(camLook);
    const fov = 38; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
  }

  // Searching a body: both inventories side by side (LootPanel). Things move one at a time, or all together.
  let lootId = null;
  // Pickpocketing (sneaking): only what someone carries, not what it wears; every thing taken can give you away.
  const stealable = (n) => { const w = wornOf(DEFS.find((x) => x.id === n.id)); return Object.fromEntries(Object.entries(n.inv).filter(([it]) => !w.includes(it) && ITEMS[it]?.kind !== "quest")); };
  const stealRisk = (it) => Math.min(0.6, Math.max(0.04, (it === "oro" ? 0.12 : 0.06) + (it === "oro" ? 0 : (ITEMS[it]?.price || 2) * 0.004) - (S.night ? 0.03 : 0)));
  const lootInfo = (id) => {
    const n = S.npcs[id], steal = n.alive, inv = steal ? stealable(n) : { ...n.inv };
    return { id, name: n.name, inv, gold: n.purse, mine: { ...P.inv }, myGold: P.gold, ore: P.ore, steal, risk: steal ? Object.fromEntries([...Object.keys(inv), "oro"].map((it) => [it, stealRisk(it === "oro" ? "oro" : it) + (it === "oro" ? n.purse * 0.004 : 0)])) : null };
  };
  const caughtStealing = (n) => {
    n.yaw = Math.atan2(P.x - n.x, P.z - n.z); n.actT = null;
    if (n.guard || n.role === "noble") S.rep.crown -= 10; else S.rep.village -= 10;
    say(`${n.name} si accorge della tua mano nella sua borsa!`);
    ai.crime(n, true);
    if (!n.hostile && !n.panic) { if (n.fights) { n.hostile = true; say(`${n.name}: "Ladro! Ora la paghi!"`); } else ai.scream(n, P.x, P.z, "Al ladro! Al ladro!"); }
    sfx.clash(0.4); shake = 0.15;
  };
  function loot(kind, id, item) {
    const n = S.npcs[id];
    if (!n) return null;
    if (n.alive) {                                                         // stealing from someone alive
      if (kind !== "take" && kind !== "gold") return lootInfo(id);
      const r = kind === "gold" ? stealRisk("oro") + n.purse * 0.004 : stealRisk(item);
      if (Math.random() < r) { caughtStealing(n); return { caught: true }; }
      if (kind === "gold") { P.gold += n.purse; if (n.purse) hooks.onFloat(`+${n.purse} oro`, "#e8c050"); n.purse = 0; sfx.pick(0.5); }
      else if (n.inv[item] && stealable(n)[item]) { n.inv[item] -= 1; if (n.inv[item] <= 0) delete n.inv[item]; if (ITEMS[item]?.kind === "ore") P.ore += 1; else P.inv[item] = (P.inv[item] || 0) + 1; sfx.pick(0.4); }
      return lootInfo(id);
    }
    const one = (it) => { if (!n.inv[it]) return; n.inv[it] -= 1; if (n.inv[it] <= 0) delete n.inv[it]; if (ITEMS[it]?.kind === "ore") P.ore += 1; else P.inv[it] = (P.inv[it] || 0) + 1; };
    if (kind === "take") { one(item); sfx.pick(0.7); }
    else if (kind === "all") { Object.keys(n.inv).forEach((it) => { while (n.inv[it]) one(it); }); P.gold += n.purse; n.purse = 0; sfx.pick(1); }
    else if (kind === "gold") { P.gold += n.purse; n.purse = 0; sfx.pick(0.8); }
    else if (kind === "give") { if (!P.inv[item] || ITEMS[item]?.kind === "quest") return lootInfo(id); take(item); n.inv[item] = (n.inv[item] || 0) + 1; sfx.pick(0.5); }
    n.looted = !Object.keys(n.inv).length && !n.purse;
    if (kind !== "gold") {                                                 // something visible came off (or went back on)?
      if (kind === "all" || wornOf(DEFS.find((x) => x.id === id)).includes(item)) dressBody(n);
    }
    return lootInfo(id);
  }

  function interact() {
    if (dialogOpen) return;
    const c = candidates();
    if (!c) return;
    if (c.kind === "horse") { P.mounted = c.id; P.sneak = false; note("Monti a cavallo."); return; }
    if (c.kind === "lupo") {                                              // a pork leg for it, or an order (its dialog)
      if (wolves.interact(c, take)) { const d = getDialog("lupo", S); if (d) { dialogOpen = true; hooks.openDialog("lupo", d); } }
      return;
    }
    if (c.kind === "dismount") { dismount(); return; }
    if (c.kind === "pick") { pickUp(c.pk); return; }
    if (c.kind === "ore") { const o = ores[c.id]; o.depletedUntil = time + 45; P.ore += 1; fx.burst(o.x, o.y, o.z, "#d8e4f0", 10, 3, true); hooks.onFloat("+1 argento", "#d8e4f0"); return; }
    if (c.kind === "steal") {
      const n = S.npcs[c.id], looking = !n.sleepAt && Math.abs(angDiff(Math.atan2(P.x - n.x, P.z - n.z), n.yaw)) < 1.0;
      if (looking) { caughtStealing(n); return; }                          // it is looking right at you
      dialogOpen = true; lootId = c.id; hooks.openLoot?.(lootInfo(c.id)); return;
    }
    if (c.kind === "obj" && (c.id === "castello" || c.id === "castello_uscita")) { goThrough(c.id === "castello"); return; }
    if (c.kind === "cage") {
      if (!P.inv.chiave_gabbia) { note("La gabbia è chiusa a chiave: la chiave ce l'ha una delle guardie di Roccanera."); return; }
      const open = !S.flags.cageOpen;
      setCage(open);
      if (open && S.flags.cage) {                                          // out of the cage: if a guard sees you...
        freeFromCage();
        const g = cageGuards().find((x) => ai.sees(x, P.x, P.z, 12));
        if (g) { g.hostile = true; g.actT = null; say(`${g.name}: "Ehi! Chi ti ha aperto? Torna dentro!"`); }
        else note("La serratura scatta: sei fuori dalla gabbia.");
      } else note(open ? "Giri la chiave: la gabbia si apre." : "Chiudi la gabbia a chiave.");
      return;
    }
    if (c.kind === "cell") {
      if (!P.inv.chiave_celle) { note("La cella è chiusa a chiave: ci vuole la chiave delle celle. Ce l'ha il carceriere."); return; }
      const open = !castle.doorOpen(c.id);
      setCell(c.id, open);
      if (open && S.flags.jail?.cell === c.id) {                          // out of your own cell: if the jailer sees you...
        S.flags.jail = null;
        const j = S.npcs.carceriere;
        if (j?.alive && ai.sees(j, P.x, P.z, 12)) { j.hostile = true; j.actT = null; say(`${j.name}: "Ehi! Chi ti ha aperto? Torna dentro!"`); }
        else note("La serratura scatta: sei fuori dalla cella.");
      } else note(open ? "Giri la chiave: la cella si apre." : "Chiudi la cella a chiave.");
      return;
    }
    if (c.kind === "npc" && !S.npcs[c.id].alive) { dialogOpen = true; lootId = c.id; hooks.openLoot?.(lootInfo(c.id)); return; }
    const d = getDialog(c.id, S);
    if (d) { dialogOpen = true; startTalk(c.id); hooks.openDialog(c.id, d); }
  }

  function choose(id, effect) {
    if (effect !== "close" && CONTINUES.has(effect)) {
      // the talk goes on: the character's reply in the panel, the choices for what is true now (the line also in the diary)
      const reply = applyEffect(effect, S, api(id)), d = getDialog(id, S, reply);
      if (d) { note(reply); hooks.openDialog(id, d); return; }
      dialogOpen = false; endTalk(); say(reply); return;
    }
    dialogOpen = false; endTalk();
    if (effect === "close") {
      if (enc.state === "talk") { api(id).forest("fight"); say(`Capo Morn: "Niente risposta? Allora parlerà la spada!"`); }
      return;
    }
    say(applyEffect(effect, S, api(id)));
  }

  // Into the castle and out (a "room" apart: castle.js): the screen goes black with "Caricamento...", the player is
  // moved (the castle's models are downloaded and built the first time), a moment for the lights and the shaders,
  // then the screen comes back. keepSpot: a game saved inside the castle starts where it was.
  let transit = false;
  // The prison cells: their doors (saved in S.flags.cells: true = open). A KO in the castle: the guards carry you into a
  // cell and shut it (S.flags.jail); the jailer lets you out for a ransom (dialogs.js), or the key opens it: his own
  // (pickpocketed through the bars) or the one on his table. The keys you had are taken back.
  const setCell = (id, open, quiet = false) => {
    castle.setDoor(id, open); S.flags.cells = { ...(S.flags.cells || {}), [id]: open };
    if (!quiet) sfx.creak(0.9);
  };
  // Roccanera's cage (world.js CAGE): a KO by Roccanera's guards. Locked in (S.flags.cage, the door: S.flags.cageOpen),
  // the first of them alive keeps watch by it (CAGE_WATCH) and lets you out for a ransom (dialogs.js); or its key
  // (Gerd's, pickpocketed through the bars) opens it. The keys you had are taken back.
  // (functions, not constants: the game starts by calling watchCage when it was saved in the cage, long before
  // these lines; as constants that start stopped with "Cannot access ... before initialization", 27/11)
  function cageGuards() { return CAGE_GUARDS.map((id) => S.npcs[id]).filter((x) => x?.alive); }
  function setCage(open, quiet = false) { S.flags.cageOpen = open; cageDoorRect.off = open; if (!quiet) sfx.creak(0.9); }
  function watchCage() {                                               // the keeper's routine while someone is in the cage
    const k = S.npcs[S.flags.cageKeeper] || cageGuards()[0]; if (!k) return;
    S.flags.cageKeeper = k.id; Object.assign(k, { routine: CAGE_WATCH, ri: 0, actT: null, walkT: 0 });
  }
  function freeFromCage() {
    const k = S.npcs[S.flags.cageKeeper];
    if (k) Object.assign(k, { routine: DEFS.find((d) => d.id === k.id).routine, ri: 0, actT: null, walkT: 0 });
    S.flags.cage = null; S.flags.cageKeeper = null;
  }
  async function toCage() {
    transit = true; running = false;
    hooks.onLoading?.("I soldati ti hanno messo KO...");
    if (P.inv.chiave_gabbia) { take("chiave_gabbia", P.inv.chiave_gabbia); const k = S.npcs.soldier1; if (k?.alive && !k.inv.chiave_gabbia) k.inv.chiave_gabbia = 1; }
    setCage(false, true);
    S.flags.cage = true; S.flags.cageKeeper = null; watchCage();
    P.x = CAGE.x; P.z = CAGE.z + 0.2; P.yaw = Math.PI; pitch = 0; lightT = 0; region = regionOf(P.x, P.z);   // facing the door
    await new Promise((r) => setTimeout(r, 1800));
    transit = false; hooks.onLoading?.(null);
    say(`Ti risvegli chiuso nella gabbia delle guardie di Roccanera. Vogliono ${RANSOM_CAGE} monete d'oro per farti uscire: parla con la guardia attraverso le sbarre.`);
  }
  async function toJail() {
    transit = true; running = false;
    hooks.onLoading?.("Le guardie ti hanno messo KO...");
    if (!castle.inZone(P.x, P.z)) {                                      // knocked out outside: the castle is loaded first
      await new Promise((r) => setTimeout(r, 350));
      try { await buildCastle(scene); } catch (e) { console.error("castello:", e); }
    }
    if (P.inv.chiave_celle) {
      take("chiave_celle", P.inv.chiave_celle);
      const j = S.npcs.carceriere; if (j?.alive && !j.inv.chiave_celle) j.inv.chiave_celle = 1;
      if (S.flags.taken?.chiave_tavolo && !picks.some((pk) => pk.id === "chiave_tavolo")) {
        delete S.flags.taken.chiave_tavolo; addPick({ qty: 1, ...pickW(PICKUPS.find((p) => p.id === "chiave_tavolo")) });
      }
    }
    setCell(castleJail.cell, false, true);
    S.flags.jail = { cell: castleJail.cell };
    P.x = castleJail.x; P.z = castleJail.z; P.yaw = castleJail.yaw; pitch = 0; lightT = 0; region = regionOf(P.x, P.z);
    renderer.compile(scene, camera);
    await new Promise((r) => setTimeout(r, 1800));
    transit = false; hooks.onLoading?.(null);
    say(`Ti risvegli in una cella delle prigioni. Il carceriere vuole ${RANSOM} monete d'oro per farti uscire: parlagli quando passa davanti alle sbarre.`);
  }
  async function goThrough(inside, keepSpot = false) {
    if (transit) return;
    transit = true; running = false;
    if (P.mounted) dismount();
    hooks.onLoading?.("Caricamento...");
    await new Promise((r) => setTimeout(r, 350));
    if (inside) { try { await buildCastle(scene); } catch (e) { console.error("castello:", e); } }
    if (!keepSpot) {
      const [ox, oz, oy] = placeWorld(0, WZ - 26.8, 0), to = inside ? castleSpawn : { x: ox, z: oz, yaw: oy };
      P.x = to.x; P.z = to.z; P.yaw = to.yaw;
      if (!inside) { terrain.update(P, 0, true); veg.update(P, 140, true); }
    }
    pitch = 0; lightT = 0; region = regionOf(P.x, P.z);
    renderer.compile(scene, camera);
    await new Promise((r) => setTimeout(r, 500));
    transit = false;
    hooks.onLoading?.(null);
    if (!keepSpot) note(inside ? "Entri nel castello di Valdoro." : "Esci nella piazza di Valdoro.");
  }

  function action(kind) {
    sfx.unlock();
    if (kind === "parryUp") { guardHeld = false; guardBroken = false; return; }       // (let go even in a dialog or a pause)
    if (kind === "interactUp") {                                           // let go: what you carried falls; a short press: as always
      if (carry) dropCarry();
      else if (holdT >= 0) { holdT = -1; holdC = null; if (!(dialogOpen || paused || transit)) interact(); }
      return;
    }
    if (dialogOpen || paused || transit) return;
    if (kind === "interact") interact();
    if (kind === "interactDown" && !carry) {                               // a thing or a body: wait, it may be held
      const c = candidates();
      if (canCarry(c)) { holdC = c; holdT = 0; } else interact();
    }
    if (carry && (kind === "attack" || kind === "parry")) dropCarry();     // (to fight you let go)
    if (pStag > 0 && (kind === "attack" || kind === "dodge")) return;                 // staggered: nothing for a moment
    if (kind === "attack") { if (atkT < 0) { atkT = 0; combo = 1; blow = nextBlow(); sfx.swing(0.7); P.atkSeq = (P.atkSeq || 0) + 1; } else if (atkT > 0.12) queued = true; }
    if (kind === "sneak") setSneak(!P.sneak);
    if (kind === "parry") guardHeld = true;                                            // held: up as long as it can be
    if (kind === "run") {                                                // in a fight the button dodges
      if (inCombat() && !P.mounted) kind = "dodge";
      else if (winded && !P.mounted && !running) hooks.onFloat("SENZA FIATO", "#c8b88a");
      else { running = !running; if (running) setSneak(false); }
    }
    if (kind === "camera") setView(view === "first" ? "third" : "first");
    if (kind === "quick") quickUse();
    if (kind === "dodge" && dodgeCd <= 0 && !P.mounted && (winded || P.stamina < 15)) { hooks.onFloat("SENZA FIATO", "#c8b88a"); kind = null; }
    if (kind === "dodge" && dodgeCd <= 0) {
      if (!P.mounted) { P.stamina -= 15; breathT = 0.8; }
      makeNoise(P.x, P.z, 6);
      const kx = input.x + (keys.d ? 1 : 0) - (keys.a ? 1 : 0), ky = input.y + (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      const f = Math.hypot(kx, ky) > 0.2 ? [kx, ky] : [0, 1];
      const fwx = Math.sin(P.yaw), fwz = Math.cos(P.yaw), rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
      dodgeDir = [fwx * -f[1] + rx * f[0], fwz * -f[1] + rz * f[0]];
      const l = Math.hypot(...dodgeDir) || 1; dodgeDir = [dodgeDir[0] / l, dodgeDir[1] / l];
      dodgeT = 0.3; iframe = 0.4; dodgeCd = 0.8;
      fx.burst(P.x, floorY(P.x, P.z) + 0.2, P.z, "#b8a47a", 8, 2.5); sfx.swing(0.35);
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
    return veg.push(x, z, rad);                                            // (the trees of the open country)
  };
  // Is a camera point inside a wall? (houses, city walls, the mine's rock): keeps the 3rd-person camera out of walls.
  const camBlocked = (x, z) => (mine.inZone(x, z) && !mine.inside(x, z, 0.4)) || (castle.inZone(x, z) && !castle.inside(x, z, 0.25)) || veg.blocked(x, z) || rects.some((r) => {
    if (r.off) return false;
    const dx = x - r.cx, dz = z - r.cz, c = Math.cos(r.ry), s2 = Math.sin(r.ry);
    return Math.abs(c * dx - s2 * dz) < r.hw + 0.15 && Math.abs(s2 * dx + c * dz) < r.hd + 0.15;
  });
  const collide = (x, z) => {
    [x, z] = pushOut(x, z);
    if (S.flags.cage && !S.flags.cageOpen) { const m = CAGE.half - 0.46; return [clamp(x, CAGE.x - m, CAGE.x + m), clamp(z, CAGE.z - m, CAGE.z + m)]; }   // locked in the cage
    if (castle.inZone(x, z)) return castle.inZone(P.x, P.z) ? castle.move(P.x, P.z, x, z) : castle.constrain(x, z);   // in the castle's rooms (step by step)
    if (mine.inZone(x, z)) return P.mounted ? mine.keepOut(x, z) : mine.constrain(x, z);   // in the tunnels (horses stay out)
    // inside Valdoro's walls: its square (in the old map's coordinates)
    const Lp = toLegacy(P.x, P.z);
    if (Lp?.site === "valdoro" && Lp.z < WZ - 1 && Lp.z > WZ - 31 && Math.abs(Lp.x) < 16.6) {
      const [lx, lz] = inSite(SITES.valdoro, x, z);
      if (lz < WZ - 1) return siteToWorld(clamp(lx, -15.8, 15.8), Math.max(WZ - 29.8, lz), "valdoro");
    }
    // on a bridge: between its parapets
    if (onDeck(P.x, P.z)) { const k = bridgeKeep(x, z); if (k) return k; }
    // the sea, the river: wading, not swimming (yet)
    if (deepWater(x, z)) return !deepWater(x, P.z) ? [x, P.z] : !deepWater(P.x, z) ? [P.x, z] : [P.x, P.z];
    return [x, z];
  };

  const enc = { state: "idle", rescued: false };
  S.enc = enc;
  const bandits = () => npcs.filter((n) => n.role === "bandit" && n.alive);
  function resetForest() {
    enc.state = "idle"; enc.rescued = false;
    bandits().forEach((b) => Object.assign(b, { goTo: null, hostile: false, state: "idle", actT: null }));
  }
  // Bandits hidden behind the trees: either an ambush or the boss demanding a toll. Bolder at night.
  function updateEncounter() {
    if (region !== "forest" || dialogOpen) return;
    const bs = bandits(), boss = S.npcs.bandit3;
    if (!bs.length) return;
    const Lz = toLegacy(P.x, P.z)?.z ?? 0;                               // (how far along the forest path)
    if (enc.state === "fight" && !enc.rescued && Lz < FZ - 54 && bs.some((b) => b.hostile)) {
      enc.rescued = true;
      const kn = npcs.find((n) => n.alive && n.guard && Math.hypot(n.x - P.x, n.z - P.z) < 30);
      bs.forEach((b) => Object.assign(b, { hostile: false, goTo: null, state: "idle", actT: null }));
      if (kn) say(`${kn.name}: "Indietro, feccia! Qui comanda la Corona!" I banditi si ritirano nel bosco.`);
      else say("I banditi si fermano al limitare del bosco e tornano tra gli alberi.");
      return;
    }
    // the bandits notice the player close by, when they see it (sneaking: much closer) or when they hear it (running,
    // a galloping horse: from far away; a sneaking player is not heard)
    const noticed = (b) => Math.hypot(b.x - P.x, b.z - P.z) < (P.sneak ? 4 : 8) || ai.sees(b, P.x, P.z, 18) || b.heardT > 0;
    if (enc.state === "idle" && Lz < FZ - 8 && Lz > FZ - 52 && bs.some(noticed)) {
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
      if (d < 2.6) { enc.state = "talk"; dialogOpen = true; startTalk(boss.id); hooks.openDialog(boss.id, getDialog(boss.id, S)); }
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
      const t = RIDERS[n.ri], dx = t[0] - n.x, dz = t[1] - n.z, dd = Math.hypot(dx, dz);
      if (dd < 0.6) {
        const end = n.ri === 0 || n.ri === RIDERS.length - 1;
        if (end) { n.riding = false; n.ms = "visit"; n.visitT = 0; n.target = n.ri === 0 ? (S.npcs.alaric.alive ? S.npcs.alaric : S.npcs.soldier1) : (S.npcs.brann.alive ? S.npcs.brann : S.npcs.oswin); n.dir = n.ri === 0 ? 1 : -1; return out; }
        n.ri = clamp(n.ri + n.dir, 0, RIDERS.length - 1); return out;
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
      if (n.visitT > 7) { n.ms = "walk"; n.said = false; n.ri = clamp(n.ri + n.dir, 0, RIDERS.length - 1); }
      return out;
    }
    return out;
  }

  const sleepTime = () => S.dayT > 0.84 || S.dayT < 0.21;
  // Each resident of a house gets their own sleeping place (before, two NPCs shared the same bed).
  const bedSlot = {};
  { const count = {}; DEFS.forEach((d) => { if (d.home == null) return; bedSlot[d.id] = count[d.home] || 0; count[d.home] = bedSlot[d.id] + 1; }); }
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
    if (castle.inZone(P.x, P.z)) castle.updateDoors(dt);
    { const d = cage.userData.door, want = S.flags.cageOpen ? Math.PI / 2 : 0; if (Math.abs(d.rotation.y - want) > 1e-3) d.rotation.y += (want - d.rotation.y) * Math.min(1, dt * 4); }
    if (S.flags.jail || S.flags.cage) npcs.forEach((n) => {             // in a cell or in the cage: whoever is angry with you gives up after a while
      if (!n.hostile || (S.flags.jail && !castle.inZone(n.x, n.z))) { n.jailAnger = 0; return; }
      n.jailAnger = (n.jailAnger || 0) + dt;
      if (n.jailAnger > 8) { n.jailAnger = 0; Object.assign(n, { hostile: false, alert: 0, actT: null, state: "idle" }); say(`${n.name}: "Marcisci lì dentro."`); }
    });
    houses.forEach((h) => {
      const near = Math.hypot(P.x - h.dx, P.z - h.dz) < 2.2 || npcs.some((n) => n.alive && (n.sleepAt || n.exitTo || n.hostile || n.alert > 0) && Math.hypot(n.x - h.dx, n.z - h.dz) < 2.2 && !(n.sleepAt && n.bedAt && Math.hypot(n.x - n.bedAt[0], n.z - n.bedAt[1]) < 1.6));
      const target = near ? 1.9 : 0;
      if (target && h.open < 0.05) sfx.creak(vAt(h.dx, h.dz));
      h.open += (target - h.open) * Math.min(1, dt * 5);
      h.door.rotation.y = h.open;
    });
    // Valdoro's gate: open to whoever the Crown trusts (or has paid), shut while its guards hunt someone, but raised for
    // its own guards when their way goes through it (gateCall: to come out after the player, or in), then shut again
    const open = ((S.known.crown >= 30 || !!S.flags.gateBribed) && !npcs.some((n) => n.valdoro && n.guard && n.alive && n.hostile)) || gateCall > 0;
    if (open !== S.gateOpen) {
      S.gateOpen = open;
      if (Math.hypot(P.x - GATE_W[0], P.z - GATE_W[1]) < 45) { sfx.gate(0.8); say(open ? (gateCall > 0 ? "Le guardie alzano la saracinesca di Valdoro!" : "Le porte di Valdoro si aprono cigolando!") : "Le porte di Valdoro si chiudono con un tonfo."); }
    }
    gate.position.y += ((open ? 5.2 : 0) - gate.position.y) * Math.min(1, dt * 1.2);
    gateRect.off = gate.position.y > 2.6;                                  // (one passes under it once it is up enough)
  }

  function updateHud(dt) {
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      const foeN = npcs.filter((n) => n.alive && n.hostile && n.fights && ai.sameZone(n)).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      const dist = (o) => Math.hypot(o.x - P.x, o.z - P.z);
      const foe = [foeN, wolves.foe(), goblin.foe()].filter(Boolean).sort((a, b) => dist(a) - dist(b))[0];
      rack.children.slice(1).forEach((sw, i) => { sw.visible = i >= (S.flags.rackTaken || 0); });
      const c = dialogOpen || paused ? null : candidates();
      const label = c?.label || null;
      if (label !== prompt) { prompt = label; hooks.onPrompt(label); }
      const wanted = npcs.some((n) => n.alive && n.guard && n.hostile && !n.spar) ? 2 : npcs.some((n) => n.alive && n.alert > 0) ? 1 : 0;
      hooks.onHud({
        hp: P.hp, gold: P.gold, ore: P.ore, eq: { ...P.eq }, inv: { ...P.inv }, rep: { ...S.rep }, known: S.known.crown, gateOpen: S.gateOpen, mounted: !!P.mounted, zone: region === "wild" && wildF > 0.5 ? "selva" : region, wanted, combo, sneak: !!P.sneak, view, running, combat: inCombat(),
        stamina: P.stamina, winded, heard: heardT > 0,
        dayT: S.dayT, night: S.night, places: repSummary(S),
        map: [...worldToMap(...(region === "castello" ? CASTLE_DOOR : [P.x, P.z])), region === "castello" ? 0 : P.yaw],   // (in the castle: at its door)
        foe: foe && Math.hypot(foe.x - P.x, foe.z - P.z) < 14 ? { name: foe.spar ? `${foe.name} (allenamento)` : foe.name, hp: Math.max(0, foe.hp), hpMax: foe.hpMax } : null,
      });
    }
  }

  const clock = new THREE.Clock();
  let raf = 0, time = 0, bobT = 0;
  // Frame pacing (heat and battery on phones): at most 60 frames a second whatever the screen (90/120 Hz screens
  // would draw up to twice as many), 45 or 30 when saving the battery, 8 while the world is paused behind a menu.
  let due = 0, lastDraw = 0, frames = 0, worstGap = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const gap = 1000 / (paused && !talk ? 8 : POWER_FPS[power]);
    if (now - due < gap * 0.75) return;
    due = Math.max(due + gap, now - gap);
    frames++; if (lastDraw) worstGap = Math.max(worstGap, now - lastDraw); lastDraw = now;
    step();
  }
  function step() {
    const dt = Math.min(0.1, clock.getDelta());
    if (paused) { if (talk) updateTalk(dt); updateHud(dt); renderer.render(scene, camera); return; }
    time += dt;
    S.dayT = (S.dayT + dt / DAY_LEN) % 1;
    graceT -= dt;
    navBudget = 2; gateCall = Math.max(0, gateCall - dt);                // (ways planned this frame at most; the gate held up)
    region = regionOf(P.x, P.z);
    // back in the forest from the village: the bandits are again where they wait (not while they are chasing you)
    if (region !== lastRegion) { if (region === "forest" && (toLegacy(P.x, P.z)?.z ?? 0) > FZ - 5 && !bandits().some((b) => b.hostile)) resetForest(); lastRegion = region; }
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
    if (!dialogOpen && !transit && dodgeT <= 0 && ml > 0.15) {
      mx /= ml; mz /= ml;
      const run = (running || keys.shift) && !P.sneak && atkT < 0 && !guarding && pStag <= 0 && !carry?.n && (P.mounted || !winded);
      const spd = (P.mounted ? (run ? 13 : 9) : run ? 7.6 : 4.5) * mag * (atkT >= 0 || guarding ? 0.5 : 1) * (pStag > 0 ? 0.35 : 1) * (P.sneak ? 0.45 : 1) * (carry?.n ? 0.55 : 1);
      [P.x, P.z] = collide(P.x + mx * spd * dt, P.z + mz * spd * dt);
      moving = true; bobT += dt * (P.mounted ? 7 : 9) * (run ? 1.45 : 1); P.running = run;
      stillT = 0;
    } else { [P.x, P.z] = collide(P.x, P.z); P.running = false; stillT += dt; if (stillT > 1.2) running = false; }   // stopping ends the run
    // stamina: running uses it up; it comes back a moment after (faster standing still)
    if (P.running && !P.mounted) {
      P.stamina = Math.max(0, P.stamina - 16 * dt); breathT = 0.8;
      if (P.stamina <= 0) { winded = true; running = false; hooks.onFloat("SENZA FIATO", "#c8b88a"); note("Sei senza fiato: cammina per riprenderlo."); }
    } else if ((breathT -= dt) <= 0) P.stamina = Math.min(100, P.stamina + (moving ? 9 : 16) * (guarding ? 0.3 : 1) * dt);   // (slowly behind the guard)
    if (winded && P.stamina >= 30) winded = false;
    // noise of the player's moves, a few times a second
    noiseT -= dt; heardT -= dt;
    if (noiseT <= 0) {
      noiseT = 0.25;
      const r = !moving ? 0 : P.mounted ? (P.running ? NOISE.gallop : NOISE.horse) : P.sneak ? NOISE.sneak : P.running ? NOISE.run : NOISE.walk;
      if (r > 0) makeNoise(P.x, P.z, r);
    }
    if (dodgeT > 0) { dodgeT -= dt; [P.x, P.z] = collide(P.x + dodgeDir[0] * 10 * dt, P.z + dodgeDir[1] * 10 * dt); }
    iframe -= dt; dodgeCd -= dt; riposteT -= dt; shake = Math.max(0, shake - dt); pStag = Math.max(0, pStag - dt);
    { const was = guarding; guarding = guardHeld && !guardBroken && atkT < 0 && !P.mounted && pStag <= 0 && dodgeT <= 0;
      if (guarding && !was) { guardT = 0; running = false; }
      if (guarding) guardT += dt;
      guardK += ((guarding ? 1 : 0) - guardK) * Math.min(1, dt * 14); P.guarding = guarding; P.attacking = atkT >= 0; }   // (ai.js reads them)
    let k = 0;
    if (import.meta.env.DEV && window.__atk) { atkT = window.__atk.t - dt; combo = window.__atk.combo; blow = window.__atk.blow || combo; queued = false; }   // dev only: freeze a blow (tests)
    if (atkT >= 0) {
      const slow = TWO_HANDED.has(P.eq.hand) ? SLOW_2H : 1;                     // a two-handed sword: slower blows
      const prev = atkT; atkT += dt * slow; k = atkT / 0.4;
      if (prev < 0.18 && atkT >= 0.18) playerAttack();
      if (import.meta.env.DEV && window.__atk) atkT = window.__atk.t;
      // the thrust is a lunge: a short step forward while the arm shoots out
      if (blow === "thrust" && !P.mounted && k > 0.3 && k < 0.52 && !(import.meta.env.DEV && window.__atk)) [P.x, P.z] = collide(P.x + Math.sin(P.yaw) * 2.4 * dt * slow, P.z + Math.cos(P.yaw) * 2.4 * dt * slow);
      if (atkT > 0.45) { if (queued && combo < 3) { atkT = 0; combo += 1; blow = nextBlow(); sfx.swing(0.8); P.atkSeq = (P.atkSeq || 0) + 1; } else { atkT = -1; combo = 0; } queued = false; }
    }
    const h = mounted();
    if (h) { h.x = P.x; h.z = P.z; h.yaw = P.yaw; }
    const beat = h ? Math.floor(time * 4) : Math.floor((time * 9) / Math.PI);
    if (moving && beat !== P.beat) { if (h) sfx.hoof(0.7); else sfx.step(P.sneak ? 0.2 : P.running ? 0.85 : 0.6); }   // (as loud as the noise they make)
    P.beat = beat;
    horses.forEach((ho) => at(ho.mesh, ho.x, floorY(ho.x, ho.z), ho.z, ho.yaw));

    scanT -= dt;
    if (scanT <= 0) { scanT = 0.5; ai.scanBodies(); }
    const seeFar = Math.min(scene.fog.far + 4, 160);   // characters hidden by the fog or too far are not drawn (the simulation still runs)
    wolves.update(dt, seeFar); goblin.update(dt, seeFar);
    npcs.forEach((n) => {
      n.mesh.visible = Math.hypot(n.x - P.x, n.z - P.z) < seeFar;
      if (n.horse) { at(n.horse.mesh, n.horse.x, floorY(n.horse.x, n.horse.z), n.horse.z, n.horse.yaw); n.horse.mesh.visible = Math.hypot(n.horse.x - P.x, n.horse.z - P.z) < seeFar; }
      if (!n.alive) {                                                   // falling (once), then lying still
        const kind = n.deathKind ?? n.id.length % DEATH_TIME.length;      // dead since a saved game: always the same pose
        n.deathT = n.deathT == null ? 99 : n.deathT + dt;
        const p = Math.min(1, n.deathT / DEATH_TIME[kind]);
        if (n.poseP !== p) {
          n.poseP = p; at(n.mesh, n.x, floorY(n.x, n.z), n.z, n.yaw); n.mesh.rotation.x = 0; n.mesh.scale.setScalar(1); poseDeath(n.mesh, kind, p); n.mesh.userData.prop.visible = false; showTool(n.mesh, null);
          if (p === 1) { n.mesh.updateMatrixWorld(true); const c = n.mesh.userData.body.localToWorld(_cv.set(0, 1.0, 0)); n.cx = c.x; n.cz = c.z; }   // middle of the body on the ground
        }
        return;
      }
      n.cd -= dt; n.stagger -= dt; n.flash -= dt;
      if (!n.hostile && n.hp < n.hpMax) n.hp = Math.min(n.hpMax, n.hp + 2 * dt);   // wounds heal slowly (not at once)
      const ox = n.x, oz = n.z;
      const r = n.scripted && !n.hostile && !n.panic ? scriptUpdate(n, dt) : ai.update(n, dt);
      if (n.hostile && n.fights) {                                          // through the castle's door after the player
        const inC = castle.inZone(n.x, n.z);
        if (inC !== castle.inZone(P.x, P.z)) {
          const [ax, az] = inC ? [castleExit.x, castleExit.z] : DOOR_OUT;
          if (Math.hypot(n.x - ax, n.z - az) < 1.2) { const [bx, bz] = inC ? DOOR_OUT : [castleSpawn.x, castleSpawn.z]; n.x = bx + (Math.random() - 0.5) * 0.8; n.z = bz + (Math.random() - 0.5) * 0.8; n.nav = null; }
        } else openFor(n, inC);
      }
      if (!n.riding && !(n.id === "cocchiere" && !n.hostile && !n.panic)) [n.x, n.z] = pushOut(n.x, n.z);
      if (mine.inZone(n.x, n.z)) [n.x, n.z] = mine.constrain(n.x, n.z);                // in the mine: along the tunnels
      else if (castle.inZone(n.x, n.z)) [n.x, n.z] = castle.inZone(ox, oz) ? castle.move(ox, oz, n.x, n.z) : castle.constrain(n.x, n.z);   // in the castle: in its rooms
      if (n.scripted && (n.hostile || n.panic)) { unmountNpc(n); if (n.id === "cocchiere") n.ms = "off"; }
      const nt = time + n.pos[0];
      // characters hidden in the fog are only moved, not posed (the pose of dozens of skeletons costs on a phone)
      const shown = n.mesh.visible;
      if (r.mode === "sleep") { at(n.mesh, n.bedAt[0], n.bedY ?? 0.62, n.bedAt[1], n.yaw); n.mesh.rotation.x = -Math.PI / 2; if (shown) poseHuman(n.mesh, 0, false, "sleep"); }
      else {
        n.mesh.userData.atk = n.atk;
        const y = shown ? (n.lastY = poseHuman(n.mesh, nt, r.walk, r.mode, r.k)) : n.lastY ?? 0;
        at(n.mesh, n.x, n.riding ? saddleY(n.mesh, 1.87) + floorY(n.x, n.z) : n.ms === "seat" ? saddleY(n.mesh, 1.17) : y + floorY(n.x, n.z) + (r.seat || 0), n.z, n.yaw);
        n.mesh.rotation.x = 0;
        n.mesh.userData.hipL.rotation.z = n.riding ? 0.5 : 0; n.mesh.userData.hipR.rotation.z = n.riding ? -0.5 : 0; followSkirt(n.mesh.userData);
      }
      if (r.mode === "hammer") { const b = Math.floor((nt * 5) / Math.PI); if (b !== n.beat) { n.beat = b; sfx.anvil(vAt(n.x, n.z)); } }
      else if (r.walk) { const b = Math.floor((nt * 9) / Math.PI); if (b !== n.beat) { n.beat = b; sfx.step(vAt(n.x, n.z) * 0.35); } }
      n.mesh.userData.prop.visible = r.carry;
      showTool(n.mesh, TOOL_OF[r.mode] || null);
      n.mesh.scale.setScalar(n.flash > 0 ? 1.08 : 1);
    });
    fx.update(dt);
    ores.forEach((o) => { o.mesh.userData.crystals.visible = o.depletedUntil < time; });
    updateCarry(dt);
    updatePicks(dt);

    // Camera: first person (view model) or third person (behind and above the shoulders)
    const bob = moving ? Math.sin(bobT) * 0.045 : 0;
    const crouch = P.sneak && !P.mounted ? 0.45 : 0;
    const shk = shake ? (Math.random() - 0.5) * 0.1 : 0;
    const gy = floorY(P.x, P.z);                                                   // the floor under the player (the mine and the castle go up and down)
    const eyeY = gy + (P.mounted ? 2.55 : 1.62) - crouch + bob + shk;
    const lookX = Math.sin(P.yaw) * Math.cos(pitch), lookY = Math.sin(pitch), lookZ = Math.cos(P.yaw) * Math.cos(pitch);
    const sw = Math.sin(Math.min(1, k) * Math.PI);
    if (view === "third") {
      // Player body
      const pm = playerMesh;
      pm.userData.atk = blow === "thrust" ? "thrust" : ["side", "rise", "over"][Math.max(0, combo - 1)];     // the three blows of the combo, or a lunge
      const ny = poseHuman(pm, bobT / 9 * (P.mounted ? 0 : 1), moving && !P.mounted, P.mounted ? "sit" : pStag > 0 ? "stagger" : atkT >= 0 ? "swing" : guardK > 0.5 ? "block" : P.sneak ? "sneak" : P.running ? "run" : null, Math.min(1, k));
      at(pm, P.x, P.mounted ? saddleY(pm, 1.87) + gy : gy + ny, P.z, P.yaw);
      pm.userData.hipL.rotation.z = P.mounted ? 0.5 : 0; pm.userData.hipR.rotation.z = P.mounted ? -0.5 : 0; followSkirt(pm.userData);
      pm.rotation.x = dodgeT > 0 ? 0.25 : 0;
      // Camera behind the right shoulder; pulled in if a wall is in the way.
      const headY = gy + (P.mounted ? 2.45 : 1.75) - crouch;
      const rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
      const want = P.mounted ? 4.2 : 3.0, side = 0.55;
      const bx = -lookX, by = 0.35 - lookY * 0.8, bz = -lookZ;
      let dist = want;
      for (let t = 0.3; t <= want; t += 0.2) {
        const cx = P.x + bx * t + rx * side * (t / want), cz = P.z + bz * t + rz * side * (t / want);
        if (camBlocked(cx, cz)) { dist = Math.max(0.35, t - 0.3); break; }
      }
      const f = dist / want;
      const cx = P.x + bx * dist + rx * side * f, cz = P.z + bz * dist + rz * side * f, cg = floorY(cx, cz);
      let cy = Math.max(cg + 0.4, headY + 0.7 + by * dist);
      if (mine.inZone(cx, cz)) cy = Math.min(cy, mine.roofY(cx, cz));              // under the tunnel's roof
      else if (castle.inZone(cx, cz)) cy = Math.min(cy, castle.roofY(cx, cz));      // under the castle's vaults
      camera.position.set(cx + shk, cy, cz);
      camera.lookAt(P.x + rx * side * f + lookX * 4, headY + lookY * 4, P.z + rz * side * f + lookZ * 4);
    } else {
      camera.position.set(P.x + shk * 0.8, eyeY, P.z);
      camera.lookAt(P.x + lookX, eyeY + lookY, P.z + lookZ);
      // The blows (FP_BLOWS): the arm turns so the edge leads, the elbow bends, the wrist bends; the sword never turns in the fist.
      const R = VM_REST.R, L = VM_REST.L;
      const g = guardK;                                                                // the guard: up while held
      vm.g.rotation.set(pStag > 0 ? -0.35 * Math.min(1, pStag / 0.5) : 0, 0, pStag > 0 ? Math.sin(pStag * 40) * 0.04 : 0);   // staggered: the arms knocked back
      if (TWO_HANDED.has(P.eq.hand)) fpTwoHands(k, g, Math.sin(bobT * 0.5) * 0.01, Math.sin(bobT * 0.5) * 0.01);   // both hands on the grip
      else {
        if (atkT >= 0) applyPose(fpRig(), vm.armR, vm.bonesR, fpArm(Math.min(1, k), blow));
        else { vm.armR.rotation.set(R.rx, 0, 0); vm.bonesR.fore.quaternion.identity(); vm.bonesR.hand.quaternion.identity(); }
        if (g > 0) vm.armR.quaternion.premultiply(_pq.setFromAxisAngle(_fwd, FP_PARRY.turn * g));    // parry: the blade turns across the screen
        vm.armR.position.set(R.pos[0] + FP_PARRY.dx * g, R.pos[1] + Math.sin(bobT * 0.5) * 0.01 + FP_PARRY.dy * g, R.pos[2] + FP_PARRY.dz * g);
        const sg = hasShield() ? g : 0;
        vm.armL.rotation.set(L.rx + 0.25 * sg, -0.55 * sg, 0);                                                       // shield to the middle
        vm.armL.position.set(L.pos[0] + 0.16 * sg, L.pos[1] + Math.cos(bobT * 0.5) * 0.01 + 0.05 * sg, L.pos[2]);
      }
      vm.g.position.y = bob * 0.5 - (P.sneak && !P.mounted ? 0.03 : 0);
    }

    if (talk) updateTalk(dt);
    mine.update(camera.position);
    terrain.update(camera.position, dt, false, scene.fog.far + 4); veg.update(camera.position, scene.fog.far + 4); terrain.sea.visible = zoneOf(camera.position.x, camera.position.z) === "out";
    sky.update(camera.position, S.dayT);
    if (import.meta.env.DEV && window.__topcam) { const c = window.__topcam; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); }   // dev only: free camera (tests)
    updateHud(dt);
    renderer.render(scene, camera);
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
    if (kk === "e") action("interactDown");
    if (kk === "j") action("attack");
    if (kk === "c") action("sneak");
    if (kk === "v") action("camera");
    if (kk === " " || kk === "l") action("dodge");
    if (kk === "i") hooks.onToggleInventory?.();
    if (kk === "k") action("parry");
    if (kk === "q") action("quick");
  };
  const ku = (e) => { const kk = e.key.toLowerCase(); keys[kk] = false; if (kk === "k") action("parryUp"); if (kk === "e") action("interactUp"); };   // (held: the guard, carrying)
  const blur = () => { Object.keys(keys).forEach((kk) => { keys[kk] = false; }); guardHeld = false; guardBroken = false; holdT = -1; if (carry) dropCarry(); };
  window.addEventListener("blur", blur);
  window.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  window.addEventListener("resize", resize);
  resize();
  setLightsOn(false); renderer.compileAsync(scene, camera); setLightsOn(true);   // the "lights off" shaders too, now
  raf = requestAnimationFrame(frame);
  if (castle.inZone(P.x, P.z)) goThrough(true, true);          // saved inside the castle: build it and stay there

  return {
    input, action, choose, shop,
    look: (dx, dy) => { P.yaw -= dx * 0.005; pitch = clamp(pitch - dy * 0.004, -1.2, 1.2); },
    closeDialog: () => { dialogOpen = false; endTalk(); },
    loot: (kind, id, item) => loot(kind, id, item),
    closeLoot: () => { dialogOpen = false; lootId = null; },
    // frames drawn so far and the longest wait between two of them since the last call (the FPS counter)
    stats: () => { const w = worstGap; worstGap = 0; return { frames, worst: w }; },
    setPower: (v) => {
      power = POWER_FPS[v] ? v : 0;
      if (saving === (power === 2)) return;
      saving = power === 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, saving ? 1 : 1.5)); resize();
      renderer.shadowMap.type = saving ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    },
    setPaused: (v) => { paused = !!v; lookers.clear(); if (paused) Object.keys(keys).forEach((kk) => { keys[kk] = false; }); },
    invAction: (kind, id) => { sfx.unlock(); if (kind === "use") consumeItem(id); else if (kind === "equip") equipItem(id); else if (kind === "drop") dropItem(id); else if (kind === "unequip") unequip(id); },
    getSave: () => ({
      player: { hp: P.hp, gold: P.gold, ore: P.ore, eq: { ...P.eq }, inv: { ...P.inv }, x: P.x, z: P.z, yaw: P.yaw },
      rep: S.rep, known: S.known, flags: S.flags, drops: S.drops, dayT: S.dayT, view,
      npcs: Object.fromEntries(npcs.map((n) => [n.id, { alive: n.alive, looted: n.looted, discovered: n.discovered, witnessed: n.witnessed, hp: n.alive ? n.hpMax : 0, deadX: n.deadX, deadZ: n.deadZ, inv: n.inv, purse: n.purse }])),
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
