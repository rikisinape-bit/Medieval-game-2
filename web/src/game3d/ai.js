import { angDiff, zoneOf } from "./world";

// Attack styles (poseHuman): overhead chop, horizontal cut, lunge, rising backhand. Each NPC blow picks one.
const ATTACKS = ["over", "side", "thrust", "rise"];
// Whoever has decided to stop the player keeps at it to the end: it gives up only when the player has got this far
// away (metres). Then it goes back to its place and heals slowly (engine).
export const GIVE_UP = 35;
export const FIGHT = {
  knight: { block: 0.35, sp: 3.4, wind: 0.5 }, soldier: { block: 0.25, sp: 3.0, wind: 0.6 },
  smith: { block: 0.15, sp: 2.9, wind: 0.65 }, bandit: { block: 0.2, sp: 3.8, wind: 0.55 },
};

export function createAI({ P, S, npcs, say, hurtPlayer, grace, snd, houseOf }) {
  const sameZone = (n) => zoneOf(P.x, P.z) === zoneOf(n.x, n.z);
  const repOf = (n) => (n.valdoro ? S.known.crown : S.rep.crown);
  // A sneaking player is noticed at about half the range (less at night), only well in front, and only very close behind.
  const sees = (n, x, z, range = 13) => {
    const hidden = P.sneak && x === P.x && z === P.z;
    if (hidden) range *= S.night ? 0.4 : 0.55;
    const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz);
    if (d > range || houseOf(n.x, n.z) !== houseOf(x, z)) return false;
    return d < (hidden ? 1.2 : 2.5) || Math.abs(angDiff(Math.atan2(dx, dz), n.yaw)) < (hidden ? 0.8 : 1.15);
  };

  const alertGuards = (x, z, r = 22, suspect = true) => npcs.forEach((g) => {
    if (!g.guard || !g.alive || g.hostile || g.spar || zoneOf(g.x, g.z) !== zoneOf(x, z) || Math.hypot(g.x - x, g.z - z) > r) return;
    if (suspect && sameZone(g) && sees(g, P.x, P.z, 16)) { g.hostile = true; say(`${g.name}: "Fermo là, criminale!"`); }
    else { g.alert = 14; g.alertPos = [x, z]; g.alertSuspect = suspect; g.actT = null; }
  });

  const scream = (n, x, z, text, suspect = true) => {
    n.panic = 7; n.flee = [x, z]; n.actT = null;
    snd.scream(n);
    say(`${n.name} urla: "${text}"`);
    alertGuards(n.x, n.z, 22, suspect);
  };

  // Returns true if anyone saw the player commit the crime.
  const crime = (victim, theft) => {
    const ws = npcs.filter((n) => n.alive && (theft || n !== victim) && n.role !== "bandit" && !n.spar && !n.hostile && sameZone(n) && sees(n, P.x, P.z));
    ws.forEach((w) => {
      if (w.guard || (theft && w === victim && w.fights)) { w.hostile = true; say(`${w.name}: "Ti ho visto! Arrenditi!"`); }
      else scream(w, P.x, P.z, theft ? "Al ladro! Al ladro!" : victim && victim.hp > 0 ? "Aggressione! Guardie!" : "Assassino! Guardie!");
    });
    return ws.length > 0;
  };

  // Noise at (x, z) heard from r metres (engine: running, a horse, blows...). Whoever hears it turns to look where it
  // came from for a moment, and whoever looks at the player sees it (no pickpocketing, no blow from behind, a crime
  // has witnesses). A wall muffles it. A guard searching for the player goes where the noise was. Sleepers sleep on.
  // Returns how many heard it.
  const hear = (x, z, r) => {
    let heard = 0;
    npcs.forEach((n) => {
      if (!n.alive || n.hostile || n.spar || n.sleepAt || n.scripted || zoneOf(n.x, n.z) !== zoneOf(x, z)) return;
      if (Math.hypot(n.x - x, n.z - z) > (houseOf(n.x, n.z) === houseOf(x, z) ? r : r * 0.4)) return;
      heard += 1;
      if (n.guard && n.alert > 0) { n.alertPos = [x, z]; return; }
      if (n.panic > 0) return;
      n.heardAt = [x, z]; n.heardT = 1.8 + Math.random() * 1.2;
    });
    return heard;
  };

  const scanBodies = () => npcs.forEach((b) => {
    if (b.alive || b.discovered || b.role === "bandit") return;
    const w = npcs.find((n) => n.alive && !n.hostile && !n.panic && n.role !== "bandit" && zoneOf(n.x, n.z) === zoneOf(b.x, b.z) && sees(n, b.x, b.z, 10));
    if (!w) return;
    b.discovered = true; S.rep.village -= 5;
    if (w.guard) { say(`${w.name}: "Un cadavere! Trovate l'assassino!"`); alertGuards(b.x, b.z, 30, false); }
    else scream(w, b.x, b.z, `Hanno ucciso ${b.name}! Aiuto!`, false);
  });

  function update(n, dt) {
    const out = { walk: false, mode: null, k: 0, carry: false };
    const dx = P.x - n.x, dz = P.z - n.z, d = Math.hypot(dx, dz);
    const face = (tx, tz, r = 6) => { n.yaw += angDiff(Math.atan2(tx - n.x, tz - n.z), n.yaw) * Math.min(1, dt * r); };
    const step = (tx, tz, sp) => {
      const ddx = tx - n.x, ddz = tz - n.z, dd = Math.hypot(ddx, ddz);
      if (dd < 0.25) return true;
      const s = Math.min(dd, sp * dt);
      n.x += (ddx / dd) * s; n.z += (ddz / dd) * s;
      face(tx, tz, 8); out.walk = true;
      return false;
    };

    if (n.hostile && n.fights && sameZone(n)) {
      const F = FIGHT[n.role] || FIGHT.soldier;
      if (n.kb > 0) { n.kb -= dt; n.x -= (dx / (d || 1)) * 5 * dt; n.z -= (dz / (d || 1)) * 5 * dt; }
      out.mode = "guard";
      if (n.stagger > 0) out.mode = "stagger";
      else if (n.state === "windup") {
        n.k += dt / F.wind; out.mode = "windup"; out.k = n.k; face(P.x, P.z, 4);
        if (n.k >= 1) { n.state = "swing"; n.k = 0; snd.swing(n); if (d < 2.3) hurtPlayer(n); }
      } else if (n.state === "swing") {
        n.k += dt / 0.3; out.mode = "swing"; out.k = n.k;
        if (n.k >= 1) { n.state = "idle"; n.cd = 0.8 + Math.random() * 0.7; n.side = Math.random() < 0.5 ? -1 : 1; }
      } else if (d > 1.8) step(P.x, P.z, F.sp);
      else {
        face(P.x, P.z, 8);
        if (n.cd > 0) { n.x += (dz / (d || 1)) * (n.side || 1) * 0.9 * dt; n.z -= (dx / (d || 1)) * (n.side || 1) * 0.9 * dt; out.walk = true; }
        else { n.state = "windup"; n.k = 0; n.atk = ATTACKS[Math.floor(Math.random() * ATTACKS.length)]; }
      }
      // (before, a bandit 22 m from its post turned round and walked home, its back to the player, healed at once)
      if (d > GIVE_UP || (n.spar && d > 15)) {
        n.hostile = false; n.state = "idle"; n.actT = null;
        if (n.spar) { n.spar = false; n.hp = n.hpMax; say(`${n.name}: "Scappi dall'allenamento? Torna quando sei pronto."`); }
      }
      return out;
    }

    if (n.panic > 0) {
      n.panic -= dt; out.mode = "panic";
      const fx = n.x - n.flee[0], fz = n.z - n.flee[1], fd = Math.hypot(fx, fz) || 1;
      step(n.x + (fx / fd) * 3, n.z + (fz / fd) * 3, 3.6);
      if (n.panic <= 0) n.actT = null;
      return out;
    }

    if (n.guard && n.alert > 0) {
      n.alert -= dt; out.mode = "look";
      if (step(n.alertPos[0], n.alertPos[1], 2.8)) out.mode = "look";
      // a guard sent after the culprit of a crime someone saw knows who it is looking for: it goes for the player as
      // soon as it sees it; after a body is found it only suspects whoever is near the body (or a known criminal)
      const known = n.alertSuspect, range = known ? 13 : 8;
      if (sameZone(n) && sees(n, P.x, P.z, range) && (known || repOf(n) < -10 || Math.hypot(P.x - n.alertPos[0], P.z - n.alertPos[1]) < 5)) { n.hostile = true; n.alert = 0; say(`${n.name}: "Eccolo! Prendetelo!"`); }
      return out;
    }

    if (sameZone(n) && grace() <= 0) {
      if (n.guard && repOf(n) < -25 && sees(n, P.x, P.z, 12)) { n.hostile = true; say(`${n.name}: "Fermo, criminale!"`); return out; }
    }

    if (n.goTo) { if (step(n.goTo[0], n.goTo[1], 2.8)) face(P.x, P.z); return out; }
    if (n.exitTo) { if (step(n.exitTo[n.exitI][0], n.exitTo[n.exitI][1], 1.3)) { n.exitI += 1; if (n.exitI >= n.exitTo.length) n.exitTo = null; } return out; }
    if (n.sleepAt) {
      n.actT = null;
      if (n.viaI < n.sleepVia.length) { if (step(n.sleepVia[n.viaI][0], n.sleepVia[n.viaI][1], 1.3)) n.viaI += 1; return out; }
      if (step(n.sleepAt[0], n.sleepAt[1], 1.1)) { out.mode = "sleep"; n.yaw = n.sleepAt[2]; }
      return out;
    }
    if (n.heardT > 0) { n.heardT -= dt; face(n.heardAt[0], n.heardAt[1], 5); return out; }   // a noise: stops and looks (hear)
    if (d < 2.4 && !P.sneak && sameZone(n) && n.role !== "bandit" && Math.abs(angDiff(Math.atan2(dx, dz), n.yaw)) < 1.6) { face(P.x, P.z, 5); return out; }
    const r = n.routine;
    if (!r) return out;
    n.ri = (n.ri || 0) % r.length;
    const s = r[n.ri];
    if (n.actT == null) {
      n.walkT = (n.walkT || 0) + dt;
      out.carry = !!s.carry;
      if (step(s.at[0], s.at[1], n.guard ? 1.4 : 1.15) || n.walkT > 20) { n.actT = s.dur; n.walkT = 0; }
    } else {
      n.actT -= dt; out.mode = s.act;
      out.carry = !!s.carry && s.act === "carry";
      if (s.face) face(s.face[0], s.face[1], 4);
      if (n.actT <= 0) { n.actT = null; n.ri = (n.ri + 1) % r.length; }
    }
    return out;
  }

  return { update, crime, scream, sees, hear, alertGuards, scanBodies, sameZone };
}
