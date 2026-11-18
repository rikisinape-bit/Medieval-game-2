// The first-person sword arm (models.js makeViewmodel): a shoulder group that turns the whole arm, an elbow that bends
// and lets the forearm turn on itself, a wrist that bends. A blow is a few key poses, each given as where the fist is,
// where the blade points, which way the cut goes (the edge must face it) and where the elbow should point; solveKey()
// turns a key into the arm's angles, mixPose() goes from one to the next joint by joint (natural arcs, the elbow
// opening and closing), applyPose() puts the result on the arm.
import * as THREE from "three";

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const HALF = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);   // the arm's half turn (tw)

// The arm's measures in its own space: elbow E0, wrist W0, the fist (G0) and what it holds (edge e0, flat n0, blade b0,
// as inFist orients it), the elbow's hinge (it bends the forearm towards the upper arm) and the forearm's own axis.
export function armRig(bones, fist) {
  const S0 = V(bones.S), E0 = V(bones.E), W0 = V(bones.W);
  const G0 = fist.position.clone().add(W0), qF = fist.quaternion;
  const u0 = E0.clone().sub(S0), we = W0.clone().sub(E0), f0 = we.clone().normalize();
  const hinge = u0.clone().cross(f0).normalize();
  return {
    E0, W0, G0, we, wg: G0.clone().sub(W0), f0, hinge, bend0: u0.angleTo(we),
    e0: new THREE.Vector3(1, 0, 0).applyQuaternion(qF), n0: new THREE.Vector3(0, 1, 0).applyQuaternion(qF), b0: new THREE.Vector3(0, 0, 1).applyQuaternion(qF),
  };
}

// Forearm and hand turns for elbow bend beta (0 = as modelled, already a little bent), forearm twist tau, wrist phi.
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const foreQ = (rig, beta, tau, out) => out.setFromAxisAngle(rig.hinge, beta).multiply(_qb.setFromAxisAngle(rig.f0, tau));
const handQ = (rig, phi, out) => out.setFromAxisAngle(rig.n0, phi);
// where the fist is (arm space) for these angles
const _qf = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _x = new THREE.Vector3();
function fistAt(rig, beta, tau, phi, out) {
  foreQ(rig, beta, tau, _qf); handQ(rig, phi, _qh);
  return out.copy(rig.wg).applyQuaternion(_qh).add(rig.we).applyQuaternion(_qf).add(rig.E0);
}
// the elbow bend that puts the fist at distance d from the shoulder (the arm folds as the bend grows)
function bendFor(rig, tau, phi, d) {
  let lo = -rig.bend0 + 0.03, hi = 2.3;
  if (fistAt(rig, lo, tau, phi, _x).length() <= d) return lo;
  if (fistAt(rig, hi, tau, phi, _x).length() >= d) return hi;
  for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fistAt(rig, m, tau, phi, _x).length() > d) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// A key pose (camera space: x right, y up, -z forward; shoulder = where the arm's group is):
// { hand: the fist, blade: where the blade points, cut: where it moves (the edge faces it), pole: where the elbow goes }.
// The fist is put where asked (as far as the arm reaches), the elbow as near to the pole as the blade allows; the
// forearm's twist and the wrist bring the blade and its edge as close as they can to what is asked.
export function solveKey(rig, shoulder, key) {
  const D = V(key.hand).sub(V(shoulder)), d = D.length(); D.normalize();
  const B = V(key.blade).normalize(), C = V(key.cut).normalize(); C.addScaledVector(B, -C.dot(B)).normalize();
  const pole = V(key.pole); pole.addScaledVector(D, -pole.dot(D));
  const hx = new THREE.Vector3(), E1 = new THREE.Vector3(), b1 = new THREE.Vector3(), e1 = new THREE.Vector3(), b = new THREE.Vector3(), e = new THREE.Vector3();
  const Q1 = new THREE.Quaternion(), qt = new THREE.Quaternion(), qs = new THREE.Quaternion(), L1 = rig.E0.length();
  let best = null;
  // swivel: how far (radians) the elbow may turn away from the pole around the shoulder-fist line (step: grid)
  const tryOne = (tau, phi, swivel, step, around) => {
    const beta = bendFor(rig, tau, phi, d);
    fistAt(rig, beta, tau, phi, hx).applyQuaternion(HALF).normalize();
    Q1.setFromUnitVectors(hx, D);                                                 // the arm aimed at the fist
    E1.copy(rig.E0).applyQuaternion(HALF).applyQuaternion(Q1); E1.addScaledVector(D, -E1.dot(D));
    const s0 = pole.lengthSq() > 1e-6 && E1.lengthSq() > 1e-8 ? Math.atan2(D.dot(_x.copy(E1).cross(pole)), E1.dot(pole)) : 0;   // the elbow turned to the pole
    // the pole matters as much as the elbow is bent: a straight arm may turn on itself freely
    const wPole = Math.min(1, E1.length() / L1 / 0.3);
    foreQ(rig, beta, tau, qt).multiply(handQ(rig, phi, _qa));
    b1.copy(rig.b0).applyQuaternion(qt).applyQuaternion(HALF).applyQuaternion(Q1); e1.copy(rig.e0).applyQuaternion(qt).applyQuaternion(HALF).applyQuaternion(Q1);
    const from = around === undefined ? -swivel : around - swivel - s0, to = around === undefined ? swivel : around + swivel - s0;
    for (let dl = from; dl <= to + 1e-9; dl += step) {
      qs.setFromAxisAngle(D, s0 + dl); b.copy(b1).applyQuaternion(qs); e.copy(e1).applyQuaternion(qs);
      const score = 1.4 * b.dot(B) + 1.2 * e.dot(C) - 0.12 * Math.abs(phi) - 0.5 * Math.max(0, Math.abs(phi) - 0.8) - 0.3 * Math.max(0, Math.abs(tau) - 1.0)
        - 0.6 * wPole * (1 - Math.cos(dl));
      if (!best || score > best.score) best = { score, tau, phi, beta, sw: s0 + dl, q1: Q1.clone() };
    }
  };
  for (let tau = -1.6; tau <= 1.6 + 1e-9; tau += 0.1) for (let phi = -1.1; phi <= 1.1 + 1e-9; phi += 0.1) tryOne(tau, phi, Math.PI, 0.1);
  const c = best;                                                                    // then finer, around the best
  for (let tau = c.tau - 0.1; tau <= c.tau + 0.1 + 1e-9; tau += 0.025) for (let phi = c.phi - 0.1; phi <= c.phi + 0.1 + 1e-9; phi += 0.025) tryOne(tau, phi, 0.12, 0.02, c.sw);
  return { q: new THREE.Quaternion().setFromAxisAngle(D, best.sw).multiply(best.q1), beta: best.beta, tau: best.tau, phi: best.phi };
}

export const restPose = (rx) => ({ q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), beta: 0, tau: 0, phi: 0 });
// joint by joint from a to b (t = 0..1)
export function mixPose(a, b, t, out) {
  out.q.slerpQuaternions(a.q, b.q, t);
  out.beta = a.beta + (b.beta - a.beta) * t; out.tau = a.tau + (b.tau - a.tau) * t; out.phi = a.phi + (b.phi - a.phi) * t;
  return out;
}
export function applyPose(rig, arm, bones, pose) {
  arm.quaternion.copy(pose.q);
  foreQ(rig, pose.beta, pose.tau, bones.fore.quaternion);
  handQ(rig, pose.phi, bones.hand.quaternion);
}
