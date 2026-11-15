import React, { useRef, useState } from "react";

// Virtual joystick. Uses pointer events with pointer capture, so each finger is tracked by its own id
// (before: touches[0] picked whatever finger touched first, e.g. the one dragging the camera).
export function Joystick({ onJoystick }) {
  const ref = useRef(null);
  const active = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    setKnob({ x: dx, y: dy });
    onJoystick({ x: dx, y: dy });
  };
  const start = (e) => {
    if (active.current != null) return;
    e.preventDefault(); e.stopPropagation();
    active.current = e.pointerId;
    ref.current?.setPointerCapture?.(e.pointerId);
    update(e);
  };
  const move = (e) => { if (e.pointerId === active.current) update(e); };
  const end = (e) => {
    if (e.pointerId !== active.current) return;
    active.current = null;
    setKnob({ x: 0, y: 0 });
    onJoystick({ x: 0, y: 0 });
  };
  return (
    <div ref={ref} data-ui="" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      className="pointer-events-auto absolute bottom-3 left-3 w-36 h-36 rounded-full bg-black/35 border-2 border-[color:hsl(var(--primary))]/40 touch-none select-none backdrop-blur-sm"
      data-testid="joystick">
      <div className="absolute w-14 h-14 rounded-full bg-[color:hsl(var(--primary))]/70 border border-[color:hsl(var(--primary))] pointer-events-none"
        style={{ left: `calc(50% - 28px + ${knob.x * 40}px)`, top: `calc(50% - 28px + ${knob.y * 40}px)` }} />
    </div>
  );
}
