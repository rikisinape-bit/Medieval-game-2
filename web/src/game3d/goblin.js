// The goblin (the user, 27/11: "deve comparire solo la notte, solo uno, e deve farlo vicino al bosco di ghiaccio per
// ora"). The user's model, rigged and animated by tools/goblin-glb.py (goblin.glb: idle, walk, run, attack, attack2,
// hit, death). One goblin at most, and only by night: as night falls it comes out by its lair, at the south-eastern
// edge of the forest under snow of the north-west (the map's white trees, ~290 m north-west of Roccanera), out of your
// sight; it prowls there, hunched. It sees well in the dark (22 m in front, 8 m all round; half as far if you sneak)
// and hears you run: it screeches and comes for you fast, swipes with one claw then the other (a wind-up you can read:
// dodge it or parry it, a perfect parry staggers it), reels when hit hard, circles you between blows; far from its
// lair it gives up and goes back. At dawn it leaves (once it is not fighting) and is gone till the next night; killed,
// it drops some gold and does not come back before the night after. Your wolf (wolves.js) fights it too, and it may
// turn on the wolf. Saved: S.flags.goblin { nights, killed }.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const EXT = import.meta.env.VITE_MODEL_EXT || "glb";
export const LAIR = [-230, -193];                 // map pixel 630, 515: the forest under snow, its edge towards Roccanera
const ROAM = 35, HP = 110, DMG = 12;
const SP = { walk: 1.1, run: 5.6 };
const ATK_T = 20 / 24, ATK_HIT = 0.5;             // a swipe's length, the moment the claw lands (tools/goblin-glb.py)
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);

async function loadModel() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (EXT === "js") {
    const { default: b64 } = await import(/* @vite-ignore */ new URL("models/goblin.js", document.baseURI).href);
    return loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
  }
  return loader.loadAsync("models/goblin.glb");
}

/**
 * ctx: { scene, S, P, floorY, place(x, z, ox, oz), zoneOf, way(n, gx, gz), ground(x, z), hurtPlayer(n), say, note,
 * float, burst, sfx, vAt, dropAt(item, x, z, qty), companion() (your wolf or null), hitWolf(w, dmg, by) }
 */
