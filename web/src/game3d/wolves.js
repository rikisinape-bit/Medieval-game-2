// The wolves (the user, 27/11: "metti 2 o 3 lupi in branco che se ti vedono ti attaccano, solo uno di questi quando sta
// per essere sconfitto si abbassa e se hai una coscia di maiale con te puoi addomesticarlo e ti segue ovunque e
// combatte con te i tuoi nemici. Se lo guardi puoi dargli degli ordini: resta qui, seguimi").
// A pack of three roams the great forest round its den, south of Roccanera. Whoever comes in sight (nearer by night,
// much nearer sneaking; running is heard) is hunted by all three: they come round you and bite in turns, circling
// between bites; far from their den they give up and go back. One of them (which one, you see only then) does not
// fight to the death: about to be beaten it crouches to the ground (lupo.glb "submit": belly low, ears back, tail
// tucked) and no longer fights; hit again it yelps and runs to the den, where it waits crouched. With a pork leg
// (the ham, prosciutto: the user's model, sold by every merchant) you can give it to it: it eats and it is yours. Then it follows you
// everywhere (into the castle and the mine too, running beside your horse), bites whoever fights you (they may turn
// on it), falls when beaten and gets up again after a while; looked at, it takes an order (dialogs.js "lupo"): stay
// here (it sits where it is, defending only itself) or follow me. Saved in S.flags.lupi.
// The model: the user's wolf, lupo.glb (tools/lupo-glb.py: idle, idle2 sitting, running, sniffing, fallen, submit, bite).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const EXT = import.meta.env.VITE_MODEL_EXT || "glb";
export const DEN = [-30, 377];                    // the den: the thick of the great forest south of Roccanera (map 830, 1085)
const ROAM = 70;                                  // how far from it the pack wanders
const PACK = [{ id: "lupo1", off: [-1.8, 0.9] }, { id: "lupo2", off: [1.5, 1.3], yields: true }, { id: "lupo3", off: [0.3, -1.7] }];
const WILD = { hp: 60, dmg: 8 }, TAME = { hp: 90, dmg: 14 };
const SP = { walk: 1.3, trot: 3.4, run: 7.4 };
const BITE_T = 17 / 24, BITE_HIT = 9 / 24;        // the bite: its length, the moment it closes (lupo.glb "bite")
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);

async function loadModel() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (EXT === "js") {
    const { default: b64 } = await import(/* @vite-ignore */ new URL("models/lupo.js", document.baseURI).href);
    return loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
  }
  return loader.loadAsync("models/lupo.glb");
}

/**
 * ctx: { scene, S, P, floorY(x, z), place(x, z, ox, oz) -> [x, z] (kept out of walls, in the rooms and tunnels),
 * zoneOf(x, z), way(n, gx, gz) (nav: the next point round obstacles, or null), ground(x, z) (dry, walkable),
 * hurtPlayer(n), enemies() (hostile fighters near: NPCs), biteNpc(n, dmg, wolf), say, note, float(text, colour),
 * burst(x, y, z, colour, n, speed), sfx, vAt(x, z) (how loud there), dropAt(item, x, z), seeFar() }
 */
