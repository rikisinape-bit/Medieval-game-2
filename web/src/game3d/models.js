import * as THREE from "three";
import { ITEMS, SWORD_TIER } from "./items";
import { BODY_MAT, bodyGeometries, variantOf } from "./body";

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
// Light anchor instead of a real PointLight: the engine moves a small pool of lights to the nearest anchors (mobile performance).
const lightAnchor = (g, color, intensity, distance, x, y, z, night = false) => {
  const o = at(new THREE.Object3D(), x, y, z);
  o.userData.anchor = { color, intensity, distance, night };
  g.add(o);
  return o;
};

const SKIN = "#e2b48a";
export const LOOKS = {
  player: { body: "#2d5d8c", legs: "#2a2218", head: "hood", hat: "#1f3346", cape: "#16222e" },
  villager: { body: "#8b6b3c", legs: "#3a2e1e", head: "cap", hat: "#5a3a1c" },
  villager2: { body: "#6a7a4a", legs: "#3a2e1e", head: "hair", hat: "#3a2414" },
  woman: { body: "#8a3a4a", legs: "#5a2a30", head: "hair", hat: "#6a4020", dress: true, female: true },
  miner: { body: "#5a4a36", legs: "#2a2218", head: "minerhelm", hat: "#c9a24a" },
  smith: { body: "#3a2a1e", legs: "#2a2218", head: "hair", hat: "#1a1008", apron: "#5a3a1a" },
  merchant: { body: "#a8822a", legs: "#3a2a17", head: "hat", hat: "#7a2a1a", apron: "#e8dcc4" },
  knight: { body: "#b8b8c4", legs: "#8a8a94", head: "helm", hat: "#c8c8d4", plume: "#c41e1e", cape: "#7a1e1e", shield: "#7a1e1e" },
  soldier: { body: "#8c1f1f", legs: "#3a3a40", head: "helm", hat: "#9a9aa4", shield: "#5a1414" },
  noble: { body: "#5e3a86", legs: "#2a1e36", head: "hat", hat: "#2a1638", cape: "#3e2460" },
  bandit: { body: "#3a4a2a", legs: "#221a12", head: "hood", hat: "#1e2616", cape: "#2a2016" },
  coachman: { body: "#6a4a2a", legs: "#2a2218", head: "hat", hat: "#1a1008" },
  king: { body: "#3e2a4a", legs: "#221a26", head: "crown", hat: "#8a6a2a", cape: "#4a1c1c", old: true, beard: "long", hair: "long" },
  messenger: { body: "#c9a24a", legs: "#3a2e1e", head: "cap", hat: "#7a1e1e", cape: "#7a1e1e" },
};

