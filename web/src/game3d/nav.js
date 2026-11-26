// The characters' way round things (the user, 27/11: "they get stuck when something is in front of them"): the
// shortest way, A* on a grid of CELL metres made when needed around where one is and where it wants to go, from what
// stops a body there: the engine's circles and boxes (houses, walls, trees of the places, stalls...), the trunks of the
// open country's trees, deep water. Each obstacle is widened by the body's radius, so the way keeps clear of them.
// A gate (a box with `gate: "<its name>"`, Valdoro's portcullis) is a wall while shut, except for whoever may open it
// (opens(name)): its cells are then marked with it, and the answer says which gates the way goes through (the engine
// raises them).
// The way is then straightened (from each point, straight on to the farthest one in sight) and returned as a list of
// points, the last one being the goal itself.
const CELL = 0.5, MARGIN = 14, MAXN = 230;          // the grid: the two points plus 14 m round them, at most 115 m a side
const SQ2 = Math.SQRT2;

/**
 * circles(): [{ x, z, r }]; boxes(): [{ cx, cz, hw, hd, ry, off, gate: name }] (as the engine's pushOut reads them);
 * trunks(x0, z0, x1, z1): the trunks [{ x, z, r }] in that box; wet(x, z): deep water there; wetNear(x0, z0, x1, z1):
 * whether the box may hold any (if not, wet is not asked cell by cell).
 */