export function createGoblin(ctx) {
  const { scene, S, P } = ctx;
  const save = (S.flags.goblin ||= { nights: 0, killed: -1 });
  const g = {
    id: "goblin", name: "Goblin", role: "goblin", isGoblin: true, fights: true, alive: false, out: false, hostile: false,
    x: LAIR[0], z: LAIR[1], yaw: 0, hp: HP, hpMax: HP, dmg: DMG, cd: 0, stagger: 0, flash: 0, state: "idle",
    atk: false, at: 0, hitDone: false, side: 1, foe: null, foeT: 0, goal: null, goalT: 0, still: 0, lost: 0, head: null, fade: 0,
    mesh: null, mixer: null, acts: {}, cur: null,
  };
  let model = null, wasNight = S.night, hunt = false, screechT = 0, leaving = false;
  const ready = loadModel().then((m) => {
    model = m;
    const mesh = cloneSkinned(model.scene);
    const mats = new Map();
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (!mats.has(o.material)) { const c = o.material.clone(); if (c.map) c.map.colorSpace = THREE.SRGBColorSpace; c.roughness = 0.85; c.metalness = 0; c.side = THREE.FrontSide; mats.set(o.material, c); }
      o.material = mats.get(o.material);
    });
    g.mats = [...mats.values()];
    g.mesh = mesh; mesh.visible = false; scene.add(mesh);
    g.mixer = new THREE.AnimationMixer(mesh);
    for (const clip of model.animations) g.acts[clip.name] = g.mixer.clipAction(clip);
    play("idle", { fade: 0 });
  }).catch((e) => console.error("goblin:", e));
  function play(name, { fade = 0.2, ts = 1, once = false } = {}) {
    const a = g.acts[name];
    if (!a) return;
    a.timeScale = ts;
    if (g.cur === name && !once) return;
    a.reset(); a.enabled = true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.play();
    const prev = g.cur && g.acts[g.cur];
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    g.cur = name;
  }
  function moveTo(gx, gz, sp, dt, nav = false) {
    const hw = g.head || (g.head = { t: 0, x: g.x, z: g.z, gx, gz });
    if (Math.hypot(gx - hw.gx, gz - hw.gz) > 0.8) Object.assign(hw, { t: 0, x: g.x, z: g.z, gx, gz });
    if (g.lost > 0) { g.lost -= dt; nav = true; }
    const p = nav ? ctx.way(g, gx, gz) : null, tx = p ? p[0] : gx, tz = p ? p[1] : gz;
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const s = Math.min(d, sp * dt), ox = g.x, oz = g.z;
    g.yaw += angDiff(Math.atan2(dx, dz), g.yaw) * Math.min(1, dt * 7);
    [g.x, g.z] = ctx.place(g.x + (dx / d) * s, g.z + (dz / d) * s, ox, oz);
    hw.t += dt;
    if (hw.t > 1.4) { if (Math.hypot(g.x - hw.x, g.z - hw.z) < 0.25 * sp) g.lost = 10; Object.assign(hw, { t: 0, x: g.x, z: g.z }); }
    return Math.hypot(g.x - ox, g.z - oz) / Math.max(dt, 1e-4);
  }
  const face = (x, z, dt, r = 8) => { g.yaw += angDiff(Math.atan2(x - g.x, z - g.z), g.yaw) * Math.min(1, dt * r); };
  const gait = (v) => (v < 0.15 ? play("idle", { fade: 0.3 }) : v < 2.5 ? play("walk", { ts: Math.max(0.6, v / SP.walk) * 0.9, fade: 0.25 }) : play("run", { ts: Math.min(1.4, Math.max(0.7, v / SP.run)), fade: 0.2 }));

  // ---- out at nightfall (once a night, not on a night it was killed), at a spot by its lair you do not see
  function emerge() {
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 22, x = LAIR[0] + Math.sin(a) * r, z = LAIR[1] + Math.cos(a) * r;
      if (!ctx.ground(x, z)) continue;
      const d = Math.hypot(x - P.x, z - P.z), seen = d < 45 && Math.abs(angDiff(Math.atan2(x - P.x, z - P.z), P.yaw)) < 0.9;
      if (d < 14 || (seen && k < 12)) continue;
      Object.assign(g, { x, z, yaw: Math.random() * 6.28, alive: true, out: true, hp: HP, hostile: false, atk: false, stagger: 0, foe: null, goal: null, fade: 0 });
      hunt = false; leaving = false; g.mesh.visible = true; play("idle", { fade: 0 });
      return;
    }
  }
  function vanish() { Object.assign(g, { out: false, alive: false, hostile: false, atk: false }); hunt = false; leaving = false; if (g.mesh) g.mesh.visible = false; }

  function notices(d) {
    if (P.hp <= 0) return false;
    const range = 22 * (P.sneak ? 0.5 : 1);
    if (d > range) return false;
    if (d < (P.sneak ? 3.5 : 8) || (P.running && d < 16)) return true;
    return Math.abs(angDiff(Math.atan2(P.x - g.x, P.z - g.z), g.yaw)) < 1.3;
  }
  // a fight: up to it, a swipe (one claw, then the other) when close and ready, round it between swipes
  function fight(T, onPlayer, dt) {
    const dx = T.x - g.x, dz = T.z - g.z, d = Math.hypot(dx, dz);
    if (g.atk) {
      g.at += dt; face(T.x, T.z, dt, g.at < ATK_T * ATK_HIT ? 6 : 2);
      if (g.at > ATK_T * 0.42 && g.at < ATK_T * 0.6) [g.x, g.z] = ctx.place(g.x + Math.sin(g.yaw) * 1.8 * dt, g.z + Math.cos(g.yaw) * 1.8 * dt, g.x, g.z);   // (the lunge)
      if (!g.hitDone && g.at >= ATK_T * ATK_HIT) {
        g.hitDone = true; ctx.sfx.swing(ctx.vAt(g.x, g.z) * 0.9);
        if (d < 2.2 && Math.abs(angDiff(Math.atan2(dx, dz), g.yaw)) < 1.0) { if (onPlayer) ctx.hurtPlayer(g); else ctx.hitWolf(T, Math.round(g.dmg * 0.9), g); }
      }
      if (g.at >= ATK_T) { g.atk = false; g.state = "idle"; }
      return;
    }
    if (g.stagger > 0) { face(T.x, T.z, dt, 3); play("hit", { once: true, fade: 0.1 }); return; }
    if (d > 1.9) gait(moveTo(T.x - (dx / (d || 1)) * 1.2, T.z - (dz / (d || 1)) * 1.2, d > 5 ? SP.run : 3, dt, d > 3));
    else if (g.cd <= 0) {
      g.atk = true; g.at = 0; g.hitDone = false; g.state = "windup"; g.cd = rnd(1.2, 2.1); g.side = -g.side;
      play(g.side > 0 ? "attack" : "attack2", { once: true, fade: 0.1 }); ctx.sfx.hiss(ctx.vAt(g.x, g.z));
    } else {                                                              // round it, facing it
      const a = Math.atan2(g.x - T.x, g.z - T.z) + 1.1 * dt * g.side;
      const v = moveTo(T.x + Math.sin(a) * 1.8, T.z + Math.cos(a) * 1.8, 1.8, dt);
      face(T.x, T.z, dt, 10); gait(v);
    }
  }
  function prowl(dt) {
    if (!g.goal || (g.goalT -= dt) <= 0 || Math.hypot(g.goal[0] - g.x, g.goal[1] - g.z) < 1.2) {
      if (g.goal && Math.hypot(g.goal[0] - g.x, g.goal[1] - g.z) < 1.2 && (g.still += dt) < 4) { gait(0); return; }
      g.still = 0; g.goalT = rnd(12, 25);
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ROAM, x = LAIR[0] + Math.sin(a) * r, z = LAIR[1] + Math.cos(a) * r;
        if (ctx.ground(x, z)) { g.goal = [x, z]; break; }
      }
      if (!g.goal) g.goal = [LAIR[0], LAIR[1]];
    }
    gait(moveTo(g.goal[0], g.goal[1], SP.walk, dt, true));
  }

  /** a blow on it: yours, or your wolf's (by) */
  function hit(dmg, by = null) {
    if (!g.alive) return;
    g.hp -= dmg; g.flash = 0.15;
    ctx.burst(g.x, ctx.floorY(g.x, g.z) + 0.9, g.z, "#4a6a1a", 10, 3);
    if (!by) ctx.float(`-${dmg}`, "#f0c050");
    if (by) { g.foe = by; g.foeT = rnd(4, 8); }
    if (!hunt) { hunt = true; g.hostile = true; }
    if (g.hp <= 0) {
      Object.assign(g, { alive: false, hostile: false, atk: false }); hunt = false; save.killed = save.nights;
      play("death", { once: true, fade: 0.15 }); ctx.sfx.scream(ctx.vAt(g.x, g.z), 520, 0.8, true);
      ctx.say("Il goblin crolla a terra con uno stridio.");
      ctx.dropAt("oro", g.x + 0.5, g.z + 0.3, 15 + Math.floor(Math.random() * 16));
      return;
    }
    if (dmg >= 14 && !g.atk) { g.stagger = 0.4; }                       // (a heavy blow: it reels)
    ctx.sfx.hiss(ctx.vAt(g.x, g.z) * 0.6);
  }

  let deadT = 0;
  function update(dt, seeFar) {
    if (!g.mesh) return;
    // the nights: counted at nightfall; out then (if not killed this night); at dawn it leaves
    if (S.night && !wasNight) { save.nights += 1; if (!g.out && save.killed < save.nights) emerge(); }
    if (S.night && !g.out && !deadT && save.killed < save.nights && model) emerge();   // (a night already begun: a game loaded by night)
    wasNight = S.night;
    if (!g.out && !deadT) return;
    g.cd -= dt; g.stagger -= dt; g.foeT -= dt; screechT -= dt;
    if (!g.alive) {                                                      // dead: it lies there till day
      deadT += dt; g.mixer.update(dt);
      g.mesh.position.set(g.x, ctx.floorY(g.x, g.z), g.z); g.mesh.rotation.y = g.yaw;
      if (!S.night && deadT > 30) { deadT = 0; vanish(); }
      return;
    }
    deadT = 0;
    const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz), same = ctx.zoneOf(g.x, g.z) === ctx.zoneOf(P.x, P.z);
    if (!S.night && !hunt) leaving = true;
    if (leaving) {                                                       // dawn: back into the wood, gone once out of sight
      gait(moveTo(LAIR[0], LAIR[1], SP.walk * 2, dt, true));
      if (d > 40 || Math.hypot(g.x - LAIR[0], g.z - LAIR[1]) < 2) { vanish(); return; }
    } else {
      if (!hunt && same && notices(d)) {
        hunt = true; g.hostile = true;
        if (screechT <= 0) { ctx.sfx.screech(ctx.vAt(g.x, g.z) || 0.4); screechT = 20; ctx.say("Uno stridio nel buio: un goblin ti ha visto!"); }
      }
      if (hunt && (!same || d > 35 || Math.hypot(P.x - LAIR[0], P.z - LAIR[1]) > ROAM + 70 || P.hp <= 0)) { hunt = false; g.hostile = false; g.atk = false; g.goal = null; }
      if (hunt) {
        const w = ctx.companion();
        const onWolf = g.foe && g.foeT > 0 && w && g.foe === w && w.down <= 0 && ctx.zoneOf(w.x, w.z) === ctx.zoneOf(g.x, g.z);
        fight(onWolf ? w : P, !onWolf, dt);
      } else prowl(dt);
    }
    g.mesh.visible = same && d < seeFar;
    g.mesh.position.set(g.x, ctx.floorY(g.x, g.z), g.z); g.mesh.rotation.y = g.yaw;
    if (g.mesh.visible) g.mixer.update(dt);
    if (g.flash > 0 !== !!g.lit) { g.lit = g.flash > 0; g.mats.forEach((m) => m.emissive.set(g.lit ? "#661010" : "#000000")); }
    g.flash -= dt;
  }

  return {
    ready, update, hit, g,
    /** it, if your blows can reach it */
    targets: () => (g.alive && g.out && g.mesh ? [g] : []),
    foe: () => (g.alive && g.hostile ? g : null),
    hunting: (r = 14) => g.alive && hunt && Math.hypot(g.x - P.x, g.z - P.z) < r,
    /** your wolf's foes: it, when it is out and after you */
    foes: () => (g.alive && g.out && hunt ? [g] : []),
    calm() { hunt = false; g.hostile = false; g.atk = false; },
    /** (tests) out now, near (x, z) */
    summon(x, z) { if (!g.mesh) return; save.killed = -1; Object.assign(g, { x, z, alive: true, out: true, hp: HP, hostile: false, atk: false, foe: null, goal: null }); hunt = false; leaving = false; g.mesh.visible = true; deadT = 0; },
  };
}
