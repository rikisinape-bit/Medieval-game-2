// Builds src/game3d/paladin.json: the paladin knight's armour (tools/.paladin-cache.json, see convert-paladin.py)
// fitted onto the game's male base body (src/game3d/bodydata.json), split into the body's rigid parts.
// Fitting, piece by piece, from the bone that moves each vertex:
//   arms and legs  segment by segment (shoulder-elbow, elbow-wrist, hip-knee, knee-ankle, ankle-toes): the position
//                  along the segment follows the segment's length, the distance from its axis the real thickness of
//                  the limb (the model's bare body vs ours);
//   pauldrons      around the shoulder joint (own parts padR/padL: in the game they follow the arm half way);
//   trunk          (cuirass, skirt, tassets, belts) band by band in height, with our trunk's width and depth;
//   helmet         around the head, to our head's size.
// Colours: from the model's painted texture if assets/sorgenti/paladino/textures/ has it, else a colour per piece.
// Usage: node tools/build-paladin.mjs
import fs from "node:fs";
import * as THREE from "three";
import sharp from "sharp";

const CACHE = new URL("./.paladin-cache.json", import.meta.url).pathname;
const BODIES = new URL("../src/game3d/bodydata.json", import.meta.url).pathname;
const TEX = new URL("../../assets/sorgenti/paladino/textures/t_paintpoly_paladin_knight_albedo.png", import.meta.url).pathname;
const OUT = new URL("../src/game3d/paladin.json", import.meta.url).pathname;
const C = JSON.parse(fs.readFileSync(CACHE)), BD = JSON.parse(fs.readFileSync(BODIES));

const TRUNK = new Set(["model_armour.001", "model_armour.002", "model_armour.003", "model_belts", "model_straps.001"]);
const HEAD = new Set(["model_helmet"]);
// colour of each piece when there is no texture (steel, cloth of the skirt, leather)
const FALLBACK = { "model_armour": "#767a80", "model_armour.001": "#80848a", "model_armour.002": "#5a1c1c", "model_armour.003": "#70747a",
  "model_belts": "#4a3020", "model_helmet": "#7a7e84", "model_straps": "#3a2818", "model_straps.001": "#3a2818" };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const bone = (n) => ({ h: V(C.bones[n].slice(0, 3)), t: V(C.bones[n].slice(3)) });
const kindOf = (n) => (/upper_arm/.test(n) ? "upper" : /forearm|hand|thumb|f_|palm/.test(n) ? "fore" : /shoulder/.test(n) ? "pad"
  : /thigh/.test(n) ? "thigh" : /shin/.test(n) ? "shin" : /foot|toe|heel/.test(n) ? "foot" : /spine\.00[56]/.test(n) ? "head" : "trunk");

// ---- the model's bare body: bones and thickness ----------------------------------------------------------------
const SB = C.body, sbVerts = [];
for (let i = 0; i < SB.b.length; i++) sbVerts.push({ p: V(SB.p.slice(i * 3, i * 3 + 3)), k: SB.b[i] >= 0 ? kindOf(C.names[SB.b[i]]) : "" });
const srcSide = (s) => {
  const L = s > 0 ? "L" : "R";                        // Blender's .L side is +x here
  return { shoulder: bone(`DEF-upper_arm.${L}`).h, elbow: bone(`DEF-forearm.${L}`).h, wrist: bone(`DEF-hand.${L}`).h,
    hip: bone(`DEF-thigh.${L}`).h, knee: bone(`DEF-shin.${L}`).h, ankle: bone(`DEF-foot.${L}`).h, toe: bone(`DEF-toe.${L}`).t };
};
const srcPelvis = bone("DEF-spine").h, srcNeck = bone("DEF-spine.004").h;