const HOLD = (o) => { at(o, 0, -0.66, 0.04); o.rotation.x = Math.PI / 2 - 0.3; return o; };
export function makeTool(id) {
  const g = new THREE.Group();
  switch (id) {
    case "ascia": add(g, at(box(0.05, 0.05, 0.85, "#5e3c1e"), 0, 0, 0.3), at(box(0.3, 0.05, 0.16, "#a8a8b0"), 0.12, 0, 0.65)); return HOLD(g);
    case "martello": add(g, at(box(0.05, 0.05, 0.45, "#5e3c1e"), 0, 0, 0.15), at(box(0.2, 0.1, 0.1, "#3a3a42"), 0, 0, 0.38)); return HOLD(g);
    case "scopa": add(g, at(box(0.04, 0.04, 1.3, "#8a6a3a"), 0, 0, 0.3), at(box(0.22, 0.08, 0.26, "#c9a95a"), 0, 0, 0.98)); return HOLD(g);
    case "pane": return at(add(g, box(0.22, 0.12, 0.14, "#a8783e")), 0, -0.7, 0.06);
    case "acqua": return at(add(g, cyl(0.07, 0.085, 0.2, "#5a6470"), at(cyl(0.03, 0.03, 0.05, "#3a2410"), 0, 0.12, 0)), 0, -0.72, 0.06);
    case "secchio": return at(add(g, cyl(0.14, 0.11, 0.22, "#4e3420", 10), at(box(0.02, 0.18, 0.02, "#3a3a3a"), 0, 0.18, 0)), 0, -0.9, 0.04);
    default: return g;
  }
}
// World representation of an inventory item lying on the ground.
export function makeItem(id, color) {
  const g = new THREE.Group();
  switch (id) {
    case "pane": g.add(at(box(0.42, 0.22, 0.26, "#c9944a"), 0, 0.11, 0)); break;
    case "acqua": add(g, at(cyl(0.12, 0.15, 0.36, "#6a7a8a"), 0, 0.18, 0), at(cyl(0.05, 0.05, 0.08, "#3a2410"), 0, 0.4, 0)); break;
    case "pozione": add(g, at(cyl(0.1, 0.14, 0.3, "#a02030"), 0, 0.15, 0), at(cyl(0.04, 0.04, 0.12, "#4a6a4a"), 0, 0.36, 0)); break;
    case "oro": [[0, 0.02, 0], [0.12, 0.02, 0.1], [-0.1, 0.02, 0.08], [0.02, 0.07, 0.03]].forEach(([x, y, z]) => g.add(at(cyl(0.11, 0.11, 0.04, "#e8c050", 10), x, y, z))); break;
    case "argento": g.add(at(mesh(new THREE.OctahedronGeometry(0.26, 0), "#d8e4f0", "#4a6a88"), 0, 0.26, 0)); break;
    case "pugnale": case "spada_corta": case "ascia_guerra": case "spada_lunga": case "spadone": case "spada_roccanera": {
      const s = makeSword({ pugnale: 0, spada_corta: 0, ascia_guerra: 1, spada_lunga: 1, spadone: 2, spada_roccanera: 2 }[id]);
      s.scale.setScalar(id === "pugnale" ? 0.6 : id === "spadone" ? 1.15 : 1); s.rotation.x = -Math.PI / 2; s.rotation.z = 0.4; g.add(at(s, 0, 0.06, 0)); break; }
    case "cuoio": case "maglia": case "piastre": add(g, at(box(0.6, 0.7, 0.34, color), 0, 0.36, 0), at(box(0.64, 0.1, 0.38, "#3a2410"), 0, 0.45, 0)); break;
    case "cappuccio": case "elmo_ferro": case "elmo_piastre": g.add(at(mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), color), 0, 0.1, 0)); break;
    case "torcia": { const t = makeTorch(false); t.rotation.z = 1.2; g.add(at(t, 0, 0.12, 0)); break; }
    case "scudo_legno": case "scudo_ferro": { const sh = makeShield(color); sh.rotation.x = -1.2; g.add(at(sh, 0, 0.3, 0)); break; }
    case "formaggio": g.add(at(cyl(0.22, 0.22, 0.14, "#e8c860", 10), 0, 0.07, 0)); break;
    case "carne": add(g, at(box(0.42, 0.18, 0.24, "#8a3a2a"), 0, 0.1, 0), at(box(0.1, 0.1, 0.4, "#e8dcc4"), 0.2, 0.1, 0)); break;
    case "mela": g.add(at(mesh(new THREE.SphereGeometry(0.14, 8, 6), "#c03030"), 0, 0.14, 0)); break;
    case "vino": add(g, at(cyl(0.11, 0.13, 0.34, "#3a1a2a"), 0, 0.17, 0), at(cyl(0.04, 0.04, 0.14, "#3a1a2a"), 0, 0.4, 0)); break;
    case "erbe": add(g, at(cone(0.14, 0.3, "#4a8a3a", 6), 0, 0.15, 0), at(cone(0.12, 0.26, "#6aa84a", 6), 0.12, 0.13, 0.08)); break;
    case "pozione_grande": add(g, at(cyl(0.14, 0.18, 0.36, "#a02030"), 0, 0.18, 0), at(cyl(0.05, 0.05, 0.14, "#4a6a4a"), 0, 0.42, 0)); break;
    case "martello": { const t = makeTool("martello"); t.rotation.set(-Math.PI / 2, 0, 0.5); g.add(at(t, 0, 0.05, -0.2)); break; }
    case "corda": g.add(at(mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 12), "#b89a5a"), 0, 0.06, 0)); g.children[0].rotation.x = Math.PI / 2; break;
    case "pelliccia": g.add(at(box(0.5, 0.1, 0.4, "#6a5a4a"), 0, 0.05, 0)); break;
    case "gemma": g.add(at(mesh(new THREE.OctahedronGeometry(0.18, 0), "#6ad0c0", "#2a6a60"), 0, 0.18, 0)); break;
    case "libro": add(g, at(box(0.3, 0.06, 0.4, "#5a2a1a"), 0, 0.03, 0), at(box(0.26, 0.04, 0.36, "#e8dcc4"), 0, 0.07, 0)); break;
    case "ascia": { const t = makeTool("ascia"); t.rotation.set(-Math.PI / 2, 0, 0.5); g.add(at(t, 0, 0.05, -0.3)); break; }
    case "testa_morn": add(g, at(mesh(new THREE.SphereGeometry(0.22, 8, 6), "#c89a78"), 0, 0.22, 0), at(box(0.46, 0.2, 0.46, "#1e2616"), 0, 0.36, 0)); break;
    default: g.add(at(box(0.3, 0.3, 0.3, "#7a5434"), 0, 0.15, 0));
  }
  return g;
}
export function makeSword(tier) {
  const t = tier === true ? 1 : tier || 0;
  const len = [0.8, 1.05, 1.2][t];
  const g = new THREE.Group();
  add(g, at(box(0.07, 0.07, 0.25, "#3a2410"), 0, 0, 0.05), at(box(0.3, 0.05, 0.06, t === 2 ? "#3a3a48" : "#c9a24a"), 0, 0, 0.2),
    at(box(0.06, 0.03, len, t === 2 ? "#9ec8ff" : "#dcdce4", t === 2 ? "#2a4a8a" : undefined), 0, 0, 0.22 + len / 2));
  return g;
}

