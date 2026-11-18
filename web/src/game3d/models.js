import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ITEMS, SWORD_TIER } from "./items";
import { BODY_MAT, PALADIN_MAT, bodyGeometries, variantOf } from "./body";
import { makeWeapon, makeShieldMesh, SHIELD_KIND } from "./weapons";
import { itemModel, toolModel, hasItemModel } from "./items3d";

const mats = {};
export const mat = (c, emissive) => {
  const k = c + (emissive || "");
  if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, emissive: emissive || "#000000", emissiveIntensity: emissive ? 1 : 0 });
  return mats[k];
};
const mesh = (geo, c, em) => { const m = new THREE.Mesh(geo, mat(c, em)); m.castShadow = true; m.receiveShadow = true; return m; };
export const box = (w, h, d, c, em) => mesh(new THREE.BoxGeometry(w, h, d), c, em);
export const cyl = (rt, rb, h, c, s = 8) => mesh(new THREE.CylinderGeometry(rt, rb, h, s), c);
export const cone = (r, h, c, s = 8) => mesh(new THREE.ConeGeometry(r, h, s), c);
export const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };
const add = (g, ...items) => { items.forEach((i) => g.add(i)); return g; };
// Merge a prop's own (direct child) meshes that share a material into one mesh each: a house goes from ~35 draw
// calls to ~10. Nested groups (doors, gates, anything animated) and light anchors are left untouched.
const bake = (g) => {
  const byMat = new Map();
  [...g.children].forEach((c) => {
    if (!c.isMesh || Array.isArray(c.material)) return;
    c.updateMatrix();
    let geo = c.geometry.clone().applyMatrix4(c.matrix);
    if (geo.index) geo = geo.toNonIndexed();
    Object.keys(geo.attributes).forEach((k) => { if (k !== "position" && k !== "normal" && !(k === "uv" && c.material.map)) geo.deleteAttribute(k); });
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo);
    g.remove(c);
  });
  byMat.forEach((geos, m) => { const merged = new THREE.Mesh(mergeGeometries(geos), m); merged.castShadow = true; merged.receiveShadow = true; g.add(merged); geos.forEach((x) => x.dispose()); });
  return g;
};
// Light anchor instead of a real PointLight: the engine moves a small pool of lights to the nearest anchors (mobile performance).
const lightAnchor = (g, color, intensity, distance, x, y, z, night = false) => {
  const o = at(new THREE.Object3D(), x, y, z);
  o.userData.anchor = { color, intensity, distance, night };
  g.add(o);
  return o;
};

const SKIN = "#e2b48a";
// Character looks: dark, desaturated, dirty medieval palette. Options are documented in body.js (bodyGeometries).
export const LOOKS = {
  player: { body: "#3b4047", legs: "#2c2924", head: "hair", hair: "short", beard: "stubble", cowl: "#2a2e31", cape: "#24272b", capeLen: 0.98, boots: "#2a1f17", straps: "#3a2a1c", pouch: "#4a3624", bracers: "#3a2c20", tallBoots: true },
  villager: { body: "#6b5c44", legs: "#4a4234", head: "cap", hat: "#4a3d2c", wraps: "#7a705c", boots: "#3a2c20", pouch: "#4a3828", dirt: 0.42 },
  villager2: { body: "#4f5844", legs: "#3e3528", head: "hair", vest: "#4a3b2b", wraps: "#6e6550", boots: "#3a2c20", dirt: 0.42 },
  woman: { body: "#5c3b38", legs: "#3e2c28", head: "hair", hat: "#5e5646", dress: true, female: true, apron: "#7c7462", dirt: 0.38 },
  miner: { body: "#4b433a", legs: "#2f2a24", head: "minerhelm", hat: "#55504a", armor: "leather", vest: "#3d2f22", sleeves: "rolled", gloves: "#2a2018", boots: "#2a2119", dirt: 0.6 },
  smith: { body: "#3c3632", legs: "#2b2621", head: "hair", apron: "#45311f", apronBib: true, sleeves: "rolled", gloves: "#2a1e16", boots: "#2a2119", dirt: 0.5 },
  merchant: { body: "#5a4b30", legs: "#3a3024", head: "hat", hat: "#4a2b24", coat: "coat", coatColor: "#4e3f2a", collar: "#6a5c4a", pouch: "#3a2a1c", trim: "#6e5a32", tallBoots: true },
  knight: { body: "#4a3030", legs: "#3a3236", head: "paladin", metal: "#6a6d72", armor: "paladin", cape: "#3a1414", shield: "#4e1a1a", dirt: 0.25 },
  soldier: { body: "#5a5040", legs: "#3a3530", head: "helm", hat: "#686b70", armor: "gambeson", tabard: "#521c1c", bracers: "#3a2c20", shield: "#4a1818", shieldKind: "round", tallBoots: true, dirt: 0.35 },
  noble: { body: "#382a40", legs: "#241c28", head: "hat", hatStyle: "chaperon", hat: "#2c1f30", coat: "robe", coatColor: "#3a2a44", collar: "#6e6456", trim: "#7a6430", cape: "#2c2134", dirt: 0.2 },
  bandit: { body: "#3a3a2e", legs: "#2a2721", head: "hood", hat: "#262a21", cape: "#2a2822", capeLen: 0.85, mask: "#2e2a22", straps: "#2a1e14", bracers: "#2e241a", tallBoots: true, angry: true, dirt: 0.5 },
  coachman: { body: "#4a3b2b", legs: "#2e2820", head: "hat", hat: "#221b15", coat: "coat", coatColor: "#3a2f23", collar: "#2e261c", tallBoots: true, gloves: "#2a2018", dirt: 0.4 },
  messenger: { body: "#5e5232", legs: "#3a3024", head: "cap", hat: "#4e1c1c", feather: "#b8b09a", tabard: "#4e1c1c", emblem: "#8a7a4a", cape: "#3e1818", capeLen: 0.7, satchel: "#4a3826", straps: "#3a2a1c", tallBoots: true },
  king: { body: "#2e2236", legs: "#221a26", head: "crown", hat: "#8a6a2a", coat: "robe", coatColor: "#4a1a20", collar: "#cfc6b4", trim: "#8a7038", cape: "#3e161c", old: true, beard: "long", hair: "long", dirt: 0.15 },
  innkeeper: { body: "#5a4a38", legs: "#3a3226", head: "hair", apron: "#8a8270", sleeves: "rolled", bulk: 1.16, pouch: "#4a3828", dirt: 0.4 },
  herbalist: { body: "#46503a", legs: "#30302a", head: "kerchief", hat: "#5a5446", dress: true, female: true, apron: "#6a6250", pouch: "#4a3a28", satchel: "#4a3a28", dirt: 0.35 },
};

