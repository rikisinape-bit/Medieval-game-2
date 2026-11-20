// Poses of the skinned humans (models.js: bones in userData.B). poseHuman() runs every frame: it builds the pose of
// what the character is doing (walking, running and creeping from gait curves of real steps, everything else from
// key poses), plants the feet with a small inverse kinematics on the legs, keeps every joint within what a real one
// can do (elbows and knees bend one way only, nothing folds into the body), cross-fades between activities, and
// returns how high the character must stand for its feet to touch the ground.
import * as THREE from "three";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const TAU = Math.PI * 2;

// ---------- a pose: rotations (x, y, z) of each bone, and where the pelvis is moved ----------
const CH = ["pel", "pelP", "spine", "chest", "neck", "head", "clavR", "clavL", "armR", "armL", "foreR", "foreL", "handR", "handL",
  "thighR", "thighL", "shinR", "shinL", "footR", "footL"];
const BONE_OF = { pel: "pelvis", spine: "spine", chest: "chest", neck: "neck", head: "head", clavR: "clavR", clavL: "clavL", armR: "upperArmR", armL: "upperArmL",
  foreR: "forearmR", foreL: "forearmL", handR: "handR", handL: "handL", thighR: "thighR", thighL: "thighL", shinR: "shinR", shinL: "shinL", footR: "footR", footL: "footL" };
const newPose = () => Object.fromEntries(CH.map((c) => [c, [0, 0, 0]]));
const clearPose = (P) => { for (const c of CH) { const a = P[c]; a[0] = 0; a[1] = 0; a[2] = 0; } return P; };
const set = (P, c, x = 0, y = 0, z = 0) => { P[c][0] = x; P[c][1] = y; P[c][2] = z; return P; };
const add = (P, c, x = 0, y = 0, z = 0) => { P[c][0] += x; P[c][1] += y; P[c][2] += z; return P; };
const flat = (P, a = new Float32Array(CH.length * 3)) => { CH.forEach((c, i) => { a[i * 3] = P[c][0]; a[i * 3 + 1] = P[c][1]; a[i * 3 + 2] = P[c][2]; }); return a; };
const blend = (A, B, k) => { const o = newPose(); CH.forEach((c) => { for (let i = 0; i < 3; i++) o[c][i] = A[c][i] + (B[c][i] - A[c][i]) * k; }); return o; };
// a key pose written as { channel: [x, y, z] } (the rest 0); mirror() swaps the sides of an asymmetric pose
const key = (o) => { const P = newPose(); Object.entries(o).forEach(([c, v]) => set(P, c, ...v)); return P; };

// Joint limits (radians): a joint never goes where a real one cannot (no broken arm, no knee bent forwards).
const LIM = {
  pel: [[-0.6, 0.6], [-0.9, 0.9], [-0.4, 0.4]], spine: [[-0.4, 0.7], [-0.7, 0.7], [-0.4, 0.4]], chest: [[-0.4, 0.6], [-0.7, 0.7], [-0.35, 0.35]],
  neck: [[-0.6, 0.7], [-0.8, 0.8], [-0.4, 0.4]], head: [[-0.6, 0.6], [-0.8, 0.8], [-0.4, 0.4]],
  clavR: [[-0.3, 0.3], [-0.45, 0.3], [-0.15, 0.5]], clavL: [[-0.3, 0.3], [-0.3, 0.45], [-0.5, 0.15]],
  armR: [[-3.1, 1.0], [-1.8, 1.8], [-0.9, 2.7]], armL: [[-3.1, 1.0], [-1.8, 1.8], [-2.7, 0.9]],
  foreR: [[-2.4, 0.0], [-0.9, 0.9], [-0.15, 0.15]], foreL: [[-2.4, 0.0], [-0.9, 0.9], [-0.15, 0.15]],
  handR: [[-1.1, 1.1], [-1.2, 1.2], [-0.9, 0.9]], handL: [[-1.1, 1.1], [-1.2, 1.2], [-0.9, 0.9]],
  thighR: [[-2.1, 0.9], [-0.7, 0.7], [-0.45, 1.0]], thighL: [[-2.1, 0.9], [-0.7, 0.7], [-1.0, 0.45]],
  shinR: [[0, 2.45], [-0.1, 0.1], [-0.1, 0.1]], shinL: [[0, 2.45], [-0.1, 0.1], [-0.1, 0.1]],
  footR: [[-0.8, 1.0], [-0.5, 0.5], [-0.4, 0.4]], footL: [[-0.8, 1.0], [-0.5, 0.5], [-0.4, 0.4]],
};

// ---------- the character's measures (from the joints of its skeleton) ----------
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function dims(u) {
  if (u._dims) return u._dims;
  const g = u.geo, J = (n) => V3(g.joints[g.bones.indexOf(n)]);
  const pel = J("pelvis"), D = { pel, sides: {}, J: Object.fromEntries(g.bones.map((b) => [b, J(b)])) };
  for (const s of ["R", "L"]) {
    const hip = J("thigh" + s), knee = J("shin" + s), ank = J("foot" + s);
    const L1 = hip.distanceTo(knee), L2 = knee.distanceTo(ank), line = ank.clone().sub(hip), len = line.length();
    const th1 = Math.atan2(knee.z - hip.z, hip.y - knee.y), th2 = Math.atan2(ank.z - knee.z, knee.y - ank.y);   // forward angles of thigh and shin
    D.sides[s] = { hip, knee, ank, L1, L2, restF: Math.atan2(line.z, -line.y), restAb: Math.asin(clamp(line.x / len, -1, 1)), th1, flex0: th1 - th2,
      a0: Math.acos(clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1)) };
  }
  D.ankleY = D.sides.R.ank.y; D.hipW = Math.abs(D.sides.R.hip.x);
  const pv = g.pivots.armR;                                 // geo.grip is given from the old arm pivot
  D.grip = new THREE.Vector3(pv[0] + g.grip[0], pv[1] + g.grip[1], pv[2] + g.grip[2]).sub(D.J.handR); D.gripAxis = V3(g.gripAxis).normalize();
  const pl = g.pivots.armL;
  D.gripL = new THREE.Vector3(pl[0] + g.gripL[0], pl[1] + g.gripL[1], pl[2] + g.gripL[2]).sub(D.J.handL); D.gripAxisL = V3(g.gripAxisL).normalize();
  D.foot = g.heelToe.map((p) => [p[0] - D.sides.R.ank.x, p[1] - D.sides.R.ank.y, p[2] - D.sides.R.ank.z]);   // heel, toe from the ankle (right side)
  return (u._dims = D);
}