// distance of points from a segment's axis (median), for points whose position along it is within [a, b]
const radius = (pts, A, B, a = 0.15, b = 0.85) => {
  const ax = B.clone().sub(A), L = ax.length(); ax.normalize();
  const d = pts.map((p) => { const v = p.clone().sub(A), u = v.dot(ax) / L; return u >= a && u <= b ? v.sub(ax.clone().multiplyScalar(v.dot(ax))).length() : null; }).filter((x) => x != null).sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)] || 0.05;
};

// ---- our body ---------------------------------------------------------------------------------------------------
function ourBody(k) {
  const B = BD[k], R = B.rig, PV = R.pivots;
  const pts = (part) => { const P = B.parts[part], out = []; for (let i = 0; i < P.p.length / 3; i++) out.push({ p: new THREE.Vector3(P.p[i * 3] + PV[part][0], P.p[i * 3 + 1] + PV[part][1], P.p[i * 3 + 2] + PV[part][2]), t: P.t ? P.t[i] : 0 }); return out; };
  const side = (s) => {
    const arm = s > 0 ? "armR" : "armL", leg = s > 0 ? "legR" : "legL", shin = s > 0 ? "shinR" : "shinL", S = pts(shin);
    const low = S.filter((a) => a.p.y > 0.06 && a.p.y < 0.13), ankle = low.reduce((m, a) => m.add(a.p), new THREE.Vector3()).multiplyScalar(1 / low.length);
    const toes = S.filter((a) => a.p.y < 0.1).sort((a, b) => b.p.z - a.p.z)[0].p;
    const joint = (n) => V(PV[arm]).add(V(R[s > 0 ? n : `${n}L`]));            // elbow / wrist of the posed arm (build-bodies)
    return { arm, leg, shin, shoulder: V(PV[arm]), elbow: joint("elbow"), wrist: joint("wrist"), hip: V(PV[leg]), knee: V(PV[shin]), ankle,
      toe: new THREE.Vector3(ankle.x, 0.03, toes.z - 0.02),
      // the arm part also holds a bit of chest and back around the shoulder: measure the arm on its own (t = 0 shoulder .. 1 wrist)
      armPts: pts(arm), torsoTop: pts("torso").map((a) => a.p),
      pts: { leg: pts(leg).map((a) => a.p), shin: S.map((a) => a.p) } };
  };
  const torso = pts("torso").map((a) => a.p), head = pts("head").map((a) => a.p);
  return { B, R, PV, side, torso, head, pelvis: new THREE.Vector3(0, PV.legR[1], PV.legR[2]), neck: new THREE.Vector3(0, R.neck, PV.head[2] - 0.015) };
}

// ---- frames and maps ---------------------------------------------------------------------------------------------
// Segment frame: y along the segment, x towards the outside (s = side), z = x × y. Both bodies use the same rule.
const frame = (A, B, s) => {
  const y = B.clone().sub(A).normalize(), x = new THREE.Vector3(s, 0, 0); x.sub(y.clone().multiplyScalar(x.dot(y))).normalize();
  return { A, L: B.distanceTo(A), x, y, z: new THREE.Vector3().crossVectors(x, y) };
};
const segMap = (from, to, k) => (p) => {
  const d = p.clone().sub(from.A), u = d.dot(from.y) / from.L, rx = d.dot(from.x), rz = d.dot(from.z);
  return to.A.clone().addScaledVector(to.y, u * to.L).addScaledVector(to.x, rx * k).addScaledVector(to.z, rz * k);
};
// Width/depth of a trunk at height y (half width, back, front) from its points, 5 cm bands, smoothed.
const profile = (pts, y0, y1) => {
  const rows = [];
  for (let y = y0; y <= y1 + 1e-6; y += 0.05) {
    const s = pts.filter((p) => Math.abs(p.y - y) < 0.035);
    if (s.length > 4) rows.push([y, Math.max(...s.map((p) => Math.abs(p.x))), Math.min(...s.map((p) => p.z)), Math.max(...s.map((p) => p.z))]);
  }
  const sm = rows.map((r, i) => { const n = rows.slice(Math.max(0, i - 1), i + 2); return [r[0], ...[1, 2, 3].map((j) => n.reduce((a, b) => a + b[j], 0) / n.length)]; });
  return (y) => { if (y <= sm[0][0]) return sm[0]; if (y >= sm[sm.length - 1][0]) return sm[sm.length - 1]; for (let i = 1; i < sm.length; i++) if (sm[i][0] >= y) { const a = sm[i - 1], b = sm[i], t = (y - a[0]) / (b[0] - a[0]); return a.map((v, j) => v + (b[j] - v) * t); } };
};