// Hand tools of the NPCs' daily routines, in the new item style (items3d.js). Same palm point as weapons.
const GRIP_TOOLS = new Set(["ascia", "martello", "scopa"]);
// Puts an object authored with its grip at the origin, the blade/haft along +Z and the edges along ±X (weapons.js)
// into the right fist of a body (bodyGeometries): at the centre of the fist, along the fist's axis, with the edge
// in line with the knuckles, as a sword is really held: the edge leads when the arm swings (front/back), the flat
// of the blade faces the sides. left: the left fist.
const _X = new THREE.Vector3(1, 0, 0), _basis = new THREE.Matrix4();
export function inFist(o, geo, left = false) {
  const g = new THREE.Vector3(...(left ? geo.gripAxisL : geo.gripAxis)).normalize();
  const e = _X.clone().cross(g).normalize();                 // edge: in the swing plane of the arm, at right angles to the grip
  o.position.set(...(left ? geo.gripL : geo.grip));
  o.quaternion.setFromRotationMatrix(_basis.makeBasis(e, g.clone().cross(e), g));
  return o;
}
// The sword never turns in the fist: for the horizontal cut the arm turns on itself (a quarter turn, palm down) so the
// edge faces where the blade goes (anim.js, ATK.side); the overhead chop and the lunge use the edge as held.
export function makeTool(id, geo) {
  const t = toolModel(id);
  if (GRIP_TOOLS.has(id)) inFist(t, geo);
  else t.position.set(geo.grip[0], geo.grip[1] - 0.01, geo.grip[2] + 0.01);
  return t;
}
// World representation of an inventory item lying on the ground.
export function makeItem(id, color) {
  const g = new THREE.Group();
  if (hasItemModel(id)) { g.add(itemModel(id)); return g; }
  switch (id) {
    case "pugnale": case "spada_corta": case "ascia_guerra": case "spada_lunga": case "spadone": case "spada_roccanera": {
      const s = makeSword(0, ITEMS[id].sword); g.add(at(s, 0, 0.03, -0.3, 0.4)); break; }   // lying flat on the ground (blade thickness is along Y)
    case "scudo_legno": case "scudo_ferro": { const sh = makeShield(ITEMS[id].color, SHIELD_KIND[id]); sh.rotation.x = -Math.PI / 2 + 0.12; g.add(at(sh, 0, 0.06, 0)); break; }
    default: g.add(at(box(0.3, 0.3, 0.3, "#5a4030"), 0, 0.15, 0));
  }
  return g;
}
// Weapon model. tier 0/1/2 (or true = 1) picks the generic short/long/great sword; kind (a sword key such as
// "pugnale", "corta", "ascia", "lunga", "spadone", "di Roccanera") picks the exact weapon. Grip at origin, blade +Z.
const TIER_KIND = ["corta", "lunga", "spadone"];
export function makeSword(tier, kind) {
  return makeWeapon(kind || TIER_KIND[tier === true ? 1 : tier || 0]);
}

