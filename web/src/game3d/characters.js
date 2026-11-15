// Rigged characters (GLB with skeleton + animations). They replace the block humans for some NPCs and the player.
// Everything else keeps the procedural block models (models.js), which are also the fallback if loading fails.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { makeSword, makeTool, makeTorch, makeShield, makePlayerModel, poseHuman, box, at } from "./models";
import { ITEMS, SWORD_TIER } from "./items";

const URLS = { adventurer: "models/personaggi/adventurer.glb", farmer: "models/personaggi/farmer.glb", king: "models/personaggi/king.glb" };
const lib = {};

export async function loadCharacters() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.entries(URLS).map(async ([id, url]) => {
    try {
      const g = await loader.loadAsync(url);
      lib[id] = { scene: g.scene, clips: Object.fromEntries(g.animations.map((a) => [a.name, a])) };
    } catch (e) {
      console.warn(`Personaggio ${id} non caricato, uso il modello a blocchi`, e);
    }
  }));
  return Object.keys(lib);
}
export const hasRig = (id) => !!lib[id];

// Colour variants (material name -> colour). Materials are cloned once per variant and shared.
export const TINTS = {
  bandit: { Green: "#2a2e20", LightGreen: "#363a26", Brown: "#2a2117", Brown2: "#1c1610", Hair: "#140c08", Gold: "#4a3a20" },
  banditBoss: { Green: "#2a1a14", LightGreen: "#5a1e16", Brown: "#2a2117", Brown2: "#1c1610", Hair: "#0e0806", Gold: "#6a5020" },
  farmerUgo: { LightBlue: "#4a5560" },
  farmerPiero: { LightBlue: "#55603a", Beige: "#a89a70" },
  farmerNino: { LightBlue: "#6a4a30", Red: "#3a5a2a" },
};
const matCache = new Map();
const tinted = (m, hex) => {
  const k = `${m.uuid}|${hex}`;
  if (!matCache.has(k)) { const c = m.clone(); c.color.set(hex); matCache.set(k, c); }
  return matCache.get(k);
};

// Pose overrides applied on top of the animation (crouch for stealth, sitting, riding).
// Rotations are around the character's own axes (x = its left, z = its front), applied in order: [bone, axis, angle].
const OVERRIDES = {
  crouch: { y: -0.27, rot: [["UpperLeg.L", "x", -1.0], ["LowerLeg.L", "x", 1.6], ["UpperLeg.R", "x", -1.0], ["LowerLeg.R", "x", 1.6], ["Torso", "x", 0.4], ["Head", "x", -0.3]] },
  sit: { y: -0.4, rot: [["UpperLeg.L", "x", -1.5], ["LowerLeg.L", "x", 1.5], ["UpperLeg.R", "x", -1.5], ["LowerLeg.R", "x", 1.5]] },
  ride: { y: 0, rot: [["UpperLeg.L", "z", 0.45], ["UpperLeg.L", "x", -1.1], ["LowerLeg.L", "x", 1.2], ["UpperLeg.R", "z", -0.45], ["UpperLeg.R", "x", -1.1], ["LowerLeg.R", "x", 1.2]] },
};
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _ax = new THREE.Vector3();
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
// Rotate a bone by `angle` around the root's axis, whatever the bone's own orientation is.
const rotateAround = (root, bone, axis, angle) => {
  bone.parent.updateWorldMatrix(true, false);
  root.getWorldQuaternion(_rq);
  bone.parent.getWorldQuaternion(_pq);
  _ax.copy(AXES[axis]).applyQuaternion(_rq).applyQuaternion(_pq.invert());
  bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, angle));
};

// Grip: how an object modelled along +Z (sword, tools) sits in the Wrist bone.
const GRIP = { pos: [0, 0.08, 0.02], rot: [-Math.PI / 2, 0, 0] };
// Bones carry the armature's x100 scale: attached objects are scaled back to metres.
const _ws = new THREE.Vector3();
const boneScale = (bone) => { bone.updateWorldMatrix(true, false); return bone.getWorldScale(_ws).x || 1; };
const attach = (bone, obj, pos = [0, 0, 0], rot = [0, 0, 0], s = 1) => {
  const k = 1 / boneScale(bone);
  const w = new THREE.Group();
  w.position.set(pos[0] * k, pos[1] * k, pos[2] * k); w.rotation.set(...rot); w.scale.setScalar(k * s);
  w.add(obj); bone.add(w);
  return w;
};
const SWORD_SCALE = 0.75; // block-model swords are long for these smaller hands
const grip = (bone, obj, s = 1) => attach(bone, obj, GRIP.pos, GRIP.rot, s);

/**
 * Builds a rigged character. opts: { tint, hide: [mesh names], weapon: "short"|"long"|null }
 * Returns a Group whose userData mimics the block human (prop, tools, sword) plus { rig, play, update, setOverride }.
 */
