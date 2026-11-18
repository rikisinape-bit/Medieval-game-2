import React, { useLayoutEffect, useRef, useState } from "react";
import { X, Heart, Pause, RotateCw, Sword, Shield, Shirt, Castle, Crown, Home, HardHat, Hand } from "lucide-react";
import { ITEMS, SWORD_ITEM, dmgReduction, sellPrice } from "@/game3d/items";
import CharacterPreview from "@/components/CharacterPreview";
import ItemPic from "@/components/ItemPic";
import RepFace from "@/components/RepFace";

// ---- Inventory tab -----------------------------------------------------------------------------------------------
// On the left the equipment: the player big (it turns only when you drag it), with what it wears in squares at its
// sides (pictures only, nothing written over the body). On the right the inventory: every thing carried, pictures
// only, one next to the other. Touching a square opens a window beside it with what the thing does and what you can
// do with it; touching the same square again closes it.
const SLOT_OF_KIND = { sword: "hand", armor: "body", helm: "head", offhand: "off" };
const SLOTS_LEFT = [{ slot: "head", Icon: HardHat, title: "Testa" }, { slot: "body", Icon: Shirt, title: "Corpo" }];
const SLOTS_RIGHT = [{ slot: "hand", Icon: Sword, title: "Arma" }, { slot: "off", Icon: Shield, title: "Mano sinistra" }];
// order of the things in the inventory: weapons and armour first, then food, then the rest
const KIND_ORDER = ["sword", "armor", "helm", "offhand", "food", "tool", "misc", "quest"];
const pct = (v) => `${Math.round(v * 100)}%`;

// What a thing does, in a few short lines (the equipped one in the same place is given to compare).
function effectOf(id, hud) {
  const it = ITEMS[id], eq = hud.eq || {};
  if (id === "oro") return [`Hai ${hud.gold} monete d'oro.`];
  if (id === "argento") return [`Hai ${hud.ore} pezzi d'argento grezzo.`, "I mercanti lo comprano."];
  switch (it.kind) {
    case "food": return [it.heal >= 100 ? "Ti rimette tutta la vita." : `Ti rimette ${it.heal} di vita.`];
    case "sword": {
      const cur = ITEMS[SWORD_ITEM[eq.hand]];
      return [`Danno ${it.dmg}`, cur && cur !== it ? `La tua arma ora: danno ${cur.dmg}` : null];
    }
    case "armor": case "helm": {
      const cur = ITEMS[eq[SLOT_OF_KIND[it.kind]]];
      return [`Ferma il ${pct(it.red)} dei danni`, cur && cur !== it ? `Quella che porti: ${pct(cur.red)}` : null];
    }
    case "offhand": return it.block ? [`Parate più facili`, `Ferma il ${pct(it.block)} dei colpi da davanti`] : [it.desc || ""];
    case "quest": return [it.desc || "Serve per una missione."];
    default: return [it.desc, it.price ? `Un mercante te lo paga ${sellPrice(id)} oro.` : null];
  }
}

function Square({ testid, selected, onPick, children, title }) {
  return (
    <button type="button" data-ui="" data-testid={testid} title={title} onClick={onPick}
      className={`relative shrink-0 w-[62px] h-[62px] sm:w-[70px] sm:h-[70px] rounded-sm border-2 flex items-center justify-center transition-colors
        bg-[radial-gradient(circle_at_50%_40%,#3a2c1c,#140e09)] ${selected ? "border-[#e8c050] shadow-[0_0_10px_rgba(232,192,80,0.45)]" : "border-[#4a3820]"}`}>
      {children}
    </button>
  );
}