// Human character: a skinned body (body.js: skin, clothes, armour, hair in one mesh, the paladin's plates in another)
// on a skeleton: pelvis, spine, chest, neck, head, clavicles, upper arms, forearms (elbows), hands (wrists), thighs,
// shins (knees), feet (ankles), and helpers that make hanging garments follow the legs. userData keeps the old names
// of the main joints (hipL/hipR = thighs, kneeL/kneeR = shins, armL/armR = upper arms, head) and has every bone by
// name in userData.B. The poses are in anim.js. seed (optional, e.g. the NPC id) gives stable per-NPC variation.
const BONE_PARENT = {
  pelvis: null, spine: "pelvis", chest: "spine", neck: "chest", head: "neck",
  clavR: "chest", upperArmR: "clavR", forearmR: "upperArmR", handR: "forearmR", clavL: "chest", upperArmL: "clavL", forearmL: "upperArmL", handL: "forearmL",
  thighR: "pelvis", shinR: "thighR", footR: "shinR", thighL: "pelvis", shinL: "thighL", footL: "shinL",
  skirtFR: "pelvis", skirtBR: "pelvis", skirtFL: "pelvis", skirtBL: "pelvis", skirtKR: "skirtFR", skirtKL: "skirtFL",
};
const HELPER_AT = { skirtFR: "thighR", skirtBR: "thighR", skirtFL: "thighL", skirtBL: "thighL", skirtKR: "shinR", skirtKL: "shinL" };   // where the helpers sit
export function makeHuman(look, weapon, seed) {
  const v = variantOf(look, seed || JSON.stringify(look));
  const geo = bodyGeometries(look, v);
  const g = new THREE.Group();
  const body = new THREE.Group(); // scaled for per-NPC height; the outer group's scale is used by the engine (hit flash)
  body.scale.setScalar(v.height);
  g.add(body);
  const names = [...geo.bones, ...Object.keys(HELPER_AT)];                 // the order of the skin's bone indices
  const J = (n) => geo.joints[geo.bones.indexOf(HELPER_AT[n] || n)];
  const B = {};
  names.forEach((n) => { B[n] = new THREE.Bone(); B[n].name = n; });
  names.forEach((n) => { const p = BONE_PARENT[n], j = J(n), q = p ? J(p) : [0, 0, 0]; B[n].position.set(j[0] - q[0], j[1] - q[1], j[2] - q[2]); (p ? B[p] : body).add(B[n]); });
  B.upperArmR.rotation.order = B.upperArmL.rotation.order = "XZY";      // y = the arm turning on itself, applied first
  g.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(names.map((n) => B[n]));
  const skin = (geometry, material) => {
    const m = new THREE.SkinnedMesh(geometry, material); m.castShadow = true; m.receiveShadow = true; body.add(m); m.bind(skeleton);
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);   // whatever the pose
    return m;
  };
  const mesh = skin(geo.body, BODY_MAT);
  if (geo.palBody) skin(geo.palBody, PALADIN_MAT);
  // Once on the graphics card, an NPC's body needs no copy in the page's memory (phones run short of it). The
  // player's stays: the menu's preview draws it with another renderer.
  if (seed !== "player") [geo.body, geo.palBody].forEach((gg) => gg && Object.values(gg.attributes).forEach((a) => { if (!a.onUploadCallback?.freed) { const f = function () { this.array = null; }; f.freed = true; a.onUpload(f); } }));
  // offsets from the shoulder (the arm's space of geo.grip, shieldAt) to the wrist and the elbow
  const off = (a, b) => { const p = J(a), q = J(b); return new THREE.Vector3(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const wristR = off("handR", "upperArmR"), wristL = off("handL", "upperArmL"), elbowL = off("forearmL", "upperArmL");
  const sp = J("spine"), prop = at(box(0.5, 0.4, 0.4, "#5a4030"), 0, 1.15 - sp[1], 0.45 - sp[2]); prop.visible = false; B.spine.add(prop);
  let sword = null;
  // weapon: "short" | "long" (NPCs) or any sword key (player); the grip goes through the fist, along its axis
  if (weapon) { sword = makeSword(0, weapon === true ? "lunga" : weapon); const hold = inFist(new THREE.Group(), geo); hold.position.sub(wristR); hold.add(sword); B.handR.add(hold); }
  if (look.shield) { const sh = makeShield(look.shield, look.shieldKind || "heater"); sh.rotation.y = -Math.PI / 2; const p = new THREE.Vector3(...geo.shieldAt).sub(elbowL); B.forearmL.add(at(sh, p.x, p.y, p.z, -Math.PI / 2)); }
  const tools = {};
  ["ascia", "martello", "scopa", "pane", "acqua", "secchio"].forEach((id) => { const t = makeTool(id, geo); t.position.sub(wristR); t.visible = false; B.handR.add(t); tools[id] = t; });
  g.userData = { hipL: B.thighL, hipR: B.thighR, kneeL: B.shinL, kneeR: B.shinR, armL: B.upperArmL, armR: B.upperArmR, head: B.head, B, mesh, wristR, wristL,
    skirt: { FR: B.skirtFR, BR: B.skirtBR, FL: B.skirtFL, BL: B.skirtBL, KR: B.skirtKR, KL: B.skirtKL }, shield: !!look.shield, sword, prop, tools, tool: null, variant: v, geo, body };
  return g;
}
export const showTool = (g, id) => {
  const u = g.userData;
  if (u.tool === id) return;
  if (u.tool) u.tools[u.tool].visible = false;
  if (id && u.tools[id]) u.tools[id].visible = true;
  if (u.sword) u.sword.visible = !id;
  u.tool = id || null;
};

// Poses (walking, fighting, working, falling...): anim.js.
export { poseHuman, poseDeath, followSkirt, saddleY, DEATH_TIME } from "./anim";

export function makeDummy() {
  const g = new THREE.Group();
  const arms = box(1.1, 0.12, 0.12, "#5e3c1e");
  add(g, at(box(0.15, 1.9, 0.15, "#5e3c1e"), 0, 0.95, 0), at(cyl(0.3, 0.3, 0.8, "#c9a95a"), 0, 1.3, 0), at(box(0.34, 0.34, 0.34, "#d8bc72"), 0, 1.9, 0), at(arms, 0, 1.45, 0));
  return bake(g);
}

export function makeBench() {
  const g = new THREE.Group();
  add(g, at(box(1.6, 0.1, 0.45, "#6a4426"), 0, 0.45, 0), at(box(0.1, 0.45, 0.4, "#3a2410"), -0.65, 0.22, 0), at(box(0.1, 0.45, 0.4, "#3a2410"), 0.65, 0.22, 0));
  return bake(g);
}

export function makeWoodpile() {
  const g = new THREE.Group();
  [[0, 0.2], [0.4, 0.2], [0.2, 0.55], [-0.4, 0.2]].forEach(([x, y]) => { const l = cyl(0.2, 0.2, 1.4, "#7a5434"); l.rotation.x = Math.PI / 2; g.add(at(l, x - 0.9, y, -0.2)); });
  add(g, at(cyl(0.35, 0.4, 0.5, "#5e3c1e", 10), 0.6, 0.25, 0.5), at(box(0.06, 0.5, 0.06, "#3a2410"), 0.6, 0.7, 0.5));
  return bake(g);
}

export function makeField() {
  const g = new THREE.Group();
  g.add(at(box(4.2, 0.06, 3.2, "#5a3a20"), 0, 0.03, 0));
  [-1.2, -0.4, 0.4, 1.2].forEach((z) => g.add(at(box(3.8, 0.3, 0.25, "#4a8a2a"), 0, 0.2, z)));
  return bake(g);
}

// The bandits' camp around its fire (centre). kit: the tents and the fire are pieces of the medieval kit (engine.js):
// here only the logs to sit on, a crate, a sack and the fire's light.
export function makeCamp(kit = false) {
  const g = new THREE.Group();
  if (!kit) {
    const tent = cone(1.8, 2.2, "#4a3a26", 4); tent.rotation.y = Math.PI / 4;
    add(g, at(tent, 2.5, 1.1, -2.6), at(cyl(0.5, 0.6, 0.2, "#3a3a3a", 8), 0, 0.1, 0), at(box(0.4, 0.4, 0.4, "#ff7a20", "#ff5a10"), 0, 0.35, 0),
      at(box(1.4, 0.3, 0.4, "#5e3c1e"), -1.6, 0.15, 1.6), at(box(0.6, 0.5, 0.6, "#7a5434"), 1.6, 0.25, 1.4));
  } else {
    const log = (x, z, ry, len) => { const l = cyl(0.17, 0.19, len, "#4e3420", 7); l.rotation.set(0, ry, Math.PI / 2); return at(l, x, 0.17, z, ry); };
    add(g, log(0.3, 2.0, 0, 1.5), log(-2.1, -1.4, Math.PI / 2, 1.5), log(2.6, 2.6, 0.5, 1.1),
      at(box(0.6, 0.5, 0.6, "#6a4a2e"), 3.3, 0.25, -0.4), at(box(0.45, 0.4, 0.45, "#5a3e26"), 3.35, 0.7, -0.35),
      at(cyl(0.22, 0.3, 0.55, "#5c5240", 6), -2.6, 0.27, 0.9));
  }
  lightAnchor(g, "#ff8a30", 5, 9, 0, 1.2, 0);
  return bake(g);
}

export function makeHorse(c = "#6a4426") {
  const g = new THREE.Group();
  add(g, at(box(0.7, 0.7, 1.7, c), 0, 1.25, 0), at(box(0.4, 0.8, 0.45, c), 0, 1.75, 0.85), at(box(0.32, 0.32, 0.7, c), 0, 2.05, 1.2),
    at(box(0.12, 0.5, 0.35, "#1a1008"), 0, 1.95, 0.7), at(box(0.15, 0.6, 0.12, "#1a1008"), 0, 1.15, -0.9), at(box(0.74, 0.12, 0.6, "#5a1a10"), 0, 1.64, 0));
  [[-0.25, 0.65], [0.25, 0.65], [-0.25, -0.65], [0.25, -0.65]].forEach(([x, z]) => g.add(at(box(0.16, 0.95, 0.16, c), x, 0.47, z)));
  return bake(g);
}

export function makeCarriage() {
  const g = new THREE.Group();
  add(g, at(box(1.7, 1.3, 2.4, "#5a1414"), 0, 1.45, 0), at(box(1.9, 0.12, 2.6, "#2a1a0a"), 0, 2.15, 0),
    at(box(1.72, 0.5, 0.6, "#c9a24a"), 0, 1.5, 0.92), at(box(0.04, 0.5, 0.6, "#f2d089", "#5a4010"), 0.87, 1.6, 0), at(box(1.4, 0.15, 0.8, "#3a2410"), 0, 1.0, 1.6));
  [[-0.95, 0.8], [0.95, 0.8], [-0.95, -0.8], [0.95, -0.8]].forEach(([x, z]) => { const w = cyl(0.45, 0.45, 0.12, "#3a2410", 12); w.rotation.z = Math.PI / 2; g.add(at(w, x, 0.45, z)); });
  g.add(at(box(0.06, 0.06, 1.6, "#3a2410"), 0, 0.9, 2.6));
  return bake(g);
}

// Enterable house: walls with a door gap, a hinged door, bed, table and a chest. Local rects are used for collision.
// With `kit` ({ wall, beam } materials of the medieval kit) only the ground floor is built, in the kit's half-timbered
// style and with a ceiling: the upper floors and the roof come from the kit (kitHouseTop) and sit on top, at HOUSE_H.
export const HOUSE_RECTS = [[0, -1.9, 2.2, 0.1], [-2.2, 0, 0.1, 1.9], [2.2, 0, 0.1, 1.9], [-1.35, 1.9, 0.85, 0.1], [1.35, 1.9, 0.85, 0.1], [-1.3, -0.9, 0.5, 0.9], [1.25, -0.8, 0.5, 0.4], [1.45, 1.05, 0.4, 0.25]];
export const CHEST_LOCAL = [1.45, 1.05];
export const HOUSE_H = 2.8;
const TILE = 1.6;                                        // metres covered by one repeat of the kit's wall texture
// Textured box: UVs in metres / TILE on every face, so the texture keeps its size whatever the box.
const tbox = (w, h, d, m) => {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / TILE, (uv.getY(i) * sv) / TILE);
  }
  const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o;
};
const beamBetween = (m, x1, y1, x2, y2, z, t = 0.14) => {        // diagonal brace in a wall facing z
  const o = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), t, t), m);
  o.position.set((x1 + x2) / 2, (y1 + y2) / 2, z); o.rotation.z = Math.atan2(y2 - y1, x2 - x1); o.castShadow = true; return o;
};
export function makeHouse(wall = "#b89a6a", roof = "#7a4a22", stone = false, kit = null) {
  const g = new THREE.Group();
  const H = HOUSE_H, wm = kit ? kit.wall : null;
  const wbox = (w, h, d) => (kit ? tbox(w, h, d, wm) : box(w, h, d, wall));
  const beam = kit ? "#3a2210" : "#3a2410";
  let r = null, chimney = null;
  if (!kit) {
    r = cone(3.4, 2, roof, 4); r.rotation.y = Math.PI / 4;
    chimney = at(box(0.5, 1.2, 0.5, "#55525a"), 1.2, 4.0, -0.6); g.add(chimney, at(r, 0, 3.8, 0));
  }
  const floor = box(4.4, 0.1, 3.8, stone ? "#6a6560" : "#6a5034"); floor.position.y = 0.05;
  add(g, floor, at(wbox(4.4, H, 0.2), 0, H / 2, -1.9), at(wbox(0.2, H, 3.8), -2.2, H / 2, 0), at(wbox(0.2, H, 3.8), 2.2, H / 2, 0),
    at(box(1.0, 0.4, 1.8, "#6a4426"), -1.3, 0.3, -0.9), at(box(0.9, 0.12, 1.6, stone ? "#8a2a2a" : "#b8b0a0"), -1.3, 0.55, -0.9), at(box(0.7, 0.12, 0.4, "#e8dcc4"), -1.3, 0.58, -1.6),
    at(box(1.0, 0.08, 0.8, "#5e3c1e"), 1.25, 0.75, -0.8), at(box(0.3, 0.3, 0.3, "#c9a95a"), 1.1, 0.95, -0.9), at(box(0.5, 0.5, 0.5, "#5e3c1e"), 1.9, 0.25, 0.3),
    at(box(0.8, 0.12, 1.7, "#b89a5a"), 0, 0.06, -1.0), at(box(0.6, 0.08, 0.35, "#e8dcc4"), 0, 0.15, -1.65),
    at(box(0.8, 0.5, 0.5, "#5a3a1a"), 1.45, 0.3, 1.05), at(box(0.84, 0.08, 0.54, "#c9a24a"), 1.45, 0.42, 1.05));
  [[0.83, -1.12], [1.67, -1.12], [0.83, -0.48], [1.67, -0.48]].forEach(([x, z]) => g.add(at(box(0.08, 0.7, 0.08, "#3a2410"), x, 0.37, z)));
  [[-2.2, 1.9], [2.2, 1.9], [-2.2, -1.9], [2.2, -1.9]].forEach(([x, z]) => g.add(at(box(0.18, H, 0.18, beam), x, H / 2, z)));
  if (kit) {
    // Half-timbering: sill and top beams all round (outside and inside), braces on the walls, a beamed ceiling and
    // the jetty that carries the kit's upper floor (a little wider than the ground floor).
    const B = kit.beam;
    const bm = (w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), B); o.castShadow = true; o.receiveShadow = true; return at(o, x, y, z); };
    [0.08, H - 0.1].forEach((y) => {
      add(g, bm(4.56, 0.16, 0.26, 0, y, -1.9), bm(0.26, 0.16, 3.96, -2.2, y, 0), bm(0.26, 0.16, 3.96, 2.2, y, 0));
      if (y > 1) add(g, bm(4.56, 0.16, 0.26, 0, y, 1.9)); else add(g, bm(1.75, 0.16, 0.26, -1.4, y, 1.9), bm(1.75, 0.16, 0.26, 1.4, y, 1.9));
    });
    add(g, bm(4.8, 0.18, 4.2, 0, H + 0.01, 0), at(box(4.36, 0.04, 3.76, "#4a3420"), 0, H - 0.2, 0));                          // jetty floor, ceiling boards
    [-1.4, -0.45, 0.45, 1.4].forEach((x) => g.add(bm(0.14, 0.14, 3.8, x, H - 0.28, 0)));                                      // ceiling joists
    [0.11, -0.11].forEach((dz) => {                                                                                           // braces, outside faces
      const zb = -1.9 - dz;
      add(g, beamBetween(B, -2.1, 0.2, -0.9, H - 0.2, zb), beamBetween(B, 2.1, 0.2, 0.9, H - 0.2, zb), bm(0.14, H, 0.04, 0, H / 2, zb));
    });
    [-1, 1].forEach((sx) => {
      const side = new THREE.Group(); side.position.x = sx * 2.31; side.rotation.y = Math.PI / 2;
      side.add(beamBetween(B, -1.8, 0.2, -0.4, H - 0.2, 0), beamBetween(B, 1.8, 0.2, 0.4, H - 0.2, 0), bm(0.14, H, 0.04, 0, H / 2, 0));
      side.updateMatrixWorld(true); [...side.children].forEach((c) => { c.applyMatrix4(side.matrix); g.add(c); });
    });
  }
  const fz = kit ? 1.99 : 1.98, glow = (x) => at(box(0.6, 0.6, 0.06, "#f2b84a", "#6a4010"), x, 1.7, fz);
  const front = [at(wbox(1.7, H, 0.2), -1.35, H / 2, 1.9), at(wbox(1.7, H, 0.2), 1.35, H / 2, 1.9), at(wbox(1.0, H - 1.9, 0.2), 0, (H + 1.9) / 2, 1.9), glow(-1.3), glow(1.3)];
  if (kit) [-1.3, 1.3].forEach((x) => front.push(at(box(0.78, 0.1, 0.1, beam), x, 1.35, 2.03), at(box(0.78, 0.1, 0.1, beam), x, 2.05, 2.03),
    at(box(0.1, 0.8, 0.1, beam), x - 0.38, 1.7, 2.03), at(box(0.1, 0.8, 0.1, beam), x + 0.38, 1.7, 2.03), at(box(0.06, 0.62, 0.06, beam), x, 1.7, 2.02),
    at(box(0.3, 0.75, 0.05, "#2e1c0e"), x - 0.58, 1.7, 2.04), at(box(0.3, 0.75, 0.05, "#2e1c0e"), x + 0.58, 1.7, 2.04)));               // window frames, shutters
  if (kit) front.push(at(box(1.18, 0.14, 0.16, beam), 0, 1.97, 1.96), at(box(0.12, 1.9, 0.16, beam), -0.55, 0.95, 1.96), at(box(0.12, 1.9, 0.16, beam), 0.55, 0.95, 1.96)); // door frame
  front.forEach((m) => g.add(m));
  const door = at(new THREE.Group(), -0.5, 0, 1.9);
  door.add(at(box(0.95, 1.8, 0.08, "#3a2210"), 0.475, 0.9, 0), at(box(0.08, 0.08, 0.08, "#c9a24a"), 0.8, 0.95, 0.07));
  if (kit) door.add(at(box(0.95, 0.1, 0.1, "#24160a"), 0.475, 0.4, 0.02), at(box(0.95, 0.1, 0.1, "#24160a"), 0.475, 1.4, 0.02));
  g.add(door);
  g.userData = { roof: r, chimney, door, front, open: 0 };
  return bake(g);
}

