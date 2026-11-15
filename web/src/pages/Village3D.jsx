import React, { useEffect, useRef, useState } from "react";
import { Heart, Coins, Sword, Wind, MessageSquare, Sun, Moon, EyeOff, Eye, Camera, Menu as MenuIcon } from "lucide-react";
import { createGame } from "@/game3d/engine";
import { Joystick } from "@/components/TouchControls";
import InteractionDialog from "@/components/InteractionDialog";
import GameMenu from "@/components/GameMenu";
import RepFace from "@/components/RepFace";
import Shop from "@/components/Shop";
import { loadSave, writeSave, clearSave } from "@/lib/save";

const ZONE = { village: "Roccanera", forest: "Bosco", mine: "Miniera", valdoro: "Valdoro" };
const clockOf = (t) => { const h = Math.floor(t * 24), m = Math.floor((t * 24 - h) * 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };


// Small round action button. Each press is handled on pointerdown of its own finger, so it works while the joystick is held.
function Btn({ testid, color, onPress, icon, label, className, big, active }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onPress(); }}
      data-testid={testid}
      data-ui=""
      className={`absolute ${big ? "w-14 h-14" : "w-11 h-11"} rounded-full border-2 ${active ? "bg-slate-700/80" : "bg-black/40"} backdrop-blur-sm flex flex-col items-center justify-center font-pixel text-[8px] active:scale-90 transition-transform select-none touch-none ${className}`}
      style={{ borderColor: color, color }}
    >
      {icon}<span className="mt-0.5 leading-none">{label}</span>
    </button>
  );
}

// Thin top bar: life, gold and a face showing how the Crown sees you. Everything else lives in the menu.
function TopBar({ hud, onMenu, onCamera }) {
  if (!hud) return null;
  const crown = hud.places?.find((p) => p.face);
  return (
    <div className="fixed top-0 inset-x-0 z-20 h-8 px-2 flex items-center gap-3 font-pixel text-[13px] text-[#e8dcc4] bg-gradient-to-b from-black/75 to-transparent pointer-events-none" data-testid="hud3d">
      <span className="flex items-center gap-1" data-testid="hud3d-hp">
        <Heart size={13} className="text-red-400" fill="#c0392b" />
        <span className="w-20 h-1.5 rounded-full bg-black/60 overflow-hidden"><span className="block h-full bg-[#c0392b] transition-[width] duration-300" style={{ width: `${Math.max(0, hud.hp)}%` }} /></span>
        <span className="w-7">{Math.max(0, Math.round(hud.hp))}</span>
      </span>
      <span className="flex items-center gap-1" data-testid="hud3d-gold"><Coins size={13} className="text-[#e8c050]" />{hud.gold}</span>
      {crown && <span className="flex items-center gap-1" data-testid="hud3d-rep" title={`La Corona: ${crown.label} (${crown.value})`}><RepFace mood={crown.mood} size={17} title={`La Corona ti considera: ${crown.label}`} /></span>}
      {hud.wanted > 0 && <span data-testid="hud3d-wanted" className={`px-1.5 rounded-sm text-[11px] ${hud.wanted === 2 ? "bg-red-900/85 text-red-100 animate-pulse" : "bg-amber-900/75 text-amber-100"}`}>{hud.wanted === 2 ? "RICERCATO" : "Guardie in allerta"}</span>}
      {hud.sneak && <EyeOff size={14} className="text-slate-300" data-testid="hud3d-sneak" />}
      <span className="flex items-center gap-1 text-[11px] text-[#cfc2a8]/80" data-testid="hud3d-clock">{hud.night ? <Moon size={11} /> : <Sun size={11} />}{clockOf(hud.dayT)} · {hud.mounted ? "A cavallo" : ZONE[hud.zone] || "Roccanera"}</span>
      <span className="ml-auto flex gap-1 pointer-events-auto" data-ui="">
        <button onClick={onCamera} className="h-6 px-1.5 rounded-sm bg-black/50 border border-[#4a3820] flex items-center gap-1 text-[11px]" data-testid="village3d-camera-btn" aria-label="Cambia telecamera"><Camera size={13} />{hud.view === "third" ? "3ª" : "1ª"}</button>
        <button onClick={onMenu} className="h-6 px-2 rounded-sm bg-black/50 border border-[#c9a24a]/70 text-[#e8c050] flex items-center gap-1 text-[12px]" data-testid="village3d-menu-btn"><MenuIcon size={14} />Menu</button>
      </span>
    </div>
  );
}

