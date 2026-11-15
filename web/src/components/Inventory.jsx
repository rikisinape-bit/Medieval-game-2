import React, { useState } from "react";
import { X, Backpack, Coins, Gem } from "lucide-react";
import { ITEMS, SWORD_ITEM, dmgReduction } from "@/game3d/items";

const KIND_LABEL = { food: "Cibo", sword: "Arma", armor: "Armatura", helm: "Elmo", offhand: "Mano sinistra", tool: "Attrezzo", quest: "Missione", misc: "Merce" };
const EQUIPPABLE = new Set(["sword", "armor", "helm", "offhand"]);
const SLOTS = [["head", "Testa", { top: "4%", left: "3%" }], ["body", "Corpo", { top: "30%", right: "3%" }], ["hand", "Mano destra", { top: "62%", right: "3%" }], ["off", "Mano sinistra", { top: "62%", left: "3%" }]];

function Doll({ eq }) {
  const body = ITEMS[eq.body]?.color || "#2d5d8c", head = ITEMS[eq.head]?.color || "#e0b890";
  return (
    <svg viewBox="0 0 120 220" className="w-full h-full" data-testid="paper-doll">
      <rect x="40" y="88" width="40" height="70" rx="3" fill={body} stroke="#1b140e" />
      <rect x="22" y="90" width="16" height="60" rx="4" fill="#2d5d8c" stroke="#1b140e" />
      <rect x="82" y="90" width="16" height="60" rx="4" fill="#2d5d8c" stroke="#1b140e" />
      <rect x="42" y="158" width="16" height="56" rx="3" fill="#2a2218" stroke="#1b140e" />
      <rect x="62" y="158" width="16" height="56" rx="3" fill="#2a2218" stroke="#1b140e" />
      <rect x="44" y="40" width="32" height="40" rx="6" fill="#e0b890" stroke="#1b140e" />
      {eq.head && <path d="M42 58 Q60 20 78 58 Z" fill={head} stroke="#1b140e" />}
      {eq.hand && <rect x="86" y="92" width="6" height="70" fill="#c8ccd4" stroke="#1b140e" transform="rotate(-18 89 92)" />}
      {eq.off === "torcia" && <><rect x="26" y="70" width="6" height="40" fill="#5e3c1e" /><circle cx="29" cy="66" r="7" fill="#ffb040" /></>}
      {eq.off && eq.off !== "torcia" && <rect x="12" y="96" width="26" height="36" rx="6" fill={ITEMS[eq.off].color || "#7a5434"} stroke="#1b140e" />}
    </svg>
  );
}

function Row({ id, qty, selected, onSelect, onAct, testid }) {
  const it = ITEMS[id];
  return (
    <div className={`rounded-sm border border-[color:hsl(var(--border))] px-2 py-1.5 ${selected ? "bg-[color:hsl(var(--secondary))]" : "bg-black/20"}`} data-testid={testid}>
      <button className="w-full text-left flex items-center justify-between font-pixel text-sm" onClick={onSelect} data-testid={`${testid}-select`}>
        <span>{it.name}{qty > 1 ? ` ×${qty}` : ""}</span>
        <span className="text-[10px] text-[#b8ab92]">{KIND_LABEL[it.kind] || ""}{it.desc ? ` · ${it.desc}` : ""}</span>
      </button>
      {selected && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {it.kind === "food" && <button className="inv-btn" onClick={() => onAct("use", id)} data-testid="inv-use">Usa</button>}
          {EQUIPPABLE.has(it.kind) && <button className="inv-btn" onClick={() => onAct("equip", id)} data-testid="inv-equip">Equipaggia</button>}
          <button className="inv-btn inv-btn-danger" onClick={() => onAct("drop", id)} data-testid="inv-drop">Lascia a terra</button>
        </div>
      )}
    </div>
  );
}