export function makeCave() {
  const g = new THREE.Group();
  const rock = "#4a443c";
  add(g, at(box(26, 1.2, 26, rock), 0, 6.4, 0), at(box(1.2, 3.3, 6.6, "#45423c"), 16.45, 6.1, 0),   // roof slab; rock face above the portal (the mountain covers the rest)
    at(box(26, 6, 1, rock), 0, 3, -12.5), at(box(26, 6, 1, rock), 0, 3, 12.5), at(box(1, 6, 26, rock), -12.5, 3, 0),
    at(box(1, 6, 10.3, rock), 12.5, 3, -6.85), at(box(1, 6, 10.3, rock), 12.5, 3, 6.85), at(box(1, 2.5, 3.4, rock), 12.5, 4.75, 0),
    at(box(5, 5, 1, rock), 14.5, 2.5, -2.2), at(box(5, 5, 1, rock), 14.5, 2.5, 2.2), at(box(5, 1, 5.4, rock), 14.5, 4, 0),
    at(box(24, 0.1, 24, "#2a2420"), 0, 0.05, 0), at(box(5, 0.1, 3.4, "#2a2420"), 14.5, 0.05, 0),
    at(box(0.25, 3.6, 0.25, "#5a3a1a"), 17, 1.8, -1.6), at(box(0.25, 3.6, 0.25, "#5a3a1a"), 17, 1.8, 1.6), at(box(0.3, 0.3, 3.6, "#5a3a1a"), 17, 3.55, 0),
    at(box(0.1, 0.05, 7, "#6a6a72"), 10, 0.1, -0.5), at(box(0.1, 0.05, 7, "#6a6a72"), 10, 0.1, 0.5), at(box(1.2, 0.8, 1.6, "#4a3020"), 6, 0.5, -5));
  // Mine timbering: frames against the walls with beams under the roof, a second frame in the entrance tunnel
  const TIMBER = "#4a3018";
  [-7.5, 0, 7.5].forEach((x) => add(g, at(box(0.3, 5.6, 0.3, TIMBER), x, 2.8, -11.8), at(box(0.3, 5.6, 0.3, TIMBER), x, 2.8, 11.8), at(box(0.34, 0.34, 23.9, TIMBER), x, 5.6, 0)));
  [-7.5, 7.5].forEach((z) => add(g, at(box(0.3, 5.6, 0.3, TIMBER), -11.8, 2.8, z), at(box(23.9, 0.3, 0.3, TIMBER), 0, 5.75, z)));
  add(g, at(box(0.22, 3.4, 0.22, TIMBER), 14.5, 1.7, -1.55), at(box(0.22, 3.4, 0.22, TIMBER), 14.5, 1.7, 1.55), at(box(0.26, 0.26, 3.4, TIMBER), 14.5, 3.4, 0));
  // Rubble heaps along the walls and rough rock on them (no collisions: they hug the walls)
  [[-10.6, -10.4, 1.5], [10.4, -10.6, 1.2], [-10.8, 10.2, 1.3], [10.6, 10.5, 1.6], [-11, -1, 1.1], [3, -11.2, 1.2], [-3, 11.2, 1.0], [11.2, -6, 0.9]].forEach(([x, z, r], i) => {
    const m = mesh(new THREE.DodecahedronGeometry(r, 0), i % 2 ? "#3e3a34" : "#46413a"); m.scale.y = 0.75; g.add(at(m, x, r * 0.35, z, i));
  });
  [[-8, -8], [8, -2], [-8, 6], [6, 9], [2, 0]].forEach(([x, z]) => { lightAnchor(g, "#ffb050", 8, 12, x, 3, z); g.add(at(box(0.15, 0.5, 0.15, "#ffb050", "#ff8a20"), x, 2.6, z)); });
  lightAnchor(g, "#ffb050", 3, 6, 16.5, 3, 0);
  return bake(g);
}

