import React, { useState } from "react";
import {
  X, Coins, Gem, Heart, Pause, RotateCw, Sword, Swords, Axe, Shield, ShieldHalf, Shirt, HardHat, Flame, Hammer, Book, PawPrint, Skull, Link,
  Croissant, Beef, Apple, Droplet, Wine, Leaf, FlaskConical, FlaskRound, Cookie, Package, Castle, Crown, Home,
} from "lucide-react";
import { ITEMS, SWORD_ITEM, dmgReduction } from "@/game3d/items";
import CharacterPreview from "@/components/CharacterPreview";
import RepFace from "@/components/RepFace";

// ---- Item tiles -------------------------------------------------------------
const ICON = {
  pane: Croissant, formaggio: Cookie, carne: Beef, mela: Apple, acqua: Droplet, vino: Wine, erbe: Leaf, pozione: FlaskConical, pozione_grande: FlaskRound,
  pugnale: Sword, spada_corta: Sword, ascia_guerra: Axe, spada_lunga: Swords, spadone: Swords, spada_roccanera: Swords,
  cuoio: Shirt, maglia: Shirt, piastre: Shirt, cappuccio: HardHat, elmo_ferro: HardHat, elmo_piastre: HardHat,
  torcia: Flame, scudo_legno: ShieldHalf, scudo_ferro: Shield,
  ascia: Axe, martello: Hammer, corda: Link, pelliccia: PawPrint, gemma: Gem, libro: Book, testa_morn: Skull,
};
const TINT = { food: "#a8e07a", sword: "#ff8a6a", armor: "#9fb8d8", helm: "#9fb8d8", offhand: "#e8c050", tool: "#c8a878", misc: "#c8a878", quest: "#ff5a4a" };
const SECTIONS = [
  { id: "food", title: "Consumabili", kinds: ["food"], empty: "Niente da mangiare o bere." },
  { id: "armor", title: "Armature", kinds: ["armor", "helm", "offhand"], empty: "Nessuna protezione." },
  { id: "weapons", title: "Armi", kinds: ["sword"], empty: "Nessuna arma di scorta." },
];
const OTHER_KINDS = ["tool", "misc", "quest"];
const SLOT_OF_KIND = { sword: "hand", armor: "body", helm: "head", offhand: "off" };
const SLOT_LABEL = { head: "Testa", body: "Corpo", hand: "Mano destra", off: "Mano sinistra" };

function Tile({ id, qty, equipped, selected, onSelect }) {
  const it = ITEMS[id];
  const Icon = ICON[id] || Package;
  return (
    <button onClick={onSelect} data-ui="" data-testid={`tile-${id}${equipped ? "-eq" : ""}`} title={it.name}
      className={`relative w-[52px] h-[52px] rounded-sm border flex items-center justify-center transition-colors
        ${selected ? "border-[#e8c050] bg-[#3a2c18]" : equipped ? "border-[#c9a24a] bg-[#2a2016]" : "border-[#4a3820] bg-black/30"}`}>
      <Icon size={24} color={it.color || TINT[it.kind] || "#e8dcc4"} strokeWidth={1.8} />
      {qty > 1 && <span className="absolute bottom-0 right-0.5 font-pixel text-[12px] leading-none text-[#e8dcc4] drop-shadow">{qty}</span>}
      {equipped && <span className="absolute top-0 left-0 font-pixel text-[9px] leading-none bg-[#c9a24a] text-[#1b140e] px-0.5 rounded-br-sm">E</span>}
    </button>
  );
}

function Section({ title, tiles, empty, sel, setSel }) {
  return (
    <div className="rounded-sm border border-[#3a2a17] bg-black/20 p-1.5" data-testid={`section-${title}`}>
      <div className="font-title text-[11px] tracking-widest text-[color:hsl(var(--primary))] mb-1">{title}</div>
      {tiles.length === 0 ? <div className="font-pixel text-xs text-[#8a7d66] italic">{empty}</div> : (
        <div className="flex flex-wrap gap-1">
          {tiles.map((t) => <Tile key={t.key} {...t} selected={sel === t.key} onSelect={() => setSel(sel === t.key ? null : t.key)} />)}
        </div>
      )}
    </div>
  );
}

