// Builds src/game3d/bodydata.json from the base bodies (tools/.bodies-cache.json, see convert-bodies.mjs).
// For each body (man, woman):
//   1. weld, centre on the feet, scale to the game's size;
//   2. pose: fingers curled into a fist, elbow slightly bent, arms lowered from the A-pose along the sides
//      (smooth weights around the shoulder, like a skinned mesh, so the shoulder deforms instead of breaking);
//   3. split into the rigid parts the game animates (torso, head, arms, legs), each in the local space of its pivot.
//      Triangles on a cut belong to both parts, so no hole opens at the joints when the limbs move.
// Also writes the rig: pivots, hand grip point and grip axis, and body measures used to fit clothes.
// Usage: node tools/build-bodies.mjs
import fs from "node:fs";

const CACHE = new URL("./.bodies-cache.json", import.meta.url).pathname;
const OUT = new URL("../src/game3d/bodydata.json", import.meta.url).pathname;
const SCALE = 1.11;                                  // 1.66 m model -> 1.84 m in the game (the NPCs vary ±4%)

// Joints measured on the original model (metres, after centring; x = the +x side).
const SRC = {
  m: { mesh: "Body002", shoulder: [0.18, 1.33], hipY: 0.87, hipX: 0.09, neck: 1.455, crotch: 0.77, knee: 0.485 },
  f: { mesh: "Cube001", shoulder: [0.17, 1.335], hipY: 0.88, hipX: 0.09, neck: 1.475, crotch: 0.8, knee: 0.485 },
};
const POSE = { hang: 0.13, forward: 0.06, elbow: 0.32, knuckle: 1.35, mid: 1.35, wrist: 0.5 };   // radians (bends) / direction