// ---------- legs: inverse kinematics (the ankle where it is asked, the foot flat or tilted) ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// target: the ankle in the body's space (x, y, z); pitch: the foot's tilt from flat (+ = heel up, on the toes)
function legIK(P, D, s, target, pitch = 0, yaw = 0) {
  const S = D.sides[s];
  _q.setFromEuler(_e.set(P.pel[0], P.pel[1], P.pel[2], "XYZ"));
  const hip = _v.copy(S.hip).sub(D.pel).applyQuaternion(_q).add(D.pel).add(_w.set(P.pelP[0], P.pelP[1], P.pelP[2]));
  const d = _w.set(target[0], target[1], target[2]).sub(hip).applyQuaternion(_q2.copy(_q).invert());   // in the pelvis' space
  const len = clamp(d.length(), Math.abs(S.L1 - S.L2) + 0.03, S.L1 + S.L2 - 0.004);
  const kneeFlex = Math.PI - Math.acos(clamp((S.L1 * S.L1 + S.L2 * S.L2 - len * len) / (2 * S.L1 * S.L2), -1, 1));
  const a = Math.acos(clamp((S.L1 * S.L1 + len * len - S.L2 * S.L2) / (2 * S.L1 * len), -1, 1));
  const ab = Math.asin(clamp(d.x / d.length(), -1, 1)), F = Math.atan2(d.z, -d.y);
  set(P, "thigh" + s, -(F + a - (S.restF + S.a0)), 0, ab - S.restAb);
  set(P, "shin" + s, kneeFlex - S.flex0, 0, 0);
  footFlat(P, s, pitch, yaw);
}
// the foot level with the ground (whatever the pelvis, thigh and knee do), then tilted by pitch, turned by yaw
function footFlat(P, s, pitch = 0, yaw = 0) {
  _q.setFromEuler(_e.set(P.pel[0], P.pel[1], P.pel[2], "XYZ"));
  _q.multiply(_q2.setFromEuler(_e.set(P["thigh" + s][0], P["thigh" + s][1], P["thigh" + s][2], "XYZ")));
  _q.multiply(_q2.setFromEuler(_e.set(P["shin" + s][0], 0, 0, "XYZ")));
  _q2.setFromEuler(_e.set(pitch, yaw, 0, "XYZ"));
  _q.invert().multiply(_q2);
  _e.setFromQuaternion(_q, "XYZ");
  set(P, "foot" + s, _e.x, _e.y, _e.z);
}
// a planted stance: the pelvis lowered by drop (and moved, turned), each foot at (x out, z forward) from under its hip
function stance(P, D, { drop = 0, fr = [0.0, 0.0], fl = [0.0, 0.0], pitchR = 0, pitchL = 0, yawR = 0, yawL = 0 }) {
  P.pelP[1] -= drop;
  legIK(P, D, "R", [D.sides.R.ank.x + fr[0], D.ankleY, D.sides.R.ank.z + fr[1]], pitchR, yawR);
  legIK(P, D, "L", [D.sides.L.ank.x - fl[0], D.ankleY, D.sides.L.ank.z + fl[1]], pitchL, yawL);
}

// ---------- arms: inverse kinematics (the wrist where it is asked, the elbow towards pole) ----------
const PARENT = { spine: "pelvis", chest: "spine", clavR: "chest", clavL: "chest", neck: "chest", head: "neck", upperArmR: "clavR", upperArmL: "clavL",
  forearmR: "upperArmR", forearmL: "upperArmL", handR: "forearmR", handL: "forearmL" };
const CH_OF = { pelvis: "pel", spine: "spine", chest: "chest", clavR: "clavR", clavL: "clavL", neck: "neck", head: "head", upperArmR: "armR", upperArmL: "armL",
  forearmR: "foreR", forearmL: "foreL", handR: "handR", handL: "handL" };
// where a bone is and how it is turned (body space), from the pose's channels
function boneFK(P, D, name) {
  const chain = []; for (let n = name; n; n = PARENT[n]) chain.unshift(n);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), tq = new THREE.Quaternion(), off = new THREE.Vector3();
  chain.forEach((n, i) => {
    const c = P[CH_OF[n]], ord = n.startsWith("upperArm") ? "XZY" : "XYZ";
    if (i === 0) pos.copy(D.pel).add(off.set(P.pelP[0], P.pelP[1], P.pelP[2]));
    else pos.add(off.copy(D.J[n]).sub(D.J[chain[i - 1]]).applyQuaternion(q));
    q.multiply(tq.setFromEuler(_e.set(c[0], c[1], c[2], ord)));
  });
  return { pos, q };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
// s: "R" | "L"; target: the wrist (body space); pole: where the elbow points; twist: the forearm turned on itself
function armIK(P, D, s, target, pole = [0, -1, 0], twist = 0) {
  const S0 = D.J["upperArm" + s], E0 = D.J["forearm" + s], W0 = D.J["hand" + s];
  const u0 = E0.clone().sub(S0), f0 = W0.clone().sub(E0), L1 = u0.length(), L2 = f0.length();
  const par = boneFK(P, D, "clav" + s), S = S0.clone().sub(D.J["clav" + s]).applyQuaternion(par.q).add(par.pos);   // the shoulder, posed
  const T = _a.set(target[0], target[1], target[2]), n = _b.copy(T).sub(S); let d = n.length(); n.normalize();
  d = clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.005);
  // the elbow: on the circle around the shoulder-wrist line, towards the pole
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  const pv = _c.set(pole[0], pole[1], pole[2]); pv.sub(_d.copy(n).multiplyScalar(pv.dot(n))).normalize();
  const E = S.clone().addScaledVector(n, x).addScaledVector(pv, h), Wt = S.clone().addScaledVector(n, d);
  // elbow bend (the rest arm is already a little bent)
  const bend = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)), bend0 = u0.angleTo(f0);
  set(P, "fore" + s, -(bend - bend0), twist, 0);
  // upper arm: turn the rest upper arm (as the parent holds it) onto shoulder->elbow, then around that line so the
  // bent forearm points at the wrist
  const up0 = u0.clone().applyQuaternion(par.q).normalize(), want = E.clone().sub(S).normalize();
  const q1 = _q3.setFromUnitVectors(up0, want);
  const qf = new THREE.Quaternion().setFromEuler(_e.set(-(bend - bend0), twist, 0, "XYZ"));
  const fNow = f0.clone().applyQuaternion(qf).applyQuaternion(par.q).applyQuaternion(q1), fWant = Wt.clone().sub(E);
  const perp = (v) => v.sub(_d.copy(want).multiplyScalar(v.dot(want))).normalize();
  const a1 = perp(fNow.clone()), a2 = perp(fWant.clone());
  const ang = Math.atan2(_d.copy(a1).cross(a2).dot(want), a1.dot(a2));
  const q2 = _q4.setFromAxisAngle(want, ang);
  const qLocal = par.q.clone().invert().multiply(q2).multiply(q1).multiply(par.q);
  _e.setFromQuaternion(qLocal, "XZY");
  set(P, "arm" + s, _e.x, _e.y, _e.z);
}
// a point near the body (body space) from the rest joints: e.g. bodyPt(D, "head", 0, -0.03, 0.12) = the mouth
const bodyPt = (D, joint, x = 0, y = 0, z = 0) => [D.J[joint].x + x, D.J[joint].y + y, D.J[joint].z + z];
// the same point carried by the posed trunk (pelvis, spine, chest, neck, head as the pose has them)
function posedPt(P, D, joint, x = 0, y = 0, z = 0) {
  const { pos, q } = boneFK(P, D, joint);
  return _a.set(x, y, z).applyQuaternion(q).add(pos).toArray();
}