// ---- Equipment tab ------------------------------------------------------------
function EquipmentTab({ hud, onAct }) {
  const [sel, setSel] = useState(null);
  const eq = hud.eq || {};
  const inv = Object.entries(hud.inv || {}).filter(([, q]) => q > 0);
  const equippedIds = { hand: SWORD_ITEM[eq.hand], body: eq.body, head: eq.head, off: eq.off };
  const tilesFor = (kinds) => [
    ...Object.entries(equippedIds).filter(([, id]) => id && kinds.includes(ITEMS[id]?.kind)).map(([slot, id]) => ({ key: `eq:${slot}`, id, qty: 1, equipped: true, slot })),
    ...inv.filter(([id]) => kinds.includes(ITEMS[id]?.kind)).map(([id, qty]) => ({ key: id, id, qty })),
  ];
  const others = tilesFor(OTHER_KINDS);
  const selTile = sel && [...SECTIONS.flatMap((s) => tilesFor(s.kinds)), ...others].find((t) => t.key === sel);
  const it = selTile && ITEMS[selTile.id];
  const act = (kind, id) => { onAct(kind, id); setSel(null); };
  const off = eq.off && ITEMS[eq.off];

  return (
    <div className="grid grid-cols-[minmax(150px,34%)_1fr] gap-2 h-full min-h-0">
      {/* Character */}
      <div className="flex flex-col min-h-0">
        <div className="relative flex-1 min-h-[150px] rounded-sm border border-[#3a2a17] bg-[radial-gradient(circle_at_50%_40%,#2a2016,#0d0a08)]">
          <CharacterPreview eq={eq} />
          {Object.entries(SLOT_LABEL).map(([slot, label], i) => {
            const id = equippedIds[slot];
            return (
              <button key={slot} data-ui="" data-testid={`slot-${slot}`} onClick={() => id && setSel(`eq:${slot}`)}
                className={`absolute ${["top-1 left-1", "top-1 right-1", "bottom-1 right-1", "bottom-1 left-1"][i]} max-w-[48%] text-left font-pixel text-[10px] leading-tight px-1 py-0.5 rounded-sm border bg-[#1b140e]/85 ${sel === `eq:${slot}` ? "border-[#e8c050]" : "border-[#4a3820]"}`}>
                <span className="text-[#8a7d66]">{label}</span><br /><span className="text-[#e8c050]">{id ? ITEMS[id].name : "—"}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 font-pixel text-[11px] text-[#cfc2a8]" data-testid="menu-stats">
          <span className="flex items-center gap-1"><Heart size={11} className="text-red-400" />{Math.round(hud.hp)}/100</span>
          <span className="flex items-center gap-1"><Sword size={11} />Danno {ITEMS[equippedIds.hand]?.dmg ?? "?"}</span>
          <span className="flex items-center gap-1"><Shirt size={11} />Difesa {Math.round(dmgReduction(eq) * 100)}%</span>
          <span className="flex items-center gap-1"><Shield size={11} />{off?.block ? `Scudo ${Math.round(off.block * 100)}%` : off ? "Torcia" : "Nessuno scudo"}</span>
          <span className="flex items-center gap-1"><Coins size={11} className="text-[#e8c050]" />{hud.gold} oro
            <button data-ui="" className="ml-auto underline decoration-dotted disabled:opacity-40" disabled={hud.gold <= 0} onClick={() => onAct("drop", "oro")} data-testid="drop-gold">lascia {Math.min(10, hud.gold)}</button></span>
          <span className="flex items-center gap-1"><Gem size={11} className="text-sky-200" />{hud.ore} argento
            <button data-ui="" className="ml-auto underline decoration-dotted disabled:opacity-40" disabled={hud.ore <= 0} onClick={() => onAct("drop", "argento")} data-testid="drop-ore">lascia 1</button></span>
        </div>
      </div>

      {/* Item sections */}
      <div className="flex flex-col min-h-0 gap-1.5">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
          {SECTIONS.map((s) => <Section key={s.id} title={s.title} empty={s.empty} tiles={tilesFor(s.kinds)} sel={sel} setSel={setSel} />)}
          {others.length > 0 && <Section title="Altri oggetti" tiles={others} sel={sel} setSel={setSel} />}
        </div>
        <div className="rounded-sm border border-[#4a3820] bg-[#1b140e] px-2 py-1.5 min-h-[46px]" data-testid="item-detail">
          {!it ? <div className="font-pixel text-xs text-[#8a7d66] italic">Tocca un quadretto per vederlo. Il personaggio a sinistra cambia subito.</div> : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-pixel text-sm leading-tight mr-auto"><span className="text-[#e8c050]">{it.name}</span>{it.desc ? <span className="text-[#b8ab92]"> · {it.desc}</span> : null}{selTile.equipped ? <span className="text-[#8a7d66]"> · equipaggiato</span> : null}</div>
              {it.kind === "food" && <button data-ui="" className="inv-btn" onClick={() => act("use", selTile.id)} data-testid="detail-use" disabled={hud.hp >= 100}>{hud.hp >= 100 ? "Vita piena" : "Usa"}</button>}
              {!selTile.equipped && SLOT_OF_KIND[it.kind] && <button data-ui="" className="inv-btn" onClick={() => act("equip", selTile.id)} data-testid="detail-equip">Equipaggia</button>}
              {selTile.equipped && selTile.slot !== "hand" && <button data-ui="" className="inv-btn" onClick={() => act("unequip", selTile.slot)} data-testid="detail-unequip">Togli</button>}
              {!selTile.equipped && it.kind !== "quest" && <button data-ui="" className="inv-btn inv-btn-danger" onClick={() => act("drop", selTile.id)} data-testid="detail-drop">Lascia a terra</button>}
            </div>
          )}
        </div>
      </div>
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
        const pct = Math.max(0, Math.min(100, (p.value + 100) / 2));
        return (
          <div key={p.id} className="rounded-sm border border-[#3a2a17] bg-black/25 p-2" data-testid={`rep-${p.id}`}>
            <div className="flex items-center gap-2">
              <Icon size={16} className="text-[color:hsl(var(--primary))]" />
              <div className="font-title text-sm tracking-wider">{p.name}</div>
              <div className="font-pixel text-[10px] text-[#8a7d66] uppercase">{p.kind}</div>
              <div className="ml-auto flex items-center gap-1 font-pixel text-sm"><RepFace mood={p.mood} size={18} />{p.label} <span className="text-[#8a7d66]">({p.value})</span></div>
            </div>
            <div className="relative h-2 mt-1.5 rounded-sm bg-[linear-gradient(90deg,#6a1a14,#3a2a17_45%,#3a2a17_55%,#6a8a2a)]">
              <div className="absolute top-[-3px] w-1.5 h-3.5 bg-[#e8dcc4] rounded-sm" style={{ left: `calc(${pct}% - 3px)` }} />
            </div>
            <div className="mt-1 text-xs italic text-[#b8ab92]">{p.note}</div>
            <ul className="mt-1 font-pixel text-[12px] text-[#cfc2a8] list-disc pl-4">{p.effects.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        );
      })}
    </div>
  );
}

// ---- Menu shell ----------------------------------------------------------------
export default function GameMenu({ hud, log = [], onAct, onClose, onReset }) {
  const [tab, setTab] = useState("equip");
  if (!hud) return null;
  const tabs = [["equip", "Equipaggiamento"], ["rep", "Reputazione"], ["log", "Diario"], ["game", "Partita"]];
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/60 p-1.5 sm:p-3" data-ui="" data-testid="game-menu">
      <div className="parchment rounded-md w-full max-w-4xl flex flex-col p-2 sm:p-3 min-h-0">
        <div className="flex items-center gap-1 mb-1.5 font-pixel text-xs">
          <span className="flex items-center gap-1 text-[#8a7d66] mr-1" data-testid="menu-paused"><Pause size={12} />In pausa</span>
          {tabs.map(([id, label]) => (
            <button key={id} data-ui="" className={`inv-btn ${tab === id ? "!bg-[#c9a24a] !text-[#1b140e]" : ""}`} onClick={() => setTab(id)} data-testid={`menu-tab-${id}`}>{label}</button>
          ))}
          <button data-ui="" onClick={onClose} className="inv-btn ml-auto" data-testid="menu-close"><X size={14} /></button>
        </div>
        <div className="flex-1 min-h-0">
          {tab === "equip" && <EquipmentTab hud={hud} onAct={onAct} />}
          {tab === "rep" && <ReputationTab hud={hud} />}
          {tab === "log" && (
            <div className="h-full overflow-y-auto space-y-0.5 font-pixel text-[13px]" data-testid="menu-log">
              {log.length === 0 && <div className="italic text-[#8a7d66]">Ancora nulla da annotare.</div>}
              {log.map((l) => <div key={l.id} className={l.quiet ? "text-[#8a7d66]" : "text-[#e8dcc4]"}>{l.t}</div>)}
            </div>
          )}
          {tab === "game" && (
            <div className="space-y-2 font-pixel text-sm" data-testid="menu-game">
              <p className="text-[#b8ab92]">La partita si salva da sola in questo browser ogni 5 secondi e quando chiudi o cambi app.</p>
              <p className="text-[#b8ab92]">Comandi: joystick per muoverti, trascina lo schermo per guardare. Tastiera: WASD, E usa, J colpisci, C furtivo, V telecamera, Spazio schiva, I menu.</p>
              <button data-ui="" className="inv-btn inv-btn-danger flex items-center gap-1" onClick={onReset} data-testid="menu-reset"><RotateCw size={12} />Nuova partita…</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
