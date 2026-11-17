import React, { useEffect, useState } from "react";
import { X, Coins, Gem, ArrowLeft, ArrowRight, Skull, Backpack } from "lucide-react";
import { ITEMS } from "@/game3d/items";
import ItemPic from "@/components/ItemPic";

const KIND = { food: "Cibo", sword: "Arma", armor: "Armatura", helm: "Elmo", offhand: "Mano sinistra", tool: "Attrezzo", misc: "Merce", quest: "Missione", ore: "Minerale" };
const ORDER = ["sword", "armor", "helm", "offhand", "quest", "food", "tool", "misc", "ore"];
const sorted = (inv) => Object.entries(inv || {}).filter(([, q]) => q > 0).sort((a, b) => ORDER.indexOf(ITEMS[a[0]]?.kind) - ORDER.indexOf(ITEMS[b[0]]?.kind) || ITEMS[a[0]].name.localeCompare(ITEMS[b[0]].name));

// One item: its picture, name, what it is; tap to move it to the other side.
function Row({ id, qty, arrow, onMove, disabled, testid }) {
  const it = ITEMS[id];
  return (
    <button data-ui="" disabled={disabled} onClick={onMove} data-testid={testid}
      className="w-full flex items-center gap-2 rounded-sm border border-[#4a3820] bg-black/25 hover:bg-[#3a2c18] hover:border-[#c9a24a] disabled:opacity-45 disabled:hover:bg-black/25 px-1.5 py-1 text-left transition-colors">
      {arrow === "left" && <ArrowLeft size={14} className="text-[#e8c050] shrink-0" />}
      <span className="relative shrink-0 rounded-sm bg-[radial-gradient(circle_at_50%_40%,#3a2c1c,#140e09)]">
        <ItemPic id={id} size={44} />
        {qty > 1 && <span className="absolute bottom-0 right-0.5 font-pixel text-[11px] leading-none text-[#e8dcc4] drop-shadow">{qty}</span>}
      </span>
      <span className="font-pixel text-[13px] leading-tight mr-auto min-w-0">
        <span className="text-[#e8dcc4] block truncate">{it.name}</span>
        <span className="text-[10px] text-[#b8ab92] block truncate">{KIND[it.kind]}{it.desc ? ` · ${it.desc}` : ""}</span>
      </span>
      {arrow === "right" && <ArrowRight size={14} className="text-[#8a7d66] shrink-0" />}
    </button>
  );
}

// Searching a body: your things on the left, the body's on the right. Tap one of its things to take it,
// one of yours to leave it there; "Prendi tutto" empties it.
export default function LootPanel({ info, onAct, onClose }) {
  const [data, setData] = useState(info);
  useEffect(() => { setData(info); }, [info]);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" || e.key === "e" || e.key === "E") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!data) return null;
  const act = (kind, item) => { const next = onAct(kind, data.id, item); if (next) setData(next); };
  const body = sorted(data.inv), mine = sorted(data.mine);
  const empty = !body.length && !data.gold;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-2" data-ui="" data-testid="loot-panel">
      <div className="parchment rounded-md w-full max-w-4xl max-h-[96dvh] flex flex-col p-2 sm:p-3 min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <Skull size={18} className="text-[color:hsl(var(--primary))]" />
          <h2 className="font-title text-lg sm:text-xl tracking-wider text-[color:hsl(var(--primary))]">Il corpo di {data.name}</h2>
          <button data-ui="" className="inv-btn ml-auto" disabled={empty} onClick={() => act("all")} data-testid="loot-all">Prendi tutto</button>
          <button data-ui="" onClick={onClose} className="inv-btn" data-testid="loot-close"><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
          {/* yours */}
          <div className="flex flex-col min-h-0 rounded-sm border border-[#3a2a17] bg-black/20 p-1.5" data-testid="loot-mine">
            <div className="flex items-center gap-2 font-title text-[12px] tracking-widest text-[color:hsl(var(--primary))] mb-1">
              <Backpack size={13} />Il tuo zaino
              <span className="ml-auto font-pixel text-[12px] text-[#e8c050] flex items-center gap-1 normal-case tracking-normal"><Coins size={12} />{data.myGold}<Gem size={12} className="text-sky-200 ml-1" />{data.ore}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
              {mine.length === 0 && <div className="font-pixel text-xs italic text-[#8a7d66]">Lo zaino è vuoto.</div>}
              {mine.map(([id, q]) => <Row key={id} id={id} qty={q} arrow="right" disabled={ITEMS[id]?.kind === "quest"} onMove={() => act("give", id)} testid={`loot-mine-${id}`} />)}
            </div>
            <div className="font-pixel text-[10px] text-[#8a7d66] mt-1">Tocca una tua cosa per lasciarla sul corpo.</div>
          </div>
          {/* the body's */}
          <div className="flex flex-col min-h-0 rounded-sm border border-[#5a3a20] bg-black/30 p-1.5" data-testid="loot-body">
            <div className="flex items-center gap-2 font-title text-[12px] tracking-widest text-[#d8a070] mb-1">
              <Skull size={13} />{data.name}
              <button data-ui="" className="ml-auto inv-btn !py-0 flex items-center gap-1 normal-case tracking-normal" disabled={!data.gold} onClick={() => act("gold")} data-testid="loot-gold"><Coins size={12} />{data.gold} oro</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
              {body.length === 0 && <div className="font-pixel text-xs italic text-[#8a7d66]">{data.gold ? "Solo qualche moneta." : "Non gli è rimasto niente."}</div>}
              {body.map(([id, q]) => <Row key={id} id={id} qty={q} arrow="left" onMove={() => act("take", id)} testid={`loot-body-${id}`} />)}
            </div>
            <div className="font-pixel text-[10px] text-[#8a7d66] mt-1">Tocca un oggetto per prenderlo.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
