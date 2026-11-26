// Things that fall (engine.js: the picks, what lies about): a small rigid-body simulation against the ground. Each
// model becomes the outermost points of its surface (a rough convex hull: shapeOf), a middle (com: where its weight
// is, from its origin) and a resistance to turning (a box's, invI). In the air it flies and turns; where its points
// touch the ground (any height: ground(x, z)) the blows push it back, with a little bounce and with friction, so it
// tips over onto a side, a flat thing stops on a face, a round one rolls. It is left exactly where and how it comes to
// rest: never put back upright.
// A thing (pk) has its origin at x, y, z (the model's own, which the rest of the engine uses), its turn q (a
// THREE.Quaternion, in the world), its speed v and its turning w (THREE.Vector3, in the world, radians a second).
import * as THREE from "three";

const G = 9.81;
const H = 1 / 120, MAX_STEPS = 6, ITER = 6;   // steps of 1/120 s (at most 6 a frame), 6 passes over the contacts
const MU = 0.55;                              // friction
const BOUNCE = 0.25, BOUNCE_MIN = 1.2;        // how much of a blow comes back, from what speed (m/s)
const SLOP = 0.004;                           // a point this near the ground (m) touches it
const ROLL = 1.6;                             // on the ground, turning dies away (a round thing stops rolling)
const SLEEP_V = 0.04, SLEEP_T = 0.3, MAX_T = 14;   // none of its points moving faster (m/s) for 0.3 s: at rest
const TIRE_T = 6;                             // still going after 6 s (rolling down a slope): it slows to a stop
const MAX_W = 30, MAX_V = 20;

const UP = new THREE.Vector3(0, 1, 0), AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const shapes = new Map();

/** The shape of a model for falling (computed once for each key): its outermost points (from its middle), its
 *  middle (from its origin), its resistance to turning (inverse, mass 1). obj: the model, at its own origin. */
export function shapeOf(key, obj) {
  let s = shapes.get(key);
  if (s) return s;
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), m = new THREE.Matrix4(), vs = [];
  obj.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const st = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += st) vs.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
  });
  if (!vs.length) vs.push(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.2, 0.1));
  const box = new THREE.Box3().setFromPoints(vs), com = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  // the outermost point in each of many directions (evenly round the sphere, the box's corners and faces)
  const dirs = [];
  for (let i = 0, N = 64; i < N; i++) { const y = 1 - (2 * i + 1) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dirs.push(new THREE.Vector3(x * (size.x + 1e-4), y * (size.y + 1e-4), z * (size.z + 1e-4)).normalize());
  dirs.push(AX, AX.clone().negate(), UP, UP.clone().negate(), AZ, AZ.clone().negate());
  const take = new Set();
  for (const d of dirs) {
    let best = -Infinity, bi = 0;
    for (let i = 0; i < vs.length; i++) { const p = vs[i], k = (p.x - com.x) * d.x + (p.y - com.y) * d.y + (p.z - com.z) * d.z; if (k > best) { best = k; bi = i; } }
    take.add(bi);
  }
  const pts = [...take].map((i) => vs[i].clone().sub(com));
  const a = Math.max(size.x, 0.05), b = Math.max(size.y, 0.05), c = Math.max(size.z, 0.05);   // (never too thin to turn)
  const rad = Math.max(...pts.map((p) => p.length()));
  s = { pts, com, rad, invI: new THREE.Vector3(12 / (b * b + c * c), 12 / (a * a + c * c), 12 / (a * a + b * b)) };
  shapes.set(key, s);
  return s;
}

const _o = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _c = new THREE.Vector3(), _ax = new THREE.Vector3(), _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion();

/** Where its middle is, in the world. */
export function middle(pk, s, out = new THREE.Vector3()) {
  return out.copy(s.com).applyQuaternion(pk.q).add(_o.set(pk.x, pk.y, pk.z));
}
/** Puts it so that its middle is at c (as it is turned). */
export function placeMiddle(pk, s, c) {
  _o.copy(s.com).applyQuaternion(pk.q);
  pk.x = c.x - _o.x; pk.y = c.y - _o.y; pk.z = c.z - _o.z;
}
/** Lays it on the ground under it as it is turned (its origin's x and z stay): its lowest points on the ground. */
export function settle(pk, s, ground) {
  const m = _o.copy(s.com).applyQuaternion(pk.q), cx = pk.x + m.x, cz = pk.z + m.z;
  let lo = Infinity, cy = -Infinity;
  for (const p of s.pts) { const y = _r.copy(p).applyQuaternion(pk.q).y; if (y < lo) lo = y; }
  for (const p of s.pts) {
    _r.copy(p).applyQuaternion(pk.q);
    if (_r.y > lo + 0.15) continue;
    const need = ground(cx + _r.x, cz + _r.z) - _r.y;
    if (need > cy) cy = need;
  }
  pk.y = cy - m.y;
}