// ---------- gait: joint angles over a step cycle (0 = right heel strike), from measured human walking ----------
// [cycle, hip flexion, knee flexion, ankle dorsiflexion] (radians)
const WALK = [[0, 0.42, 0.06, 0.0], [0.1, 0.4, 0.28, -0.1], [0.3, 0.12, 0.1, 0.1], [0.5, -0.18, 0.08, 0.16], [0.6, -0.12, 0.62, -0.3], [0.73, 0.22, 1.08, -0.08], [0.87, 0.46, 0.45, 0.04]];
const RUN = [[0, 0.62, 0.38, 0.1], [0.15, 0.42, 0.7, 0.28], [0.32, 0.0, 0.42, 0.1], [0.42, -0.3, 0.5, -0.45], [0.58, -0.05, 1.45, -0.2], [0.75, 0.62, 1.85, 0.05], [0.9, 0.8, 0.95, 0.12]];
function gait(T, c) {                                   // smooth periodic interpolation (Catmull-Rom)
  c = ((c % 1) + 1) % 1;
  let i = T.length - 1; while (i > 0 && T[i][0] > c) i--;
  const k0 = T[(i - 1 + T.length) % T.length], k1 = T[i], k2 = T[(i + 1) % T.length], k3 = T[(i + 2) % T.length];
  const t1 = k1[0], t2 = k2[0] <= t1 ? k2[0] + 1 : k2[0], f = (c < t1 ? c + 1 : c) - t1, u = f / (t2 - t1);
  const out = [];
  for (let j = 1; j < 4; j++) {
    const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j];
    out.push(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u));
  }
  return out;
}
// legs, pelvis and arm swing of a step cycle. kind: "walk" | "run" | "sneak"
function stepLegs(P, t, kind, long = false) {
  const run = kind === "run", sneak = kind === "sneak", T = run ? RUN : WALK, c = t * 9 / TAU;   // (9 rad/s as the old walk)
  const R = gait(T, c), L = gait(T, c + 0.5), amp = sneak ? 0.6 : long ? 0.8 : 1;
  if (long) { R[1] *= 0.55; L[1] *= 0.55; }                // in a long dress: shorter steps, the feet stay under the hem
  const crouchH = sneak ? 0.78 : 0, crouchK = sneak ? 1.15 : 0;
  set(P, "thighR", -(R[0] * amp + crouchH), 0, 0.03); set(P, "thighL", -(L[0] * amp + crouchH), 0, -0.03);
  set(P, "shinR", R[1] * amp + crouchK); set(P, "shinL", L[1] * amp + crouchK);
  const tw = Math.sin(c * TAU), lift = Math.cos(c * TAU * 2);
  add(P, "pel", sneak ? 0.32 : run ? 0.1 : 0.03, -(run ? 0.12 : 0.07) * tw, (run ? 0.03 : 0.045) * tw);   // the hips turn and drop with the step
  footFlat(P, "R", -R[2] * amp); footFlat(P, "L", -L[2] * amp);
  // the shoulders turn against the hips, the arms swing against the legs (the elbows bend more going forward)
  add(P, "chest", 0, (run ? 0.22 : 0.12) * tw, 0); add(P, "spine", 0, (run ? 0.08 : 0.05) * tw, -0.4 * P.pel[2]);
  const sw = run ? 0.75 : sneak ? 0.25 : 0.5;
  const aR = sw * (R[0] - 0.12), aL = sw * (L[0] - 0.12);
  set(P, "armR", aR, 0, 0.08); set(P, "armL", aL, 0, -0.08);
  set(P, "foreR", run ? -1.45 - 0.25 * Math.max(0, -aR) : -0.25 - 0.55 * Math.max(0, -aR)); set(P, "foreL", run ? -1.45 - 0.25 * Math.max(0, -aL) : -0.25 - 0.55 * Math.max(0, -aL));
  return { lift: run ? 0.03 * Math.max(0, lift) : 0 };
}

// ---------- the poses ----------
// standing at rest: weight on one leg, breathing, a slow look around (ph: each character its own rhythm)
function idle(P, D, t, ph) {
  const br = Math.sin(t * 1.7 + ph), sway = Math.sin(t * 0.45 + ph);
  const left = Math.sin(ph * 3.7) > 0, sg = left ? -1 : 1;  // some rest on the right leg, some on the left
  add(P, "pel", 0.02, 0.03 * sway * sg, 0.03 * sway * sg); add(P, "pelP", 0.012 * sway * sg, 0, 0);
  stance(P, D, left ? { drop: 0.006, fr: [0.015, -0.03], fl: [0.01, 0.02], yawR: 0.18, yawL: -0.15 } : { drop: 0.006, fr: [0.01, 0.02], fl: [0.015, -0.03], yawR: 0.15, yawL: -0.18 });
  add(P, "spine", 0.02 + 0.008 * br, -0.5 * P.pel[1], -0.7 * P.pel[2]); add(P, "chest", 0.012 * br, 0, -0.3 * P.pel[2]);
  add(P, "clavR", 0, 0, 0.012 * br); add(P, "clavL", 0, 0, -0.012 * br);
  add(P, "armR", 0.04, 0, 0.06); add(P, "armL", 0.04, 0, -0.06);
  add(P, "foreR", -0.2 - 0.03 * br); add(P, "foreL", -0.25 - 0.03 * br);
  add(P, "handR", 0.05, 0, -0.08); add(P, "handL", 0.05, 0, 0.08);
  add(P, "head", 0.03 * Math.sin(t * 0.31 + ph), 0.22 * Math.sin(t * 0.21 + ph * 2) * Math.sin(t * 0.13 + ph), 0);
}

// combat stance: sword side back, knees bent, sword up in front, the other hand (or the shield) guarding
const GUARD_OF = (shield) => key({
  pel: [0.06, -0.28, 0], spine: [0.06, 0.12, 0], chest: [0.04, 0.12, 0], neck: [-0.02, 0.02, 0], head: [-0.02, 0.0, 0],
  armR: [-0.62, 0, 0.22], foreR: [-1.15, 0.15, 0], handR: [0.32, 0, 0],
  armL: shield ? [-0.85, 0, -0.32] : [-0.55, 0, -0.2], foreL: shield ? [-1.25, 0, 0] : [-1.35, 0, 0], handL: [0.15, 0, 0],
});
const GUARDS = [GUARD_OF(false), GUARD_OF(true)], GUARD = (shield) => GUARDS[shield ? 1 : 0];   // (read only)
const GUARD_FEET = { drop: 0.07, fr: [0.07, -0.2], fl: [0.06, 0.22], yawR: 0.35, yawL: -0.1 };