export function makeFountain() {
  const g = new THREE.Group();
  add(g, at(cyl(1.8, 1.9, 0.6, "#8a8478", 12), 0, 0.3, 0), at(cyl(1.6, 1.6, 0.1, "#2b4868", 12), 0, 0.62, 0), at(cyl(0.3, 0.4, 1.4, "#8a8478", 8), 0, 1.2, 0),
    at(cyl(0.7, 0.7, 0.15, "#8a8478", 10), 0, 1.9, 0), at(cyl(0.6, 0.6, 0.05, "#5a8ab8", 10), 0, 2.0, 0));
  return bake(g);
}

export function makeValdoroWalls() {
  const g = new THREE.Group();
  const stone = "#8a8478";
  add(g, at(box(34, 5, 1, stone), 0, 2.5, -30.5), at(box(1, 5, 30, stone), -16.5, 2.5, -15.5), at(box(1, 5, 30, stone), 16.5, 2.5, -15.5));
  for (let x = -16; x <= 16; x += 2) g.add(at(box(0.8, 0.8, 1.1, "#5e5a52"), x, 5.3, -30.5));
  [[-16.5, -30.5], [16.5, -30.5]].forEach(([x, z]) => add(g, at(cyl(1.4, 1.6, 7, stone, 10), x, 3.5, z), at(cone(1.8, 2.2, "#6a2a22", 10), x, 8.1, z)));
  return bake(g);
}