// the world's resistance to turning, applied to x (R · invI · Rᵀ x)
const turnBy = (s, q, x, out) => out.copy(x).applyQuaternion(_qi).multiply(s.invI).applyQuaternion(q);
// how hard it is to push the point r (from the middle) along dir
const massAt = (s, q, r, dir) => { _a.crossVectors(r, dir); turnBy(s, q, _a, _b); _a.crossVectors(_b, r); return 1 + dir.dot(_a); };
const push = (s, q, v, w, r, jx, jy, jz) => { v.x += jx; v.y += jy; v.z += jz; _a.set(jx, jy, jz); _b.crossVectors(r, _a); w.add(turnBy(s, q, _b, _a)); };
const velAt = (v, w, r) => _u.crossVectors(w, r).add(v);
const C = Array.from({ length: 24 }, () => ({ r: new THREE.Vector3(), t: 0, kn: 1, kx: 1, kz: 1, jn: 0, jx: 0, jz: 0 }));

/** Moves a falling thing on by dt. ground(x, z): the height there; keepOut(x, z) → [x, z]: out of walls. Returns
 *  { rest: it has come to rest (left as it is), hit: the hardest blow against the ground (m/s, for the sound) }. */
export function tumble(pk, s, dt, ground, keepOut) {
  const { q, v, w } = pk, c = middle(pk, s, _c);
  const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(dt / H - 0.01))), h = Math.min(dt / n, 1 / 60);
  let hit = 0, rest = false;
  for (let st = 0; st < n && !rest; st++) {
    v.y -= G * h;
    _qi.copy(q).invert();
    // the points touching the ground (or very nearly)
    const g0 = ground(c.x, c.z);
    let nc = 0;
    for (const p of s.pts) {
      const ct = C[nc], r = ct.r.copy(p).applyQuaternion(q), y = c.y + r.y;
      if (y > g0 + 0.3) continue;
      const d = ground(c.x + r.x, c.z + r.z) - y;
      if (d < -SLOP || d > 0.4) continue;                               // (above it; or deep under a step: a wall)
      const vn = velAt(v, w, r).y;
      ct.t = vn < -BOUNCE_MIN ? -BOUNCE * vn : d < 0 ? d / h : 0;          // a bounce; or just onto the ground, not into it
      if (-vn > hit) hit = -vn;
      ct.kn = massAt(s, q, r, UP); ct.kx = massAt(s, q, r, AX); ct.kz = massAt(s, q, r, AZ);
      ct.jn = ct.jx = ct.jz = 0;
      if (++nc === C.length) break;
    }
    // the ground pushes back where they touch (never pulls), friction holds them (as much as it can)
    for (let it = 0; it < ITER && nc; it++) {
      for (let i = 0; i < nc; i++) {
        const ct = C[i];
        let u = velAt(v, w, ct.r);
        const jn = Math.max(0, ct.jn + (ct.t - u.y) / ct.kn), dn = jn - ct.jn;
        ct.jn = jn;
        if (dn) push(s, q, v, w, ct.r, 0, dn, 0);
        u = velAt(v, w, ct.r);
        let jx = ct.jx - u.x / ct.kx, jz = ct.jz - u.z / ct.kz;
        const lim = MU * ct.jn, f = Math.hypot(jx, jz);
        if (f > lim) { const k = f > 1e-9 ? lim / f : 0; jx *= k; jz *= k; }
        push(s, q, v, w, ct.r, jx - ct.jx, 0, jz - ct.jz);
        ct.jx = jx; ct.jz = jz;
      }
    }
    if (nc) { const k = ROLL + Math.max(0, (pk.simT || 0) - TIRE_T) * 3; w.multiplyScalar(Math.max(0, 1 - k * h)); if (k > ROLL) v.multiplyScalar(Math.max(0, 1 - (k - ROLL) * h)); }
    if (w.lengthSq() > MAX_W * MAX_W) w.setLength(MAX_W);
    if (v.lengthSq() > MAX_V * MAX_V) v.setLength(MAX_V);
    // it moves and turns
    c.addScaledVector(v, h);
    const wl = w.length();
    if (wl > 1e-6) { _dq.setFromAxisAngle(_ax.copy(w).divideScalar(wl), wl * h); q.premultiply(_dq).normalize(); }
    // never into the ground (its deepest point back on it)...
    const g1 = ground(c.x, c.z);
    let pen = 0;
    for (const p of s.pts) {
      _r.copy(p).applyQuaternion(q);
      const y = c.y + _r.y;
      if (y > g1 + 0.12) continue;
      const d = ground(c.x + _r.x, c.z + _r.z) - y;
      if (d > pen && d < 0.4) pen = d;
    }
    c.y += pen;
    // ...nor into walls (it bounces off them a little)
    const [nx, nz] = keepOut(c.x, c.z), dx = nx - c.x, dz = nz - c.z, dl = Math.hypot(dx, dz);
    if (dl > 1e-6) {
      const ux = dx / dl, uz = dz / dl, vn = v.x * ux + v.z * uz;
      if (vn < 0) { v.x -= 1.3 * vn * ux; v.z -= 1.3 * vn * uz; w.multiplyScalar(0.7); }
      c.x = nx; c.z = nz;
    }
    // still long enough: at rest, as it is
    if (nc && v.length() + w.length() * s.rad < SLEEP_V) { pk.still = (pk.still || 0) + h; if (pk.still >= SLEEP_T) rest = true; }
    else pk.still = 0;
    pk.simT = (pk.simT || 0) + h;
    if (pk.simT > MAX_T) rest = true;
  }
  if (rest) { v.set(0, 0, 0); w.set(0, 0, 0); }
  placeMiddle(pk, s, c);
  return { rest, hit };
}
