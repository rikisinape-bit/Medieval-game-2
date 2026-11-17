import * as THREE from "three";
import { PALADIN_READY, setupPaladinEnv } from "./game3d/body";
import { LOOKS, makeHuman, poseHuman, poseDeath, makeSword, makeShield, makeItem, makeSwordRack, makePlayerModel } from "./game3d/models";
const q = new URLSearchParams(location.search);
const W = +(q.get("w") || 1400), H = +(q.get("h") || 560);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(W, H); setupPaladinEnv(r); r.shadowMap.enabled = true; document.body.appendChild(r.domElement);
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
if (q.get("items")) {
  const ids = ["pane", "formaggio", "carne", "mela", "acqua", "vino", "erbe", "pozione", "pozione_grande", "oro", "argento", "gemma", "libro", "corda", "pelliccia", "torcia", "testa_morn",
    "cuoio", "maglia", "piastre", "cappuccio", "elmo_ferro", "elmo_piastre", "martello", "ascia", "pugnale", "spada_corta", "ascia_guerra", "spada_lunga", "spadone", "spada_roccanera", "scudo_legno", "scudo_ferro"];
  ids.forEach((id, i) => { const it = makeItem(id); it.position.set((i % 11) * 0.62 - 3.1, 0, Math.floor(i / 11) * 0.75 - 0.6); scene.add(it); });
  list.length = 0;
}
if (q.get("eq")) {
  list.length = 0;
  [{ hand: "corta" }, { hand: "pugnale", body: "cuoio", head: "cappuccio", off: "torcia" }, { hand: "spada_lunga" === 1 ? 0 : "lunga", body: "maglia", head: "elmo_ferro", off: "scudo_legno" },
   { hand: "spadone", body: "piastre", head: "elmo_piastre", off: "scudo_ferro" }, { hand: "ascia", body: "maglia", head: "cappuccio" }, { hand: "di Roccanera", body: "cuoio", head: "elmo_piastre", off: "scudo_ferro" }]
    .forEach((eq, i) => list.push(["playerEq", "p" + i, eq]));
}
// ?faces=hair|beard|female: a row of heads with every hairstyle / beard (close camera on the heads)
const faces = q.get("faces");
if (faces) {
  list.length = 0;
  const H = ["short", "buzz", "bowl", "long", "ponytail", "receding", "curly", "shaggy", "bald"];
  const B = ["stubble", "full", "boxed", "pointed", "forked", "long", "goatee", "moustache", "chops"];
  const FH = ["bun", "braid", "twinbraids", "long", "ponytail", "crown"];
  if (faces === "hair") H.forEach((h, i) => list.push(["villager2", "fh" + i, { hair: h, beard: "none", hairColor: ["#2e2218", "#93784a", "#6e3418", "#1a1410", "#5a3f26", "#76583a", "#45321f", "#4a2214", "#2e2218"][i] }]));
  if (faces === "beard") B.forEach((b, i) => list.push(["villager2", "fb" + i, { hair: H[i % H.length], beard: b, old: i === 5, hairColor: i === 5 ? "#8d877c" : ["#2e2218", "#6e3418", "#45321f", "#1a1410", "#93784a", "", "#5a3f26", "#4a2214", "#76583a"][i] }]));
  if (faces === "female") FH.forEach((h, i) => list.push(["woman", "ff" + i, { hair: h, hairColor: ["#5a3f26", "#93784a", "#6e3418", "#1a1410", "#76583a", "#45321f"][i] }]));
}
// ?pal=1: the paladin armour on a knight without shield and cape, from the front, the side and the back
if (q.get("pal")) {
  list.length = 0;
  if (q.get("pal") === "4") list.push(["knight", "alaric", { shield: null, cape: null, _ry: +(q.get("ry") || 0) }]);
  else [0, Math.PI / 2, Math.PI].forEach((ry, i) => list.push(["knight", "alaric", { shield: null, cape: null, _ry: ry }]));
  if (q.get("pal") === "2") list.push(["playerEq", "pp", { hand: "spadone", body: "piastre", head: "elmo_piastre" }], ["playerEq", "pq", { hand: "spadone", body: "piastre", head: null }]);
}
const n = list.length, sp = faces ? 0.42 : 0.85;
list.forEach(([look, id, extra], i) => {
  const g = look === "playerEq" ? makePlayerModel(extra) : makeHuman({ ...LOOKS[look], ...(extra || {}) }, ["knight", "soldier", "bandit"].includes(look) ? (look === "knight" || id === "bandit3" ? "long" : "short") : null, id);
  g.userData.atk = q.get("atk") || "over";
  const y = poseHuman(g, 0, !!q.get("walk"), q.get("mode") || null, +(q.get("k") || 0.5)); g.position.y = y;
  if (q.get("death")) poseDeath(g, +q.get("death"), +(q.get("p") || 1));
  g.position.x = (i - (n - 1) / 2) * sp + (q.get("weapons") ? -4.6 : 0); g.rotation.y = extra?._ry ?? +(q.get("ry") || 0.25);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
});
const zoom = q.get("zoom");
const cam = new THREE.PerspectiveCamera(zoom ? 18 : 30, W / H, 0.1, 100);
if (q.get("items")) { cam.fov = 38; cam.updateProjectionMatrix(); cam.position.set(0.2, 3.6, 4.6); cam.lookAt(0.2, 0, 0.2); }
const hand = q.get("hand");
if (q.get("items")) {} else if (hand != null) { const x = (+hand - (n - 1) / 2) * sp; cam.fov = 22; cam.updateProjectionMatrix(); cam.position.set(x + 1.3, 1.2, 1.6); cam.lookAt(x + 0.15, 0.85, 0); }
else if (q.get("weapons")) { cam.fov = 34; cam.updateProjectionMatrix(); cam.position.set(-0.6, 2.3, 6.2); cam.lookAt(-0.6, 0.55, 0.6); }
const range = q.get("range");
if (hand != null || q.get("weapons") || q.get("items")) {} else if (q.get("top")) { const x = ((+q.get("top") - (n - 1) / 2) * sp); cam.fov = 26; cam.updateProjectionMatrix(); cam.position.set(x, 4.2, 0.6); cam.lookAt(x, 1.0, 0.45); } else if (range) { const [a, b] = range.split("-").map(Number); const x = ((a + b) / 2 - (n - 1) / 2) * sp; cam.fov = 30; cam.updateProjectionMatrix(); cam.position.set(x, 1.15, 1.1 + (b - a + 1) * 0.95); cam.lookAt(x, 1.0, 0); }
else if (faces) { cam.fov = 14; cam.updateProjectionMatrix(); cam.position.set(0, 1.78, 6.5); cam.lookAt(0, 1.66, 0); }
else if (zoom) { const x = (+zoom - (n - 1) / 2) * sp; cam.fov = +(q.get("fov") || 18); cam.updateProjectionMatrix(); cam.position.set(x + 0.3, 1.78, 2.2); cam.lookAt(x, 1.72, 0); }
else { cam.position.set(0, 1.25, 17.5); cam.lookAt(0, 1.0, 0); }
await PALADIN_READY;
if (q.get("cpos")) { cam.fov = +(q.get("fov") || 30); cam.updateProjectionMatrix(); cam.position.set(...q.get("cpos").split(",").map(Number)); cam.lookAt(...q.get("clook").split(",").map(Number)); }
if (faces) {                                         // one close frame per head, side by side
  r.setScissorTest(true);
  const cw = W / n, fc = new THREE.PerspectiveCamera(+(q.get("ffov") || 16), cw / H, 0.05, 50);
  scene.children.filter((o) => o.userData.hipL).forEach((g, i) => {
    const x = g.position.x, hy = (g.userData.geo?.pivots.head[1] ?? 1.7) * (g.userData.variant?.height || 1);
    const ca = +(q.get("ca") || 0); fc.position.set(x + Math.sin(ca) * 1.25, hy + 0.08, Math.cos(ca) * 1.25); fc.lookAt(x, hy - 0.01 + +(q.get("fdy") || 0), 0);
    r.setViewport(i * cw, 0, cw, H); r.setScissor(i * cw, 0, cw, H); r.render(scene, fc);
  });
} else r.render(scene, cam);
let tris = 0, calls = 0; scene.traverse((o) => { if (o.isMesh && o.visible && o.parent.visible) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
window.STATS = { tris: Math.round(tris), calls }; window.DONE = true;