// Attacks: the cocked pose at the end of the windup, the blow at its end; legs: feet and drop of each.
const ATK = {
  over: {   // overhead chop: the sword goes up behind the head, the whole body comes down with it
    cock: key({ pel: [-0.04, -0.2, 0], pelP: [0, 0, -0.05], spine: [-0.12, 0.05, 0], chest: [-0.1, 0.12, 0], neck: [0.05, 0, 0], head: [0.05, 0, 0],
      clavR: [0, 0, 0.18], armR: [-2.7, 0, 0.32], foreR: [-1.55, 0, 0], handR: [0.55, 0, 0], armL: [-0.7, -0.3, -0.2], foreL: [-1.0, 0, 0] }),
    cockFeet: { drop: 0.05, fr: [0.08, -0.22], fl: [0.06, 0.2], pitchL: 0.15, yawR: 0.35 },
    hit: key({ pel: [0.12, 0.18, 0], pelP: [0, 0, 0.12], spine: [0.3, 0.05, 0], chest: [0.24, 0.1, 0], neck: [-0.15, 0, 0], head: [-0.05, 0, 0],
      clavR: [0, -0.15, 0], armR: [-0.55, 0, 0.12], foreR: [-0.15, 0, 0], handR: [-0.15, 0, 0], armL: [-0.25, 0, -0.35], foreL: [-1.0, 0, 0] }),
    hitFeet: { drop: 0.12, fr: [0.08, -0.32], fl: [0.06, 0.4], pitchR: 0.35, yawR: 0.3 },
  },
  side: {   // horizontal cut: the body winds up away from the blow, then unwinds and the arm sweeps across
    cock: key({ pel: [0.04, -0.4, 0], spine: [0.04, -0.25, 0], chest: [0.02, -0.45, 0], neck: [0, 0.4, 0], head: [0, 0.35, 0],
      clavR: [0, 0.15, 0.12], armR: [-0.55, Math.PI / 2, 1.2], foreR: [-1.35, 0, 0], handR: [-0.1, 0, 0], armL: [-0.75, 0, -0.45], foreL: [-1.1, 0, 0] }),
    cockFeet: { drop: 0.08, fr: [0.12, -0.18], fl: [0.08, 0.2], yawR: 0.4 },
    hit: key({ pel: [0.06, 0.4, 0], pelP: [0, 0, 0.06], spine: [0.08, 0.25, 0], chest: [0.06, 0.4, 0], neck: [0, -0.35, 0], head: [0, -0.3, 0],
      clavR: [0, -0.25, 0], armR: [-1.35, Math.PI / 2, -0.3], foreR: [-0.15, 0, 0], handR: [-0.15, 0, 0], armL: [0.25, 0, -0.35], foreL: [-1.3, 0, 0] }),
    hitFeet: { drop: 0.1, fr: [0.1, -0.28], fl: [0.08, 0.32], pitchR: 0.3, yawR: 0.2 },
  },
  thrust: { // lunge: the fist drawn back to the hip, then the front leg steps far and the arm shoots straight forward
    cock: key({ pel: [0.05, -0.32, 0], pelP: [0, 0, -0.06], spine: [0.04, -0.12, 0], chest: [0.04, -0.25, 0], neck: [0, 0.2, 0], head: [0, 0.18, 0],
      clavR: [0, 0.2, 0], armR: [0.3, 0, 0.28], foreR: [-1.75, 0, 0], handR: [0.35, 0, 0], armL: [-1.0, 0, -0.1], foreL: [-0.55, 0, 0] }),
    cockFeet: { drop: 0.1, fr: [0.08, -0.25], fl: [0.06, 0.18], yawR: 0.4 },
    hit: key({ pel: [0.18, 0.12, 0], pelP: [0, 0, 0.26], spine: [0.15, 0.08, 0], chest: [0.08, 0.15, 0], neck: [-0.12, -0.1, 0], head: [-0.06, -0.08, 0],
      clavR: [0, -0.35, 0], armR: [-1.48, 0, 0.06], foreR: [-0.05, 0, 0], handR: [0.35, 0, 0], armL: [0.55, 0, -0.25], foreL: [-0.45, 0, 0] }),
    hitFeet: { drop: 0.16, fr: [0.08, -0.42], fl: [0.06, 0.62], pitchR: 0.45, yawR: 0.35 },
  },
  rise: {   // rising backhand: low on the other side, then up and out across the body
    cock: key({ pel: [0.12, 0.35, 0], spine: [0.1, 0.2, 0], chest: [0.12, 0.4, 0], neck: [0.05, -0.35, 0], head: [0.05, -0.3, 0],
      armR: [0.15, 0, -0.5], foreR: [-0.75, 0, 0], handR: [0.4, 0, 0], armL: [-0.45, 0, -0.35], foreL: [-1.2, 0, 0] }),
    cockFeet: { drop: 0.12, fr: [0.1, -0.15], fl: [0.06, 0.22] },
    hit: key({ pel: [-0.02, -0.38, 0], pelP: [0, 0, 0.05], spine: [-0.06, -0.2, 0], chest: [-0.06, -0.38, 0], neck: [-0.05, 0.35, 0], head: [-0.05, 0.3, 0],
      clavR: [0, 0, 0.3], armR: [-2.25, 0, 0.95], foreR: [-0.35, 0, 0], handR: [-0.45, 0, 0], armL: [-0.35, 0, -0.55], foreL: [-1.0, 0, 0] }),
    hitFeet: { drop: 0.06, fr: [0.1, -0.2], fl: [0.08, 0.28], pitchR: 0.2, yawR: 0.3 },
  },
};
const feetMix = (a, b, k) => ({ drop: a.drop + ((b.drop || 0) - a.drop) * k, ...Object.fromEntries(["fr", "fl"].map((f) => [f, [a[f][0] + (b[f][0] - a[f][0]) * k, a[f][1] + (b[f][1] - a[f][1]) * k]])),
  ...Object.fromEntries(["pitchR", "pitchL", "yawR", "yawL"].map((f) => [f, (a[f] || 0) + ((b[f] || 0) - (a[f] || 0)) * k])) });

function attack(P, D, mode, k, atk, shield) {
  const A = ATK[atk] || ATK.over, ready = GUARD(shield);
  let from, to, fa, fb, e;
  if (mode === "windup") { from = ready; to = A.cock; fa = GUARD_FEET; fb = A.cockFeet; e = ease(k); }
  else if (k < 0.7) { from = A.cock; to = A.hit; fa = A.cockFeet; fb = A.hitFeet; const s = clamp(k / 0.5, 0, 1); e = s < 1 ? 1 - (1 - s) * (1 - s) * (1 - s) : 1; }   // fast, then held
  else { from = A.hit; to = ready; fa = A.hitFeet; fb = GUARD_FEET; e = ease((k - 0.7) / 0.3); }                              // recover
  const B = blend(from, to, e); CH.forEach((c) => set(P, c, P[c][0] + B[c][0], P[c][1] + B[c][1], P[c][2] + B[c][2]));
  stance(P, D, feetMix(fa, fb, e));
}

