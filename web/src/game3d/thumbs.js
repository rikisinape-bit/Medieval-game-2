// Pictures of the real items for the inventory, shops and bodies: each item's 3D model (makeItem, the one lying on
// the ground in the game) is rendered once by a small off-screen renderer and kept as an image (data URL).
import * as THREE from "three";
import { makeItem } from "./models";

const SIZE = 128;
const cache = new Map();
let r = null, scene = null, cam = null;
const _box = new THREE.Box3(), _c = new THREE.Vector3(), _s = new THREE.Sphere();

function setup() {
  r = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(SIZE, SIZE, false); r.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff4e0", "#3a3026", 1.5));
  const d = new THREE.DirectionalLight("#fff0d8", 2.2); d.position.set(2, 4, 3); scene.add(d);
  const rim = new THREE.DirectionalLight("#9ab0d0", 0.8); rim.position.set(-3, 2, -2); scene.add(rim);
  cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
}

/** Image (data URL) of an item, or null if WebGL is not available. */
export function itemThumb(id) {
  if (cache.has(id)) return cache.get(id);
  let url = null;
  try {
    if (!r) setup();
    const o = makeItem(id);
    o.traverse((m) => { if (m.isMesh) m.castShadow = false; });
    scene.add(o); o.updateMatrixWorld(true);
    _box.setFromObject(o); _box.getBoundingSphere(_s); _box.getCenter(_c);
    // long flat things (swords, torches, tools lying on the ground) are seen from above, so they fill the picture
    const size = _box.getSize(new THREE.Vector3()), flat = size.y < 0.35 * Math.max(size.x, size.z);
    const tall = size.y > 1.2 * Math.max(size.x, size.z);                 // standing things (the plate armour): from the front
    const dir = (flat ? new THREE.Vector3(0.12, 1, 0.3) : tall ? new THREE.Vector3(0.35, 0.25, 1) : new THREE.Vector3(0.55, 0.85, 1)).normalize();
    const reach = flat ? Math.hypot(size.x, size.z) / 2 : tall ? size.y * 0.55 : _s.radius;
    const dist = (reach / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * (flat ? 0.95 : 1.02);
    cam.position.copy(_c).addScaledVector(dir, dist); cam.lookAt(_c); cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix();
    r.render(scene, cam);
    url = r.domElement.toDataURL("image/png");
    scene.remove(o);
  } catch (e) { console.warn("Immagine oggetto non disponibile", id, e); }
  cache.set(id, url);
  return url;
}
