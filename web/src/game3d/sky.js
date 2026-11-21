// The sun and the moon in the sky (engine.js moves them with the day's clock, S.dayT: 0 midnight, 0.5 noon). Both go
// round the sky as the real ones do here in the north: they rise in the east, are highest in the south, set in the
// west; the sun by day, the moon (full, opposite to the sun) by night. The engine's light comes from the one that is
// up (sunDir), so the shadows follow them; at night the moonlight is pale blue and weak.
// They are drawn far away (SKY_R from the camera, beyond the fog, which does not touch them; anything nearer hides
// them): the sun a bright disc in a large glow, orange low on the horizon; the moon the user's model (models/luna.glb:
// a sphere with its craters carved in, from a 3ds Max scene: tools/max-mesh.py, moon-export.py, build-moon.mjs),
// shaded as the sun lights it a little from one side (so its craters show), luminous, in a pale halo.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const EXT = import.meta.env.VITE_MODEL_EXT || "glb";
const SKY_R = 180;                  // (the camera sees 220 m)
const LAT = 0.44;                   // the latitude (radians, ~25 degrees): the sun is 65 degrees high at noon
const SUN_SIZE = 14, MOON_SIZE = 15;   // metres at SKY_R: the sun's disc ~4.5 degrees, the moon ~4.8 (larger than true)

/** Where the sun is (unit vector; world: x east, y up, z south) at time of day t (0 midnight, 0.5 noon). */
export function sunDir(t, out = new THREE.Vector3()) {
  const H = (t - 0.5) * Math.PI * 2, c = Math.cos(H), s = Math.sin(H);
  return out.set(-s, Math.cos(LAT) * c, Math.sin(LAT) * c);        // (t 0.25: east; 0.5: south, high; 0.75: west)
}

// a soft round glow (white; the sprites colour it): core = how much of the radius is solid
function roundTexture(core, soft) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(core, "rgba(255,255,255,1)");
  r.addColorStop(core + (1 - core) * soft, "rgba(255,255,255,0.22)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sprite = (map, color, size, opacity) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.setScalar(size); s.frustumCulled = false; s.renderOrder = -2;
  return s;
};

export function createSky(scene) {
  const disc = roundTexture(0.62, 0.35), glow = roundTexture(0.0, 0.25);
  const sun = sprite(disc, "#fff4d8", SUN_SIZE, 1), sunGlow = sprite(glow, "#ffd890", SUN_SIZE * 5, 0.55);
  const halo = sprite(glow, "#a8bcff", MOON_SIZE * 4.5, 0.5);
  scene.add(sunGlow, sun, halo);
  // the moon: flat facets (from the screen's derivatives), lit by the sun from where it is, turned a little aside
  const moonMat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: new THREE.Vector3(0, 0, 1) }, uColor: { value: new THREE.Color("#eef2fb") }, uOpacity: { value: 1 } },
    vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform vec3 uLight; uniform vec3 uColor; uniform float uOpacity; varying vec3 vW;
      void main() { vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); float d = max(dot(n, uLight), 0.0);
        gl_FragColor = vec4(uColor * (0.38 + 0.72 * d), uOpacity); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), moonMat);   // (the model replaces it once loaded)
  moon.scale.setScalar(MOON_SIZE / 2); moon.frustumCulled = false; moon.renderOrder = -1;
  scene.add(moon);
  (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let gltf;
    if (EXT === "js") {
      const { default: b64 } = await import(/* @vite-ignore */ new URL("models/luna.js", document.baseURI).href);
      gltf = await loader.parseAsync(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer, "");
    } else gltf = await loader.loadAsync("models/luna.glb");
    let geo = null; gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
    if (geo) { moon.geometry.dispose(); moon.geometry = geo; }
  })().catch((e) => console.warn("luna:", e));

  const v = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), warm = new THREE.Color("#ffa050"), white = new THREE.Color("#fff4d8"), wGlow = new THREE.Color("#ffd890");
  const fade = (y) => THREE.MathUtils.smoothstep(y, -0.06, 0.05);    // (below the horizon: gone)
  return {
    /** Puts them where they are at time t, around the camera. */
    update(cam, t) {
      sunDir(t, v);
      const sa = fade(v.y), low = 1 - THREE.MathUtils.smoothstep(v.y, 0.02, 0.3);      // low: red and wide
      sun.visible = sunGlow.visible = sa > 0;
      if (sa > 0) {
        sun.position.copy(cam).addScaledVector(v, SKY_R); sunGlow.position.copy(sun.position);
        sun.material.opacity = sa; sun.material.color.copy(white).lerp(warm, low * 0.75);
        sunGlow.material.opacity = 0.55 * sa; sunGlow.material.color.copy(wGlow).lerp(warm, low); sunGlow.scale.setScalar(SUN_SIZE * (5 + 2.5 * low));
      }
      v.negate();                                                                   // the moon: opposite
      const ma = fade(v.y);
      moon.visible = halo.visible = ma > 0;
      if (ma > 0) {
        moon.position.copy(cam).addScaledVector(v, SKY_R); halo.position.copy(moon.position);
        moon.lookAt(cam);
        // the sun lights it from behind the one looking at it, turned 35 degrees aside: the craters cast a little shade
        side.crossVectors(v, up).normalize();
        moonMat.uniforms.uLight.value.copy(v).negate().multiplyScalar(Math.cos(0.6)).addScaledVector(side, Math.sin(0.6)).addScaledVector(up, 0.15).normalize();
        moonMat.uniforms.uOpacity.value = ma; halo.material.opacity = 0.5 * ma;
      }
    },
  };
}
