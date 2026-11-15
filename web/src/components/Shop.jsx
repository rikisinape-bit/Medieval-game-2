import React, { useState } from "react";
import { X, Coins, Gem, ShoppingBag } from "lucide-react";
import { ITEMS, sellPrice, buyPrice, priceMarkup } from "@/game3d/items";

const KIND = { food: "Cibo", sword: "Arma", armor: "Armatura", helm: "Elmo", offhand: "Mano sinistra", tool: "Attrezzo", misc: "Merce", quest: "Missione", ore: "Minerale" };

export default function Shop({ hud, shopId, def, onTrade, onClose }) {
  const [tab, setTab] = useState("buy");
  if (!hud || !def) return null;
  const markup = priceMarkup(hud.rep);
  const mine = Object.entries(hud.inv || {}).filter(([id, q]) => q > 0 && def.buys.includes(ITEMS[id]?.kind));
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-3" data-testid="shop-panel" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="parchment rounded-md w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-4 border border-[color:hsl(var(--border))]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-title text-xl tracking-wider text-[color:hsl(var(--primary))] flex items-center gap-2"><ShoppingBag size={18} />{def.title}</h2>
          <div className="flex items-center gap-3 font-pixel text-xs">
            <span className="flex items-center gap-1" data-testid="shop-gold"><Coins size={13} className="text-[color:hsl(var(--primary))]" />{hud.gold} oro</span>
            <span className="flex items-center gap-1" data-testid="shop-ore"><Gem size={13} className="text-sky-200" />{hud.ore}</span>
            <button onClick={onClose} className="inv-btn" data-testid="shop-close"><X size={14} /></button>
          </div>
        </div>
        <div className="flex gap-1 mb-3 font-pixel text-xs">
          <button className={`inv-btn ${tab === "buy" ? "!bg-[#c9a24a] !text-[#1b140e]" : ""}`} onClick={() => setTab("buy")} data-testid="shop-tab-buy">Compra</button>
          <button className={`inv-btn ${tab === "sell" ? "!bg-[#c9a24a] !text-[#1b140e]" : ""}`} onClick={() => setTab("sell")} data-testid="shop-tab-sell">Vendi le tue cose</button>
          {markup > 1 && <span className="text-red-300 self-center ml-2">Prezzi maggiorati: il villaggio non si fida di te</span>}
        </div>
        {tab === "buy" ? (
          <div className="grid sm:grid-cols-2 gap-1.5" data-testid="shop-buy-list">
            {def.sells.map((id) => { const it = ITEMS[id], p = buyPrice(id, hud.rep); return (
              <div key={id} className="rounded-sm border border-[color:hsl(var(--border))] bg-black/20 px-2 py-1.5 flex items-center justify-between gap-2" data-testid={`shop-buy-${id}`}>
                <div className="font-pixel text-sm leading-tight"><div>{it.name}</div><div className="text-[10px] text-[#b8ab92]">{KIND[it.kind]}{it.desc ? ` · ${it.desc}` : ""}</div></div>
                <button className="inv-btn whitespace-nowrap" disabled={hud.gold < p} onClick={() => onTrade("buy", id)} data-testid={`shop-buy-${id}-btn`}>{p} oro</button>
              </div>); })}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-1.5" data-testid="shop-sell-list">
            {def.orePrice > 0 && (
              <div className="rounded-sm border border-[color:hsl(var(--border))] bg-black/20 px-2 py-1.5 flex items-center justify-between gap-2" data-testid="shop-sell-argento">
                <div className="font-pixel text-sm leading-tight"><div>Argento grezzo ×{hud.ore}</div><div className="text-[10px] text-[#b8ab92]">Minerale</div></div>
                <button className="inv-btn whitespace-nowrap" disabled={hud.ore <= 0} onClick={() => onTrade("sell", "argento")} data-testid="shop-sell-argento-btn">+{def.orePrice} oro</button>
              </div>
            )}
            {mine.map(([id, q]) => { const it = ITEMS[id]; return (
              <div key={id} className="rounded-sm border border-[color:hsl(var(--border))] bg-black/20 px-2 py-1.5 flex items-center justify-between gap-2" data-testid={`shop-sell-${id}`}>
                <div className="font-pixel text-sm leading-tight"><div>{it.name} ×{q}</div><div className="text-[10px] text-[#b8ab92]">{KIND[it.kind]}</div></div>
                <button className="inv-btn whitespace-nowrap" onClick={() => onTrade("sell", id)} data-testid={`shop-sell-${id}-btn`}>+{sellPrice(id)} oro</button>
              </div>); })}
            {mine.length === 0 && !(def.orePrice > 0 && hud.ore > 0) && <div className="font-pixel text-sm text-[#b8ab92] italic col-span-2" data-testid="shop-sell-empty">Non hai nulla che interessi a questo mercante (compra: {def.buys.map((k) => KIND[k]).join(", ")}).</div>}
          </div>
        )}
      </div>
    </div>
  );
}