// work, gestures, the rest (the trunk first, then the hands where they must be)
const sideV = (s, x, y, z) => [s === "R" ? x : -x, y, z];
// a point along what the right hand holds (along = metres from the fist along the handle), body space
const onHandle = (P, D, along, side = 0) => posedPt(P, D, "handR", D.grip.x + D.gripAxis.x * along + side, D.grip.y + D.gripAxis.y * along, D.grip.z + D.gripAxis.z * along);
function upper(P, D, t, mode, ph, shield) {
  const w = Math.sin(t * 5);
  switch (mode) {
    case "talk": {         // speaking with the hands: the near hand moves in front of the chest, the head nods
      const a = Math.sin(t * 2.4 + ph), b = Math.sin(t * 3.1 + 1 + ph);
      add(P, "chest", 0, 0.05 * a, 0);
      add(P, "head", 0.05 * Math.sin(t * 2.1 + ph), 0.12 * Math.sin(t * 0.9 + ph), 0.04 * Math.sin(t * 1.3));
      armIK(P, D, "R", posedPt(P, D, "chest", 0.15 + 0.05 * a, -0.04 + 0.07 * b, 0.3), sideV("R", 0.8, -1, -0.4));
      set(P, "handR", -0.25 + 0.25 * a, 0, -0.45 + 0.2 * b);
      add(P, "armL", -0.12, 0, -0.1); add(P, "foreL", -0.55 + 0.12 * Math.sin(t * 1.9 + ph)); add(P, "handL", 0.1, 0, 0.1);
      break;
    }
    case "eat": {          // bites: the fist comes up to the mouth, the other hand holds the food at the chest
      const c = 0.5 + 0.5 * Math.sin(t * 2.2 + ph);
      add(P, "head", 0.12 + 0.03 * Math.sin(t * 9) * c, 0, 0);
      armIK(P, D, "R", posedPt(P, D, "head", 0.03, -0.085 - 0.13 * (1 - c), 0.12 + 0.05 * (1 - c)), sideV("R", 0.6, -1, -0.2));
      set(P, "handR", -0.65, 0, -0.35);
      armIK(P, D, "L", posedPt(P, D, "chest", -0.1, -0.06, 0.29), sideV("L", 0.6, -1, -0.3)); set(P, "handL", -0.2, 0, 0.3);
      break;
    }
    case "drink":          // the cup at the lips, tilted, the head back
      add(P, "neck", -0.15); add(P, "head", -0.2);
      armIK(P, D, "R", posedPt(P, D, "head", 0.03, -0.075, 0.13), sideV("R", 0.6, -1, -0.1)); set(P, "handR", -1.0, 0, -0.3);
      add(P, "armL", -0.05, 0, -0.08); add(P, "foreL", -0.4);
      break;
    case "hammer": {       // the hammer goes up and comes down on the anvil, the other hand holds the piece
      const up = Math.abs(w);
      add(P, "spine", 0.12, 0.05, 0); add(P, "chest", 0.1 + 0.06 * (1 - up), 0.05, 0); add(P, "head", 0.25);
      add(P, "armR", -0.65 - 1.25 * up, -0.2, 0.3); add(P, "foreR", -0.45 - 1.15 * up); add(P, "handR", 0.2 - 0.6 * up, 0, 0);
      armIK(P, D, "L", posedPt(P, D, "chest", -0.1, -0.3, 0.42), sideV("L", 0.7, -1, -0.2)); set(P, "handL", 0.3, 0, 0.2);
      break;
    }
    case "chop": {         // two-handed axe: up over the head, down with the whole back; the left hand lower on the haft
      const c = Math.sin(t * 4), up = 0.5 + 0.5 * c;
      add(P, "spine", 0.3 * (1 - up) - 0.08 * up, 0, 0); add(P, "chest", 0.2 * (1 - up), 0, 0); add(P, "head", 0.2 * (1 - up));
      add(P, "armR", -2.5 * up - 0.4, 0, -0.05); add(P, "foreR", -0.4 - 0.6 * up); add(P, "handR", -0.4 * up, 0, 0);
      armIK(P, D, "L", onHandle(P, D, -0.16), sideV("L", 0.5, -1, -0.2)); set(P, "handL", -0.4 * up, 0, 0.2);
      break;
    }
    case "pump": {         // both hands on the pump's handle, up and down
      const c = Math.abs(Math.sin(t * 4));
      add(P, "spine", 0.1 + 0.08 * c);
      armIK(P, D, "R", posedPt(P, D, "chest", 0.12, -0.2 + 0.18 * c, 0.42), sideV("R", 0.7, -1, -0.3)); armIK(P, D, "L", posedPt(P, D, "chest", -0.06, -0.2 + 0.18 * c, 0.42), sideV("L", 0.7, -1, -0.3));
      break;
    }
    case "water": {        // the can held low in front with both hands
      const c = Math.sin(t * 3);
      add(P, "spine", 0.22); add(P, "chest", 0.08); add(P, "head", 0.2);
      armIK(P, D, "R", posedPt(P, D, "chest", 0.1, -0.42 + 0.04 * c, 0.4), sideV("R", 0.6, -1, -0.3)); armIK(P, D, "L", posedPt(P, D, "chest", -0.06, -0.36 + 0.04 * c, 0.38), sideV("L", 0.6, -1, -0.3));
      break;
    }
    case "sweep": {        // the broom swept side to side, the left hand higher on the handle
      const c = Math.sin(t * 4);
      add(P, "spine", 0.2, 0.25 * c, 0); add(P, "chest", 0.08, 0.15 * c, 0); add(P, "head", 0.25);
      add(P, "armR", -0.55, 0, 0.2 + 0.3 * c); add(P, "foreR", -0.7);
      armIK(P, D, "L", onHandle(P, D, 0.3), sideV("L", 0.6, -1, -0.3));
      break;
    }
    case "sell": add(P, "armR", -2.35, 0, 0.35 + 0.18 * Math.sin(t * 6)); add(P, "foreR", -0.55); add(P, "handR", 0, 0, 0.3 * Math.sin(t * 6)); add(P, "neck", -0.08); add(P, "head", -0.1); add(P, "armL", -0.1, 0, -0.08); add(P, "foreL", -0.4); break;
    case "read": case "carry":
      if (mode === "read") { add(P, "neck", 0.2); add(P, "head", 0.25); } else add(P, "spine", -0.06);
      for (const s of ["R", "L"]) { armIK(P, D, s, posedPt(P, D, "chest", s === "R" ? 0.13 : -0.13, mode === "read" ? -0.06 : -0.16, 0.3), sideV(s, 0.6, -1, -0.2)); set(P, "hand" + s, 0.15, 0, s === "R" ? -0.4 : 0.4); }
      break;
    case "cheer": { const c = Math.sin(t * 8); add(P, "armR", -2.75 + 0.15 * c, 0, 0.35); add(P, "armL", -2.75 - 0.15 * c, 0, -0.35); add(P, "foreR", -0.3); add(P, "foreL", -0.3); add(P, "head", -0.2); add(P, "spine", -0.08); break; }
    case "panic": {        // hands on the head
      const c = Math.sin(t * 9);
      add(P, "head", 0.15, 0.25 * c, 0); add(P, "spine", 0.15);
      for (const s of ["R", "L"]) { armIK(P, D, s, posedPt(P, D, "head", s === "R" ? 0.115 : -0.115, 0.0, 0.0), sideV(s, 1, -0.3, 0.3)); set(P, "hand" + s, -0.3, 0, 0); }
      break;
    }
    case "look": { const c = Math.sin(t * 1.2); add(P, "neck", 0, 0.3 * c, 0); add(P, "head", 0, 0.4 * c, 0); add(P, "chest", 0, 0.12 * c, 0); break; }
    case "guardUpper": {   // the guard's arms while walking
      const G = GUARD(shield); ["spine", "chest", "neck", "head", "armR", "foreR", "handR", "armL", "foreL", "handL"].forEach((c) => set(P, c, G[c][0], G[c][1] + P[c][1] * 0.3, G[c][2]));
      break;
    }
    default: break;
  }
}

