// The water of the sea and the rivers (the user, 27/11: "il mare ed il fiume con quello che ti ho aggiunto"): the
// user's calm sea, mare_calmo.blend (a surface of Blender's Ocean modifier, 50 m a period), baked into
// mare_calmo_n.jpg by tools/bake-mare.py (its normals; its heights in blue). Laid three times, at its own size and at
// two smaller ones, each turned and drifting its own way, so the waves move and never line up. Its colour is the
// blue of the user's material, darker where the water is deep, lighter and clearer by the shores (how deep: from how
// far the coast is, mondo/costa.png, as terrain.js heightAt digs the sea floor); the sky shows in it more and more
// towards the horizon (Fresnel), the sun glints on the waves, a thin foam comes and goes along the sea's shores (not
// the rivers': they are told apart by how much land is round them).
import * as THREE from "three";
import MARE_N from "./mare_calmo_n.jpg";
import COSTA from "./mondo/costa.png";

// the user's blue (mare_calmo.blend: its material's colour, linear) for the deep water; by the shores, a clearer one
const BLUE = [0.149, 0.457, 0.8];
const DEEP = BLUE.map((c) => c * 0.5), SHALLOW = [0.14, 0.46, 0.56];

const PARS = `uniform float wTime;
uniform sampler2D wN, wCoast;
uniform vec4 wMap;
uniform vec3 wSky, wDeepC, wShallowC;
varying vec3 wWP;
`;
// the colour and the clearness by the depth (after <color_fragment>)
const COLOUR = `
	vec2 wC = ( wWP.xz + wMap.xy ) / wMap.zw;
	float wD = texture2D( wCoast, wC ).r * 255.0 - 128.0;                 // metres from the coast (- at sea)
	float wDepth = clamp( 0.25 - wD * 0.32, 0.0, 12.0 );                  // the floor's depth there (terrain.js heightAt)
	float wDeep = smoothstep( 0.2, 9.0, wDepth );
	diffuseColor.rgb = mix( wShallowC, wDeepC, wDeep );
	diffuseColor.a = mix( 0.5, 0.94, smoothstep( 0.0, 6.0, wDepth ) );
	float wSea = smoothstep( 12.0, -4.0, textureLod( wCoast, wC, 5.0 ).r * 255.0 - 128.0 );   // (the sea, not a river: little land round)
`;
// the waves (in place of <normal_fragment_maps>): the slopes of the three layers added up
const WAVES = `
	float wDist = distance( wWP.xz, cameraPosition.xz );
	float wNear = 1.0 - smoothstep( 50.0, 380.0, wDist );                 // far: calmer, no shimmering
	vec2 wP = wWP.xz;
	vec2 wU1 = wP / 50.0 + wTime * vec2( 0.011, 0.006 );
	vec2 wU2 = mat2( 0.62, -0.78, 0.78, 0.62 ) * wP / 13.7 + wTime * vec2( -0.019, 0.015 );
	vec2 wU3 = mat2( -0.27, -0.96, 0.96, -0.27 ) * wP / 4.3 + wTime * vec2( 0.033, 0.039 );
	vec4 wT2 = texture2D( wN, wU2 );
	vec2 wS = ( texture2D( wN, wU1 ).rg * 2.0 - 1.0 ) * 0.8
		+ mat2( 0.62, 0.78, -0.78, 0.62 ) * ( wT2.rg * 2.0 - 1.0 ) * ( 0.2 + 0.25 * wNear )
		+ mat2( -0.27, 0.96, -0.96, -0.27 ) * ( texture2D( wN, wU3 ).rg * 2.0 - 1.0 ) * 0.28 * wNear;
	vec3 wNw = normalize( vec3( wS.x, 1.0, wS.y ) );
	normal = normalize( ( viewMatrix * vec4( wNw, 0.0 ) ).xyz );
`;
// the sky in it, the foam (before <opaque_fragment>)
const SKY = `
	vec3 wUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	float wCos = clamp( dot( normalize( mix( wUp, normal, 0.5 ) ), normalize( vViewPosition ) ), 0.0, 1.0 );   // (half the waves: calm)
	float wF = 0.02 + 0.98 * pow( 1.0 - wCos, 5.0 );
	vec3 wRefl = wSky * mix( vec3( 0.7, 0.83, 1.0 ), vec3( 0.5, 0.68, 0.97 ), smoothstep( 0.05, 0.4, wCos ) );   // (the sky in it: bluer higher up)
	outgoingLight = mix( outgoingLight, wRefl, wF * 0.6 );
	diffuseColor.a = mix( diffuseColor.a, 1.0, wF );
	float wLit = clamp( dot( wSky, vec3( 0.4 ) ), 0.06, 1.0 );            // (the foam as light as the day)
	float wBand = smoothstep( -2.6, -0.5, wD ) * ( 1.0 - smoothstep( -0.1, 0.4, wD ) );
	float wFoam = wBand * smoothstep( 0.35, 0.85, 0.5 + 0.5 * sin( wTime * 0.8 + wD * 1.6 + wT2.b * 5.0 ) ) * wSea * 0.6;
	outgoingLight = mix( outgoingLight, vec3( 0.93, 0.96, 0.98 ) * wLit, wFoam );
	diffuseColor.a = max( diffuseColor.a, wFoam );
`;

/** The water's material (one for the sea's plane, which fills the rivers too). update(seconds, sky colour) each frame. */
export function waterMaterial(renderer, map) {
  const L = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const waves = L.load(MARE_N);
  waves.wrapS = waves.wrapT = THREE.RepeatWrapping; waves.flipY = false; waves.anisotropy = aniso;
  const coast = L.load(COSTA);
  coast.flipY = false; coast.wrapS = coast.wrapT = THREE.ClampToEdgeWrapping;
  const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  const u = {
    wTime: { value: 0 }, wN: { value: waves }, wCoast: { value: coast }, wMap: { value: new THREE.Vector4(map.ox, map.oz, map.w, map.h) },
    wSky: { value: new THREE.Color("#9fc3dc") }, wDeepC: { value: lin(DEEP) }, wShallowC: { value: lin(SHALLOW) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: lin(DEEP), roughness: 0.12, metalness: 0, transparent: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = "varying vec3 wWP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\twWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    sh.fragmentShader = PARS + sh.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + COLOUR)
      .replace("#include <normal_fragment_maps>", WAVES)
      .replace("#include <opaque_fragment>", SKY + "#include <opaque_fragment>");
  };
  mat.customProgramCacheKey = () => "acqua-1";
  mat.userData.update = (t, sky) => { u.wTime.value = t; if (sky) u.wSky.value.copy(sky); };
  return mat;
}
