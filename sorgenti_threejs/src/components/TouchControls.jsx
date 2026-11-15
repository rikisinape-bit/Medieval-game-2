import React, { useRef, useState } from "react";
import { Sword, EyeOff, MessageSquare, Hand } from "lucide-react";

export function Joystick({ onJoystick }) {
  const ref = useRef(null);
  const active = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const t = e.touches?.[0] || e;
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    setKnob({ x: dx, y: dy });
    onJoystick({ x: dx, y: dy });
  };
  const start = (e) => { active.current = true; update(e); };
  const move = (e) => { if (active.current) update(e); };
  const end = () => { active.current = false; setKnob({ x: 0, y: 0 }); onJoystick({ x: 0, y: 0 }); };
  return (
    <div ref={ref} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      className="pointer-events-auto absolute bottom-4 left-4 w-28 h-28 rounded-full bg-black/35 border-2 border-[color:hsl(var(--primary))]/40 touch-none select-none backdrop-blur-sm"
      data-testid="joystick">
      <div className="absolute w-12 h-12 rounded-full bg-[color:hsl(var(--primary))]/70 border border-[color:hsl(var(--primary))]"
        style={{ left: `calc(50% - 24px + ${knob.x * 30}px)`, top: `calc(50% - 24px + ${knob.y * 30}px)` }} />
    </div>
  );
}

function RoundBtn({ testid, color, onClick, icon, label, active, className }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`absolute w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center font-pixel text-[10px] active:scale-90 transition-transform backdrop-blur-sm ${active ? "bg-emerald-900/80" : "bg-black/45"} ${className}`}
      style={{ borderColor: color, color }}>
      {icon}
      <span className="mt-0.5 leading-none">{label}</span>
    </button>
  );
}

export default function TouchControls({ onJoystick, onAction, sneaking }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <Joystick onJoystick={onJoystick} />
      <div className="pointer-events-auto absolute bottom-3 right-3 w-48 h-48">
        <RoundBtn testid="btn-interact" color="#6ab0f0" onClick={() => onAction("interact")} icon={<MessageSquare size={20} />} label="Interagisci" className="top-0 left-16" />
        <RoundBtn testid="btn-hide" color="#7ad07a" onClick={() => onAction("hide")} icon={<EyeOff size={20} />} label={sneaking ? "Nascosto" : "Nascondi"} active={sneaking} className="top-16 left-0" />
        <RoundBtn testid="btn-grab" color="#e0b850" onClick={() => onAction("grab")} icon={<Hand size={20} />} label="Afferra" className="top-16 right-0" />
        <RoundBtn testid="btn-attack" color="#ff6a5a" onClick={() => onAction("attack")} icon={<Sword size={22} />} label="Attacca" className="bottom-0 left-16" />
      </div>
    </div>
  );
}
