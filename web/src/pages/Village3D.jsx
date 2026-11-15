import React, { useEffect, useRef, useState } from "react";
import { Heart, Coins, Gem, Sword, Shield, Wind, MessageSquare, RotateCw, Crown, Home, Backpack, Castle, Sun, Moon } from "lucide-react";
import { ITEMS } from "@/game3d/items";
import { createGame } from "@/game3d/engine";
import { Joystick } from "@/components/TouchControls";
import InteractionDialog from "@/components/InteractionDialog";
import Inventory from "@/components/Inventory";
import Shop from "@/components/Shop";
import { loadSave, writeSave, clearSave } from "@/lib/save";

const ZONE = { village: "Roccanera", forest: "Bosco", mine: "Miniera", valdoro: "Valdoro" };
const clockOf = (t) => { const h = Math.floor(t * 24), m = Math.floor((t * 24 - h) * 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };


function Btn({ testid, color, onPress, icon, label, className, big }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onPress(); }}
      data-testid={testid}
      className={`absolute ${big ? "w-20 h-20" : "w-16 h-16"} rounded-full border-2 bg-black/45 backdrop-blur-sm flex flex-col items-center justify-center font-pixel text-[10px] active:scale-90 transition-transform select-none touch-none ${className}`}
      style={{ borderColor: color, color }}
    >
      {icon}<span className="mt-0.5 leading-none">{label}</span>
    </button>
  );
}