export function makeTree(pine) {
  const g = new THREE.Group();
  g.add(at(cyl(0.18, 0.26, 1.6, "#5e3c1e"), 0, 0.8, 0));
  if (pine) [0, 1, 2].forEach((i) => g.add(at(cone(1.4 - i * 0.35, 1.6, ["#1f3a1a", "#26461f", "#2e5426"][i], 7), 0, 2 + i * 0.9, 0)));
  else [[0, 2.6, 0, 1.3], [0.6, 2.2, 0.3, 0.9], [-0.6, 2.3, -0.2, 0.9]].forEach(([x, y, z, s]) => {
    const m = mesh(new THREE.IcosahedronGeometry(s, 0), "#2e5426"); g.add(at(m, x, y, z));
  });
  return g;
}

export function makeForge() {
  const g = new THREE.Group();
  [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]].forEach(([x, z]) => g.add(at(box(0.2, 2.8, 0.2, "#3a2410"), x, 1.4, z)));
  add(g, at(box(4.6, 0.15, 3.6, "#5a3a1a"), 0, 2.85, 0), at(box(1.4, 1.0, 1.2, "#55525a"), -1.2, 0.5, -1), at(box(1.0, 0.35, 0.8, "#ff7a20", "#ff5a10"), -1.2, 1.05, -1),
    at(box(0.5, 0.5, 0.35, "#2a2a30"), 0.6, 0.25, 0.4), at(box(0.8, 0.22, 0.35, "#3a3a42"), 0.6, 0.6, 0.4),
    at(box(1.6, 1.4, 0.1, "#3a2410"), 1.6, 0.9, -1.6));
  lightAnchor(g, "#ff7a30", 6, 7, -1.2, 1.6, -1);
  return bake(g);
}

