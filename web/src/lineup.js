import * as THREE from "three";
import { LOOKS, makeHuman, poseHuman } from "./game3d/models";
const q = new URLSearchParams(location.search);
const W = +(q.get("w") || 1400), H = +(q.get("h") || 560);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(W, H); r.shadowMap.enabled = true; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#5d6870");
scene.add(new THREE.HemisphereLight("#d8dce8", "#3a3026", 0.9));
const d = new THREE.DirectionalLight("#fff0d8", 1.8); d.position.set(4, 7, 6); d.castShadow = true; Object.assign(d.shadow.camera, { left: -10, right: 10, top: 5, bottom: -2 }); scene.add(d);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshStandardMaterial({ color: "#4a5236" })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const list = [
  ["villager", "ugo"], ["villager2", "piero"], ["smith", "bruno"], ["woman", "marta", { female: true }], ["merchant", "lena", { female: true }],
  ["miner", "torin", { old: true }], ["bandit", "bandit1"], ["king", "king"], ["knight", "alaric"], ["woman", "mira", { female: true }],
];
const n = list.length, sp = 1.0;
list.forEach(([look, id, extra], i) => {
  const g = makeHuman({ ...LOOKS[look], ...(extra || {}) }, look === "knight" ? "long" : null, id);
  poseHuman(g, 0, false, q.get("mode") || null, 0.5);
  g.position.x = (i - (n - 1) / 2) * sp; g.rotation.y = +(q.get("ry") || 0.25);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
});
const zoom = q.get("zoom");
const cam = new THREE.PerspectiveCamera(zoom ? 18 : 30, W / H, 0.1, 100);
if (zoom) { const x = (+zoom - (n - 1) / 2) * sp; cam.position.set(x, 1.75, 3.2); cam.lookAt(x, 1.7, 0); }
else { cam.position.set(0, 1.3, 11.5); cam.lookAt(0, 1.0, 0); }
r.render(scene, cam);
let tris = 0, calls = 0; scene.traverse((o) => { if (o.isMesh && o.visible && o.parent.visible) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
window.STATS = { tris: Math.round(tris), calls }; window.DONE = true;
