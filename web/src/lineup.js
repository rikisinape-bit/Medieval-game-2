import * as THREE from "three";
import { LOOKS, makeHuman, poseHuman, makeSword, makeShield, makeItem, makeSwordRack, makePlayerModel } from "./game3d/models";
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
if (q.get("weapons")) {
  ["pugnale", "corta", "ascia", "lunga", "spadone", "di Roccanera"].forEach((k, i) => {
    const w = makeSword(0, k); w.rotation.x = -Math.PI / 2; w.position.set(-2.6 + i * 0.55, 0.12, 0.6); scene.add(w);          // standing upright
    const it = makeItem({ corta: "spada_corta", ascia: "ascia_guerra", lunga: "spada_lunga", "di Roccanera": "spada_roccanera" }[k] || k); it.position.set(-2.6 + i * 0.55, 0, 1.7); scene.add(it);
  });
  [["#5a3a22", "round"], ["#4e1a1a", "heater"], ["#4a1818", "round"]].forEach(([c, kd], i) => { const sh = makeShield(c, kd); sh.position.set(1.0 + i * 0.75, 0.5, 0.6); sh.rotation.y = -0.3; scene.add(sh); });
  ["scudo_legno", "scudo_ferro"].forEach((id, i) => { const it = makeItem(id); it.position.set(1.2 + i * 0.9, 0, 1.7); scene.add(it); });
  const rack = makeSwordRack(); rack.position.set(3.5, 0, -0.6); scene.add(rack);
  list.length = 0;
  list.push(["soldier", "soldier1"], ["knight", "alaric"], ["bandit", "bandit3"]);
}
const n = list.length, sp = 0.85;
list.forEach(([look, id, extra], i) => {
  const g = look === "playerEq" ? makePlayerModel(extra) : makeHuman({ ...LOOKS[look], ...(extra || {}) }, ["knight", "soldier", "bandit"].includes(look) ? (look === "knight" || id === "bandit3" ? "long" : "short") : null, id);
  poseHuman(g, 0, false, q.get("mode") || null, 0.5);
  g.position.x = (i - (n - 1) / 2) * sp + (q.get("weapons") ? -4.6 : 0); g.rotation.y = +(q.get("ry") || 0.25);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
});
const zoom = q.get("zoom");
const cam = new THREE.PerspectiveCamera(zoom ? 18 : 30, W / H, 0.1, 100);
if (q.get("weapons")) { cam.fov = 34; cam.updateProjectionMatrix(); cam.position.set(-0.6, 2.3, 6.2); cam.lookAt(-0.6, 0.55, 0.6); }
const range = q.get("range");
if (q.get("weapons")) {} else if (range) { const [a, b] = range.split("-").map(Number); const x = ((a + b) / 2 - (n - 1) / 2) * sp; cam.fov = 30; cam.updateProjectionMatrix(); cam.position.set(x, 1.15, 1.1 + (b - a + 1) * 0.95); cam.lookAt(x, 1.0, 0); }
else if (zoom) { const x = (+zoom - (n - 1) / 2) * sp; cam.position.set(x, 1.75, 3.2); cam.lookAt(x, 1.7, 0); }
else { cam.position.set(0, 1.25, 17.5); cam.lookAt(0, 1.0, 0); }
r.render(scene, cam);
let tris = 0, calls = 0; scene.traverse((o) => { if (o.isMesh && o.visible && o.parent.visible) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
window.STATS = { tris: Math.round(tris), calls }; window.DONE = true;