// ---------- small vector maths ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / len(a));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rotate = (v, axis, ang) => {                   // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), k = norm(axis);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
};
// Principal axes (power iteration on the covariance): largest first.
function pca(pts) {
  const c = mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach((p) => { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
  const mv = (v) => [dot(C[0], v), dot(C[1], v), dot(C[2], v)];
  const axes = [];
  for (let n = 0; n < 3; n++) {
    let v = norm([1 + n, 0.3 - n * 0.2, 0.7 * n - 0.4]);
    for (let it = 0; it < 200; it++) { axes.forEach((a) => { v = sub(v, mul(a, dot(v, a))); }); v = norm(mv(v)); }
    axes.push(v);
  }
  return { c, axes };
}

function build(raw, J) {
  // 1. weld + centre + scale
  const map = new Map(), V = [], I = [];
  for (let i = 0; i < raw.length; i += 3) {
    const k = `${raw[i].toFixed(4)},${raw[i + 1].toFixed(4)},${raw[i + 2].toFixed(4)}`;
    if (!map.has(k)) { map.set(k, V.length); V.push([raw[i], raw[i + 1], raw[i + 2]]); }
    I.push(map.get(k));
  }
  const torsoPts = V.filter((v) => v[1] > 0.95 && v[1] < 1.3);
  const minY = Math.min(...V.map((v) => v[1]));
  const xs = V.map((v) => v[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const tz = torsoPts.filter((v) => Math.abs(v[0] - cx) < 0.15).map((v) => v[2]), cz = (Math.min(...tz) + Math.max(...tz)) / 2;   // middle of the trunk's depth
  V.forEach((v, i) => { V[i] = [v[0] - cx, v[1] - minY, v[2] - cz]; });

  // 2. arms: axis from the vertices well outside the shoulders, then smooth weights along it
  const zAt = (y, x) => { const n = V.filter((v) => Math.abs(v[1] - y) < 0.06 && Math.abs(v[0]) < x + 0.04).map((v) => v[2]); return (Math.min(...n) + Math.max(...n)) / 2; };   // middle of the body's depth
  const arms = {};
  for (const side of [1, -1]) {
    const S = [side * J.shoulder[0], J.shoulder[1], zAt(J.shoulder[1], J.shoulder[0])];
    const far = V.filter((v) => v[0] * side > J.shoulder[0] + 0.1 && v[1] > 0.75);
    let a = pca(far).axes[0]; if (dot(a, [side, -1, 0]) < 0) a = mul(a, -1);
    const T = V.map((v) => dot(sub(v, S), a));
    const R = V.map((v, i) => len(sub(sub(v, S), mul(a, T[i]))));
    const tips = Math.max(...V.map((v, i) => (v[0] * side > J.shoulder[0] && R[i] < 0.2 ? T[i] : 0)));
    // wrist = where the arm is thinnest towards the end
    let wrist = tips * 0.75, best = 1;
    for (let t = tips * 0.6; t < tips * 0.85; t += 0.005) {
      const rs = V.map((v, i) => (Math.abs(T[i] - t) < 0.015 && R[i] < 0.1 ? R[i] : -1)).filter((x) => x >= 0);
      const m = rs.length ? Math.max(...rs) : 1;
      if (m < best) { best = m; wrist = t; }
    }
    const W = V.map((v, i) => {                         // arm weight: on the arm axis, beyond the shoulder
      const lim = 0.075 + 0.25 * Math.max(0, T[i] - wrist + 0.03);
      if (v[0] * side > J.shoulder[0] + 0.09 && v[1] > 0.75) return 1;               // in the A-pose everything out there is arm
      const medial = smooth(J.shoulder[0] - 0.06, J.shoulder[0] - 0.005, v[0] * side);   // nothing inside the shoulder joint (chest)
      return smooth(-0.045, 0.06, T[i]) * medial * (1 - smooth(Math.max(lim, 0.11), Math.max(lim, 0.11) + 0.035, R[i]));
    });
    const handPts = V.filter((v, i) => W[i] > 0.9 && T[i] > wrist + 0.02);
    const hp = pca(handPts); let palm = hp.axes[2];
    if (dot(palm, [-side, 0, 0]) < 0) palm = mul(palm, -1);        // the palm faces the body
    arms[side] = { S, a, T, W, wrist, tips, palm };
  }

  // Pose, distal first (everything uses the original arm coordinates T): finger tips, knuckles, elbow, shoulder.
  const P = V.map((v) => [...v]);
  for (const side of [1, -1]) {
    const { S, a, T, W, wrist, tips, palm } = arms[side];
    const handLen = tips - wrist, curl = norm(cross(a, palm)), fwd = norm(cross(a, [0, 0, 1]));
    const bend = (t0, axis, ang, wd = 0.012) => {
      const C = add(S, mul(a, t0));
      P.forEach((p, i) => { if (W[i] > 0.5 && T[i] > t0 - wd) { const k = smooth(t0 - wd, t0 + wd, T[i]); P[i] = add(C, rotate(sub(p, C), axis, ang * k)); } });
    };
    bend(wrist + handLen * 0.72, curl, POSE.mid);               // middle phalanges
    bend(wrist + handLen * 0.45, curl, POSE.knuckle);           // knuckles
    bend(wrist * 0.52, fwd, POSE.elbow, 0.03);                  // elbow
  }
  // Grip (centre of the fist) and grip axis, measured before lowering the arm.
  const rig = {};
  for (const side of [1, -1]) {
    const { S, a, T, W, wrist, tips } = arms[side];
    const fist = P.filter((p, i) => W[i] > 0.9 && T[i] > wrist + (tips - wrist) * 0.3);
    arms[side].grip = mul(fist.reduce(add, [0, 0, 0]), 1 / fist.length);
    arms[side].gripAxis = norm(cross(a, arms[side].palm));
  }
  // Lower the arms: the shoulder->grip direction goes to the hanging direction.
  for (const side of [1, -1]) {
    const A = arms[side], from = norm(sub(A.grip, A.S)), to = norm([side * POSE.hang, -1, POSE.forward]);
    const axis = norm(cross(from, to)), ang = Math.acos(Math.min(1, dot(from, to)));
    P.forEach((p, i) => { if (A.W[i] > 0) P[i] = add(A.S, rotate(sub(p, A.S), axis, ang * A.W[i])); });
    A.grip = add(A.S, rotate(sub(A.grip, A.S), axis, ang));
    A.gripAxis = rotate(A.gripAxis, axis, ang);
    A.elbow = add(A.S, rotate(sub(add(A.S, mul(A.a, A.wrist * 0.52)), A.S), axis, ang));
  }
  // Turn the forearm (like turning the wrist) so the palm faces the thigh and the fist's grip axis points forward.
  for (const side of [1, -1]) {
    const A = arms[side], fa = norm(sub(A.grip, A.elbow));
    const flat = (v) => norm(sub(v, mul(fa, dot(v, fa))));
    let g = flat(A.gripAxis); const want = flat([0, -0.35, 1]);
    if (dot(g, want) < 0) g = mul(g, -1);                               // a grip axis has no direction: take the nearer one
    const ang = Math.atan2(dot(cross(g, want), fa), dot(g, want));
    P.forEach((p, i) => { if (A.W[i] > 0.5) { const k = smooth(A.wrist * 0.55, A.wrist * 0.95, A.T[i]); if (k > 0) P[i] = add(A.elbow, rotate(sub(p, A.elbow), fa, ang * k)); } });
    A.grip = add(A.elbow, rotate(sub(A.grip, A.elbow), fa, ang));
    A.gripAxis = want;
    // Cock the wrist: the fist tilts so the grip axis points forward and down (a sword held at rest).
    const W0 = add(A.elbow, mul(fa, len(sub(A.grip, A.elbow)) * 0.62)), dev = norm(cross(A.gripAxis, [0, -1, 0]));
    P.forEach((p, i) => { if (A.W[i] > 0.5) { const k = smooth(A.wrist * 0.97, A.wrist * 1.05, A.T[i]); if (k > 0) P[i] = add(W0, rotate(sub(p, W0), dev, POSE.wrist * k)); } });
    A.grip = add(W0, rotate(sub(A.grip, W0), dev, POSE.wrist));
    A.gripAxis = norm(rotate(A.gripAxis, dev, POSE.wrist));
  }

  // 3. scale everything, split into parts
  const sc = (p) => mul(p, SCALE);
  const Ps = P.map(sc);
  const hipY = J.hipY * SCALE, hipX = J.hipX * SCALE, neck = J.neck * SCALE, crotch = J.crotch * SCALE;
  const headTop = Math.max(...Ps.map((p) => p[1]));
  const headPivot = [0, (neck + headTop) / 2 - 0.01, 0];
  { const zs = Ps.filter((p) => p[1] > headPivot[1] - 0.04 && p[1] < headPivot[1] + 0.04).map((p) => p[2]); headPivot[2] = (Math.min(...zs) + Math.max(...zs)) / 2; }
  const shoulder = sc(arms[1].S), hip = [hipX, hipY, 0];
  const inArm = (i, side) => arms[side].W[i] > 0.5;
  const legOf = (p) => (Math.abs(p[0]) < 0.28 && p[1] < crotch + 0.55 * Math.abs(p[0]) + 0.02 ? Math.sign(p[0]) || 1 : 0);
  const kneeY = J.knee * SCALE; let rigKnee = null;
  const kind = Ps.map((p, i) => (inArm(i, 1) ? "armR" : inArm(i, -1) ? "armL" : p[1] > neck ? "head" : legOf(p) > 0 ? (p[1] < kneeY ? "shinR" : "legR") : legOf(p) < 0 ? (p[1] < kneeY ? "shinL" : "legL") : "torso"));
  const pivots = { torso: [0, 0, 0], head: headPivot, armR: shoulder, armL: [-shoulder[0], shoulder[1], arms[-1].S[2] * SCALE], legR: hip, legL: [-hipX, hipY, 0], shinR: [0, kneeY, 0], shinL: [0, kneeY, 0] };
  // Body measures for clothes: exact cross-sections (triangles cut by horizontal planes) every 5 cm: half width,
  // back and front of the trunk (below the crotch: of both legs together).
  const section = (y, test) => {
    const pts = [];
    for (let i = 0; i < I.length; i += 3) {
      const tri = [I[i], I[i + 1], I[i + 2]]; if (!tri.every((j) => test(kind[j]))) continue;
      for (let e = 0; e < 3; e++) { const a = Ps[tri[e]], b = Ps[tri[(e + 1) % 3]]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const k = (y - a[1]) / (b[1] - a[1]); pts.push([a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k]); } }
    }
    return pts;
  };
  // legs turn around the middle of the thigh
  { const pts = section(hipY - 0.12, (k) => k === "legR"); const zs = pts.map((p) => p[1]); pivots.legR[2] = pivots.legL[2] = +((Math.min(...zs) + Math.max(...zs)) / 2).toFixed(4); }
  // knees: in the middle of the leg's section at the cut (the shin is a child of the thigh in the game)
  { const pts = section(kneeY, (k) => k === "legR" || k === "shinR"), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const kx = (Math.min(...xs) + Math.max(...xs)) / 2, kz = (Math.min(...zs) + Math.max(...zs)) / 2 - 0.01;
    pivots.shinR = [+kx.toFixed(4), +kneeY.toFixed(4), +kz.toFixed(4)]; pivots.shinL = [-pivots.shinR[0], pivots.shinR[1], pivots.shinR[2]];
    rigKnee = { r: +((Math.max(...xs) - Math.min(...xs)) / 2).toFixed(3) }; }
  const parts = {};
  for (const name of Object.keys(pivots)) {
    const used = new Map(), pos = [], idx = [], tt = [];
    for (let i = 0; i < I.length; i += 3) {
      const tri = [I[i], I[i + 1], I[i + 2]];
      const ks = tri.map((j) => kind[j]);
      if (!ks.includes(name)) continue;
      // a cut triangle goes to both parts, except head/torso: those only where the neck is (not the shoulders)
      tri.forEach((j) => {
        if (!used.has(j)) {
          used.set(j, pos.length / 3);
          const p = sub(Ps[j], pivots[name]); pos.push(...p.map((x) => +x.toFixed(4)));
          const side = name === "armR" ? 1 : name === "armL" ? -1 : 0;
          tt.push(side ? +(arms[side].T[j] / arms[side].wrist).toFixed(3) : 0);    // 0 shoulder .. 1 wrist .. >1 hand
        }
        idx.push(used.get(j));
      });
    }
    parts[name] = { p: pos, i: idx, ...(name.startsWith("arm") ? { t: tt } : {}) };
  }
  const prof = [];
  for (let y = 0.3; y <= neck + 0.001; y += 0.05) {
    const pts = y > crotch + 0.2 ? section(y, (k) => k === "torso") : y > crotch ? section(y, (k) => k === "torso" || (k.startsWith("leg") || k.startsWith("shin"))) : section(y, (k) => (k.startsWith("leg") || k.startsWith("shin")));
    if (pts.length < 3) continue;
    prof.push([+y.toFixed(2), +Math.max(...pts.map((p) => Math.abs(p[0]))).toFixed(3), +Math.min(...pts.map((p) => p[1])).toFixed(3), +Math.max(...pts.map((p) => p[1])).toFixed(3)]);
  }
  const headPts = Ps.filter((p, i) => kind[i] === "head");
  const eyeY = neck + (headTop - neck) * 0.55;
  const face = headPts.filter((p) => Math.abs(p[1] - eyeY) < 0.03 && Math.abs(p[0]) < 0.03);
  const R = arms[1];
  const gripLocal = sub(sc(R.grip), shoulder);
  const r3 = (a) => a.map((x) => +x.toFixed(4));
  return {
    parts,
    rig: {
      pivots: Object.fromEntries(Object.entries(pivots).map(([k, v]) => [k, r3(v)])),
      grip: r3(gripLocal), gripAxis: r3(R.gripAxis), knee: rigKnee,
      gripL: r3(sub(sc(arms[-1].grip), pivots.armL)), gripAxisL: r3(arms[-1].gripAxis),
      height: +headTop.toFixed(3), neck: +neck.toFixed(3), crotch: +crotch.toFixed(3),
      head: { top: +(headTop - headPivot[1]).toFixed(3), chin: +(neck - headPivot[1]).toFixed(3), halfW: +Math.max(...headPts.map((p) => Math.abs(p[0]))).toFixed(3),
        front: +(Math.max(...face.map((p) => p[2])) - headPivot[2]).toFixed(3), back: +(Math.min(...headPts.map((p) => p[2])) - headPivot[2]).toFixed(3), eye: +(eyeY - headPivot[1]).toFixed(3) },
      armLen: +(R.wrist * SCALE).toFixed(3),
      torso: prof,
    },
  };
}

const data = JSON.parse(fs.readFileSync(CACHE));
const out = {};
for (const [k, J] of Object.entries(SRC)) out[k] = build(data[J.mesh], J);
fs.writeFileSync(OUT, JSON.stringify(out));
for (const [k, b] of Object.entries(out)) console.log(k, Object.entries(b.parts).map(([n, p]) => `${n}:${p.i.length / 3}`).join(" "), JSON.stringify({ ...b.rig, torso: undefined }));
console.log(`-> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
