// The ground: one big plane with the grass photo texture (terreno_erba.jpg, from tools/build-ground.mjs), laid in
// world coordinates (about 2.5 m of lawn per repeat). The repetition is hidden by mixing two copies of the texture,
// at different scales and angles, with a large-scale noise; the same noise makes greener and drier, yellower patches.
// In the forest the grass is darker and browner (forest floor), with a soft edge instead of the old box's border.
// Without the texture the old flat ground is used (green circle + darker forest floor).
import * as THREE from "three";
import GRASS_TEX from "./terreno_erba.jpg";   // inlined in the code (vite.config: the published page only takes data: images)
import { FZ, WZ } from "./world";

let grass = null;
// Called once before the game is created (like loadNature): decodes the texture so the ground never shows up black.
export async function loadGround() {
  try {
    grass = await new THREE.TextureLoader().loadAsync(GRASS_TEX);
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.colorSpace = THREE.SRGBColorSpace;
    grass.anisotropy = 4;                     // sharper at grazing angles (clamped to what the GPU offers)
  } catch (e) {
    console.warn("Texture dell'erba non caricata: terreno a tinta unita", e);
    grass = null;
  }
}

// Forest floor: the rectangle the forest covers (|x| < 32, from the edge of the village to Valdoro's wall), soft edges.
const GROUND_GLSL = /* glsl */ `
varying vec2 vGround;
float gHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 groundColor(vec2 p) {
  float n = gNoise(p * 0.09) * 0.6 + gNoise(p * 0.27 + 7.3) * 0.4;                    // 0..1, patches of a few metres
  vec3 a = texture2D(map, p * 0.4).rgb;                                                // 2.5 m per repeat
  vec3 b = texture2D(map, mat2(0.8, 0.6, -0.6, 0.8) * p * 0.2778 + vec2(0.37, 0.71)).rgb;   // 3.6 m, turned 37 degrees
  vec3 g = mix(a, b, smoothstep(0.35, 0.65, n)) * (0.88 + 0.24 * n);
  float dry = smoothstep(0.58, 0.85, gNoise(p * 0.05 + 21.7));                        // drier, yellower meadow here and there
  g *= mix(vec3(1.0), vec3(1.16, 1.02, 0.66), dry * 0.55);
  float forest = (1.0 - smoothstep(28.0, 36.0, abs(p.x)))
    * (1.0 - smoothstep(${(FZ + 1).toFixed(1)}, ${(FZ + 9).toFixed(1)}, p.y)) * smoothstep(${(WZ - 10).toFixed(1)}, ${(WZ - 2).toFixed(1)}, p.y);
  return g * mix(vec3(1.0), vec3(0.72, 0.7, 0.6), forest);
}
`;

function grassMaterial() {
  const m = new THREE.MeshLambertMaterial({ map: grass, name: "Ground_Grass" });
  m.customProgramCacheKey = () => "ground";
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\n" + GROUND_GLSL)
      .replace("#include <map_fragment>", "diffuseColor.rgb *= groundColor(vGround);");
  };
  return m;
}

// The whole ground of the map (village, forest, mine, Valdoro and beyond), at y = 0.
export function makeGround() {
  const g = new THREE.Group();
  if (grass) {
    const geo = new THREE.PlaneGeometry(300, 380).rotateX(-Math.PI / 2).translate(0, 0, -60);
    const plane = new THREE.Mesh(geo, grassMaterial());
    plane.receiveShadow = true; plane.matrixAutoUpdate = false;
    g.add(plane);
  } else {
    const circle = new THREE.Mesh(new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#5a7a3a", roughness: 1 }));
    const forest = new THREE.Mesh(new THREE.BoxGeometry(66, 0.1, 76), new THREE.MeshStandardMaterial({ color: "#3e5a2a", roughness: 1 }));
    forest.position.set(0, 0, FZ - 33);
    circle.receiveShadow = forest.receiveShadow = true;
    g.add(circle, forest);
  }
  return g;
}