function Hud({ hud }) {
  if (!hud) return null;
  return (
    <div className="fixed top-2 left-2 z-20 w-56 parchment rounded-md p-2 space-y-1.5" data-testid="hud3d">
      <div data-testid="hud3d-hp">
        <div className="flex justify-between text-[11px] font-pixel"><span className="flex items-center gap-1"><Heart size={11} className="text-red-400" />Vita</span><span>{Math.round(hud.hp)}/100</span></div>
        <div className="bar-track rounded-sm mt-0.5"><div className="bar-fill" style={{ width: `${Math.max(0, hud.hp)}%`, background: "#c0392b" }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-pixel">
        <span className="flex items-center gap-1" data-testid="hud3d-gold"><Coins size={11} className="text-[color:hsl(var(--primary))]" />{hud.gold} oro</span>
        <span className="flex items-center gap-1" data-testid="hud3d-ore"><Gem size={11} className="text-sky-200" />{hud.ore} argento</span>
        <span className="flex items-center gap-1 truncate" data-testid="hud3d-sword"><Sword size={11} className="shrink-0" />{ITEMS[Object.keys(ITEMS).find((k) => ITEMS[k].sword === hud.eq.hand)]?.name || hud.eq.hand}</span>
        <span className="flex items-center gap-1 truncate" data-testid="hud3d-armor"><Shield size={11} className="shrink-0" />{hud.eq.body ? ITEMS[hud.eq.body].name : "Senza armatura"}</span>
        <span className="truncate" data-testid="hud3d-zone">{hud.mounted ? "A cavallo" : ZONE[hud.zone] || "Roccanera"}</span>
        <span className="flex items-center gap-1" data-testid="hud3d-clock">{hud.night ? <Moon size={11} className="text-sky-200" /> : <Sun size={11} className="text-amber-300" />}{clockOf(hud.dayT)}{hud.night ? " · notte" : ""}</span>
        <span className="flex items-center gap-1" data-testid="hud3d-rep-village" title="Reputazione villaggio"><Home size={11} />{hud.rep.village}</span>
        <span className="flex items-center gap-1" data-testid="hud3d-rep-crown" title="Reputazione Corona"><Crown size={11} />{hud.rep.crown}</span>
        <span className="flex items-center gap-1" data-testid="hud3d-known-crown" title="Ciò che Valdoro sa di te (portato dai messaggeri)"><Castle size={11} />{hud.known}{hud.gateOpen ? " · porte aperte" : ""}</span>
      </div>
      {hud.wanted > 0 && (
        <div data-testid="hud3d-wanted" className={`font-pixel text-[11px] text-center rounded-sm py-0.5 ${hud.wanted === 2 ? "bg-red-900/80 text-red-100 animate-pulse" : "bg-amber-900/70 text-amber-100"}`}>
          {hud.wanted === 2 ? "RICERCATO — le guardie ti inseguono" : "Le guardie cercano un colpevole"}
        </div>
      )}
      {hud.riposte && <div data-testid="hud3d-riposte" className="font-pixel text-[11px] text-center text-orange-300">Contrattacco pronto! Colpisci ora</div>}
    </div>
  );
}

export default function Village3D() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [log, setLog] = useState([]);
  const [floats, setFloats] = useState([]);
  const [invOpen, setInvOpen] = useState(false);
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
        onToggleInventory: () => setInvOpen((o) => !o),
        openShop: (id, def) => setShop({ id, def }),
        onLog: (t) => setLog((l) => [{ id: `${Date.now()}${Math.random()}`, t }, ...l].slice(0, 3)),
        onFloat: (t, c) => {
          const id = `${Date.now()}${Math.random()}`;
          setFloats((f) => [...f, { id, t, c }].slice(-4));
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
  // True pause while backpack, shop or a dialog is open: the world (and enemies) stop.
  const paused = invOpen || !!shop || !!dialog || askReset;
  useEffect(() => { gameRef.current?.setPaused(paused); }, [paused, hud === null]);
  // In-game confirmation (window.confirm is blocked in sandboxed pages and ugly on mobile).
  const reset = () => {
    gameRef.current = null;
    clearSave();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" data-testid="village3d-root">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" data-testid="village3d-canvas" />
      <Hud hud={hud} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-1.5 h-1.5 rounded-full bg-white/70 pointer-events-none" data-testid="crosshair" />
      <div className="fixed top-2 right-2 z-20 flex flex-col items-end gap-1">
        <div className="flex gap-1">
          <button onClick={() => setInvOpen(true)} className="parchment rounded-sm px-2 py-1 font-pixel text-[11px] flex items-center gap-1 text-[color:hsl(var(--primary))]" data-testid="village3d-inventory-btn"><Backpack size={12} />Zaino{hud ? ` (${Object.values(hud.inv || {}).reduce((a, b) => a + b, 0)})` : ""}</button>
          <button onClick={() => setAskReset(true)} className="parchment rounded-sm px-2 py-1 font-pixel text-[11px] flex items-center gap-1" data-testid="village3d-reset"><RotateCw size={12} />Nuova partita</button>
        </div>
        <div className="font-pixel text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-sm hidden md:block">WASD muovi · trascina o frecce per guardare · E interagisci · I zaino · J colpisci (x3 combo) · K para · Spazio schiva</div>
      </div>
      {hud?.foe && (
        <div className="fixed top-2 left-[62%] md:left-1/2 -translate-x-1/2 z-20 w-44 md:w-64 parchment rounded-md px-3 py-1.5" data-testid="foe-bar">
          <div className="font-title text-xs tracking-widest text-red-300 text-center">{hud.foe.name}</div>
          <div className="bar-track rounded-sm mt-1"><div className="bar-fill" style={{ width: `${(hud.foe.hp / hud.foe.hpMax) * 100}%`, background: "#c0392b" }} /></div>
        </div>
      )}
      <div className="fixed top-[30%] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
        {floats.map((f) => <div key={f.id} className="hex-float font-pixel text-3xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]" style={{ color: f.c }}>{f.t}</div>)}
      </div>
      {prompt && !dialog && (
        <button onPointerDown={(e) => { e.preventDefault(); act("interact"); }} className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 parchment rounded-sm px-3 py-1.5 font-pixel text-sm text-[color:hsl(var(--primary))]" data-testid="village3d-prompt">
          [E] {prompt}
        </button>
      )}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-20 w-[46vw] max-w-md space-y-0.5 pointer-events-none" data-testid="village3d-log">
        {log.map((l, i) => <div key={l.id} className={`font-pixel text-xs text-center bg-black/55 rounded-sm px-2 py-0.5 text-[#e8dcc4] ${i ? "opacity-60" : ""}`}>{l.t}</div>)}
      </div>
      <div className="pointer-events-none fixed inset-0 z-30">
        <Joystick onJoystick={(v) => { if (gameRef.current) { gameRef.current.input.x = v.x; gameRef.current.input.y = v.y; } }} />
        <div className="pointer-events-auto absolute bottom-3 right-3 w-52 h-52">
          <Btn testid="btn3d-interact" color="#6ab0f0" onPress={() => act("interact")} icon={<MessageSquare size={20} />} label="Interagisci" className="top-0 left-[72px]" />
          <Btn testid="btn3d-parry" color="#9fd0ff" onPress={() => act("parry")} icon={<Shield size={20} />} label="Para" className="top-[72px] left-0" />
          <Btn testid="btn3d-dodge" color="#a8e07a" onPress={() => act("dodge")} icon={<Wind size={20} />} label="Schiva" className="top-[72px] right-0" />
          <Btn testid="btn3d-attack" color="#ff6a5a" onPress={() => act("attack")} icon={<Sword size={24} />} label="Colpisci" className="bottom-0 left-16" big />
        </div>
      </div>
      {invOpen && <Inventory hud={hud} onAct={(k, id) => gameRef.current?.invAction(k, id)} onClose={() => setInvOpen(false)} />}
      {shop && <Shop hud={hud} shopId={shop.id} def={shop.def} onTrade={(k, id) => gameRef.current?.shop(k, shop.id, id)} onClose={() => setShop(null)} />}
      <InteractionDialog
        interaction={dialog?.d}
        onChoose={(effect) => { const d = dialog; setDialog(null); if (d) gameRef.current?.choose(d.id, effect); }}
      />
      {askReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" data-testid="reset-confirm">
          <div className="parchment rounded-md p-4 max-w-sm w-full">
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