// ---------- two-handed swords: both hands on the grip ----------
// The right fist at G on the posed chest (x right, y up, z forward), the blade along B (both turn with the chest), the
// left fist LEFT_BELOW lower on the grip: armIK puts the wrists there, the hands turn onto the blade. Standing and
// walking (rest), the guard, the parry (block) and each blow (the cocked pose and the blow, like ATK; the trunk and
// the legs are ATK's: the blow is wound up first, then it falls).
const LEFT_BELOW = 0.11;
const TWO = {
  rest: { G: [0.05, -0.36, 0.27], B: [0.05, -0.32, 0.95] },             // standing, walking: low, the point forward and down
  ready: { G: [0.06, -0.26, 0.34], B: [0.05, 0.72, 0.69] },            // in front of the belly, the blade up and forward
  block: { G: [0.12, 0.12, 0.36], B: [0.95, 0.3, 0.1] },              // the blade across in front of the face, the point out to the right
  // tw: the trunk's turn (+: the sword side back), lean: bent forward; the feet: ATK's
  side: { cock: { G: [0.22, 0.26, 0.06], B: [0.3, 0.75, -0.55], tw: 0.55, lean: -0.08 }, hit: { G: [-0.14, -0.3, 0.32], B: [-0.55, -0.45, 0.7], tw: -0.65, lean: 0.35 } },  // from over the right shoulder down to the left
  rise: { cock: { G: [-0.16, 0.12, 0.1], B: [-0.3, 0.8, -0.45], tw: -0.45, lean: -0.05 }, hit: { G: [0.22, -0.3, 0.38], B: [0.55, -0.45, 0.7], tw: 0.4, lean: 0.3 } },  // from over the left shoulder down to the right
  over: { cock: { G: [0.04, 0.42, -0.04], B: [0.0, 0.4, -0.92], tw: 0.1, lean: -0.25 }, hit: { G: [0.0, -0.3, 0.5], B: [0, -0.35, 0.94], tw: 0, lean: 0.45 } },    // over the head, straight down
  thrust: { cock: { G: [0.06, -0.22, 0.16], B: [0, 0.45, 0.89], tw: 0.45, lean: 0 }, hit: { G: [0.02, -0.08, 0.56], B: [0, 0.15, 0.99], tw: -0.15, lean: 0.25 } },
};
export const TWO_WIND = 0.34;                                          // (the share of a two-handed blow spent winding up)
const _g2 = new THREE.Vector3(), _b2 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _q5 = new THREE.Quaternion(), _q6 = new THREE.Quaternion();
// The hand turned so that what it holds points along b (body space): the forearm turns on itself (within its limits)
// as far as it helps, the wrist does the rest within its own (the best of a few turns of the forearm).
const _Y3 = new THREE.Vector3(0, 1, 0), _qB = new THREE.Quaternion(), _qF = new THREE.Quaternion(), _qT = new THREE.Quaternion(), _ax = new THREE.Vector3(), _hb = [0, 0, 0];
function aimHand(P, D, s, b) {
  const axis = s === "R" ? D.gripAxis : D.gripAxisL, Lh = LIM["hand" + s], fore = P["fore" + s];
  _qB.copy(boneFK(P, D, "upperArm" + s).q).multiply(_qT.setFromEuler(_e.set(fore[0], 0, 0, "XYZ")));   // the forearm before its own turn
  let best = Infinity, bt = 0;
  for (let tw = -0.9; tw <= 0.9001; tw += 0.15) {
    _qF.copy(_qB).multiply(_qT.setFromAxisAngle(_Y3, tw));
    _q5.setFromUnitVectors(axis, _h2.copy(b).applyQuaternion(_q6.copy(_qF).invert()));
    _e.setFromQuaternion(_q5, "XYZ");
    const x = clamp(_e.x, Lh[0][0], Lh[0][1]), y = clamp(_e.y, Lh[1][0], Lh[1][1]), z = clamp(_e.z, Lh[2][0], Lh[2][1]);
    const err = _ax.copy(axis).applyQuaternion(_q6.setFromEuler(_e.set(x, y, z, "XYZ"))).applyQuaternion(_qF).angleTo(b) + 0.02 * Math.abs(tw);
    if (err < best) { best = err; bt = tw; _hb[0] = x; _hb[1] = y; _hb[2] = z; }
  }
  fore[1] = bt; set(P, "hand" + s, _hb[0], _hb[1], _hb[2]);
}
function holdAt(P, D, s, p, b, pole) {     // the fist of arm s at p (body space), holding along b
  const grip = s === "R" ? D.grip : D.gripL;
  _w2.copy(grip).applyQuaternion(_q5.setFromUnitVectors(s === "R" ? D.gripAxis : D.gripAxisL, b)).negate().add(p);   // the wrist, a first guess
  for (let i = 0; i < 3; i++) {
    armIK(P, D, s, _w2.toArray(), pole, P["fore" + s][1]); aimHand(P, D, s, b);   // (with the forearm's turn found last time)
    const at = posedPt(P, D, "hand" + s, grip.x, grip.y, grip.z);
    _w2.x += p.x - at[0]; _w2.y += p.y - at[1]; _w2.z += p.z - at[2];
  }
  armIK(P, D, s, _w2.toArray(), pole, P["fore" + s][1]);                // (the wrist where it must be, with the last turn)
}
function twoHands(P, D, K) {
  const { pos, q } = boneFK(P, D, "chest"), G = K.G;
  const g = _g2.set(G[0], G[1], G[2]).applyQuaternion(q).add(pos), b = _b2.set(K.B[0], K.B[1], K.B[2]).normalize().applyQuaternion(q);
  const hi = clamp(G[1] / 0.4, 0, 1);                                   // (high hands: the elbows out and forward)
  holdAt(P, D, "R", g.clone(), b.clone(), [0.8, -0.9 + 1.1 * hi, -0.25 + 0.6 * hi]);
  holdAt(P, D, "L", g.clone().addScaledVector(b, -LEFT_BELOW), b.clone(), [-0.8, -0.9 + 1.1 * hi, -0.25 + 0.6 * hi]);
  if (import.meta.env.DEV && globalThis.__twoDbg) {   // (tests: how far the hands and the blade are from what was asked, after the joint limits)
    const err = (s, p) => { const c = P["hand" + s].map((v, i) => clamp(v, LIM["hand" + s][i][0], LIM["hand" + s][i][1])); const keep = P["hand" + s].slice(); set(P, "hand" + s, ...c);
      const { q } = boneFK(P, D, "hand" + s), ax = (s === "R" ? D.gripAxis : D.gripAxisL).clone().applyQuaternion(q), at = posedPt(P, D, "hand" + s, ...(s === "R" ? D.grip : D.gripL).toArray());
      set(P, "hand" + s, ...keep); return [Math.round(THREE.MathUtils.radToDeg(ax.angleTo(b))), Math.round(100 * Math.hypot(at[0] - p.x, at[1] - p.y, at[2] - p.z))]; };
    globalThis.__twoDbg.push({ R: err("R", g), L: err("L", g.clone().addScaledVector(b, -LEFT_BELOW)), hand: [P.handR.map((v) => +v.toFixed(2)), P.handL.map((v) => +v.toFixed(2))] });
  }
}
const mix2 = (a, b, t) => ({ G: a.G.map((v, i) => v + (b.G[i] - v) * t), B: a.B.map((v, i) => v + (b.B[i] - v) * t), tw: (a.tw || 0) + ((b.tw || 0) - (a.tw || 0)) * t, lean: (a.lean || 0) + ((b.lean || 0) - (a.lean || 0)) * t });
// a two-handed blow: from the guard up to the cocked pose, then down fast to the blow, a moment held, back to the guard;
// the trunk turns and bends with it (tw, lean), the legs step as in ATK
function attack2(P, D, k, atk) {
  const A = TWO[atk] || TWO.over, S = ATK[atk] || ATK.over;
  let K, feet;
  if (k < TWO_WIND) { const e = ease(k / TWO_WIND); K = mix2(TWO.ready, A.cock, e); feet = feetMix(GUARD_FEET, S.cockFeet, e); }
  else {
    const s = (k - TWO_WIND) / (1 - TWO_WIND);
    if (s < 0.7) { const e = 1 - Math.pow(1 - clamp(s / 0.5, 0, 1), 3); K = mix2(A.cock, A.hit, e); feet = feetMix(S.cockFeet, S.hitFeet, e); }
    else { const e = ease((s - 0.7) / 0.3); K = mix2(A.hit, TWO.ready, e); feet = feetMix(S.hitFeet, GUARD_FEET, e); }
  }
  const tw = K.tw, ln = K.lean;
  set(P, "pel", 0.06 + 0.2 * ln, 0.3 * tw, 0); set(P, "pelP", 0, 0, 0.18 * ln);
  set(P, "spine", 0.06 + 0.5 * ln, 0.3 * tw, 0); set(P, "chest", 0.04 + 0.5 * ln, 0.4 * tw, 0);
  set(P, "neck", -0.1 - 0.3 * ln, -0.45 * tw, 0); set(P, "head", -0.05 - 0.25 * ln, -0.4 * tw, 0);
  stance(P, D, feet);
  twoHands(P, D, K);
}
function twoHanded(P, D, mode) {
  twoHands(P, D, mode === "block" ? TWO.block : mode === "guard" ? TWO.ready : TWO.rest);
}

// ---------- applying a pose ----------
function apply(u, A) {
  const B = u.B;
  CH.forEach((c, i) => {
    if (c === "pelP") return;
    const b = B[BONE_OF[c]], L = LIM[c];
    let x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2];
    if (!Number.isFinite(x)) x = 0; if (!Number.isFinite(y)) y = 0; if (!Number.isFinite(z)) z = 0;   // never a broken number on a bone
    if (L) { x = clamp(x, L[0][0], L[0][1]); y = clamp(y, L[1][0], L[1][1]); z = clamp(z, L[2][0], L[2][1]); }
    b.rotation.set(x, y, z);
  });
  const D = dims(u), i = CH.indexOf("pelP") * 3;
  const ok = (v) => (Number.isFinite(v) ? v : 0);
  B.pelvis.position.set(D.pel.x + ok(A[i]), D.pel.y + ok(A[i + 1]), D.pel.z + ok(A[i + 2]));
  u.body.rotation.set(0, 0, 0); u.body.position.set(0, 0, 0);
  u.head.scale.setScalar(u.headGone ? 0.001 : 1);
}
// lowest point of the feet (body space): the character stands on it
const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
function footLow(u) {
  const B = u.B, D = dims(u); let low = 1e9;
  B.pelvis.updateMatrix();
  for (const s of ["R", "L"]) {
    B["thigh" + s].updateMatrix(); B["shin" + s].updateMatrix(); B["foot" + s].updateMatrix();
    _m.copy(B.pelvis.matrix).multiply(B["thigh" + s].matrix).multiply(B["shin" + s].matrix).multiply(B["foot" + s].matrix);
    for (const f of D.foot) { _p.set(s === "R" ? f[0] : -f[0], f[1], f[2]).applyMatrix4(_m); low = Math.min(low, _p.y); }
  }
  return low;
}

