// Item catalogue: inventory entries, world pickups, shops and NPC daily tools.
// kind: food | gold | ore | sword | armor | helm | offhand | tool | quest | misc. price = buy price; selling gives 50%.
// two: a two-handed sword (both hands on the grip: slower, heavier blows; no shield or torch in the other hand).
export const ITEMS = {
  pane: { name: "Pane", kind: "food", heal: 15, price: 3, desc: "+15 vita" },
  prosciutto: { name: "Prosciutto", kind: "food", heal: 35, price: 9, desc: "+35 vita" },
  pomodoro: { name: "Pomodoro", kind: "food", heal: 5, price: 1, desc: "+5 vita" },
  patata: { name: "Patata", kind: "food", heal: 6, price: 1, desc: "+6 vita" },
  formaggio: { name: "Formaggio", kind: "food", heal: 10, price: 2, desc: "+10 vita" },
  carne: { name: "Carne arrosto", kind: "food", heal: 25, price: 6, desc: "+25 vita" },
  mela: { name: "Mela", kind: "food", heal: 6, price: 1, desc: "+6 vita" },
  acqua: { name: "Borraccia d'acqua", kind: "food", heal: 8, price: 2, desc: "+8 vita" },
  vino: { name: "Vino di Valdoro", kind: "food", heal: 12, price: 5, desc: "+12 vita" },
  erbe: { name: "Erbe curative", kind: "food", heal: 20, price: 7, desc: "+20 vita" },
  pozione: { name: "Pozione", kind: "food", heal: 50, price: 12, desc: "+50 vita" },
  pozione_grande: { name: "Pozione maggiore", kind: "food", heal: 100, price: 30, desc: "vita piena" },
  oro: { name: "Monete d'oro", kind: "gold" },
  argento: { name: "Argento grezzo", kind: "ore", price: 10 },
  pugnale: { name: "Pugnale", kind: "sword", sword: "pugnale", dmg: 9, price: 8, desc: "Danno 9, veloce" },
  spada_corta: { name: "Spada corta", kind: "sword", sword: "corta", dmg: 14, price: 15, desc: "Danno 14" },
  ascia_guerra: { name: "Ascia da guerra", kind: "sword", sword: "ascia", dmg: 20, price: 22, desc: "Danno 20" },
  spada_lunga: { name: "Spadone", kind: "sword", sword: "lunga", dmg: 34, price: 30, two: true, desc: "Danno 34, a due mani" },
  spadone: { name: "Spadone di Valdoro", kind: "sword", sword: "spadone", dmg: 42, price: 75, two: true, desc: "Danno 42, a due mani" },
  spada_roccanera: { name: "Lama di Roccanera", kind: "sword", sword: "di Roccanera", dmg: 34, price: 120, desc: "Danno 34" },
  cuoio: { name: "Armatura di cuoio", kind: "armor", red: 0.2, color: "#6a4426", price: 20, desc: "-20% danni" },
  maglia: { name: "Cotta di maglia", kind: "armor", red: 0.35, color: "#8a8a94", price: 45, desc: "-35% danni" },
  piastre: { name: "Armatura a piastre", kind: "armor", red: 0.5, color: "#c8c8d4", price: 80, desc: "-50% danni" },
  cappuccio: { name: "Cappuccio di cuoio", kind: "helm", red: 0.05, color: "#6a4426", price: 8, desc: "-5% danni" },
  elmo_ferro: { name: "Elmo di ferro", kind: "helm", red: 0.1, color: "#8a8a94", price: 25, desc: "-10% danni" },
  elmo_piastre: { name: "Elmo a piastre", kind: "helm", red: 0.15, color: "#c8c8d4", price: 50, desc: "-15% danni" },
  torcia: { name: "Torcia", kind: "offhand", light: true, price: 5, desc: "Fa luce di notte" },
  scudo_legno: { name: "Scudo di legno", kind: "offhand", block: 0.2, color: "#7a5434", price: 18, desc: "Parata più facile, -20% danni frontali" },
  scudo_ferro: { name: "Scudo di ferro", kind: "offhand", block: 0.35, color: "#8a8a94", price: 45, desc: "Parata più facile, -35% danni frontali" },
  ascia: { name: "Ascia da legna", kind: "tool", price: 6, desc: "Serve a tagliare la legna" },
  martello: { name: "Martello da fabbro", kind: "tool", price: 7 },
  corda: { name: "Corda", kind: "misc", price: 3 },
  pelliccia: { name: "Pelliccia di lupo", kind: "misc", price: 9 },
  gemma: { name: "Gemma grezza", kind: "misc", price: 25 },
  libro: { name: "Libro di preghiere", kind: "misc", price: 6 },
  testa_morn: { name: "Testa di Capo Morn", kind: "quest", desc: "Prova per Ser Alaric" },
  chiave_celle: { name: "Chiave delle celle", kind: "misc", price: 4, desc: "Apre le celle delle prigioni del castello" },
  chiave_gabbia: { name: "Chiave della gabbia", kind: "misc", price: 2, desc: "Apre la gabbia delle guardie di Roccanera" },
};
// Danno e oggetto di ogni spada derivano da ITEMS (prima erano duplicati a mano).
const SWORD_ENTRIES = Object.entries(ITEMS).filter(([, it]) => it.kind === "sword");
export const SWORD_DMG = Object.fromEntries(SWORD_ENTRIES.map(([, it]) => [it.sword, it.dmg]));
export const SWORD_ITEM = Object.fromEntries(SWORD_ENTRIES.map(([id, it]) => [it.sword, id]));
export const SWORD_TIER = { pugnale: 0, corta: 0, ascia: 1, lunga: 1, spadone: 2, "di Roccanera": 2 };
// the two-handed swords (sword keys); their blows take longer (SLOW_2H: the swing's clock runs at this rate)
export const TWO_HANDED = new Set(SWORD_ENTRIES.filter(([, it]) => it.two).map(([, it]) => it.sword));
export const SLOW_2H = 0.62;
export const SLOT_OF = { sword: "hand", armor: "body", helm: "head", offhand: "off" };
export const dmgReduction = (eq) => Math.min(0.7, (ITEMS[eq.body]?.red || 0) + (ITEMS[eq.head]?.red || 0));
// Rincaro per chi ha reputazione di villaggio sotto -20: unico punto di calcolo (prima in 3 posti).
export const MARKUP_REP = -20;
export const priceMarkup = (rep) => (rep.village < MARKUP_REP ? 1.5 : 1);
export const buyPrice = (id, rep) => Math.round((ITEMS[id]?.price || 0) * priceMarkup(rep));
export const sellPrice = (id) => Math.max(1, Math.floor((ITEMS[id]?.price || 0) / 2));
// Which hand-held tool an NPC shows for each routine action.
export const TOOL_OF = { chop: "ascia", hammer: "martello", eat: "pane", drink: "acqua", water: "secchio", sweep: "scopa" };

