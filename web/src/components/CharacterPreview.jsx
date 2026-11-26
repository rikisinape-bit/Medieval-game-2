import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { makePlayerModel, poseHuman } from "@/game3d/models";

// Dedicated 3D view of the player in the menu. Rebuilds the model whenever the equipment changes. It stands still,
// a little turned; it turns only while you drag it (finger or mouse).
export default function CharacterPreview({ eq }) {
  const canvasRef = useRef(null);
  const view = useRef(null);
  const eqKey = JSON.stringify(eq || {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    scene.add(new THREE.HemisphereLight("#f0e0c0", "#2a1e14", 1.1));
    const key = new THREE.DirectionalLight("#ffe8c0", 1.8); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight("#8aa8ff", 0.8); rim.position.set(-3, 2, -3); scene.add(rim);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.12, 24), new THREE.MeshStandardMaterial({ color: "#3a2a17", roughness: 1 }));
    base.position.y = -0.06; scene.add(base);
    const holder = new THREE.Group(); scene.add(holder);
    const st = { renderer, scene, camera, holder, yaw: 0.35, drag: null, raf: 0, t0: performance.now() };
    view.current = st;
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      // the whole body fills the height; in a narrow frame the camera steps back so the sword stays in
      const half = Math.max(1.02, 0.62 / camera.aspect), dist = half / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 1.0, dist); camera.lookAt(0, 0.93, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
    const loop = () => {
      holder.rotation.y = st.yaw;
      const m = holder.children[0];
      const now = performance.now();
      if (m) poseHuman(m, (now - st.t0) / 1000, false, null);
      st.last = now;
      renderer.render(scene, camera);
      st.raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(st.raf); ro.disconnect();
      base.geometry.dispose(); base.material.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const st = view.current;
    if (!st) return;
    st.holder.clear();
    st.holder.add(makePlayerModel(eq || {}));
  }, [eqKey]);

  const down = (e) => { const st = view.current; if (!st) return; st.drag = { id: e.pointerId, x: e.clientX }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { const st = view.current; if (st?.drag && st.drag.id === e.pointerId) { st.yaw += (e.clientX - st.drag.x) * 0.012; st.drag.x = e.clientX; } };
  const up = (e) => { const st = view.current; if (st?.drag?.id === e.pointerId) st.drag = null; };
  return <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="w-full h-full touch-none" data-testid="character-preview" />;
}
