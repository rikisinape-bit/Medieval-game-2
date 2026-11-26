// The ground's materials (engine.js): grass, dirt, cracked earth, flagstones (textures: tools/build-ground.mjs).
// Each texture is laid in world space (it runs on across meshes of any size and turn: meadow, square, roads, paths) at
// its real size, with the relief of its normal map lit by the sun. The repetition is hidden by a second, bigger and
// turned copy blended in by patches (not for the flagstones: two sizes of stones would show through each other) and by
// large lighter, darker and drier patches; far away the texture calms down to its average colour (no shimmer on a phone).
import * as THREE from "three";
import ERBA from "./terreno_erba.jpg";
import ERBA_N from "./terreno_erba_n.jpg";
import TERRA from "./terreno_terra.jpg";
import TERRA_N from "./terreno_terra_n.jpg";
import CREPE from "./terreno_crepe.jpg";
import CREPE_N from "./terreno_crepe_n.jpg";
import PIETRA from "./terreno_pietra.jpg";
import PIETRA_N from "./terreno_pietra_n.jpg";

const SETS = { erba: [ERBA, ERBA_N], terra: [TERRA, TERRA_N], crepe: [CREPE, CREPE_N], pietra: [PIETRA, PIETRA_N] };
const loaded = {};
function textures(name, renderer) {
  if (loaded[name]) return loaded[name];
  const L = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [map, nrm] = SETS[name].map((src, i) => {
    const t = L.load(src); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (i === 0) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return (loaded[name] = [map, nrm]);
}

const GROUND_FS = `uniform float gScale, gVar, gDry, gMix;
varying vec3 gW;
float gHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float gNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( gHash( i ), gHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gHash( i + vec2( 0.0, 1.0 ) ), gHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
`;
// (instead of the texture on the mesh's own uv)
const GROUND_MAP = `
	vec2 gUvA = gW.xz / gScale;
	vec2 gUvB = mat2( 0.8, -0.6, 0.6, 0.8 ) * gW.xz / ( gScale * 2.3 ) + vec2( 0.37, 0.61 );
	vec3 gTex = mix( texture2D( map, gUvA ).rgb, texture2D( map, gUvB ).rgb, smoothstep( 0.3, 0.7, gNoise( gW.xz * 0.07 ) ) * gMix );
	gTex = mix( gTex, textureLod( map, gUvA, 12.0 ).rgb, smoothstep( 18.0, 60.0, distance( gW, cameraPosition ) ) * 0.6 );
	float gV = gNoise( gW.xz * 0.03 + 7.1 ) * 0.65 + gNoise( gW.xz * 0.13 + 3.7 ) * 0.35;
	gTex *= 1.0 + gVar * ( gV * 2.0 - 1.0 );
	gTex = mix( gTex, gTex * vec3( 1.12, 1.05, 0.78 ), smoothstep( 0.6, 0.9, gNoise( gW.xz * 0.045 + 11.3 ) ) * gDry );
	diffuseColor.rgb *= gTex;
`;
// the relief, for a flat ground: u runs along +x, v along +z, up is +y
const GROUND_NORMAL = `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 gMapN = texture2D( normalMap, gUvA ).xyz * 2.0 - 1.0;
	gMapN.xy *= normalScale;
	normal = normalize( ( viewMatrix * vec4( normalize( vec3( gMapN.x, gMapN.z, gMapN.y ) ), 0.0 ) ).xyz );
#endif
`;

/**
 * A ground material. name: "erba" | "terra" | "crepe"; scale: metres one texture covers; tint: colour it is multiplied
 * by; vary: how much the large patches change its light (0..1); dry: how yellow the dry patches are; relief: strength
 * of the normal map; mix: how much of the second, bigger copy shows in its patches.
 */
export function groundMat(renderer, name, { scale = 2, tint = "#ffffff", vary = 0.18, dry = 0.3, relief = 1, mix = 0.55 } = {}) {
  const [map, normalMap] = textures(name, renderer);
  const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(relief, relief), color: tint, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { gScale: { value: scale }, gVar: { value: vary }, gDry: { value: dry }, gMix: { value: mix } });
    sh.vertexShader = "varying vec3 gW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tgW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    sh.fragmentShader = GROUND_FS + sh.fragmentShader.replace("#include <map_fragment>", GROUND_MAP).replace("#include <normal_fragment_maps>", GROUND_NORMAL);
  };
  m.customProgramCacheKey = () => "ground-1";
  return m;
}