export function createNav({ circles, boxes, trunks, wet, wetNear }) {
  let blk = new Uint8Array(0), gc = new Float32Array(0), came = new Int32Array(0), seen = new Uint32Array(0), shut = new Uint32Array(0);
  let hi = new Int32Array(0), hf = new Float32Array(0), hn = 0, stamp = 0;
  let W = 0, H = 0, ox = 0, oz = 0;
  const ensure = (n) => {
    if (blk.length >= n) return;
    blk = new Uint8Array(n); gc = new Float32Array(n); came = new Int32Array(n); seen = new Uint32Array(n); shut = new Uint32Array(n);
    hi = new Int32Array(n * 4); hf = new Float32Array(n * 4); stamp = 0;
  };
  // the grid's cells: 0 free, 1 a wall, 2 + g the shut gate gates[g] (one that the body asking may open)
  let gates = [];
  const mark = (i, j, v) => { const k = j * W + i; if (v === 1 || blk[k] === 0) blk[k] = v; };
  const range = (a, b, n) => [Math.max(0, Math.floor(a)), Math.min(n - 1, Math.floor(b))];
  function disc(cx, cz, r) {
    const [i0, i1] = range((cx - r - ox) / CELL, (cx + r - ox) / CELL, W), [j0, j1] = range((cz - r - oz) / CELL, (cz + r - oz) / CELL, H), r2 = r * r;
    for (let j = j0; j <= j1; j++) { const pz = oz + (j + 0.5) * CELL - cz; for (let i = i0; i <= i1; i++) { const px = ox + (i + 0.5) * CELL - cx; if (px * px + pz * pz <= r2) mark(i, j, 1); } }
  }
  function box(b, rad, v) {
    const c = Math.cos(b.ry), s = Math.sin(b.ry), hw = b.hw + rad, hd = b.hd + rad, ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const [i0, i1] = range((b.cx - ex - ox) / CELL, (b.cx + ex - ox) / CELL, W), [j0, j1] = range((b.cz - ez - oz) / CELL, (b.cz + ez - oz) / CELL, H);
    for (let j = j0; j <= j1; j++) {
      const dz = oz + (j + 0.5) * CELL - b.cz;
      for (let i = i0; i <= i1; i++) {
        const dx = ox + (i + 0.5) * CELL - b.cx;
        if (Math.abs(c * dx - s * dz) < hw && Math.abs(s * dx + c * dz) < hd) mark(i, j, v);
      }
    }
  }
  function build(x0, z0, x1, z1, rad, opens) {
    ox = x0; oz = z0; W = Math.ceil((x1 - x0) / CELL); H = Math.ceil((z1 - z0) / CELL); ensure(W * H); blk.fill(0, 0, W * H); gates = [];
    for (const o of circles()) if (o.x + o.r + rad > x0 && o.x - o.r - rad < x1 && o.z + o.r + rad > z0 && o.z - o.r - rad < z1) disc(o.x, o.z, o.r + rad);
    for (const b of boxes()) {
      if (b.off) continue;                                   // (an open gate, a door, a cage's open side)
      const e = b.hw + b.hd + rad;
      if (!(b.cx + e > x0 && b.cx - e < x1 && b.cz + e > z0 && b.cz - e < z1)) continue;
      const g = b.gate && opens(b.gate) && gates.length < 250 ? gates.push(b.gate) + 1 : 1;   // (2 + its index, or a wall)
      box(b, rad, g);
    }
    for (const t of trunks(x0, z0, x1, z1)) disc(t.x, t.z, t.r + rad);
    if (wetNear(x0, z0, x1, z1)) for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (blk[j * W + i] === 0 && wet(ox + (i + 0.5) * CELL, oz + (j + 0.5) * CELL)) blk[j * W + i] = 1;
  }
  const ok = (k) => blk[k] !== 1;
  // the nearest cell one may stand on (within 3 m), or -1
  function free(i, j) {
    for (let r = 0; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < W && b < H && ok(b * W + a)) return b * W + a;
    }
    return -1;
  }
  // the binary heap of open cells (by cost so far + the straight estimate)
  const push = (k, f) => { let p = hn++; while (p > 0) { const q = (p - 1) >> 1; if (hf[q] <= f) break; hi[p] = hi[q]; hf[p] = hf[q]; p = q; } hi[p] = k; hf[p] = f; };
  const pop = () => {
    const top = hi[0], k = hi[--hn], f = hf[hn];
    let p = 0;
    for (;;) { let q = p * 2 + 1; if (q >= hn) break; if (q + 1 < hn && hf[q + 1] < hf[q]) q++; if (hf[q] >= f) break; hi[p] = hi[q]; hf[p] = hf[q]; p = q; }
    hi[p] = k; hf[p] = f;
    return top;
  };
  function search(s, t) {
    stamp++; hn = 0;
    const ti = t % W, tj = (t / W) | 0;
    const est = (k) => { const dx = Math.abs((k % W) - ti), dz = Math.abs(((k / W) | 0) - tj); return dx + dz + (SQ2 - 2) * Math.min(dx, dz); };
    gc[s] = 0; seen[s] = stamp; came[s] = -1; push(s, est(s));
    while (hn) {
      const k = pop();
      if (k === t) return true;
      if (shut[k] === stamp) continue;
      shut[k] = stamp;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n = b * W + a;
        if (!ok(n) || shut[n] === stamp) continue;
        if (di && dj && (!ok(j * W + a) || !ok(b * W + i))) continue;   // (no cutting a corner)
        const g = gc[k] + (di && dj ? SQ2 : 1);
        if (seen[n] === stamp && gc[n] <= g) continue;
        seen[n] = stamp; gc[n] = g; came[n] = k; push(n, g + est(n));
      }
    }
    return false;
  }
  // whether the straight line between two points of the grid stays on cells one may stand on
  function sight(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (CELL * 0.5));
    for (let s = 1; s < n; s++) {
      const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n, i = Math.floor((x - ox) / CELL), j = Math.floor((z - oz) / CELL);
      if (i < 0 || j < 0 || i >= W || j >= H || !ok(j * W + i)) return false;
    }
    return true;
  }

  /**
   * The way from (sx, sz) to (tx, tz) for a body of radius rad; opens(name): whether it may open that gate. Returns
   * { pts: [[x, z], ...] (the last is the goal), gates: the names of the shut gates it goes through } or null (no need:
   * near, or too far for a grid, or no way at all: then straight on).
   */
  function path(sx, sz, tx, tz, { rad = 0.4, opens = () => false } = {}) {
    if (Math.hypot(tx - sx, tz - sz) < 1) return null;
    const x0 = Math.min(sx, tx) - MARGIN, z0 = Math.min(sz, tz) - MARGIN, x1 = Math.max(sx, tx) + MARGIN, z1 = Math.max(sz, tz) + MARGIN;
    if ((x1 - x0) / CELL > MAXN || (z1 - z0) / CELL > MAXN) return null;
    build(x0, z0, x1, z1, rad, opens);
    const ci = (x) => Math.min(W - 1, Math.max(0, Math.floor((x - ox) / CELL))), cj = (z) => Math.min(H - 1, Math.max(0, Math.floor((z - oz) / CELL)));
    const s = free(ci(sx), cj(sz)), t = free(ci(tx), cj(tz));
    if (s < 0 || t < 0 || !search(s, t)) return null;
    const cells = [];
    for (let k = t; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    const via = new Set();
    const at = (k) => [ox + ((k % W) + 0.5) * CELL, oz + (((k / W) | 0) + 0.5) * CELL];
    for (const k of cells) if (blk[k] >= 2) via.add(gates[blk[k] - 2]);
    // straightened: from where one stands, on to the farthest point in sight
    const pts = [];
    let from = [sx, sz];
    for (let a = 0; a < cells.length - 1 && pts.length < 64;) {
      let b = a + 1;                                         // (the next cell is always reachable: one step)
      while (b + 1 < cells.length && sight(from[0], from[1], ...at(cells[b + 1]))) b++;
      if (b >= cells.length - 1) break;                      // the goal in sight: straight on to it
      const p = at(cells[b]);
      pts.push(p); from = p; a = b;
    }
    pts.push([tx, tz]);
    return { pts, gates: [...via] };
  }
  return { path };
}