export default function Village3D() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [log, setLog] = useState([]);       // diary: every message, read in the menu
  const [toast, setToast] = useState(null); // the one essential message currently on screen
  const toastT = useRef(0);
  const [floats, setFloats] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shop, setShop] = useState(null);
  const [askReset, setAskReset] = useState(false);

  useEffect(() => {
    let alive = true;
    let saveId = 0;
    let game = null;
    const save = () => { if (gameRef.current) writeSave(gameRef.current.getSave()); };
    // On mobile "beforeunload" often never fires: save when the page is hidden (app switch, screen off, tab closed).
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    (async () => {
      const saved = loadSave();
      if (!alive || !canvasRef.current) return;
      game = createGame(canvasRef.current, {
        onHud: setHud,
        onPrompt: setPrompt,
        openDialog: (id, d) => setDialog({ id, d }),
        onToggleInventory: () => setMenuOpen((o) => !o),
        openShop: (id, def) => setShop({ id, def }),
        onLog: (t, quiet) => {
          const id = `${Date.now()}${Math.random()}`;
          setLog((l) => [{ id, t, quiet }, ...l].slice(0, 60));
          if (quiet) return;
          setToast({ id, t });
          clearTimeout(toastT.current);
          toastT.current = setTimeout(() => setToast(null), Math.min(6000, 2500 + t.length * 35));
        },
        onFloat: (t, c, big) => {
          const id = `${Date.now()}${Math.random()}`;
          setFloats((f) => [...f, { id, t, c, big }].slice(-2));
          setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
        },
      }, saved);
      gameRef.current = game;
      saveId = setInterval(save, 5000);
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", save);
    })();
    return () => {
      alive = false;
      clearInterval(saveId);
      save();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  const act = (k) => gameRef.current?.action(k);
  // True pause: menu, shop, dialogs and the reset confirmation all stop the world.
  const paused = menuOpen || !!shop || !!dialog || askReset;
  useEffect(() => { gameRef.current?.setPaused(paused); }, [paused, hud === null]);
  // Escape closes the menu / shop (dialogs handle Escape themselves).
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { setMenuOpen(false); setShop(null); setAskReset(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  // In-game confirmation (window.confirm is blocked in sandboxed pages and ugly on mobile).
  const reset = () => {
    gameRef.current = null;
    clearSave();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" data-testid="village3d-root">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" data-testid="village3d-canvas" />
      <TopBar hud={hud} onMenu={() => setMenuOpen(true)} onCamera={() => act("camera")} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-1.5 h-1.5 rounded-full bg-white/70 pointer-events-none" data-testid="crosshair" />
      {hud?.foe && (
        <div className="fixed top-9 left-1/2 -translate-x-1/2 z-20 w-44 md:w-64 parchment rounded-md px-3 py-1.5" data-testid="foe-bar">
          <div className="font-title text-xs tracking-widest text-red-300 text-center">{hud.foe.name}</div>
          <div className="bar-track rounded-sm mt-1"><div className="bar-fill" style={{ width: `${(hud.foe.hp / hud.foe.hpMax) * 100}%`, background: "#c0392b" }} /></div>
        </div>
      )}
      {/* Small floating feedback just right of the crosshair (max 2 at a time). */}
      <div className="fixed top-[38%] left-[calc(50%+18px)] z-20 flex flex-col items-start pointer-events-none" data-testid="floats">
        {floats.map((f) => <div key={f.id} className={`hex-float font-pixel ${f.big ? "text-2xl" : "text-base"} leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]`} style={{ color: f.c }}>{f.t}</div>)}
      </div>
      {prompt && !dialog && (
        <button data-ui="" onPointerDown={(e) => { e.preventDefault(); act("interact"); }} className="fixed bottom-2 left-1/2 -translate-x-1/2 z-20 bg-black/50 border border-[#c9a24a]/50 rounded-sm px-2 py-0.5 font-pixel text-[12px] text-[#e8c050]" data-testid="village3d-prompt">
          <span className="[@media(pointer:coarse)]:hidden">[E] </span>{prompt}
        </button>
      )}
      {/* One essential message at a time, small, under the top bar; it fades by itself. Everything is kept in the diary. */}
      {toast && (
        <div key={toast.id} className="fixed top-8 left-2 z-20 max-w-[42vw] pointer-events-none font-pixel text-[12px] leading-tight bg-black/45 rounded-sm px-2 py-0.5 text-[#e8dcc4] toast-in" data-testid="village3d-log">{toast.t}</div>
      )}
      <div className="pointer-events-none fixed inset-0 z-30">
        <Joystick onJoystick={(v) => { if (gameRef.current) { gameRef.current.input.x = v.x; gameRef.current.input.y = v.y; } }} />
        {/* Compact cluster: the container itself lets touches through, only the buttons catch them. */}
        <div className="absolute bottom-2 right-2 w-[110px] h-[110px]">
          <Btn testid="btn3d-attack" color="#ff6a5a" onPress={() => act("attack")} icon={<Sword size={20} />} label="Colpisci" className="pointer-events-auto bottom-0 right-0" big />
          <Btn testid="btn3d-interact" color="#6ab0f0" onPress={() => act("interact")} icon={<MessageSquare size={15} />} label="Usa" className="pointer-events-auto bottom-[62px] right-[6px]" />
          <Btn testid="btn3d-dodge" color="#a8e07a" onPress={() => act("dodge")} icon={<Wind size={15} />} label="Schiva" className="pointer-events-auto bottom-[6px] right-[62px]" />
          <Btn testid="btn3d-sneak" color="#9ab0c8" onPress={() => act("sneak")} active={hud?.sneak} icon={hud?.sneak ? <EyeOff size={15} /> : <Eye size={15} />} label={hud?.sneak ? "Furtivo" : "Nasconditi"} className="pointer-events-auto bottom-[58px] right-[58px]" />
        </div>
      </div>
      {menuOpen && <GameMenu hud={hud} log={log} onAct={(k, id) => gameRef.current?.invAction(k, id)} onClose={() => setMenuOpen(false)} onReset={() => setAskReset(true)} />}
      {shop && <Shop hud={hud} shopId={shop.id} def={shop.def} onTrade={(k, id) => gameRef.current?.shop(k, shop.id, id)} onClose={() => setShop(null)} />}
      <InteractionDialog
        interaction={dialog?.d}
        onChoose={(effect) => { const d = dialog; setDialog(null); if (d) gameRef.current?.choose(d.id, effect); }}
      />
      {askReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" data-testid="reset-confirm">
          <div className="parchment rounded-md p-4 max-w-sm w-full" data-ui="">
            <div className="font-title text-lg text-[color:hsl(var(--primary))] tracking-wider">Nuova partita?</div>
            <p className="mt-2 text-sm italic">Il salvataggio attuale andrà perso per sempre.</p>
            <div className="mt-4 flex gap-2 justify-end font-pixel">
              <button className="inv-btn" onClick={() => setAskReset(false)} data-testid="reset-cancel">Annulla</button>
              <button className="inv-btn inv-btn-danger" onClick={reset} data-testid="reset-ok">Ricomincia</button>
            </div>
          </div>
        </div>
      )}
      <div className="portrait-warning" data-testid="rotate-warning">Ruota il telefono in orizzontale per giocare</div>
    </div>
  );
}
