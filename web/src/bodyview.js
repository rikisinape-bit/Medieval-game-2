// Dev page: base bodies. ?raw=1 the original A-pose with a ruler; otherwise the game parts (bodydata.json)
// assembled on their pivots, one colour per part, with a stick through each fist along the grip axis.
// ?side=1 side view, ?swing=0.6 legs/arms rotated, ?zoom=hand close-up of the right hand.
import * as THREE from "three";
import bodies from "./game3d/bodydata.json";
const q = new URLSearchParams(location.search);
const W = 1700, H = 900;
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#7a8a98");
scene.add(new THREE.HemisphereLight("#fff", "#555", 1.2)); const d = new THREE.DirectionalLight("#fff", 1.4); d.position.set(3, 5, 6); scene.add(d);
const COLS = { torso: "#c8b8a8", head: "#d8a888", armR: "#a8c8a0", armL: "#a0b0d8", legR: "#d8c070", legL: "#c090c0" };
let x = -0.6;
const side = +(q.get("side") || 0), swing = +(q.get("swing") || 0);
if (q.get("raw")) {
  const data = await (await fetch("/tools/.bodies-cache.json")).json();
  for (const p of Object.values(data)) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "#c8b8a8", flatShading: true, side: THREE.DoubleSide }));
    if (side) m.rotation.y = Math.PI / 2;
    m.position.x = x; x += side ? 0.9 : 1.35; scene.add(m);
  }
} else {
  for (const b of Object.values(bodies)) {
    const root = new THREE.Group(); root.position.x = x; x += side ? 0.9 : 1.2; if (side) root.rotation.y = Math.PI / 2; scene.add(root);
    for (const [name, p] of Object.entries(b.parts)) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p.p, 3)); g.setIndex(p.i);
      const piv = new THREE.Group(); piv.position.set(...b.rig.pivots[name]);
      piv.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COLS[name], flatShading: true })));
      if (name === "legR" || name === "armL") piv.rotation.x = swing; if (name === "legL" || name === "armR") piv.rotation.x = -swing;
      if (name.startsWith("arm")) {
        const ax = new THREE.Vector3(...(name === "armR" ? b.rig.gripAxis : b.rig.gripAxisL));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), new THREE.MeshBasicMaterial({ color: "#222" }));
        stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax); stick.position.set(...(name === "armR" ? b.rig.grip : b.rig.gripL)); piv.add(stick);
      }
      root.add(piv);
    }
  }
}
if (q.get("raw")) for (let y = 0; y < 2; y += 0.05) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.003, 0.002), new THREE.MeshBasicMaterial({ color: Math.round(y * 20) % 2 ? "#f44" : "#ff0" })); l.position.set(0, y, 0.4); scene.add(l); }
const zoom = q.get("zoom");
const oh = zoom ? 0.25 : 1.0, cam = new THREE.OrthographicCamera(-oh * W / H, oh * W / H, oh, -oh, 0.1, 50);
const cx = zoom ? -0.6 + 0.3 : +(q.get("cx") || 0), cy = zoom ? 0.85 : 0.95;
cam.position.set(cx + (zoom ? 1.2 : 0), cy + (zoom ? 0.3 : 0), 10); cam.lookAt(cx, cy, 0);
r.render(scene, cam); window.DONE = true;