// The window beside a square, level with it and never over the square itself: inside the inventory (and the squares
// of the right hand) on the right of the square if there is room, else on its left; only on a small screen, when
// neither fits, over the player's frame. The windows of the squares left of the player open over the inventory.
function ItemWindow({ pop, hud, onAct, onClose, root, area }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current, R = root.current; if (!el || !R) return;
    const Rb = R.getBoundingClientRect(), x0 = Math.min(...area.map((a) => a.current.getBoundingClientRect().left)) - Rb.left;
    const x1 = R.clientWidth, H = R.clientHeight, w = el.offsetWidth, h = el.offsetHeight, gap = 6;
    let left = pop.ax + pop.aw + gap;
    if (left < x0) left = x0 + gap;                                   // a square left of the player: over the inventory, level with it
    else if (left + w > x1) {
      left = pop.ax - w - gap;                                        // no room on the right: on the left (on a small screen even
      if (left < 0) left = x1 - w;                                    // over the player's frame: never over the square itself)
    }
    setPos({ left: Math.max(0, Math.min(x1 - w, left)), top: Math.max(0, Math.min(H - h, pop.ay)) });
  }, [pop, root, area]);
  const it = ITEMS[pop.id];
  const act = (kind, arg) => { onAct(kind, arg); onClose(); };
  const lines = effectOf(pop.id, hud).filter(Boolean);
  return (
    <div ref={ref} data-ui="" data-testid="item-window" style={pos} onClick={(e) => e.stopPropagation()}
      className="absolute z-10 w-[190px] lg:w-[240px] rounded-md border-2 border-[#c9a24a] bg-[#1b140e] p-2 shadow-[0_6px_24px_rgba(0,0,0,0.75)]">
      <div className="flex items-start gap-2">
        <ItemPic id={pop.id} size={48} />
        <div className="min-w-0">
          <div className="font-title text-[15px] leading-tight text-[#e8c050]">{it.name}</div>
          {pop.slot && <div className="font-pixel text-[14px] text-[#8a7d66]">Equipaggiato</div>}
        </div>
      </div>
      <div className="mt-1 font-pixel text-[16px] leading-tight text-[#e8dcc4] space-y-0.5" data-testid="item-effect">
        {lines.map((l) => <div key={l}>{l}</div>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {it.kind === "food" && <button type="button" data-ui="" className="inv-btn inv-btn-lg" disabled={hud.hp >= 100} onClick={() => act("use", pop.id)} data-testid="detail-use">{hud.hp >= 100 ? "Vita piena" : "Usa"}</button>}
        {!pop.slot && SLOT_OF_KIND[it.kind] && <button type="button" data-ui="" className="inv-btn inv-btn-lg" onClick={() => act("equip", pop.id)} data-testid="detail-equip">Equipaggia</button>}
        {pop.slot && pop.slot !== "hand" && <button type="button" data-ui="" className="inv-btn inv-btn-lg" onClick={() => act("unequip", pop.slot)} data-testid="detail-unequip">Togli</button>}
        {!pop.slot && it.kind !== "quest" && (
          <button type="button" data-ui="" className="inv-btn inv-btn-lg inv-btn-danger" onClick={() => act("drop", pop.id)} data-testid="detail-drop">
            {pop.id === "oro" ? `Lascia ${Math.min(10, hud.gold)} a terra` : pop.id === "argento" ? "Lascia 1 a terra" : "Lascia a terra"}
          </button>
        )}
      </div>
    </div>
  );
}

function InventoryTab({ hud, onAct }) {
  const [pop, setPop] = useState(null);           // the open window: { key, id, slot, ax, ay, aw, ah }
  const root = useRef(null), invRef = useRef(null), handRef = useRef(null);
  const eq = hud.eq || {};
  const equipped = { hand: SWORD_ITEM[eq.hand], body: eq.body, head: eq.head, off: eq.off };
  const carried = Object.entries(hud.inv || {}).filter(([id, q]) => q > 0 && ITEMS[id])
    .sort(([a], [b]) => (KIND_ORDER.indexOf(ITEMS[a].kind) - KIND_ORDER.indexOf(ITEMS[b].kind)) || ITEMS[a].name.localeCompare(ITEMS[b].name));
  const tiles = [...carried, ...(hud.gold > 0 ? [["oro", hud.gold]] : []), ...(hud.ore > 0 ? [["argento", hud.ore]] : [])];
  // touch a square: its window opens beside it; the same square again (or an empty spot) closes it
  const pick = (key, id, slot) => (e) => {
    e.stopPropagation();
    if (pop?.key === key) { setPop(null); return; }
    const r = e.currentTarget.getBoundingClientRect(), R = root.current.getBoundingClientRect();
    setPop({ key, id, slot, ax: r.left - R.left, ay: r.top - R.top, aw: r.width, ah: r.height });
  };
  const off = eq.off && ITEMS[eq.off];
  const slot = ({ slot: s, Icon, title }) => {
    const id = equipped[s];
    return (
      <Square key={s} testid={`slot-${s}`} title={title} selected={pop?.key === `eq:${s}`} onPick={id ? pick(`eq:${s}`, id, s) : (e) => { e.stopPropagation(); setPop(null); }}>
        {id ? <ItemPic id={id} size={52} /> : <Icon size={26} className="text-[#4a3c28]" />}
      </Square>
    );
  };
  return (
    <div ref={root} className="relative grid grid-cols-[minmax(0,46%)_minmax(0,1fr)] gap-2 h-full min-h-0" onClick={() => setPop(null)} data-testid="inventory-tab">
      {/* Equipment: the player with what it wears at its sides */}
      <section className="flex flex-col min-h-0 rounded-sm border border-[#3a2a17] bg-black/20 p-1.5" data-testid="equipment">
        <div className="font-title text-[14px] tracking-widest text-[color:hsl(var(--primary))] mb-1">Equipaggiamento</div>
        <div className="flex-1 min-h-0 flex items-stretch gap-1.5">
          <div className="flex flex-col justify-center gap-2">{SLOTS_LEFT.map(slot)}</div>
          <div className="relative flex-1 min-w-0 rounded-sm bg-[radial-gradient(circle_at_50%_40%,#2a2016,#0d0a08)]"><CharacterPreview eq={eq} /></div>
          <div ref={handRef} className="flex flex-col justify-center gap-2">{SLOTS_RIGHT.map(slot)}</div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 font-pixel text-[16px] leading-tight text-[#cfc2a8]" data-testid="menu-stats">
          <span className="flex items-center gap-1.5"><Heart size={15} className="text-red-400" />{Math.round(hud.hp)}/100</span>
          <span className="flex items-center gap-1.5"><Sword size={15} />Danno {ITEMS[equipped.hand]?.dmg ?? "?"}</span>
          <span className="flex items-center gap-1.5"><Shirt size={15} />Difesa {pct(dmgReduction(eq))}</span>
          <span className="flex items-center gap-1.5">{off && !off.block ? <Hand size={15} /> : <Shield size={15} />}{off?.block ? `Scudo ${pct(off.block)}` : off ? "Torcia" : "Niente scudo"}</span>
        </div>
      </section>

      {/* Inventory: pictures only, one next to the other */}
      <section ref={invRef} className="flex flex-col min-h-0 rounded-sm border border-[#3a2a17] bg-black/20 p-1.5" data-testid="inventory">
        <div className="font-title text-[14px] tracking-widest text-[color:hsl(var(--primary))] mb-1">Inventario</div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5" onScroll={() => setPop(null)}>
          {tiles.length === 0 ? <div className="font-pixel text-[16px] text-[#8a7d66] italic">Non porti niente.</div> : (
            <div className="flex flex-wrap gap-1.5 content-start">
              {tiles.map(([id, qty]) => (
                <Square key={id} testid={`tile-${id}`} title={ITEMS[id].name} selected={pop?.key === id} onPick={pick(id, id, null)}>
                  <ItemPic id={id} size={52} />
                  {qty > 1 && <span className="absolute bottom-0 right-1 font-pixel text-[15px] leading-none text-[#e8dcc4] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{qty}</span>}
                </Square>
              ))}
            </div>
          )}
        </div>
      </section>

      {pop && <ItemWindow pop={pop} hud={hud} onAct={onAct} onClose={() => setPop(null)} root={root} area={pop.slot === "head" || pop.slot === "body" ? [invRef] : [invRef, handRef]} />}
    </div>
  );
}

// ---- Reputation tab -------------------------------------------------------------
const PLACE_ICON = { village: Home, crown: Crown, valdoro: Castle };
function ReputationTab({ hud }) {
  return (
    <div className="h-full overflow-y-auto grid sm:grid-cols-2 gap-2 content-start" data-testid="rep-list">
      {(hud.places || []).map((p) => {
        const Icon = PLACE_ICON[p.id] || Home;
        const pos = Math.max(0, Math.min(100, (p.value + 100) / 2));
        return (
          <div key={p.id} className="rounded-sm border border-[#3a2a17] bg-black/25 p-2" data-testid={`rep-${p.id}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <Icon size={18} className="text-[color:hsl(var(--primary))]" />
              <div className="font-title text-[16px] tracking-wider">{p.name}</div>
              <div className="font-pixel text-[13px] text-[#8a7d66] uppercase">{p.kind}</div>
              <div className="ml-auto flex items-center gap-1 font-pixel text-[17px]"><RepFace mood={p.mood} size={22} />{p.label} <span className="text-[#8a7d66]">({p.value})</span></div>
            </div>
            <div className="relative h-2.5 mt-2 rounded-sm bg-[linear-gradient(90deg,#6a1a14,#3a2a17_45%,#3a2a17_55%,#6a8a2a)]">
              <div className="absolute top-[-3px] w-2 h-4 bg-[#e8dcc4] rounded-sm" style={{ left: `calc(${pos}% - 4px)` }} />
            </div>
            <div className="mt-1.5 text-[15px] italic text-[#b8ab92]">{p.note}</div>
            <ul className="mt-1 font-pixel text-[16px] leading-tight text-[#cfc2a8] list-disc pl-5">{p.effects.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}

// ---- Menu shell ----------------------------------------------------------------
export default function GameMenu({ hud, log = [], onAct, onClose, onReset }) {
  const [tab, setTab] = useState("inv");
  if (!hud) return null;
  const tabs = [["inv", "Inventario"], ["rep", "Reputazione"], ["log", "Diario"], ["game", "Partita"]];
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/70 p-1 sm:p-3" data-ui="" data-testid="game-menu">
      <div className="parchment rounded-md w-full max-w-5xl flex flex-col p-1.5 sm:p-3 min-h-0">
        <div className="flex items-center gap-1.5 mb-1.5 font-pixel">
          <span className="hidden sm:flex items-center gap-1 text-[15px] text-[#8a7d66] mr-1" data-testid="menu-paused"><Pause size={15} />In pausa</span>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" data-ui="" className={`inv-btn inv-btn-lg ${tab === id ? "!bg-[#c9a24a] !text-[#1b140e]" : ""}`} onClick={() => setTab(id)} data-testid={`menu-tab-${id}`}>{label}</button>
          ))}
          <button type="button" data-ui="" onClick={onClose} className="inv-btn inv-btn-lg ml-auto !px-3" data-testid="menu-close" aria-label="Chiudi"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0">
          {tab === "inv" && <InventoryTab hud={hud} onAct={onAct} />}
          {tab === "rep" && <ReputationTab hud={hud} />}
          {tab === "log" && (
            <div className="h-full overflow-y-auto space-y-1 font-pixel text-[17px] leading-tight" data-testid="menu-log">
              {log.length === 0 && <div className="italic text-[#8a7d66]">Ancora nulla da annotare.</div>}
              {log.map((l) => <div key={l.id} className={l.quiet ? "text-[#8a7d66]" : "text-[#e8dcc4]"}>{l.t}</div>)}
            </div>
          )}
          {tab === "game" && (
            <div className="h-full overflow-y-auto space-y-3 font-pixel text-[17px] leading-snug" data-testid="menu-game">
              <p className="text-[#b8ab92]">La partita si salva da sola in questo browser ogni 5 secondi e quando chiudi o cambi app.</p>
              <p className="text-[#b8ab92]">Comandi: joystick per muoverti, trascina lo schermo per guardare. Tastiera: WASD, Maiusc corri, E usa (da furtivo: ruba), J attacca, K para, C furtivo, V telecamera, Spazio schiva, I menu.</p>
              <button type="button" data-ui="" className="inv-btn inv-btn-lg inv-btn-danger flex items-center gap-1.5" onClick={onReset} data-testid="menu-reset"><RotateCw size={16} />Nuova partita…</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