// ---------- the skirt's helpers follow the legs (see body.js garmentSkin) ----------
// The front of each side follows its thigh going forward, the back going backward; the front below the knee follows
// the shin when the thigh is forward (a long skirt falls from the knees when sitting). Call it again after changing
// the hips by hand (riding).
export const followSkirt = (u) => {
  const s = u.skirt; if (!s) return;
  [[u.hipR, u.kneeR, s.FR, s.BR, s.KR], [u.hipL, u.kneeL, s.FL, s.BL, s.KL]].forEach(([hip, knee, F, Bk, K]) => {
    const r = hip.rotation;
    F.rotation.set(Math.min(0, r.x), r.y, r.z); Bk.rotation.set(Math.max(0, r.x), r.y, r.z);
    K.rotation.set(knee.rotation.x * clamp(-r.x / 0.4, 0, 1), 0, 0);
  });
};

// ---------- poseHuman ----------
// mode: what the character is doing (null = stand / walk); k: progress of timed moves (0..1). Attacks: "windup"
// then "swing", in the style userData.atk ("over" overhead chop, "side" horizontal cut, "thrust" lunge, "rise" rising
// backhand). Returns the height of the character's root (the feet on the ground; sitting: as before).
export function poseHuman(g, t, moving, mode, k = 0) {
  const u = g.userData, D = dims(u), ph = ((u.variant?.seed || 0) % 997) / 997 * TAU, shield = !!u.shield, long = !!u.geo?.long;
  const P = clearPose(u._P || (u._P = newPose()));
  let lift = 0, sitY = null;
  const walking = moving && !["sit", "sleep", "dead", "windup", "swing", "stagger"].includes(mode);
  switch (mode) {
    case "windup": case "swing":
      if (u.twoHand && mode === "swing") attack2(P, D, Math.min(1, k), u.atk || "over");   // a two-handed blow: wound up first, then it falls
      else attack(P, D, mode, Math.min(1, k), u.atk || "over", shield);
      break;
    case "slash": attack(P, D, "swing", Math.min(1, k * 1.6) * 0.7, "side", shield); break;
    case "guard":
      if (walking) { lift = stepLegs(P, t, "walk", long).lift; upper(P, D, t, "guardUpper", ph, shield); }
      else { const G = GUARD(shield); CH.forEach((c) => set(P, c, ...G[c])); add(P, "pelP", 0, 0.012 * Math.sin(t * 3 + ph), 0); add(P, "chest", 0.015 * Math.sin(t * 3 + ph)); stance(P, D, GUARD_FEET); }
      break;
    case "block": {
      const G = GUARD(shield); CH.forEach((c) => set(P, c, ...G[c]));
      set(P, "armR", -1.35, -0.35, 0.25); set(P, "foreR", -1.25, 0, 0); set(P, "handR", 0.55, 0, -0.35);
      set(P, "armL", shield ? -1.3 : -0.9, 0, -0.3); set(P, "foreL", shield ? -1.2 : -1.4); add(P, "spine", -0.08); add(P, "head", 0.08);
      if (walking) lift = stepLegs(P, t, "walk", long).lift; else stance(P, D, { ...GUARD_FEET, drop: 0.1 });
      break;
    }
    case "stagger":
      set(P, "pel", -0.12, 0.15, 0.05); set(P, "pelP", 0, 0, -0.08); set(P, "spine", -0.2, 0.1, 0); set(P, "chest", -0.15, 0.1, 0.05); set(P, "neck", -0.2, 0.15, 0); set(P, "head", -0.2, 0.2, 0);
      set(P, "armR", -0.55, 0, 0.85); set(P, "foreR", -0.6); set(P, "armL", -0.45, 0, -0.85); set(P, "foreL", -0.6);
      stance(P, D, { drop: 0.06, fr: [0.08, 0.05], fl: [0.1, -0.25], pitchL: 0.25 });
      break;
    case "run":
      if (moving) {
        lift = stepLegs(P, t, "run", long).lift; add(P, "spine", 0.1); add(P, "chest", 0.05); add(P, "neck", -0.08); add(P, "head", -0.06);
        add(P, "handR", 0.1); add(P, "handL", 0.1);
      } else idle(P, D, t, ph);
      break;
    case "sneak":
      if (moving) stepLegs(P, t, "sneak", long);
      else { set(P, "pel", 0.32); stance(P, D, { drop: 0.3, fr: [0.04, -0.12], fl: [0.04, 0.12], pitchR: 0.15 }); }
      add(P, "spine", 0.12); add(P, "chest", 0.1); add(P, "neck", -0.3); add(P, "head", -0.25);
      add(P, "armR", -0.55, 0, 0.12); add(P, "armL", -0.55, 0, -0.12); add(P, "foreR", -1.05); add(P, "foreL", -1.05);
      break;
    case "sit":          // on a bench or a saddle: thighs level, shins down, feet flat, hands on the thighs
      set(P, "thighR", -1.5, 0, 0.06); set(P, "thighL", -1.5, 0, -0.06); set(P, "shinR", 1.45); set(P, "shinL", 1.45);
      footFlat(P, "R", 0.15); footFlat(P, "L", 0.15);
      set(P, "spine", 0.05 + 0.01 * Math.sin(t * 1.7 + ph)); set(P, "chest", 0.04); set(P, "head", 0.1, 0.15 * Math.sin(t * 0.3 + ph), 0);
      for (const s of ["R", "L"]) { armIK(P, D, s, posedPt(P, D, "pelvis", s === "R" ? 0.13 : -0.13, 0.07, 0.31), sideV(s, 0.7, -0.3, -1)); set(P, "hand" + s, 0.45, 0, 0); }
      sitY = 0.45 - (u.geo?.pivots.legR[1] ?? 0.82);
      break;
    case "sleep":        // lying on the back (the engine lays the body down): hands on the belly, head turned
      set(P, "thighR", -0.12, 0, 0.05); set(P, "thighL", -0.05, 0, -0.08); set(P, "shinR", 0.3); set(P, "shinL", 0.15); set(P, "footR", 0.45); set(P, "footL", 0.4);
      set(P, "armR", -0.35, 0, 0.18); set(P, "armL", -0.3, 0, -0.18); set(P, "foreR", -1.55); set(P, "foreL", -1.45); set(P, "handR", 0.3, 0, -0.3); set(P, "handL", 0.3, 0, 0.3);
      set(P, "head", 0.05, 0.35, 0); set(P, "spine", 0.0 + 0.012 * Math.sin(t * 1.2)); sitY = 0;
      break;
    case "dead": set(P, "thighR", 0.1); set(P, "thighL", -0.15); set(P, "shinR", 0.3); set(P, "shinL", 0.12); set(P, "armR", -2.6, 0, 0.3); set(P, "armL", -2.8, 0, -0.3); set(P, "foreR", -0.4); set(P, "foreL", -0.3); sitY = 0; break;
    case "train": {      // practice: overhead chops one after the other
      const c = (t * 1.2) % 1;
      attack(P, D, c < 0.45 ? "windup" : "swing", c < 0.45 ? c / 0.45 : (c - 0.45) / 0.55, "over", shield); break;
    }
    default:
      if (walking) { lift = stepLegs(P, t, "walk", long).lift; if (mode === "carry" || mode === "read") { set(P, "armR", 0); set(P, "armL", 0); set(P, "foreR", 0); set(P, "foreL", 0); } }
      else if (["hammer", "chop", "water", "sweep", "pump"].includes(mode)) { set(P, "pel", 0.06); stance(P, D, { drop: mode === "chop" ? 0.06 : 0.035, fr: [0.08, -0.1], fl: [0.08, 0.12], yawR: 0.3, yawL: -0.2 }); add(P, "head", 0, 0, 0); }
      else idle(P, D, t, ph);
      upper(P, D, t, mode, ph, shield);
  }
  // a two-handed sword: both hands on its grip (not riding, talking, falling...)
  if (u.twoHand && (mode == null || ["run", "sneak", "block", "guard"].includes(mode))) twoHanded(P, D, mode);
  // the head looks where the body goes: it turns back what the pelvis and the trunk turned
  const turn = P.pel[1] + P.spine[1] + P.chest[1];
  if (!["windup", "swing", "slash", "train", "look", "sleep", "dead"].includes(mode)) { add(P, "neck", 0, -0.45 * turn, 0); add(P, "head", 0, -0.4 * turn, 0); }
  // cross-fade into a new activity (a blow: quickly)
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const tag = `${mode}|${walking}|${mode === "windup" || mode === "swing" ? "atk" : ""}`;
  if (u._last && u._tag !== tag) { u._from = Float32Array.from(u._last); u._t0 = now; u._dur = mode === "swing" ? 0.06 : mode === "windup" ? 0.12 : 0.25; }   // (copied before it is overwritten)
  u._tag = tag;
  const A = flat(P, u._A || (u._A = new Float32Array(CH.length * 3)));
  if (u._from) { const f = ease((now - u._t0) / u._dur); if (f >= 1) u._from = null; else for (let i = 0; i < A.length; i++) A[i] = u._from[i] + (A[i] - u._from[i]) * f; }
  u._last = A;
  apply(u, A);
  followSkirt(u);
  if (sitY !== null) return sitY;
  return (-footLow(u) + lift) * (u.variant?.height || 1);
}

