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
  ["player", "player"], ["villager", "ugo"], ["villager2", "piero"], ["woman", "marta", { female: true }], ["woman", "elsa", { female: true }],
  ["smith", "bruno"], ["merchant", "lena", { female: true }], ["merchant", "osric"], ["miner", "torin", { old: true }], ["innkeeper", "bodo"],
  ["herbalist", "mira"], ["coachman", "cocchiere"], ["messenger", "messenger1"], ["bandit", "bandit1"], ["bandit", "bandit3"],
  ["soldier", "soldier1"], ["knight", "alaric"], ["noble", "silas"], ["king", "king"],
];
const n = list.length, sp = 0.85;
list.forEach(([look, id, extra], i) => {
  const g = makeHuman({ ...LOOKS[look], ...(extra || {}) }, ["knight", "soldier", "bandit"].includes(look) ? (look === "knight" ? "long" : "short") : null, id);
  poseHuman(g, 0, false, q.get("mode") || null, 0.5);
  g.position.x = (i - (n - 1) / 2) * sp; g.rotation.y = +(q.get("ry") || 0.25);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
});
const zoom = q.get("zoom");
const cam = new THREE.PerspectiveCamera(zoom ? 18 : 30, W / H, 0.1, 100);
const range = q.get("range");
if (range) { const [a, b] = range.split("-").map(Number); const x = ((a + b) / 2 - (n - 1) / 2) * sp; cam.fov = 30; cam.updateProjectionMatrix(); cam.position.set(x, 1.15, 1.1 + (b - a + 1) * 0.95); cam.lookAt(x, 1.0, 0); }
else if (zoom) { const x = (+zoom - (n - 1) / 2) * sp; cam.position.set(x, 1.75, 3.2); cam.lookAt(x, 1.7, 0); }
else { cam.position.set(0, 1.25, 17.5); cam.lookAt(0, 1.0, 0); }
r.render(scene, cam);
let tris = 0, calls = 0; scene.traverse((o) => { if (o.isMesh && o.visible && o.parent.visible) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
window.STATS = { tris: Math.round(tris), calls }; window.DONE = true;