export function makeRig(id, opts = {}) {
  const src = lib[id];
  const g = new THREE.Group();
  const inst = cloneSkinned(src.scene);
  g.add(inst);
  const tint = TINTS[opts.tint] || opts.colors || {};
  inst.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    if ((opts.hide || []).some((h) => o.name.startsWith(h))) { o.visible = false; return; }
    const fix = (m) => (tint[m.name] ? tinted(m, tint[m.name]) : m);
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
  const bones = {};
  // GLTFLoader strips "." from node names (Wrist.R -> WristR): index bones by both spellings.
  inst.traverse((o) => { if (o.isBone) { bones[o.name] = o; bones[o.name.replace(/(L|R)$/, ".$1")] = o; } });
  const handR = bones["Wrist.R"], handL = bones["Wrist.L"];

  const mixer = new THREE.AnimationMixer(inst);
  const actions = {};
  let cur = null, curName = null, override = null;
  const act = (name) => {
    if (!actions[name] && src.clips[name]) actions[name] = mixer.clipAction(src.clips[name]);
    return actions[name];
  };
  // play(name, { once, fade, speed, restart, end })
  const play = (name, o = {}) => {
    const a = act(name) || act("Idle");
    if (!a) return;
    if (curName === name && !o.restart) { if (o.speed) a.timeScale = o.speed; return; }
    a.reset();
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.timeScale = o.speed || 1;
    if (o.end) a.time = a.getClip().duration;
    a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (cur && cur !== a) cur.crossFadeTo(a, o.fade ?? 0.18, false);
    cur = a; curName = name;
  };
  const duration = (name) => src.clips[name]?.duration || 1;
  const update = (dt) => {
    mixer.update(dt);
    inst.position.y = 0;
    if (override) {
      const ov = OVERRIDES[override];
      inst.position.y = ov.y;
      for (const [b, axis, angle] of ov.rot) if (bones[b]) rotateAround(g, bones[b], axis, angle);
    }
  };

  // Hand-held objects (same API as the block human: sword, tools, carried crate)
  let sword = null;
  if (opts.weapon && handR) sword = grip(handR, makeSword(opts.weapon === "long"), SWORD_SCALE);
  const tools = {};
  if (handR) ["ascia", "martello", "scopa", "pane", "acqua", "secchio"].forEach((t) => {
    const tool = makeTool(t);
    tool.position.set(0, 0, 0); tool.rotation.set(0, 0, 0);
    const w = grip(handR, tool); w.visible = false; tools[t] = w;
  });
  const prop = at(box(0.5, 0.4, 0.4, "#7a5434"), 0, 1.15, 0.45); prop.visible = false; g.add(prop);

  g.userData = {
    rig: true, kind: id, bones, handR, handL, sword, tools, tool: null, prop, play, update, duration,
    setOverride: (v) => { override = v || null; },
    get current() { return curName; },
  };
  play("Idle");
  update(0);
  return g;
}

// Player body: the Adventurer rig if it loaded, otherwise the block model.
export const makePlayerBody = (eq) => (hasRig("adventurer") ? makePlayerRig(eq) : makePlayerModel(eq));
// Animate any player body for one frame (menu preview).
export const animateIdle = (g, t, dt) => { if (g.userData.rig) { g.userData.play("Idle"); g.userData.update(dt); } else poseHuman(g, t, false, null); };

// Player body with the current equipment on the Adventurer rig.
export function makePlayerRig(eq) {
  const armor = eq.body && ITEMS[eq.body];
  const colors = armor ? { Green: armor.color, LightGreen: armor.color } : {};
  const g = makeRig("adventurer", { colors, weapon: (SWORD_TIER[eq.hand] || 0) >= 1 ? "long" : "short" });
  const u = g.userData;
  if (u.sword) u.sword.children[0].scale.setScalar(eq.hand === "pugnale" ? 0.6 : eq.hand === "spadone" ? 1.15 : 1);
  if (eq.head && u.bones.Head) {
    const helm = new THREE.Group();
    const c = ITEMS[eq.head].color;
    helm.add(at(box(0.27, 0.13, 0.29, c), 0, 0.25, 0.01), at(box(0.28, 0.16, 0.08, c), 0, 0.15, -0.11), at(box(0.06, 0.14, 0.24, c), 0.13, 0.16, 0), at(box(0.06, 0.14, 0.24, c), -0.13, 0.16, 0));
    if (eq.head !== "cappuccio") helm.add(at(box(0.2, 0.03, 0.02, "#1a1a1a"), 0, 0.19, 0.155));
    attach(u.bones.Head, helm);
  }
  if (eq.off && u.handL) {
    if (eq.off === "torcia") { const t = makeTorch(false); t.rotation.x = Math.PI / 2; grip(u.handL, t); }
    else { const sh = makeShield(ITEMS[eq.off].color); sh.rotation.set(0, Math.PI / 2, 0); attach(u.handL, sh, [-0.08, 0.1, 0]); }
  }
  return g;
}

// Which clip to use for each routine/fight mode of the old procedural poses.
const MODE_CLIP = {
  windup: "Sword_Slash", swing: "Sword_Slash", slash: "Sword_Slash", chop: "Sword_Slash", hammer: "Sword_Slash", train: "Sword_Slash",
  stagger: "HitRecieve", pump: "Interact", water: "Interact", sweep: "Interact", sell: "Interact", eat: "Interact", drink: "Interact",
  cheer: "Wave", panic: "Run", talk: "Idle_Neutral", read: "Idle_Neutral", look: "Idle", carry: "Idle", sit: "Idle", sleep: "Idle_Neutral",
};
// Drives an NPC rig from the AI output (r = { walk, mode, k }).
export function animateNpcRig(n, r, dt) {
  const u = n.mesh.userData;
  u.setOverride(r.mode === "sit" ? "sit" : null);
  if (r.mode === "windup" || r.mode === "swing") {
    if (r.mode === "windup" && u.current !== "Sword_Slash") u.play("Sword_Slash", { once: true, restart: true, fade: 0.1, speed: u.duration("Sword_Slash") / 0.9 });
  } else if (r.mode === "stagger") u.play("HitRecieve", { once: true });
  else if (r.walk) u.play(n.hostile || n.panic > 0 ? "Run" : "Walk");
  else if (r.mode && MODE_CLIP[r.mode]) u.play(MODE_CLIP[r.mode]);
  else u.play(n.hostile && n.fights ? "Idle_Sword" : "Idle");
  u.update(dt);
}
