// Dev page: shows kit pieces in a row with their index. ?ids=a,b,c&cell=12&cam=x,y,z
import * as THREE from "three";
import { loadNature, addNature } from "./game3d/nature";
import { LOOKS, makeHuman } from "./game3d/models";
const q = new URLSearchParams(location.search);
const W = 1700, H = 850, ids = q.get("ids").split(","), cell = +(q.get("cell") || 12), cols = +(q.get("cols") || ids.length);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#7a8a98");
scene.add(new THREE.HemisphereLight("#dfe8ff", "#4a4034", 1.0)); const d = new THREE.DirectionalLight("#fff0d8", 1.6); d.position.set(6, 12, 9); scene.add(d);
const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#4a5236" })); g.rotation.x = -Math.PI / 2; scene.add(g);
await loadNature();
const items = ids.map((id, i) => ({ id, x: ((i % cols) - (cols - 1) / 2) * cell, z: -Math.floor(i / cols) * cell * 1.3, ry: +(q.get("ry") || 0) }));
addNature(scene, items);
items.forEach((it, i) => { const m = makeHuman(LOOKS.villager, null, "v" + i); m.position.set(it.x - cell * 0.42, 0, it.z + 2.5); scene.add(m);
  const c = document.createElement("canvas"); c.width = 128; c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#ff0"; x.font = "bold 44px sans-serif"; x.fillText(String(i), 8, 48);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(3, 1.5, 1); sp.position.set(it.x, 0.9, it.z + 4.5); scene.add(sp); });
const rows = Math.ceil(ids.length / cols), span = cols * cell;
const oh = +(q.get("ortho") || 0); const cam = oh ? new THREE.OrthographicCamera(-oh * W / H, oh * W / H, oh, -oh, 0.1, 2000) : new THREE.PerspectiveCamera(32, W / H, 0.1, 2000);
const cp = (q.get("cam") || "").split(",").map(Number);
if (cp.length === 3) { cam.position.set(...cp); cam.lookAt(0, +(q.get("ly") || 5), -(rows - 1) * cell * 0.65); }
else { cam.position.set(span * 0.12, span * 0.38 + 6, span * 0.95 + 8); cam.lookAt(0, 6, -(rows - 1) * cell * 0.65); }
if (q.get("lines")) for (let y = 0.5; y < 12; y += 0.5) { const l = new THREE.Mesh(new THREE.BoxGeometry(span + 20, y % 1 ? 0.015 : 0.035, 0.02), new THREE.MeshBasicMaterial({ color: y % 1 ? "#f44" : "#ff0" })); l.position.set(0, y, 6); scene.add(l); }
if (q.get("clip")) { r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -+q.get("clip"))]; }
r.render(scene, cam); window.DONE = true;