export function makeSwordRack() {
  const g = new THREE.Group();
  g.add(at(box(1.6, 0.12, 0.3, "#3a2410"), 0, 1.2, 0));
  [-0.5, 0, 0.5].forEach((x) => { const s = makeSword(0, "lunga"); s.rotation.x = -Math.PI / 2; g.add(at(s, x, 0.1, 0.05)); });
  return g;
}

export function makeStall() {
  const g = new THREE.Group();
  add(g, at(box(3, 0.9, 1.2, "#6a4426"), 0, 0.45, 0), at(box(3.2, 0.1, 1.8, "#c9a24a"), 0, 2.4, 0), at(box(3.2, 0.1, 1.8, "#8b1e1e"), 0, 2.5, 0.05),
    at(box(0.5, 0.35, 0.5, "#c9a24a"), -0.8, 1.07, 0), at(box(0.4, 0.3, 0.4, "#e8c890"), 0.3, 1.05, 0), at(box(0.6, 0.6, 0.6, "#7a5434"), 1.8, 0.3, 0.6));
  [[-1.5, 0.8], [1.5, 0.8], [-1.5, -0.8], [1.5, -0.8]].forEach(([x, z]) => g.add(at(box(0.1, 2.4, 0.1, "#3a2410"), x, 1.2, z)));
  return bake(g);
}

export function makeOreRock() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.DodecahedronGeometry(0.8, 0), "#6a6258"));
  const crystals = new THREE.Group();
  [[0.3, 0.5, 0.4], [-0.4, 0.4, 0.3], [0, 0.7, -0.2]].forEach(([x, y, z]) => crystals.add(at(mesh(new THREE.OctahedronGeometry(0.22, 0), "#d8e4f0", "#6a8aa8"), x, y, z)));
  g.add(crystals);
  g.position.y = 0.5;
  g.userData.crystals = crystals;
  return g;
}

export function makeWell() {
  const g = new THREE.Group();
  add(g, at(cyl(1, 1, 1, "#6a6258", 10), 0, 0.5, 0), at(cyl(0.8, 0.8, 0.05, "#2b4868", 10), 0, 0.95, 0),
    at(box(0.15, 2.2, 0.15, "#3a2410"), -0.9, 1.6, 0), at(box(0.15, 2.2, 0.15, "#3a2410"), 0.9, 1.6, 0), at(cone(1.4, 0.8, "#7a4a22", 4), 0, 3, 0));
  return bake(g);
}

export function makeSignpost() {
  const g = new THREE.Group();
  const b1 = box(1.3, 0.3, 0.08, "#8a6a3a"); b1.rotation.z = 0.1;
  add(g, at(box(0.15, 2.2, 0.15, "#5e3c1e"), 0, 1.1, 0), at(b1, 0.4, 1.8, 0), at(box(1.0, 0.26, 0.08, "#7a5a2a"), -0.3, 1.4, 0));
  return bake(g);
}

export function makeCityWall() {
  const g = new THREE.Group();
  const stone = "#8a8478", dark = "#5e5a52";
  [-11.5, 11.5].forEach((x) => g.add(at(box(17, 7, 2, stone), x, 3.5, 0)));
  g.add(at(box(6, 2, 2, stone), 0, 6, 0));
  for (let x = -19.5; x <= 19.5; x += 1.5) g.add(at(box(0.8, 0.8, 2.1, dark), x, 7.4, 0));
  [-3.8, 3.8].forEach((x) => {
    add(g, at(cyl(1.6, 1.8, 10, stone, 10), x, 5, 0.4), at(cone(2.1, 2.6, "#6a2a22", 10), x, 11.3, 0.4), at(box(0.9, 2.4, 0.05, "#a8282a"), x, 6.5, 2.25));
  });
  const gate = new THREE.Group();
  for (let x = -2.2; x <= 2.2; x += 0.55) gate.add(at(box(0.1, 5, 0.1, "#2a2420"), x, 2.5, 0.2));
  for (let y = 0.6; y <= 4.6; y += 0.8) gate.add(at(box(4.6, 0.1, 0.1, "#2a2420"), 0, y, 0.2));
  g.add(gate);
  g.userData = { gate };
  return bake(g);
}


