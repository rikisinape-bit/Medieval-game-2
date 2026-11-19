// Clouds in the sky: pictures of real cloud volumes (tools/build-clouds.mjs) drifting with the wind.
// They live on a wide flat layer high above (virtual metres, around the camera: they are too far for the player's steps
// to move them); each is drawn on a sphere of radius RS round the camera, in the direction of its place on the layer
// and at the size it would look from there, so they get smaller and closer together towards the horizon and cross the
// sky as real ones do. One mesh of a few dozen quads upright on the screen (one draw call), far ones first. Far away
// they fade into the haze; one that leaves the layer comes back on the other side as another cloud, so the sky is
// never the same twice (and every game starts with a different one).
import * as THREE from "three";
import ATLAS from "./nuvole.webp";
import INFO from "./nuvole.json";

const RS = 185;                                       // drawn this far from the camera (inside the camera's far plane)
const LAYER = 380, HALF = 2600, FADE = [1800, 2750];   // layer height, its half size, haze from..to (virtual metres)

export function createClouds(scene, { count = 26 } = {}) {
  if (!INFO.length) return { update() {} };
  const tex = new THREE.TextureLoader().load(ATLAS);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 12), uv = new Float32Array(count * 8), col = new Float32Array(count * 16), idx = new Uint16Array(count * 6);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1;
  scene.add(mesh);

  // the wind: a direction for this game, turning slowly; each cloud a little faster or slower (they are not all as high)
  let windA = Math.random() * Math.PI * 2;
  const wind = 9 + Math.random() * 7;
  const pick = (c) => { c.s = Math.floor(Math.random() * INFO.length); c.k = 0.8 + Math.random() * 0.6; c.dy = (Math.random() - 0.5) * 160; c.v = 0.75 + Math.random() * 0.5; c.fl = Math.random() < 0.5; };   // (fl: mirrored, another bank)
  const clouds = Array.from({ length: count }, () => { const c = { x: (Math.random() * 2 - 1) * HALF, z: (Math.random() * 2 - 1) * HALF }; pick(c); return c; });

  const d = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), C = new THREE.Vector3();
  const order = clouds.map((_, i) => i);
  /**
   * cam: the camera; light: colour the clouds take (white by day, warm at dusk, dark at night); alpha: how much they
   * show (less at night, little in the thick of the forest).
   */
  function update(dt, cam, light, alpha) {
    windA += dt * 0.004;
    const wx = Math.cos(windA) * wind, wz = Math.sin(windA) * wind;
    for (const c of clouds) {
      c.x += wx * c.v * dt; c.z += wz * c.v * dt;
      // out of the layer downwind: back in upwind, as a new cloud
      if (c.x > HALF) { c.x -= 2 * HALF; pick(c); } else if (c.x < -HALF) { c.x += 2 * HALF; pick(c); }
      if (c.z > HALF) { c.z -= 2 * HALF; pick(c); } else if (c.z < -HALF) { c.z += 2 * HALF; pick(c); }
      c.dist = Math.hypot(c.x, LAYER + c.dy, c.z);
    }
    order.sort((a, b) => clouds[b].dist - clouds[a].dist);            // far ones first (blending)
    right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);   // upright on the screen
    order.forEach((ci, n) => {
      const c = clouds[ci], info = INFO[c.s];
      d.set(c.x, LAYER + c.dy, c.z).normalize();
      C.copy(cam.position).addScaledVector(d, RS);
      const w = (info.m * c.k * RS) / c.dist, h = w * info.r;
      // the quad's bottom edge a little below the point (the clouds' flat bases stay level)
      const p = n * 12;
      [[-1, -0.35], [1, -0.35], [1, 1.65], [-1, 1.65]].forEach(([sx, sy], q) => {
        pos[p + q * 3] = C.x + right.x * (w / 2) * sx + up.x * (h / 2) * sy;
        pos[p + q * 3 + 1] = C.y + right.y * (w / 2) * sx + up.y * (h / 2) * sy;
        pos[p + q * 3 + 2] = C.z + right.z * (w / 2) * sx + up.z * (h / 2) * sy;
      });
      const u0 = c.fl ? info.u + info.uw : info.u, u1 = c.fl ? info.u : info.u + info.uw;
      uv.set([u0, info.v, u1, info.v, u1, info.v + info.vh, u0, info.v + info.vh], n * 8);
      const fade = 1 - Math.min(1, Math.max(0, (c.dist - FADE[0]) / (FADE[1] - FADE[0])));
      for (let q = 0; q < 4; q++) col.set([light.r, light.g, light.b, alpha * fade], n * 16 + q * 4);
      idx.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3], n * 6);
    });
    geo.attributes.position.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.color.needsUpdate = true;
    geo.index.needsUpdate = true;
  }
  return { update, mesh };
}
