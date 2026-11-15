import * as THREE from "three";
import { mat } from "./models";

const GEO = new THREE.BoxGeometry(0.09, 0.09, 0.09);

export function createFx(scene) {
  const parts = [];
  const burst = (x, y, z, color, count = 10, speed = 3, glow) => {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(GEO, mat(color, glow ? color : undefined));
      m.position.set(x, y, z);
      scene.add(m);
      parts.push({ m, life: 0.5, v: [(Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed] });
    }
  };
  const update = (dt) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; p.v[1] -= 9.8 * dt;
      p.m.position.x += p.v[0] * dt; p.m.position.y = Math.max(0.03, p.m.position.y + p.v[1] * dt); p.m.position.z += p.v[2] * dt;
      p.m.scale.setScalar(Math.max(0.1, p.life * 2));
      if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); }
    }
  };
  return { burst, update };
}