export default function Inventory({ hud, onAct, onClose }) {
  const [sel, setSel] = useState(null);
  if (!hud) return null;
  const eq = hud.eq || {};
  const entries = Object.entries(hud.inv || {}).filter(([, q]) => q > 0);
  const act = (kind, id) => { onAct(kind, id); if (kind === "drop" || kind === "equip") setSel(null); };
  const nameOf = (slot) => (slot === "hand" ? ITEMS[SWORD_ITEM[eq.hand]]?.name : eq[slot] ? ITEMS[eq[slot]].name : "—");
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3" data-testid="inventory-panel" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="parchment rounded-md w-full max-w-3xl max-h-[92dvh] overflow-y-auto p-4 border border-[color:hsl(var(--border))]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-title text-xl tracking-wider text-[color:hsl(var(--primary))] flex items-center gap-2"><Backpack size={18} />Equipaggiamento e zaino</h2>
          <button onClick={onClose} className="inv-btn" data-testid="inventory-close"><X size={14} /></button>
        </div>
        <div className="grid md:grid-cols-[220px_1fr] gap-4">
          <div>
            <div className="relative h-56 bg-black/25 rounded-sm border border-[color:hsl(var(--border))]" data-testid="equipment-doll">
              <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-20"><Doll eq={eq} /></div>
              {SLOTS.map(([slot, label, pos]) => (
                <button key={slot} onClick={() => setSel(`slot:${slot}`)} data-testid={`eq-slot-${slot}`}
                  className={`absolute font-pixel text-[9px] leading-tight px-1 py-0.5 rounded-sm border ${sel === `slot:${slot}` ? "border-[#c9a24a] bg-[#c9a24a] text-[#1b140e]" : "border-[#5a4424] bg-[#2f2823]/90 text-[#e8dcc4]"}`}
                  style={pos}>
                  {label}<br /><span className="text-[#c9a24a]">{nameOf(slot)}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 font-pixel text-[10px] text-[#b8ab92]" data-testid="eq-summary">Danno {ITEMS[SWORD_ITEM[eq.hand]]?.dmg ?? "?"} · Riduzione danni {Math.round(dmgReduction(eq) * 100)}%{eq.off && ITEMS[eq.off].block ? ` · scudo ${Math.round(ITEMS[eq.off].block * 100)}%` : eq.off === "torcia" ? " · torcia accesa" : ""}</div>
            {sel?.startsWith("slot:") && sel !== "slot:hand" && eq[sel.slice(5)] && (
              <button className="inv-btn mt-2" onClick={() => { act("unequip", sel.slice(5)); setSel(null); }} data-testid="inv-unequip">Togli {nameOf(sel.slice(5))}</button>
            )}
            <div className="grid grid-cols-1 gap-1.5 font-pixel text-xs mt-3">
              <div className="rounded-sm bg-black/25 px-2 py-1.5 flex items-center gap-2 justify-between" data-testid="inv-gold">
                <span className="flex items-center gap-2"><Coins size={13} className="text-[color:hsl(var(--primary))]" />{hud.gold} oro</span>
                <button className="inv-btn" disabled={hud.gold <= 0} onClick={() => act("drop", "oro")} data-testid="inv-drop-gold">Lascia {Math.min(10, hud.gold)}</button>
              </div>
              <div className="rounded-sm bg-black/25 px-2 py-1.5 flex items-center gap-2 justify-between" data-testid="inv-ore">
                <span className="flex items-center gap-2"><Gem size={13} className="text-sky-200" />{hud.ore} argento</span>
                <button className="inv-btn" disabled={hud.ore <= 0} onClick={() => act("drop", "argento")} data-testid="inv-drop-ore">Lascia 1</button>
              </div>
            </div>
          </div>
          <div className="space-y-1.5" data-testid="inv-list">
            {entries.length === 0 && <div className="font-pixel text-sm text-[#b8ab92] italic" data-testid="inv-empty">Lo zaino è vuoto. Raccogli oggetti nel mondo con [E].</div>}
            {entries.map(([id, q]) => <Row key={id} id={id} qty={q} selected={sel === id} onSelect={() => setSel(sel === id ? null : id)} onAct={act} testid={`inv-item-${id}`} />)}
          </div>
        </div>
        <div className="mt-3 font-pixel text-[10px] text-[#b8ab92]">Gli oggetti lasciati a terra restano nel mondo. Tasto I apre/chiude lo zaino.</div>
      </div>
    </div>
  );
}