const FLAME_MAT = new THREE.MeshStandardMaterial({ color: "#ffb048", emissive: "#ff7a18", emissiveIntensity: 1.6, flatShading: true });
const FLAME_GEO = new THREE.ConeGeometry(0.055, 0.16, 5);
export function makeTorch(lit = true) {
  const g = new THREE.Group();
  add(g, at(cyl(0.022, 0.027, 0.5, "#3a2618", 6), 0, 0, 0), at(cyl(0.048, 0.038, 0.11, "#2a2420", 7), 0, 0.29, 0), at(cyl(0.05, 0.05, 0.02, "#8a7650", 7), 0, 0.25, 0));
  const flame = new THREE.Mesh(FLAME_GEO, FLAME_MAT); flame.position.set(0, 0.42, 0); g.add(flame);
  g.userData = { flame };
  if (lit) { const l = new THREE.PointLight("#ffa040", 0, 14); l.position.set(0, 0.5, 0); g.add(l); g.userData.light = l; }
  return g;
}
// Shield model: kind "round" (wood) or "heater" (iron, painted). Face +Z, centred on the grip.
export function makeShield(color, kind = "heater") {
  return makeShieldMesh(color, kind);
}
export function makeLantern() {
  const g = new THREE.Group();
  const glow = box(0.26, 0.34, 0.26, "#ffd080", "#ff9a30"); glow.castShadow = false;
  add(g, at(cyl(0.07, 0.09, 3.2, "#3a2410"), 0, 1.6, 0), at(box(0.7, 0.08, 0.08, "#3a2410"), 0.3, 3.1, 0), at(glow, 0.6, 2.8, 0), at(box(0.32, 0.05, 0.32, "#2a2420"), 0.6, 3.0, 0));
  lightAnchor(g, "#ffb050", 7, 13, 0.6, 2.7, 0, true);
  g.userData = { glow };
  return g;
}
// First-person arms: the player's own arm geometry (sleeves, armour, gloves) from body.js, attached to the camera.
// rest = shoulder position (camera space) and raise angle; the engine animates armR/armL around it.
export const VM_REST = { R: { pos: [0.3, -0.12, 0.1], rx: 1.45 }, L: { pos: [-0.36, -0.14, 0.08], rx: 1.3 } };
export function makeViewmodel(look) {
  const geo = bodyGeometries(look, variantOf(look, "player"), { fp: true });
  const g = new THREE.Group();
  // Each arm is turned half a turn on itself (thumb up): what the fist holds (fistR / fistL, oriented like the
  // fist, objects along +Z) points up and forwards. hand: the fist's position with the arm's plain orientation.
  // The arm is skinned on three bones (body.js, fpJoints): the shoulder group turns the whole arm, bones.fore bends
  // the elbow and turns the forearm on itself, bones.hand bends the wrist. What the fist holds follows the hand.
  const arm = (geometry, rest, left) => {
    const p = new THREE.Group(); p.position.set(...rest.pos); p.rotation.x = rest.rx;
    const tw = new THREE.Group(); tw.rotation.y = Math.PI; p.add(tw);
    const [S, E, W] = geo.fpJoints[left ? "L" : "R"], up = new THREE.Bone(), fore = new THREE.Bone(), hand = new THREE.Bone();
    up.position.set(...S); fore.position.set(E[0] - S[0], E[1] - S[1], E[2] - S[2]); hand.position.set(W[0] - E[0], W[1] - E[1], W[2] - E[2]);
    up.add(fore); fore.add(hand); tw.add(up);
    const fist = inFist(new THREE.Group(), geo, left); fist.position.sub(new THREE.Vector3(...W)); hand.add(fist);
    const gp = left ? geo.gripL : geo.grip, mark = at(new THREE.Group(), -gp[0], gp[1], -gp[2]); p.add(mark);
    g.add(p); p.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([up, fore, hand]);
    const skin = (geometry2, material) => { const m = new THREE.SkinnedMesh(geometry2, material); m.frustumCulled = false; tw.add(m); m.bind(skeleton); return m; };
    skin(geometry, BODY_MAT);
    const pal = geo.pal?.[left ? "armL" : "armR"]; if (pal) skin(pal, PALADIN_MAT);   // paladin bracers
    return [p, mark, fist, { tw, up, fore, hand, S, E, W }];
  };
  const [armR, handR, fistR, bonesR] = arm(geo.armR, VM_REST.R, false), [armL, handL, fistL, bonesL] = arm(geo.armL, VM_REST.L, true);
  return { g, armR, armL, handR, handL, fistR, fistL, bonesR, bonesL, geo };
}

// The player's 3D body with the current equipment (used in third person and in the menu preview).
// What each piece of equipment looks like on the player's body (body.js options).
const ARMOR_LOOK = {
  cuoio: { armor: "leather", vest: "#4a3220" },
  maglia: { armor: "mail", metal: "#62666b" },
  piastre: { armor: "paladin", metal: "#62666b" },              // the paladin knight's armour (paladin.json)
};
const HELM_LOOK = {
  cappuccio: { head: "leatherhood", hat: "#4a3424" },
  elmo_ferro: { head: "nasal", hat: "#6a6d72" },
  elmo_piastre: { head: "paladin", cowl: null },                 // the paladin knight's great helm (with a mail aventail)
};
// Look of the player's body for the current equipment (also used by the first-person arms).
export function playerLook(eq) {
  const off = eq.off && ITEMS[eq.off];
  const look = {
    ...LOOKS.player,
    ...(ARMOR_LOOK[eq.body] || {}),
    ...(HELM_LOOK[eq.head] || {}),
    ...(off?.block ? { shield: off.color, shieldKind: SHIELD_KIND[eq.off] } : {}),
  };
  if (eq.body === "piastre") delete look.straps;
  if (eq.body) delete look.cape;   // the cape would hide the armour seen from behind (third person)
  return look;
}
export function makePlayerModel(eq) {
  const g = makeHuman(playerLook(eq), eq.hand || "corta", "player");
  if (eq.off === "torcia") { const t = makeTorch(false), geo = g.userData.geo; t.position.set(...geo.gripL).sub(g.userData.wristL); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(geo.gripAxisL[0], 0.9, geo.gripAxisL[2]).normalize()); g.userData.B.handL.add(t); }
  return g;
}