export function createWolves(ctx) {
  const { scene, S, P } = ctx;
  const save = (S.flags.lupi ||= { dead: {}, sub: false, tame: null, stay: false, at: null, hp: null });
  let model = null;
  const wolves = PACK.filter((p) => !save.dead[p.id]).map((p, i) => ({
    id: p.id, name: "Lupo", role: "lupo", isWolf: true, yields: !!p.yields, off: p.off, ring: (i / PACK.length) * Math.PI * 2,
    x: DEN[0] + p.off[0] * 3, z: DEN[1] + p.off[1] * 3, yaw: i * 2.1, hurtT: 0,
    hp: WILD.hp, hpMax: WILD.hp, dmg: WILD.dmg, alive: true, hostile: false, fights: true,
    cd: 0, stagger: 0, flash: 0, state: "idle", biting: false, bt: 0, bitHit: false, sub: false, flee: false, tame: false,
    foe: null, foeT: 0, target: null, down: 0, eating: 0, still: 0, lost: 0, head: null, mesh: null, mixer: null, acts: {}, cur: null,
  }));
  // the one that gave in (saved): crouched at the den; the tamed one: beside you (or where it was told to stay)
  for (const w of wolves) {
    if (save.tame === w.id) {
      Object.assign(w, { tame: true, yields: false, hpMax: TAME.hp, hp: save.hp ?? TAME.hp, dmg: TAME.dmg, name: "Il tuo lupo" });
      const at = save.stay && save.at ? save.at : [P.x - Math.sin(P.yaw) * 2.5, P.z - Math.cos(P.yaw) * 2.5];
      w.x = at[0]; w.z = at[1];
    } else if (save.sub && w.yields) Object.assign(w, { sub: true, x: DEN[0] + 1, z: DEN[1] + 1, hp: Math.round(WILD.hp * 0.3) });
  }
  const pack = { hunt: false, goal: [DEN[0], DEN[1]], goalT: 0, howlT: 0 };
  const tamed = () => wolves.find((w) => w.tame && w.alive) || null;

  // ---- the model, one copy each (its own material: it flashes when hit)
  const ready = loadModel().then((g) => {
    model = g;
    for (const w of wolves) addMesh(w);
  }).catch((e) => console.error("lupo:", e));
  function addMesh(w) {
    const m = cloneSkinned(model.scene);
    const mats = new Map();
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (!mats.has(o.material)) { const c = o.material.clone(); if (c.map) c.map.colorSpace = THREE.SRGBColorSpace; c.roughness = 0.9; c.metalness = 0; mats.set(o.material, c); }
      o.material = mats.get(o.material);
    });
    m.scale.setScalar(1.05);
    w.mats = [...mats.values()];
    w.mesh = m; scene.add(m);
    w.mixer = new THREE.AnimationMixer(m);
    for (const clip of model.animations) w.acts[clip.name] = w.mixer.clipAction(clip);
    play(w, w.sub ? "submit" : "idle", { fade: 0 });
  }
  function play(w, name, { fade = 0.25, ts = 1, once = false } = {}) {
    const a = w.acts[name];
    if (!a) return;
    a.timeScale = ts;
    if (w.cur === name && !once) return;
    a.reset(); a.enabled = true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.play();
    const prev = w.cur && w.acts[w.cur];
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    w.cur = name;
  }

  // ---- moving: straight on, round what is in front when it makes no headway (nav), kept out of walls
  function moveTo(w, gx, gz, sp, dt, nav = false) {
    const hw = w.head || (w.head = { t: 0, x: w.x, z: w.z, gx, gz });
    if (Math.hypot(gx - hw.gx, gz - hw.gz) > 0.8) Object.assign(hw, { t: 0, x: w.x, z: w.z, gx, gz });
    if (w.lost > 0) { w.lost -= dt; nav = true; }
    const p = nav ? ctx.way(w, gx, gz) : null, tx = p ? p[0] : gx, tz = p ? p[1] : gz;
    const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const s = Math.min(d, sp * dt), ox = w.x, oz = w.z;
    w.yaw += angDiff(Math.atan2(dx, dz), w.yaw) * Math.min(1, dt * 7);
    [w.x, w.z] = ctx.place(w.x + (dx / d) * s, w.z + (dz / d) * s, ox, oz);
    hw.t += dt;
    if (hw.t > 1.4) { if (Math.hypot(w.x - hw.x, w.z - hw.z) < 0.25 * sp) w.lost = 10; Object.assign(hw, { t: 0, x: w.x, z: w.z }); }
    return Math.hypot(w.x - ox, w.z - oz) / Math.max(dt, 1e-4);
  }
  const face = (w, x, z, dt, r = 8) => { w.yaw += angDiff(Math.atan2(x - w.x, z - w.z), w.yaw) * Math.min(1, dt * r); };
  // the gait for a speed: sniffing along slowly, running (its stride quicker or slower with the speed)
  function gait(w, v) {
    if (v < 0.15) play(w, w.sit ? "idle2" : "idle", { fade: 0.35 });
    else if (v < 2.4) play(w, "sniffing", { ts: Math.max(0.6, v / 1.3) * 0.9, fade: 0.3 });
    else play(w, "running", { ts: Math.min(1.5, Math.max(0.55, v / SP.run)), fade: 0.25 });
  }

  // ---- what a wild wolf notices: you in front of it (nearer at night, much nearer if you sneak), close by whatever
  // way it faces (it smells), your running
  function notices(w, d) {
    if (P.hp <= 0) return false;
    const range = (S.night ? 15 : 24) * (P.sneak ? 0.5 : 1) * (P.mounted ? 1.25 : 1);
    if (d > range) return false;
    if (d < (P.sneak ? 4 : 9) || (P.running && d < 18)) return true;
    return Math.abs(angDiff(Math.atan2(P.x - w.x, P.z - w.z), w.yaw)) < 1.2;
  }
  function startHunt() {
    if (pack.hunt) return;
    pack.hunt = true;
    if (pack.howlT <= 0) { ctx.sfx.howl(Math.max(0.35, ctx.vAt(DEN[0], DEN[1]) || 0.5)); pack.howlT = 30; ctx.say("Un branco di lupi ti ha fiutato!"); }
  }

  // ---- a fight: round the target (each wolf its own side), a bite when close and ready, circling between bites
  function fight(w, T, dt, onPlayer) {
    const dx = T.x - w.x, dz = T.z - w.z, d = Math.hypot(dx, dz);
    if (w.biting) {
      w.bt += dt; face(w, T.x, T.z, dt, 10);
      if (w.bt > 0.2 && w.bt < 0.45) [w.x, w.z] = ctx.place(w.x + Math.sin(w.yaw) * 2.2 * dt, w.z + Math.cos(w.yaw) * 2.2 * dt, w.x, w.z);   // (the lunge)
      if (!w.bitHit && w.bt >= BITE_HIT) {
        w.bitHit = true;
        if (d < 2.3 && Math.abs(angDiff(Math.atan2(dx, dz), w.yaw)) < 0.9) { ctx.sfx.bite(ctx.vAt(w.x, w.z)); if (onPlayer) ctx.hurtPlayer(w); else bite(w, T); }
      }
      if (w.bt >= BITE_T) w.biting = false;
      return;
    }
    if (w.stagger > 0) { const v = moveTo(w, w.x - (dx / (d || 1)) * 2, w.z - (dz / (d || 1)) * 2, 1.2, dt); gait(w, v); face(w, T.x, T.z, dt); return; }
    if (d > 1.9) {
      let a = Math.atan2(w.x - T.x, w.z - T.z); a += angDiff(w.ring, a) * 0.3;   // (from its side, drawn round to its own)
      const r = 1.3;
      gait(w, moveTo(w, T.x + Math.sin(a) * r, T.z + Math.cos(a) * r, d > 6 ? (w.tame && P.mounted ? 12 : SP.run) : SP.trot, dt, d > 3));
    } else if (w.cd <= 0) {
      w.biting = true; w.bt = 0; w.bitHit = false; w.cd = rnd(1.3, 2.4);
      play(w, "bite", { once: true, fade: 0.1 }); ctx.sfx.growl(ctx.vAt(w.x, w.z) * 0.8);
    } else {                                                            // round it, facing it
      const a = Math.atan2(w.x - T.x, w.z - T.z) + (w.ring > Math.PI ? 1 : -1) * 0.9 * dt * 2;
      const v = moveTo(w, T.x + Math.sin(a) * 1.7, T.z + Math.cos(a) * 1.7, 2.2, dt);
      face(w, T.x, T.z, dt, 10); gait(w, v);
    }
  }
  // the tamed wolf's bite on whoever it fights (it may turn on it for a while)
  function bite(w, T) {
    if (T.isWolf) { hit(T, w.dmg, w); return; }
    ctx.biteNpc(T, w.dmg, w);
    if (T.alive) { T.foe = w; T.foeT = rnd(4, 8); }
  }

  // ---- a blow on a wolf (yours, or another wolf's): the one that yields crouches instead of dying
  function hit(w, dmg, by = null) {
    if (!w.alive || w.down > 0) return;
    if (w.sub) {                                                          // it gave in: hit again, it runs to its den
      ctx.sfx.yelp(ctx.vAt(w.x, w.z)); w.flee = true; play(w, "running", { ts: 1.3 });
      ctx.note("Il lupo guaisce e scappa verso la sua tana."); return;
    }
    w.hp -= dmg; w.flash = 0.15; w.stagger = Math.max(w.stagger, 0.25); w.hurtT = 6;
    ctx.burst(w.x, ctx.floorY(w.x, w.z) + 0.55, w.z, "#a01818", 10, 3);
    if (!by) ctx.float(`-${dmg}`, "#f0c050");
    if (by && !w.tame) { w.foe = by; w.foeT = rnd(4, 8); }
    if (!w.tame && !pack.hunt) startHunt();
    if (w.tame) { if (w.hp <= 0) { w.hp = 0; w.down = 25; w.biting = false; play(w, "fallen", { once: true, fade: 0.35 }); ctx.sfx.yelp(ctx.vAt(w.x, w.z)); ctx.say("Il tuo lupo è a terra! Si rialzerà tra poco."); } return; }
    if (w.yields && w.hp <= w.hpMax * 0.35) {                            // about to be beaten: it gives in
      w.hp = Math.max(1, w.hp); w.sub = true; w.biting = false; w.hostile = false; save.sub = true;
      play(w, "submit", { fade: 0.4 }); ctx.sfx.whine(ctx.vAt(w.x, w.z));
      ctx.say(`Un lupo si accuccia a terra, le orecchie basse: si arrende.${P.inv.prosciutto ? " Hai un prosciutto..." : ""}`);
      return;
    }
    if (w.hp <= 0) {
      w.alive = false; w.hostile = false; w.biting = false; save.dead[w.id] = true;
      play(w, "fallen", { once: true, fade: 0.35 }); ctx.sfx.yelp(ctx.vAt(w.x, w.z) * 0.8);
      ctx.note("Un lupo cade a terra.");
      if (Math.random() < 0.7) ctx.dropAt("pelliccia", w.x + 0.4, w.z + 0.3);
    } else ctx.sfx.growl(ctx.vAt(w.x, w.z) * 0.6);
  }

  // ---- a wild wolf: the pack wandering round the den, or the hunt
  function wild(w, dt) {
    const dx = P.x - w.x, dz = P.z - w.z, d = Math.hypot(dx, dz), same = ctx.zoneOf(w.x, w.z) === ctx.zoneOf(P.x, P.z);
    if (w.sub) {                                                          // it gave in
      if (w.flee) {
        gait(w, moveTo(w, DEN[0] + 1, DEN[1] + 1, SP.run, dt, true));
        if (Math.hypot(w.x - DEN[0] - 1, w.z - DEN[1] - 1) < 1.5) { w.flee = false; play(w, "submit", { fade: 0.4 }); }
        return;
      }
      play(w, "submit", { fade: 0.4 });
      if (same && d < 14) face(w, P.x, P.z, dt, 2);
      if ((w.whineT = (w.whineT || 0) - dt) <= 0 && same && d < 12) { ctx.sfx.whine(ctx.vAt(w.x, w.z) * 0.7); w.whineT = rnd(3, 6); }
      return;
    }
    if (!pack.hunt && same && notices(w, d)) startHunt();
    w.hostile = pack.hunt;
    if (pack.hunt) {
      const comp = tamed();
      const onComp = w.foe && w.foeT > 0 && comp && comp === w.foe && comp.down <= 0 && ctx.zoneOf(comp.x, comp.z) === ctx.zoneOf(w.x, w.z);
      fight(w, onComp ? comp : P, dt, !onComp);
      return;
    }
    // wandering: the pack's goal (a spot of dry ground round the den), each wolf beside it; a rest there
    const gx = pack.goal[0] + w.off[0] * 2, gz = pack.goal[1] + w.off[1] * 2, gd = Math.hypot(gx - w.x, gz - w.z);
    w.sit = false;
    if (gd > 1.2) gait(w, moveTo(w, gx, gz, gd > 20 ? SP.trot : SP.walk, dt));
    else { w.still += dt; w.sit = w.still > 9; gait(w, 0); if (w.still < 0.5) w.yaw += angDiff(Math.atan2(pack.goal[0] - DEN[0], pack.goal[1] - DEN[1]) + w.ring, w.yaw) * dt; }
    if (gd > 1.2) w.still = 0;
  }
  function packGoal(dt) {
    if ((pack.goalT -= dt) > 0) return;
    pack.goalT = rnd(22, 40);
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ROAM, x = DEN[0] + Math.sin(a) * r, z = DEN[1] + Math.cos(a) * r;
      if (ctx.ground(x, z)) { pack.goal = [x, z]; return; }
    }
    pack.goal = [DEN[0], DEN[1]];
  }
  // the hunt ends: you far from their den or out of reach, or knocked out
  function huntOver() {
    if (!pack.hunt) return;
    const alive = wolves.filter((w) => w.alive && !w.tame && !w.sub);
    if (!alive.length) { pack.hunt = false; return; }
    const far = alive.every((w) => Math.hypot(P.x - w.x, P.z - w.z) > 40 || ctx.zoneOf(w.x, w.z) !== ctx.zoneOf(P.x, P.z)) || Math.hypot(P.x - DEN[0], P.z - DEN[1]) > ROAM + 50;
    if (far) { pack.hunt = false; pack.goal = [DEN[0], DEN[1]]; pack.goalT = rnd(20, 30); alive.forEach((w) => { w.foe = null; w.biting = false; }); }
  }

  // ---- the tamed wolf
  function enemyOf(w) {
    const stay = save.stay, list = [];
    for (const n of ctx.enemies()) list.push(n);
    for (const o of wolves) if (o !== w && o.alive && !o.tame && !o.sub && pack.hunt) list.push(o);
    let best = null, bd = Infinity;
    for (const n of list) {
      if (ctx.zoneOf(n.x, n.z) !== ctx.zoneOf(w.x, w.z)) continue;
      const dw = Math.hypot(n.x - w.x, n.z - w.z), dp = Math.hypot(n.x - P.x, n.z - P.z);
      if (stay ? dw > 7 : dp > 14 || dw > 26) continue;
      const score = dw - (n === w.target ? 3 : 0);
      if (score < bd) { bd = score; best = n; }
    }
    return best;
  }
  function companion(w, dt) {
    if (w.down > 0) {                                                     // beaten: on the ground for a while
      w.down -= dt; play(w, "fallen", { once: true, fade: 0.35 });
      if (w.down <= 0) { w.hp = Math.round(w.hpMax * 0.5); play(w, "idle", { fade: 0.4 }); ctx.note("Il tuo lupo si rialza."); }
      return;
    }
    if (w.eating > 0) { w.eating -= dt; play(w, "sniffing", { ts: 0.7 }); return; }
    const dP = Math.hypot(P.x - w.x, P.z - w.z), zone = ctx.zoneOf(P.x, P.z);
    if (!save.stay && (ctx.zoneOf(w.x, w.z) !== zone || dP > 70)) {     // left far behind, or you went in somewhere: beside you
      // (behind you, else at your side, else in front: the first spot a wall does not take away)
      const f = [Math.sin(P.yaw), Math.cos(P.yaw)], r = [Math.cos(P.yaw), -Math.sin(P.yaw)];
      let best = null;
      for (const [a, b] of [[-2.2, 0.8], [0, 1.6], [0, -1.6], [1.8, 0.9]]) {
        const [x, z] = ctx.place(P.x + f[0] * a + r[0] * b, P.z + f[1] * a + r[1] * b, P.x, P.z);
        if (Math.hypot(x - P.x, z - P.z) > 1.1) { best = [x, z]; break; }
      }
      [w.x, w.z] = best || ctx.place(P.x + r[0] * 0.9, P.z + r[1] * 0.9, P.x, P.z); w.yaw = P.yaw; w.head = null; w.nav = null; w.target = null;
    }
    const e = enemyOf(w);
    w.target = e;
    if (e) { w.sit = false; fight(w, e, dt, false); return; }
    w.biting = false;
    if (w.hurtT <= 0) w.hp = Math.min(w.hpMax, w.hp + 2 * dt);          // (its wounds heal, out of a fight)
    if (save.stay) {                                                      // where it was told to stay: sitting
      const [sx, sz] = save.at || [w.x, w.z], ds = Math.hypot(sx - w.x, sz - w.z);
      if (ds > 1) { w.sit = false; gait(w, moveTo(w, sx, sz, ds > 6 ? SP.run : SP.trot, dt, true)); }
      else { w.sit = true; gait(w, 0); if (dP < 25) face(w, P.x, P.z, dt, 1.5); }
      return;
    }
    // following: a little behind you, at your pace (running beside your horse)
    const bx = P.x - Math.sin(P.yaw) * 2.2 + Math.cos(P.yaw) * 1.0, bz = P.z - Math.cos(P.yaw) * 2.2 - Math.sin(P.yaw) * 1.0;
    const db = Math.hypot(bx - w.x, bz - w.z);
    const watched = dP < 5 && Math.abs(angDiff(Math.atan2(w.x - P.x, w.z - P.z), P.yaw)) < 0.6;   // (you look at it: it waits for an order)
    if (!watched && (dP > 3.4 || (db > 2.5 && (P.running || P.mounted)))) {
      const sp = dP > 14 ? (P.mounted ? 13 : SP.run + 1) : dP > 6 ? (P.mounted ? 11 : SP.run) : P.running ? SP.run : P.mounted ? 9 : SP.trot;
      w.sit = false; w.still = 0; gait(w, moveTo(w, bx, bz, sp, dt, dP > 5));
    } else { w.still += dt; w.sit = w.still > 6; gait(w, 0); face(w, P.x, P.z, dt, 2); }
  }

  // ---- every frame
  let saveT = 0;
  function update(dt, seeFar) {
    if (!model) return;
    pack.howlT -= dt;
    packGoal(dt);
    huntOver();
    for (const w of wolves) {
      if (!w.mesh) continue;
      w.cd -= dt; w.stagger -= dt; w.foeT -= dt; w.hurtT -= dt;
      if (w.alive) {
        if (w.tame) companion(w, dt); else wild(w, dt);
      }
      const shown = ctx.zoneOf(w.x, w.z) === ctx.zoneOf(P.x, P.z) && Math.hypot(w.x - P.x, w.z - P.z) < seeFar;
      w.mesh.visible = shown;
      w.mesh.position.set(w.x, ctx.floorY(w.x, w.z), w.z); w.mesh.rotation.y = w.yaw;
      if (shown || w.tame) w.mixer.update(dt);
      if (w.flash > 0 !== !!w.lit) { w.lit = w.flash > 0; w.mats.forEach((m) => m.emissive.set(w.lit ? "#661010" : "#000000")); }
      w.flash -= dt;
    }
    if ((saveT -= dt) <= 0) {                                             // (where the tamed one is, for the saved game)
      saveT = 1;
      const t = tamed();
      if (t) { save.hp = Math.round(t.hp); if (save.stay && !save.at) save.at = [+t.x.toFixed(2), +t.z.toFixed(2)]; }
    }
  }

  return {
    ready,
    update,
    /** the wolves your blows can reach (not yours) */
    targets: () => wolves.filter((w) => w.alive && !w.tame && w.mesh),
    hit: (w, dmg, by = null) => hit(w, dmg, by),
    /** the nearest wolf fighting you (the HUD's bar) */
    foe: () => wolves.filter((w) => w.alive && w.hostile && !w.sub && !w.tame).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0] || null,
    hunting: (r = 14) => pack.hunt && wolves.some((w) => w.alive && !w.tame && !w.sub && Math.hypot(w.x - P.x, w.z - P.z) < r),
    /** what you can do with a wolf near you: give the one that gave in a ham; give yours an order. (w < 0: it goes
     *  before a thing on the ground beside it, e.g. a pelt of the pack) */
    candidate(near) {
      for (const w of wolves) {
        if (!w.alive || !w.mesh || ctx.zoneOf(w.x, w.z) !== ctx.zoneOf(P.x, P.z)) continue;
        if (w.sub && !w.flee && near(w.x, w.z, 2.8)) return { kind: "lupo", id: w.id, x: w.x, z: w.z, w: -1.5, label: P.inv.prosciutto ? "Dai il prosciutto al lupo" : "Lupo arreso (vuole un prosciutto)" };
        if (w.tame && w.down <= 0 && w.eating <= 0 && near(w.x, w.z, 3.2)) return { kind: "lupo", id: "ordini", x: w.x, z: w.z, w: -1.5, label: "Dai un ordine al lupo" };
      }
      return null;
    },
    /** true: open its dialog of orders */
    interact(c, take) {
      if (c.id === "ordini") return true;
      const w = wolves.find((o) => o.id === c.id);
      if (!w || !w.sub) return false;
      if (!P.inv.prosciutto) { ctx.note("Il lupo ha fame e paura: con un prosciutto potresti conquistarlo. Lo vendono tutti i mercanti, anche Lena al mercato di Roccanera."); return false; }
      take("prosciutto");
      Object.assign(w, { sub: false, tame: true, yields: false, hostile: false, eating: 2.6, hpMax: TAME.hp, hp: TAME.hp * 0.6, dmg: TAME.dmg, name: "Il tuo lupo", target: null, foe: null });
      Object.assign(save, { sub: false, tame: w.id, stay: false, at: null, hp: w.hp });
      ctx.say("Il lupo divora il prosciutto e ti annusa la mano: ora è con te. Guardalo e premi Usa per dargli un ordine.");
      return false;
    },
    /** an order (dialogs.js): stay (where it is now) or follow */
    order(stay) {
      const w = tamed();
      save.stay = !!stay; save.at = w && stay ? [+w.x.toFixed(2), +w.z.toFixed(2)] : null;
      if (w) { w.target = null; w.still = 0; }
    },
    /** you knocked out: the pack lets you be */
    calm() { pack.hunt = false; wolves.forEach((w) => { w.biting = false; w.foe = null; }); },
    tamed,
    all: wolves,
  };
}