// Height of a seated character's origin so that its hips are at hipsAt (saddle 1.87, carriage seat 1.17).
export const saddleY = (g, hipsAt) => hipsAt - (g.userData.geo?.pivots.legR[1] ?? 0.82) * (g.userData.variant?.height ?? 1);

// ---------- deaths ----------
// The character falls over p = 0..1 (DEATH_TIME seconds). kind 0 backwards, 1 face down, 2 to the knees then on the
// side, 3 spinning onto the side. The body (userData.body) turns around the feet; the limbs go slack as it falls.
export const DEATH_TIME = [1.1, 1.0, 2.0, 1.3];
export function poseDeath(g, kind, p) {
  const u = g.userData, D = dims(u), P = newPose(), body = u.body;
  const fall = (x) => { const k = clamp(x, 0, 1); return k * k; };                     // accelerating, like a fall
  let rot = [0, 0, 0], pos = [0, 0, 0];
  if (kind === 0) {                                        // hit, staggers back, knees give way, falls on the back
    const a = ease(p / 0.25), f = fall((p - 0.2) / 0.8), s = ease((p - 0.85) / 0.15);
    set(P, "spine", -0.25 * a + 0.1 * f, 0.1 * a, 0); set(P, "chest", -0.2 * a + 0.1 * f); set(P, "neck", -0.2 * a + 0.3 * f); set(P, "head", -0.3 * a + 0.2 * f - 0.15 * s, 0.4 * s, 0);
    set(P, "armR", -1.4 * a - 1.0 * f, 0, 0.6 * a + 0.4 * f); set(P, "armL", -1.2 * a - 1.1 * f, 0, -0.6 * a - 0.5 * f); set(P, "foreR", -0.8 * a + 0.5 * f); set(P, "foreL", -0.9 * a + 0.6 * f);
    set(P, "handR", 0.3 * f, 0, 0.3 * f); set(P, "handL", 0.3 * f, 0, -0.3 * f);
    set(P, "thighR", 0.2 * a - 0.55 * f, 0, 0.1 * f); set(P, "thighL", -0.25 * a - 0.15 * f, 0, -0.12 * f); set(P, "shinR", 0.4 * a + 0.55 * f); set(P, "shinL", 0.6 * a - 0.45 * f);
    set(P, "footR", 0.3 * f); set(P, "footL", 0.45 * f);
    rot = [-0.25 * a - (Math.PI / 2 - 0.25) * f, 0, 0]; pos = [0, 0.16 * f, -0.15 * a];
  } else if (kind === 1) {                                 // folds forward, arms out to break the fall, face down
    const a = ease(p / 0.2), f = fall((p - 0.15) / 0.85), s = ease((p - 0.85) / 0.15);
    set(P, "spine", 0.35 * a - 0.2 * f); set(P, "chest", 0.25 * a - 0.15 * f); set(P, "neck", 0.2 * a - 0.45 * f); set(P, "head", 0.15 * a - 0.35 * f, 0.9 * f, 0);
    set(P, "armR", -1.0 * a - 1.4 * f, 0, 0.3 * f); set(P, "armL", -1.1 * a - 1.5 * f, 0, -0.35 * f); set(P, "foreR", -0.5 * a + 0.35 * f); set(P, "foreL", -0.4 * a + 0.3 * f);
    set(P, "handR", -0.6 * f); set(P, "handL", -0.6 * f);
    set(P, "thighR", -0.35 * a + 0.3 * f); set(P, "thighL", -0.15 * a + 0.2 * f, 0, -0.1 * f); set(P, "shinR", 0.6 * a - 0.3 * f); set(P, "shinL", 0.35 * a - 0.15 * f + 0.25 * s);
    set(P, "footR", 0.6 * f); set(P, "footL", 0.7 * f);
    rot = [0.2 * a + (Math.PI / 2 - 0.2) * f, 0, 0]; pos = [0, 0.12 * f, 0.1 * a];
  } else if (kind === 2) {                                 // drops to the knees, sways, falls on the side
    const kn = ease(p / 0.35), f = fall((p - 0.55) / 0.45);
    set(P, "pel", 0.15 * kn * (1 - f)); set(P, "spine", 0.25 * kn * (1 - f) + 0.1 * f, 0, 0.15 * f); set(P, "chest", 0.15 * kn, 0, 0.1 * f); set(P, "neck", 0.3 * kn); set(P, "head", 0.35 * kn - 0.2 * f, 0, 0.3 * f);
    set(P, "thighR", -0.05 * kn - 0.9 * f, 0, 0.05); set(P, "thighL", -0.05 * kn - 0.6 * f, 0, -0.05); set(P, "shinR", 1.6 * kn + 0.25 * f); set(P, "shinL", 1.6 * kn + 0.1 * f);
    set(P, "footR", 0.8 * kn); set(P, "footL", 0.8 * kn);
    set(P, "armR", -0.3 * kn - 0.9 * f, 0, 0.15); set(P, "armL", -0.6 * kn - 1.2 * f, 0, -0.1); set(P, "foreR", -0.4 * kn); set(P, "foreL", -0.9 * kn + 0.5 * f);
    rot = [0.2 * kn * (1 - f), 0, (Math.PI / 2) * f]; pos = [0, -0.5 * kn * (1 - f) + 0.2 * f, 0];
  } else {                                                 // spins round and falls on the other side
    const f = fall(p / 0.9), sp = ease(p);
    set(P, "spine", 0.2 * f, 0.3 * sp, -0.2 * f); set(P, "chest", 0.1, 0.2 * sp, -0.15 * f); set(P, "neck", 0.2 * f); set(P, "head", 0.2 * f, -0.4 * f, 0.3 * f);
    set(P, "armR", -0.8 * f, 0, -0.2 * f); set(P, "armL", -1.2 * f, 0, 0.55 * f); set(P, "foreR", -0.7 * f); set(P, "foreL", -0.5 * f);     // the upper arm drapes over the chest
    set(P, "thighR", 0.15 * f); set(P, "thighL", -0.45 * f); set(P, "shinR", 0.25 * f); set(P, "shinL", 0.7 * f); set(P, "footR", 0.4 * f); set(P, "footL", 0.5 * f);
    rot = [0, 1.4 * sp, -(Math.PI / 2) * f]; pos = [0, 0.2 * f, 0];
  }
  apply(u, flat(P));
  body.rotation.set(rot[0], rot[1], rot[2]); body.position.set(pos[0], pos[1], pos[2]);
  u._last = null; u._from = null; u._tag = "dead";
  followSkirt(u);
}