// Shops: what the merchant sells (unlimited stock) and which kinds he buys from you.
export const SHOPS = {
  lena: { title: "Banco di Lena", sells: ["pane", "pomodoro", "patata", "formaggio", "mela", "acqua", "pozione", "torcia", "corda"], buys: ["food", "ore", "misc", "tool"], orePrice: 10 },
  bruno: { title: "Forgia di Bruno", sells: ["spada_corta", "spada_lunga", "pugnale", "cuoio", "cappuccio", "ascia", "martello"], buys: ["sword", "armor", "helm", "tool", "ore"], orePrice: 8 },
  aldo: { title: "Armeria di Mastro Aldo", sells: ["cuoio", "maglia", "piastre", "cappuccio", "elmo_ferro", "elmo_piastre", "scudo_legno", "scudo_ferro"], buys: ["armor", "helm", "offhand", "ore"], orePrice: 12 },
  garrick: { title: "Lame di Garrick", sells: ["pugnale", "spada_corta", "ascia_guerra", "spada_lunga", "spadone"], buys: ["sword", "tool", "ore"], orePrice: 11 },
  mira: { title: "Spezieria di Mira", sells: ["erbe", "pozione", "pozione_grande", "torcia", "acqua"], buys: ["food", "misc"], orePrice: 0 },
  bodo: { title: "Locanda del Cinghiale", sells: ["pane", "prosciutto", "formaggio", "carne", "vino", "mela", "acqua"], buys: ["food"], orePrice: 0 },
  osric: { title: "Emporio di Osric", sells: ["corda", "torcia", "libro", "pelliccia", "gemma", "pane"], buys: ["food", "sword", "armor", "helm", "offhand", "tool", "misc", "ore"], orePrice: 9 },
};
// What falls on the ground when an NPC dies (besides gold): [item, chance]
export const LOOT_OF = {
  smith: [["martello", 0.7], ["cuoio", 0.3]], armorer: [["elmo_ferro", 0.5], ["scudo_legno", 0.4]], weaponsmith: [["pugnale", 0.6], ["ascia_guerra", 0.3]],
  merchant: [["pane", 0.9], ["pozione", 0.4], ["corda", 0.5]], herbalist: [["erbe", 0.9], ["pozione", 0.5]], innkeeper: [["carne", 0.8], ["vino", 0.8], ["prosciutto", 0.5]], trader: [["gemma", 0.4], ["libro", 0.5], ["pelliccia", 0.5]],
  knight: [["elmo_ferro", 0.5], ["spada_lunga", 0.4]], soldier: [["spada_corta", 0.4], ["cappuccio", 0.4], ["pane", 0.5]], bandit: [["pugnale", 0.4], ["cuoio", 0.25], ["pane", 0.5], ["torcia", 0.3]],
  noble: [["libro", 0.6], ["gemma", 0.3]], villager: [["pane", 0.6], ["mela", 0.5], ["acqua", 0.4], ["pomodoro", 0.3], ["patata", 0.3]], miner: [["argento", 0.8], ["acqua", 0.5]], messenger: [["libro", 0.5], ["pane", 0.5], ["torcia", 0.4]],
};