// Human character. Same pivots and userData as always (hipL, hipR, armL, armR, head, prop, tools, sword, tool),
// so poseHuman/showTool and the engine keep working. seed (optional, e.g. the NPC id) gives stable per-NPC variation.
// Each pivot holds ONE merged vertex-coloured mesh sharing BODY_MAT (see body.js).
export function makeHuman(look, weapon, seed) {
  const v = variantOf(look, seed || JSON.stringify(look));
  const geo = bodyGeometries(look, v);
  const g = new THREE.Group();
  const body = new THREE.Group(); // scaled for per-NPC height; the outer group's scale is used by the engine (hit flash)
  body.scale.setScalar(v.height);
  g.add(body);
  const part = (geometry) => { const m = new THREE.Mesh(geometry, BODY_MAT); m.castShadow = true; m.receiveShadow = true; return m; };
  const pivot = (x, y, geometry) => { const p = at(new THREE.Group(), x, y, 0); p.add(part(geometry)); body.add(p); return p; };
  body.add(part(geo.torso));
  const hipL = pivot(-geo.hipX, 0.82, geo.legL);
  const hipR = pivot(geo.hipX, 0.82, geo.legR);
  const armL = pivot(-geo.shoulderX, 1.52, geo.armL);
  const armR = pivot(geo.shoulderX, 1.52, geo.armR);
  const head = pivot(0, 1.8, geo.head);
  const prop = at(box(0.5, 0.4, 0.4, "#5a4030"), 0, 1.15, 0.45); prop.visible = false; body.add(prop);
  let sword = null;
  if (weapon) { sword = makeSword(weapon === "long"); at(sword, 0, -0.66, 0.04); sword.rotation.x = Math.PI / 2 - 0.3; armR.add(sword); }
  if (look.shield) armL.add(at(box(0.06, 0.6, 0.5, look.shield), -0.08, -0.45, 0.12));
  const tools = {};
  ["ascia", "martello", "scopa", "pane", "acqua", "secchio"].forEach((id) => { const t = makeTool(id); t.visible = false; armR.add(t); tools[id] = t; });
  g.userData = { hipL, hipR, armL, armR, sword, head, prop, tools, tool: null, variant: v };
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

export function poseHuman(g, t, moving, mode, k = 0) {
  const { hipL, hipR, armL, armR, head } = g.userData;
  const s = moving ? Math.sin(t * 9) * 0.6 : 0;
  hipL.rotation.x = s; hipR.rotation.x = -s;
  armL.rotation.x = -s * 0.6; armR.rotation.x = s * 0.6; armL.rotation.z = 0; armR.rotation.z = 0; head.rotation.y = 0; head.rotation.x = 0;
  const w = Math.sin(t * 5);
  let y = 0;
  switch (mode) {
    case "eat": armR.rotation.x = -2.3 + 0.25 * Math.sin(t * 4); armR.rotation.z = -0.55; head.rotation.x = 0.15; break;
    case "drink": armR.rotation.x = -2.7; armR.rotation.z = -0.6; head.rotation.x = -0.35; break;
    case "windup": armR.rotation.x = -2.6 * k; break;
    case "swing": armR.rotation.x = -2.6 + 3.4 * Math.min(1, k * 1.6); break;
    case "slash": armR.rotation.x = -1.5; armR.rotation.z = 1.3 - 2.6 * Math.min(1, k * 1.6); break;
    case "stagger": armL.rotation.x = -0.4; armR.rotation.x = -0.4; armL.rotation.z = 0.7; armR.rotation.z = -0.7; head.rotation.y = 0.4; break;
    case "dead": hipL.rotation.x = 0; hipR.rotation.x = 0; armL.rotation.x = -2.8; armR.rotation.x = -2.6; break;
    case "sleep": hipL.rotation.x = 0; hipR.rotation.x = 0; armL.rotation.x = 0.3; armR.rotation.x = 0.3; break;
    case "hammer": armR.rotation.x = -1.2 - 0.9 * Math.abs(w); armL.rotation.x = -0.6; break;
    case "chop": armL.rotation.x = armR.rotation.x = -1.2 - 1.2 * Math.sin(t * 4); break;
    case "pump": armL.rotation.x = armR.rotation.x = -0.8 - 0.4 * Math.abs(Math.sin(t * 4)); break;
    case "water": armL.rotation.x = armR.rotation.x = -1.0 + 0.4 * Math.sin(t * 3); break;
    case "sweep": armL.rotation.x = -0.9; armR.rotation.x = -0.7; armL.rotation.z = armR.rotation.z = 0.4 * Math.sin(t * 4); break;
    case "sell": armR.rotation.x = -2.6; armR.rotation.z = 0.3 * Math.sin(t * 6); break;
    case "read": case "carry": armL.rotation.x = armR.rotation.x = -1.1; break;
    case "talk": armR.rotation.x = -0.6 + 0.3 * Math.sin(t * 3); armR.rotation.z = 0.2; head.rotation.y = 0.2 * Math.sin(t * 1.5); break;
    case "cheer": armL.rotation.x = armR.rotation.x = -2.8 + 0.3 * Math.sin(t * 8); break;
    case "panic": armL.rotation.x = armR.rotation.x = -2.9; armL.rotation.z = 0.3; armR.rotation.z = -0.3; break;
    case "look": head.rotation.y = 0.7 * Math.sin(t * 1.2); break;
    case "sneak": hipL.rotation.x = -0.7 + s * 0.4; hipR.rotation.x = -0.7 - s * 0.4; armL.rotation.x = armR.rotation.x = -0.6; head.rotation.x = 0.25; y = -0.3; break;
    case "sit": hipL.rotation.x = hipR.rotation.x = -1.5; armL.rotation.x = armR.rotation.x = -0.4; y = -0.42; break;
    case "train": { const c = (t * 1.2) % 1; armR.rotation.x = c < 0.6 ? -2.6 * (c / 0.6) : -2.6 + 3.4 * Math.min(1, ((c - 0.6) / 0.4) * 1.6); break; }
    default: break;
  }
  return y;
}

export function makeDummy() {
  const g = new THREE.Group();
  const arms = box(1.1, 0.12, 0.12, "#5e3c1e");
  add(g, at(box(0.15, 1.9, 0.15, "#5e3c1e"), 0, 0.95, 0), at(cyl(0.3, 0.3, 0.8, "#c9a95a"), 0, 1.3, 0), at(box(0.34, 0.34, 0.34, "#d8bc72"), 0, 1.9, 0), at(arms, 0, 1.45, 0));
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  add(g, at(box(1.6, 0.1, 0.45, "#6a4426"), 0, 0.45, 0), at(box(0.1, 0.45, 0.4, "#3a2410"), -0.65, 0.22, 0), at(box(0.1, 0.45, 0.4, "#3a2410"), 0.65, 0.22, 0));
  return g;
}

export function makeWoodpile() {
  const g = new THREE.Group();
  [[0, 0.2], [0.4, 0.2], [0.2, 0.55], [-0.4, 0.2]].forEach(([x, y]) => { const l = cyl(0.2, 0.2, 1.4, "#7a5434"); l.rotation.x = Math.PI / 2; g.add(at(l, x - 0.9, y, -0.2)); });
  add(g, at(cyl(0.35, 0.4, 0.5, "#5e3c1e", 10), 0.6, 0.25, 0.5), at(box(0.06, 0.5, 0.06, "#3a2410"), 0.6, 0.7, 0.5));
  return g;
}

export function makeField() {
  const g = new THREE.Group();
  g.add(at(box(4.2, 0.06, 3.2, "#5a3a20"), 0, 0.03, 0));
  [-1.2, -0.4, 0.4, 1.2].forEach((z) => g.add(at(box(3.8, 0.3, 0.25, "#4a8a2a"), 0, 0.2, z)));
  return g;
}

export function makeCamp() {
  const g = new THREE.Group();
  const tent = cone(1.8, 2.2, "#4a3a26", 4); tent.rotation.y = Math.PI / 4;
  add(g, at(tent, 2.5, 1.1, -2.6), at(cyl(0.5, 0.6, 0.2, "#3a3a3a", 8), 0, 0.1, 0), at(box(0.4, 0.4, 0.4, "#ff7a20", "#ff5a10"), 0, 0.35, 0),
    at(box(1.4, 0.3, 0.4, "#5e3c1e"), -1.6, 0.15, 1.6), at(box(0.6, 0.5, 0.6, "#7a5434"), 1.6, 0.25, 1.4));
  lightAnchor(g, "#ff8a30", 5, 9, 0, 1.2, 0);
  return g;
}

export function makeHorse(c = "#6a4426") {
  const g = new THREE.Group();
  add(g, at(box(0.7, 0.7, 1.7, c), 0, 1.25, 0), at(box(0.4, 0.8, 0.45, c), 0, 1.75, 0.85), at(box(0.32, 0.32, 0.7, c), 0, 2.05, 1.2),
    at(box(0.12, 0.5, 0.35, "#1a1008"), 0, 1.95, 0.7), at(box(0.15, 0.6, 0.12, "#1a1008"), 0, 1.15, -0.9), at(box(0.74, 0.12, 0.6, "#5a1a10"), 0, 1.64, 0));
  [[-0.25, 0.65], [0.25, 0.65], [-0.25, -0.65], [0.25, -0.65]].forEach(([x, z]) => g.add(at(box(0.16, 0.95, 0.16, c), x, 0.47, z)));
  return g;
}

export function makeCarriage() {
  const g = new THREE.Group();
  add(g, at(box(1.7, 1.3, 2.4, "#5a1414"), 0, 1.45, 0), at(box(1.9, 0.12, 2.6, "#2a1a0a"), 0, 2.15, 0),
    at(box(1.72, 0.5, 0.6, "#c9a24a"), 0, 1.5, 0.92), at(box(0.04, 0.5, 0.6, "#f2d089", "#5a4010"), 0.87, 1.6, 0), at(box(1.4, 0.15, 0.8, "#3a2410"), 0, 1.0, 1.6));
  [[-0.95, 0.8], [0.95, 0.8], [-0.95, -0.8], [0.95, -0.8]].forEach(([x, z]) => { const w = cyl(0.45, 0.45, 0.12, "#3a2410", 12); w.rotation.z = Math.PI / 2; g.add(at(w, x, 0.45, z)); });
  g.add(at(box(0.06, 0.06, 1.6, "#3a2410"), 0, 0.9, 2.6));
  return g;
}

// Enterable house: walls with a door gap, a hinged door, bed, table and a chest. Local rects are used for collision.
export const HOUSE_RECTS = [[0, -1.9, 2.2, 0.1], [-2.2, 0, 0.1, 1.9], [2.2, 0, 0.1, 1.9], [-1.35, 1.9, 0.85, 0.1], [1.35, 1.9, 0.85, 0.1], [-1.3, -0.9, 0.5, 0.9], [1.25, -0.8, 0.5, 0.4], [1.45, 1.05, 0.4, 0.25]];
export const CHEST_LOCAL = [1.45, 1.05];
export function makeHouse(wall = "#b89a6a", roof = "#7a4a22", stone = false) {
  const g = new THREE.Group();
  const r = cone(3.4, 2, roof, 4); r.rotation.y = Math.PI / 4;
  const chimney = at(box(0.5, 1.2, 0.5, "#55525a"), 1.2, 4.0, -0.6); g.add(chimney);
  const floor = box(4.4, 0.1, 3.8, stone ? "#6a6560" : "#6a5034"); floor.position.y = 0.05;
  add(g, floor, at(box(4.4, 2.8, 0.2, wall), 0, 1.4, -1.9), at(box(0.2, 2.8, 3.8, wall), -2.2, 1.4, 0), at(box(0.2, 2.8, 3.8, wall), 2.2, 1.4, 0),
    at(r, 0, 3.8, 0),
    at(box(1.0, 0.4, 1.8, "#6a4426"), -1.3, 0.3, -0.9), at(box(0.9, 0.12, 1.6, stone ? "#8a2a2a" : "#b8b0a0"), -1.3, 0.55, -0.9), at(box(0.7, 0.12, 0.4, "#e8dcc4"), -1.3, 0.58, -1.6),
    at(box(1.0, 0.08, 0.8, "#5e3c1e"), 1.25, 0.75, -0.8), at(box(0.3, 0.3, 0.3, "#c9a95a"), 1.1, 0.95, -0.9), at(box(0.5, 0.5, 0.5, "#5e3c1e"), 1.9, 0.25, 0.3),
    at(box(0.8, 0.12, 1.7, "#b89a5a"), 0, 0.06, -1.0), at(box(0.6, 0.08, 0.35, "#e8dcc4"), 0, 0.15, -1.65),
    at(box(0.8, 0.5, 0.5, "#5a3a1a"), 1.45, 0.3, 1.05), at(box(0.84, 0.08, 0.54, "#c9a24a"), 1.45, 0.42, 1.05));
  [[0.83, -1.12], [1.67, -1.12], [0.83, -0.48], [1.67, -0.48]].forEach(([x, z]) => g.add(at(box(0.08, 0.7, 0.08, "#3a2410"), x, 0.37, z)));
  [[-2.2, 1.9], [2.2, 1.9], [-2.2, -1.9], [2.2, -1.9]].forEach(([x, z]) => g.add(at(box(0.18, 2.8, 0.18, "#3a2410"), x, 1.4, z)));
  const front = [at(box(1.7, 2.8, 0.2, wall), -1.35, 1.4, 1.9), at(box(1.7, 2.8, 0.2, wall), 1.35, 1.4, 1.9), at(box(1.0, 0.9, 0.2, wall), 0, 2.35, 1.9),
    at(box(0.6, 0.6, 0.06, "#f2b84a", "#6a4010"), -1.3, 1.7, 1.98), at(box(0.6, 0.6, 0.06, "#f2b84a", "#6a4010"), 1.3, 1.7, 1.98)];
  front.forEach((m) => g.add(m));
  const door = at(new THREE.Group(), -0.5, 0, 1.9);
  door.add(at(box(0.95, 1.8, 0.08, "#3a2210"), 0.475, 0.9, 0), at(box(0.08, 0.08, 0.08, "#c9a24a"), 0.8, 0.95, 0.07));
  g.add(door);
  g.userData = { roof: r, chimney, door, front, open: 0 };
  return g;
}

export function makeCave() {
  const g = new THREE.Group();
  const rock = "#4a443c";
  add(g, at(box(26, 1.2, 26, rock), 0, 6.4, 0), at(box(26.4, 0.4, 26.4, "#4e6a3a"), 0, 7.1, 0),
    at(box(26, 6, 1, rock), 0, 3, -12.5), at(box(26, 6, 1, rock), 0, 3, 12.5), at(box(1, 6, 26, rock), -12.5, 3, 0),
    at(box(1, 6, 10.3, rock), 12.5, 3, -6.85), at(box(1, 6, 10.3, rock), 12.5, 3, 6.85), at(box(1, 2.5, 3.4, rock), 12.5, 4.75, 0),
    at(box(5, 5, 1, rock), 14.5, 2.5, -2.2), at(box(5, 5, 1, rock), 14.5, 2.5, 2.2), at(box(5, 1, 5.4, rock), 14.5, 4, 0),
    at(box(24, 0.1, 24, "#2a2420"), 0, 0.05, 0), at(box(5, 0.1, 3.4, "#2a2420"), 14.5, 0.05, 0),
    at(box(0.25, 3.6, 0.25, "#5a3a1a"), 17, 1.8, -1.6), at(box(0.25, 3.6, 0.25, "#5a3a1a"), 17, 1.8, 1.6), at(box(0.3, 0.3, 3.6, "#5a3a1a"), 17, 3.55, 0),
    at(box(0.1, 0.05, 7, "#6a6a72"), 10, 0.1, -0.5), at(box(0.1, 0.05, 7, "#6a6a72"), 10, 0.1, 0.5), at(box(1.2, 0.8, 1.6, "#4a3020"), 6, 0.5, -5));
  [[-8, -8], [8, -2], [-8, 6], [6, 9], [2, 0]].forEach(([x, z]) => { lightAnchor(g, "#ffb050", 8, 12, x, 3, z); g.add(at(box(0.15, 0.5, 0.15, "#ffb050", "#ff8a20"), x, 2.6, z)); });
  lightAnchor(g, "#ffb050", 3, 6, 16.5, 3, 0);
  return g;
}

export function makeFountain() {
  const g = new THREE.Group();
  add(g, at(cyl(1.8, 1.9, 0.6, "#8a8478", 12), 0, 0.3, 0), at(cyl(1.6, 1.6, 0.1, "#2b4868", 12), 0, 0.62, 0), at(cyl(0.3, 0.4, 1.4, "#8a8478", 8), 0, 1.2, 0),
    at(cyl(0.7, 0.7, 0.15, "#8a8478", 10), 0, 1.9, 0), at(cyl(0.6, 0.6, 0.05, "#5a8ab8", 10), 0, 2.0, 0));
  return g;
}

export function makeValdoroWalls() {
  const g = new THREE.Group();
  const stone = "#8a8478";
  add(g, at(box(34, 5, 1, stone), 0, 2.5, -30.5), at(box(1, 5, 30, stone), -16.5, 2.5, -15.5), at(box(1, 5, 30, stone), 16.5, 2.5, -15.5));
  for (let x = -16; x <= 16; x += 2) g.add(at(box(0.8, 0.8, 1.1, "#5e5a52"), x, 5.3, -30.5));
  [[-16.5, -30.5], [16.5, -30.5]].forEach(([x, z]) => add(g, at(cyl(1.4, 1.6, 7, stone, 10), x, 3.5, z), at(cone(1.8, 2.2, "#6a2a22", 10), x, 8.1, z)));
  return g;
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
  return g;
}

export function makeSwordRack() {
  const g = new THREE.Group();
  g.add(at(box(1.6, 0.12, 0.3, "#3a2410"), 0, 1.2, 0));
  [-0.5, 0, 0.5].forEach((x) => { const s = makeSword(true); s.rotation.x = -Math.PI / 2; g.add(at(s, x, 0.1, 0.05)); });
  return g;
}

export function makeStall() {
  const g = new THREE.Group();
  add(g, at(box(3, 0.9, 1.2, "#6a4426"), 0, 0.45, 0), at(box(3.2, 0.1, 1.8, "#c9a24a"), 0, 2.4, 0), at(box(3.2, 0.1, 1.8, "#8b1e1e"), 0, 2.5, 0.05),
    at(box(0.5, 0.35, 0.5, "#c9a24a"), -0.8, 1.07, 0), at(box(0.4, 0.3, 0.4, "#e8c890"), 0.3, 1.05, 0), at(box(0.6, 0.6, 0.6, "#7a5434"), 1.8, 0.3, 0.6));
  [[-1.5, 0.8], [1.5, 0.8], [-1.5, -0.8], [1.5, -0.8]].forEach(([x, z]) => g.add(at(box(0.1, 2.4, 0.1, "#3a2410"), x, 1.2, z)));
  return g;
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
  return g;
}

export function makeSignpost() {
  const g = new THREE.Group();
  const b1 = box(1.3, 0.3, 0.08, "#8a6a3a"); b1.rotation.z = 0.1;
  add(g, at(box(0.15, 2.2, 0.15, "#5e3c1e"), 0, 1.1, 0), at(b1, 0.4, 1.8, 0), at(box(1.0, 0.26, 0.08, "#7a5a2a"), -0.3, 1.4, 0));
  return g;
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
  return g;
}


export function makeTorch(lit = true) {
  const g = new THREE.Group();
  add(g, at(cyl(0.03, 0.035, 0.5, "#5e3c1e"), 0, 0, 0), at(cyl(0.05, 0.04, 0.1, "#3a2410"), 0, 0.28, 0));
  const flame = mesh(new THREE.SphereGeometry(0.08, 6, 5), "#ffb040", "#ff7a10"); flame.castShadow = false; at(flame, 0, 0.4, 0); g.add(flame);
  g.userData = { flame };
  if (lit) { const l = new THREE.PointLight("#ffa040", 0, 14); l.position.set(0, 0.5, 0); g.add(l); g.userData.light = l; }
  return g;
}
export function makeShield(color) {
  const g = new THREE.Group();
  add(g, at(box(0.5, 0.65, 0.06, color), 0, 0, 0), at(cyl(0.08, 0.08, 0.08, "#c9a24a", 8), 0, 0, 0.05));
  g.children[1].rotation.x = Math.PI / 2;
  return g;
}
export function makeLantern() {
  const g = new THREE.Group();
  const glow = box(0.26, 0.34, 0.26, "#ffd080", "#ff9a30"); glow.castShadow = false;
  add(g, at(cyl(0.07, 0.09, 3.2, "#3a2410"), 0, 1.6, 0), at(box(0.7, 0.08, 0.08, "#3a2410"), 0.3, 3.1, 0), at(glow, 0.6, 2.8, 0), at(box(0.32, 0.05, 0.32, "#2a2420"), 0.6, 3.0, 0));
  lightAnchor(g, "#ffb050", 7, 13, 0.6, 2.7, 0, true);
  g.userData = { glow };
  return g;
}
// First-person arms, attached to the camera.
export function makeViewmodel(look) {
  const g = new THREE.Group();
  const armR = new THREE.Group(), armL = new THREE.Group();
  armR.add(at(box(0.14, 0.5, 0.14, look.body), 0, -0.25, 0), at(box(0.15, 0.12, 0.15, "#e0b890"), 0, -0.55, 0));
  armL.add(at(box(0.14, 0.5, 0.14, look.body), 0, -0.25, 0), at(box(0.15, 0.12, 0.15, "#e0b890"), 0, -0.55, 0));
  const handR = at(new THREE.Group(), 0, -0.58, 0), handL = at(new THREE.Group(), 0, -0.58, 0);
  armR.add(handR); armL.add(handL);
  at(armR, 0.3, -0.3, -0.6); armR.rotation.x = 1.1; armR.scale.setScalar(0.7);
  at(armL, -0.3, -0.3, -0.6); armL.rotation.x = 1.1; armL.scale.setScalar(0.7);
  g.add(armR, armL);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { g, armR, armL, handR, handL };
}

// The player's 3D body with the current equipment (used in third person and in the menu preview).
export function makePlayerModel(eq) {
  const off = eq.off && ITEMS[eq.off];
  const look = {
    ...LOOKS.player,
    body: ITEMS[eq.body]?.color || LOOKS.player.body,
    ...(eq.head ? { head: "helm", hat: ITEMS[eq.head].color } : {}),
    ...(off?.block ? { shield: off.color } : {}),
  };
  const g = makeHuman(look, (SWORD_TIER[eq.hand] || 0) >= 1 ? "long" : "short");
  if (eq.off === "torcia") { const t = makeTorch(false); t.rotation.x = Math.PI / 2 - 0.3; g.userData.armL.add(at(t, 0, -0.75, 0.1)); }
  return g;
}