function build(k) {
  const O = ourBody(k), sides = { 1: { s: srcSide(1), o: O.side(1) }, [-1]: { s: srcSide(-1), o: O.side(-1) } };
  const kindPts = (kind) => sbVerts.filter((v) => v.k === kind).map((v) => v.p);
  // limbs: one map per segment and side
  const maps = {};
  [1, -1].forEach((s) => {
    const { s: S, o: Q } = sides[s], sx = (p) => p.x * s > 0;
    const seg = (name, a, b, part, srcPts, ourPts) => {
      // measured on the middle of the segment (near the joints the body widens: shoulder, armpit, hips)
      const ro = radius(ourPts, Q[a], Q[b], 0.35, 0.85), rs = radius(srcPts.filter(sx), S[a], S[b], 0.35, 0.85), kk = Math.min(1.35, Math.max(0.75, ro / rs));
      if (process.env.DBG) console.log(name, s, "ours", ro.toFixed(3), "src", rs.toFixed(3), "Q", Q[a].toArray().map((x) => x.toFixed(3)).join(","), Q[b].toArray().map((x) => x.toFixed(3)).join(","));
      maps[`${name}${s}`] = { f: segMap(frame(S[a], S[b], s), frame(Q[a], Q[b], s), kk * 1.03), part: Q[part], k: kk };
    };
    // Arms: our arm's real centre line, ring by ring (t = 0 shoulder .. 0.52 elbow .. 1 wrist .. hand), from the
    // vertices of our arm; the model's arm: its bones (shoulder -> elbow -> wrist).
    const AP = Q.armPts, kern = (t, bw = 0.07) => AP.map((a) => Math.exp(-(((a.t - t) / bw) ** 2)));
    const line = (t) => { const w = kern(t), c = new THREE.Vector3(); let sw = 0; AP.forEach((a, i) => { c.addScaledVector(a.p, w[i]); sw += w[i]; }); return c.multiplyScalar(1 / sw); };
    const ringR = (t, c, y) => { const w = kern(t, 0.05), d = []; AP.forEach((a, i) => { if (w[i] > 0.5) { const v = a.p.clone().sub(c); d.push(v.sub(y.clone().multiplyScalar(v.dot(y))).length()); } }); d.sort((a, b) => a - b); return d[Math.floor(d.length / 2)]; };
    const srcT = (p) => {                                            // position of a point along the model's arm (same t)
      const u1 = p.clone().sub(S.shoulder).dot(S.elbow.clone().sub(S.shoulder)) / S.elbow.distanceToSquared(S.shoulder);
      if (u1 < 1) return { t: 0.52 * u1, A: S.shoulder, B: S.elbow, u: u1 };
      const u2 = p.clone().sub(S.elbow).dot(S.wrist.clone().sub(S.elbow)) / S.wrist.distanceToSquared(S.elbow);
      return { t: 0.52 + 0.48 * u2, A: S.elbow, B: S.wrist, u: u2 };
    };
    const srcArm = kindPts("upper").concat(kindPts("fore")).filter(sx);
    const srcR = (t) => {                                            // the model's bare arm thickness around t
      const d = srcArm.map((p) => { const q = srcT(p); if (Math.abs(q.t - t) > 0.06) return null; const y = q.B.clone().sub(q.A).normalize(), v = p.clone().sub(q.A); return v.sub(y.multiplyScalar(v.dot(y))).length(); }).filter((x) => x != null).sort((a, b) => a - b);
      return d[Math.floor(d.length / 2)] || 0.05;
    };
    const kAt = {}; [0.3, 0.75, 0.95].forEach((t) => { const c = line(t), y = line(t + 0.05).sub(line(t - 0.05)).normalize(); kAt[t] = Math.min(1.35, Math.max(0.8, ringR(t, c, y) / srcR(t))); });
    const kArm = (t) => (t < 0.3 ? kAt[0.3] : t < 0.75 ? kAt[0.3] + (kAt[0.75] - kAt[0.3]) * (t - 0.3) / 0.45 : t < 0.95 ? kAt[0.75] + (kAt[0.95] - kAt[0.75]) * (t - 0.75) / 0.2 : kAt[0.95]);
    const armMap = (p) => {
      const q = srcT(p), ys = q.B.clone().sub(q.A).normalize(), base = q.A.clone().lerp(q.B, q.u), fs = frame(base, base.clone().add(ys), s);
      const d = p.clone().sub(base), rx = d.dot(fs.x), rz = d.dot(fs.z);
      const t = Math.max(0.12, q.t), c = line(t), yd = line(t + 0.05).sub(line(t - 0.05)).normalize(), fd = frame(c, c.clone().add(yd), s), k = kArm(t) * 1.03;
      return c.clone().addScaledVector(fd.y, (q.t - t) * 0.6).addScaledVector(fd.x, rx * k).addScaledVector(fd.z, rz * k);
    };
    maps[`upper${s}`] = maps[`fore${s}`] = { f: armMap, part: Q.arm, k: kAt[0.3], t: (p) => srcT(p).t };
    seg("thigh", "hip", "knee", "leg", kindPts("thigh"), Q.pts.leg);
    seg("shin", "knee", "ankle", "shin", kindPts("shin"), Q.pts.shin);
    seg("foot", "ankle", "toe", "shin", kindPts("foot").concat(kindPts("shin")), Q.pts.shin);
    maps[`foot${s}`].f = segMap(frame(S.ankle, S.toe, s), frame(Q.ankle, Q.toe, s), 1.0);   // sabatons: not wider than the model's
    // pauldron: around the top of the shoulder (highest point of the body above the shoulder, both bodies)
    const top = (pts, x0) => pts.filter((p) => Math.abs(p.x - x0) < 0.05).sort((a, b) => b.y - a.y)[0];
    const sTop = top(sbVerts.filter((v) => v.k === "pad" || v.k === "upper" || v.k === "trunk").map((v) => v.p), S.shoulder.x);
    const oTop = top(AP.map((a) => a.p).concat(Q.torsoTop), Q.shoulder.x);
    const kp = Math.max(1, kAt[0.3]) * 1.04;
    maps[`pad${s}`] = { f: (p) => oTop.clone().add(p.clone().sub(sTop).multiplyScalar(kp)), part: s > 0 ? "padR" : "padL" };
  });
  // trunk: height from pelvis to neck; width and depth from exact cross-sections of both bodies without the arms
  // (ours: the profile of build-bodies; the model's: its bare body's triangles cut by horizontal planes)
  const SI = C.body.i, noArm = (i) => sbVerts[i].k !== "upper" && sbVerts[i].k !== "fore";
  const section = (y) => {
    const pts = [];
    for (let t = 0; t < SI.length; t += 3) {
      const tri = [SI[t], SI[t + 1], SI[t + 2]]; if (!tri.every(noArm)) continue;
      for (let e = 0; e < 3; e++) { const a = sbVerts[tri[e]].p, b = sbVerts[tri[(e + 1) % 3]].p; if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) { const k = (y - a.y) / (b.y - a.y); pts.push([a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k]); } }
    }
    return [y, Math.max(...pts.map((p) => Math.abs(p[0]))), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  };
  const srcRows = []; for (let y = 0.6; y <= srcNeck.y + 1e-6; y += 0.05) srcRows.push(section(y));
  const interp = (rows) => (y) => { if (y <= rows[0][0]) return rows[0]; if (y >= rows[rows.length - 1][0]) return rows[rows.length - 1]; for (let i = 1; i < rows.length; i++) if (rows[i][0] >= y) { const a = rows[i - 1], b = rows[i], t = (y - a[0]) / (b[0] - a[0]); return a.map((v, j) => v + (b[j] - v) * t); } };
  const sP = interp(srcRows), oP = interp(O.R.torso);
  const sy = (O.neck.y - O.pelvis.y) / (srcNeck.y - srcPelvis.y);
  const clampK = (k) => Math.min(1.25, Math.max(0.85, k));
  // ratios, smoothed over 15 cm (the plates are rigid: no waves)
  const kAtY = (y) => { let kx = 0, kz = 0, n = 0; for (let d = -0.075; d <= 0.0751; d += 0.025) { const yy = y + d, y2 = O.pelvis.y + (yy - srcPelvis.y) * sy, a = sP(yy), b = oP(y2); kx += b[1] / a[1]; kz += (b[3] - b[2]) / (a[3] - a[2]); n++; } return [clampK(kx / n), clampK(kz / n)]; };
  const trunk = (p) => {
    const y2 = O.pelvis.y + (p.y - srcPelvis.y) * sy, a = sP(p.y), b = oP(y2), [kx, kz] = kAtY(p.y);
    return new THREE.Vector3(p.x * kx * 1.02, y2, (b[2] + b[3]) / 2 + (p.z - (a[2] + a[3]) / 2) * kz * 1.02);
  };
  if (process.env.DBG) for (let y = 0.7; y < 1.7; y += 0.1) { const y2 = O.pelvis.y + (y - srcPelvis.y) * sy, a = sP(y), b = oP(y2), k = kAtY(y); console.log("trunk", y.toFixed(2), "src", a.slice(1).map((v) => v.toFixed(3)).join(","), "ours", b.slice(1).map((v) => v.toFixed(3)).join(","), "k", k.map((v) => v.toFixed(2)).join(",")); }
  // helmet: around the head, to our head's size (with room for hair)
  const hs = kindPts("head").filter((p) => p.y > srcNeck.y + 0.05), hb = new THREE.Box3().setFromPoints(hs), ob = new THREE.Box3().setFromPoints(O.head.filter((p) => p.y > O.neck.y + 0.03));
  const hsz = hb.getSize(new THREE.Vector3()), osz = ob.getSize(new THREE.Vector3()), hc = hb.getCenter(new THREE.Vector3()), oc = ob.getCenter(new THREE.Vector3());
  const hk = new THREE.Vector3(osz.x / hsz.x, osz.y / hsz.y, osz.z / hsz.z).multiplyScalar(1.06);
  const head = (p) => new THREE.Vector3(oc.x + (p.x - hc.x) * hk.x, oc.y + (p.y - hc.y) * hk.y, oc.z + (p.z - hc.z) * hk.z);

  const PV = O.PV, pivotOf = { torso: [0, 0, 0], head: PV.head, armR: PV.armR, armL: PV.armL, legR: PV.legR, legL: PV.legL, shinR: PV.shinR, shinL: PV.shinL, padR: PV.armR, padL: PV.armL };
  const parts = Object.fromEntries(Object.keys(pivotOf).map((n) => [n, { p: [], i: [], c: [], map: new Map() }]));
  return { maps, trunk, head, parts, pivotOf, kinfo: Object.fromEntries(Object.entries(maps).map(([n, m]) => [n, m.k && +m.k.toFixed(2)])) };
}

// ---- colours -----------------------------------------------------------------------------------------------------
let tex = null;
if (fs.existsSync(TEX)) {
  const { data, info } = await sharp(TEX).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  tex = (u, v) => { const x = Math.min(info.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor((1 - (v - Math.floor(v))) * info.height))), i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
}
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const grade = ([r, g, b]) => { const l = (r + g + b) / 3; return [r, g, b].map((c) => Math.round(Math.min(255, (l + (c - l) * 0.85) * 0.86))); };   // dark fantasy: less saturated, darker

// ---- fitting -----------------------------------------------------------------------------------------------------
const out = {};
for (const k of ["m"]) {
  const F = build(k);
  for (const [name, M] of Object.entries(C.meshes)) {
    const nv = M.b.length;
    for (let t = 0; t < nv; t += 3) {
      const ids = [t, t + 1, t + 2], P = ids.map((i) => V(M.p.slice(i * 3, i * 3 + 3))), kinds = ids.map((i) => (M.b[i] >= 0 ? kindOf(C.names[M.b[i]]) : "trunk"));
      const cx = (P[0].x + P[1].x + P[2].x) / 3, s = cx >= 0 ? 1 : -1;
      // which part the triangle belongs to, and how each corner is moved
      let part, mapOf;
      if (TRUNK.has(name)) { part = "torso"; mapOf = () => F.trunk; }
      else if (HEAD.has(name)) { part = "head"; mapOf = () => F.head; }
      else {
        const vote = {}; kinds.forEach((kd) => { vote[kd] = (vote[kd] || 0) + 1; });
        const main = Object.entries(vote).sort((a, b) => b[1] - a[1])[0][0];
        const limb = (kd) => (kd === "upper" || kd === "fore" || kd === "thigh" || kd === "shin" || kd === "foot" || kd === "pad" ? F.maps[`${kd}${s}`] : null);
        const m = limb(main);
        part = m ? m.part : main === "head" ? "head" : "torso";
        mapOf = (kd) => { const mm = limb(kd); if (main === "pad") return F.maps[`pad${s}`].f; return mm && mm.part === part ? mm.f : m ? m.f : kd === "head" ? F.head : F.trunk; };
      }
      // the gauntlets' finger plates are for an open hand: they are left out (the fist itself is painted steel)
      if (part === "armR" || part === "armL") { const tm = F.maps[`fore${s}`].t; if (Math.min(...P.map(tm)) > 1.06) continue; }
      const Q = P.map((p, j) => mapOf(kinds[j])(p));
      const prt = F.parts[part], piv = F.pivotOf[part];
      Q.forEach((q, j) => {
        const key = `${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)}`;
        if (!prt.map.has(key)) { prt.map.set(key, prt.p.length / 3); prt.p.push(+(q.x - piv[0]).toFixed(4), +(q.y - piv[1]).toFixed(4), +(q.z - piv[2]).toFixed(4)); }
        prt.i.push(prt.map.get(key));
      });
      let rgb;
      if (tex) { const sm = ids.map((i) => tex(M.uv[i * 2], M.uv[i * 2 + 1])), u = (M.uv[t * 2] + M.uv[t * 2 + 2] + M.uv[t * 2 + 4]) / 3, v = (M.uv[t * 2 + 1] + M.uv[t * 2 + 3] + M.uv[t * 2 + 5]) / 3; sm.push(tex(u, v), tex(u, v)); rgb = [0, 1, 2].map((c) => sm.reduce((a, x) => a + x[c], 0) / sm.length); }
      else rgb = hexRGB(FALLBACK[name] || "#888888");
      prt.c.push(...grade(rgb));
    }
  }
  out[k] = { parts: Object.fromEntries(Object.entries(F.parts).filter(([, p]) => p.i.length).map(([n, p]) => [n, { p: p.p, i: p.i, c: p.c }])), textured: !!tex };
  console.log(k, Object.entries(out[k].parts).map(([n, p]) => `${n}:${p.i.length / 3}`).join(" "), "scale", JSON.stringify(F.kinfo));
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${tex ? "colori dalla texture" : "texture mancante: colori per pezzo"} -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
