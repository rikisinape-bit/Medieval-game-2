// The places of the world, as first made in one compact map ("legacy" coordinates): the village at the centre, the
// winding forest path north (-z) to the walls of Valdoro, the mine in the hill to the west (-x). In the world of Vasilad
// each place stands where the user's map draws it: sites.js moves and turns them (toWorld, toLegacy, regionOf).
import { SWORD_DMG, SWORD_ITEM, SWORD_TIER } from "./items";
export const FZ = -36;            // forest start
export const WZ = FZ - 68;        // Valdoro wall
export const CX = -45, CZ = 0;    // cave centre
// The castle of Valdoro, inside (castle.js): a "room" far away (beyond the map's east edge), where nothing of the
// world is in sight
export const CASTLE = [4000, 0];
// the region of a legacy point (sites.js regionOf: of a world point)
export const legacyRegionOf = (x, z) => (Math.abs(x - CASTLE[0]) < 300 && Math.abs(z - CASTLE[1]) < 300 ? "castello" : x < CX + 17 && x > CX - 15 && Math.abs(z - CZ) < 13.6 ? "mine" : z < WZ ? "valdoro" : z < -30 && Math.abs(x) < 32 ? "forest" : "village");
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const SWORDS = Object.fromEntries(Object.keys(SWORD_DMG).map((k) => [k, { dmg: SWORD_DMG[k], tier: SWORD_TIER[k], item: SWORD_ITEM[k] }]));
// Winding path through the forest (centre line); walkable area is the whole forest.
export const PATH = [[0, -30], [5, -42], [-5, -54], [-11, -66], [-3, -78], [7, -88], [2, -98], [0, WZ + 1]];
export const CAMP = [1, -74];
export const LANTERNS = [[3.2, 3.2], [-3.2, -3.2], [9.5, 10.5], [-10, -1.5], [14.5, -8.5], [6.8, -14.5], [-6, 12], [12, 20], [2, -29], [0, WZ - 7], [-8, WZ - 20], [9.8, WZ - 17.2], [-3.4, WZ - 26.5], [CX + 18.6, 3.4]];

const R = (x, z, act, dur, extra = {}) => ({ at: [x, z], act, dur, ...extra });
const [KX, KZ] = CASTLE;

export const NPC_DEFS = [
  { id: "torin", name: "Torin", role: "miner", look: "miner", old: true, pos: [-11, -20], hp: 40, dmg: 5, loot: 6, home: 1,
    routine: [R(-12.2, -22, "chop", 7, { face: [-12.2, -25] }), R(-6.4, 5.6, "talk", 4, { face: [-8, 5.9], carry: true }), R(-11, -19, "eat", 4), R(25, -2.6, "look", 4, { face: [31, -4] })] },   // (towards the mine's road)
  { id: "bruno", name: "Bruno il Fabbro", role: "smith", look: "smith", pos: [14.6, -3.5], hp: 70, dmg: 12, loot: 15, weapon: "short", fights: true, home: 5,
    routine: [R(14.6, -3.5, "hammer", 8, { face: [14.6, -4.6] }), R(12.8, -4.4, "pump", 4, { face: [12.8, -6] }), R(15.5, -2.2, "drink", 3)] },
  { id: "lena", name: "Lena", role: "merchant", look: "merchant", female: true, pos: [-8, 5.9], hp: 40, dmg: 4, loot: 20, home: 0,
    routine: [R(-8, 5.9, "sell", 6, { face: [-8, 3] }), R(-6, 9.6, "carry", 3, { face: [-7, 8], carry: true }), R(-8, 5.9, "talk", 5, { face: [-8, 3] }), R(-8, 6.4, "eat", 3, { face: [-8, 3] })] },
  { id: "alaric", name: "Ser Alaric", role: "knight", look: "knight", pos: [2, 12], hp: 140, dmg: 16, loot: 40, weapon: "long", guard: true, fights: true,
    routine: [R(2, 12, "look", 6), R(11, 20.4, "look", 6, { face: [12.5, 23] }), R(-2, -3.5, "look", 5)] },
  { id: "soldier1", name: "Soldato Gerd", role: "soldier", look: "soldier", pos: [8, 18], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true, carries: ["chiave_gabbia"],
    routine: [R(8, 18, "look", 2), R(-8, 16, "look", 2), R(-12, 2, "look", 2), R(-2, -6, "look", 2), R(8, 3, "look", 2)] },
  { id: "soldier2", name: "Soldato Ulf", role: "soldier", look: "soldier", pos: [11, 21.6], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true,
    routine: [R(11, 21.6, "train", 9, { face: [11, 23] }), R(14, 21.6, "train", 7, { face: [14, 23] }), R(-2, -4, "look", 4), R(8, 3, "look", 3)] },
  { id: "silas", name: "Silas l'Esattore", role: "noble", look: "noble", pos: [22.6, 15.2], hp: 35, dmg: 3, loot: 30, home: 2,
    routine: [R(22.6, 15.2, "read", 7), R(2.5, 2.2, "read", 6, { face: [0, 0] }), R(6, 9, "talk", 4)] },
  { id: "marta", name: "Marta", role: "villager", look: "woman", pos: [1.5, 0.9], home: 0,
    routine: [R(1.5, 0.9, "water", 5, { face: [0, 0] }), R(1.8, 1.6, "drink", 3, { face: [0, 0] }), R(-11.3, 11.4, "sweep", 7), R(-9.6, 5, "talk", 4, { face: [-8, 5.9] })] },
  { id: "ugo", name: "Ugo", role: "villager", look: "villager", model: "farmer", tint: "farmerUgo", pos: [5.5, -10.6], home: 4,
    routine: [R(5.5, -10.6, "chop", 8, { face: [5.5, -12] }), R(9, -12.4, "look", 2, { carry: true }), R(3, -6, "eat", 4), R(3, -6, "talk", 3)] },
  { id: "elsa", name: "Elsa", role: "villager", look: "woman", pos: [-11, 13], home: 3,
    routine: [R(-11, 13, "sweep", 6), R(-9.4, 4.6, "talk", 5, { face: [-8, 5.9] }), R(-1.2, -1.4, "water", 4, { face: [0, 0] }), R(-1.6, -1.8, "drink", 3, { face: [0, 0] })] },
  { id: "piero", name: "Piero", role: "villager", look: "villager2", model: "farmer", tint: "farmerPiero", pos: [8.4, 6.6], home: 2,
    routine: [R(8.4, 6.6, "sit", 9, { face: [8.4, 0] }), R(8.4, 6.6, "eat", 5, { face: [8.4, 0] }), R(12.5, 20.4, "cheer", 6, { face: [12.5, 23] }), R(3, 4, "talk", 4)] },
  { id: "nino", name: "Nino", role: "villager", look: "villager", model: "farmer", tint: "farmerNino", pos: [-11, -4], home: 1,
    routine: [R(-11, -4, "chop", 7), R(-9, -5.5, "chop", 6), R(-1.4, 1.4, "drink", 3, { face: [0, 0] }), R(-6.4, 5.4, "talk", 3, { face: [-8, 5.9], carry: true })] },
  { id: "cocchiere", name: "Cocchiere Brac", role: "villager", look: "coachman", pos: [19.5, 17], hp: 40, dmg: 4, loot: 10, scripted: true },
  { id: "messenger1", name: "Messaggero Aldric", role: "messenger", look: "messenger", pos: [4, 9], hp: 45, dmg: 5, loot: 8, scripted: true, rider: 1 },
  { id: "messenger2", name: "Messaggero Teo", role: "messenger", look: "messenger", pos: [1.5, WZ + 9], hp: 45, dmg: 5, loot: 8, scripted: true, rider: -1 },
  { id: "bandit1", model: "adventurer", tint: "bandit", name: "Bandito Rask", role: "bandit", look: "bandit", pos: [7, -46], hp: 55, dmg: 9, loot: 14, weapon: "short", fights: true, routine: [R(7, -46, "look", 9, { face: [1.5, -46] })] },
  { id: "bandit2", model: "adventurer", tint: "bandit", name: "Bandito Vesk", role: "bandit", look: "bandit", pos: [-13.5, -60], hp: 55, dmg: 9, loot: 14, weapon: "short", fights: true, routine: [R(-13.5, -60, "look", 9, { face: [-8, -60] })] },
  { id: "bandit3", model: "adventurer", tint: "banditBoss", name: "Capo Morn", role: "bandit", look: "bandit", pos: [-1, -73.5], hp: 90, dmg: 13, loot: 30, weapon: "long", fights: true, boss: true,
    routine: [R(-1, -73.5, "look", 7, { face: [-7, -72] }), R(2.6, -75.6, "eat", 8, { face: [1, -74] })] },
  { id: "bandit4", model: "adventurer", tint: "bandit", name: "Predone Krell", role: "bandit", look: "bandit", pos: [9, -84], hp: 60, dmg: 10, loot: 18, weapon: "short", fights: true, routine: [R(9, -84, "look", 9, { face: [3, -84] })] },
  { id: "brann", name: "Cavaliere Brann", role: "knight", look: "knight", pos: [-3, WZ + 5], hp: 140, dmg: 16, loot: 35, weapon: "long", guard: true, fights: true, valdoro: true,
    routine: [R(-3, WZ + 5, "look", 8, { face: [-3, WZ + 20] })] },
  { id: "oswin", name: "Cavaliere Oswin", role: "knight", look: "knight", pos: [3, WZ + 5], hp: 140, dmg: 16, loot: 35, weapon: "long", guard: true, fights: true, valdoro: true,
    routine: [R(3, WZ + 5, "look", 8, { face: [3, WZ + 20] })] },
  { id: "hal", name: "Guardia Hal", role: "soldier", look: "soldier", pos: [-3.5, WZ - 4], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true, valdoro: true,
    routine: [R(-3.5, WZ - 4, "look", 6, { face: [0, WZ - 16] }), R(-8, WZ - 16, "look", 4), R(-3.5, WZ - 4, "drink", 3)] },
  { id: "rolf", name: "Guardia Rolf", role: "soldier", look: "soldier", pos: [3.5, WZ - 4], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true, valdoro: true,
    routine: [R(3.5, WZ - 4, "look", 6, { face: [0, WZ - 16] }), R(8, WZ - 22, "look", 4)] },
  { id: "aldo", name: "Mastro Aldo", role: "armorer", look: "smith", pos: [6, WZ - 17], hp: 60, dmg: 8, loot: 25, weapon: "short", fights: true, valdoro: true, home: 6,
    routine: [R(6, WZ - 17, "hammer", 8, { face: [6, WZ - 19] }), R(4.5, WZ - 16, "talk", 4), R(6, WZ - 17, "drink", 3)] },
  { id: "garrick", name: "Garrick l'Armaiolo", role: "weaponsmith", look: "smith", pos: [-7, WZ - 12], hp: 65, dmg: 11, loot: 25, weapon: "long", fights: true, valdoro: true, home: 7,
    routine: [R(-7, WZ - 12, "hammer", 8, { face: [-7, WZ - 14] }), R(-5.5, WZ - 11, "sell", 5, { face: [-3, WZ - 11] }), R(-7, WZ - 12, "eat", 3)] },
  { id: "mira", name: "Speziale Mira", role: "herbalist", look: "herbalist", pos: [8, WZ - 8], hp: 35, dmg: 3, loot: 18, valdoro: true, home: 6,
    routine: [R(8, WZ - 8, "sell", 7, { face: [5, WZ - 8] }), R(-1.5, WZ - 14, "water", 4, { face: [0, WZ - 16] }), R(8, WZ - 8, "read", 5, { face: [5, WZ - 8] })] },
  { id: "bodo", name: "Locandiere Bodo", role: "innkeeper", look: "innkeeper", pos: [-6, WZ - 27], hp: 50, dmg: 6, loot: 22, valdoro: true, home: 8,
    routine: [R(-6, WZ - 27, "sell", 7, { face: [-6, WZ - 24] }), R(-7.5, WZ - 26, "carry", 4, { carry: true }), R(-6, WZ - 27, "drink", 3, { face: [-6, WZ - 24] })] },
  { id: "osric", name: "Mercante Osric", role: "trader", look: "merchant", pos: [4, WZ - 28], hp: 40, dmg: 4, loot: 35, valdoro: true, home: 9,
    routine: [R(4, WZ - 28, "sell", 8, { face: [4, WZ - 25] }), R(1.5, WZ - 19, "talk", 4, { face: [0, WZ - 16] }), R(4, WZ - 28, "eat", 3, { face: [4, WZ - 25] })] },
  // the King lives in the castle: on his throne, now and then a look down the hall, a meal in the banquet hall
  { id: "king", name: "Re Edric", role: "noble", look: "king", pos: [KX, KZ - 18.75], hp: 50, dmg: 3, loot: 50, valdoro: true,
    routine: [R(KX, KZ - 18.75, "sit", 40, { face: [KX, KZ - 10], seat: 0.2 }), R(KX, KZ - 13.5, "look", 6, { face: [KX, KZ - 4] }), R(KX + 7.4, KZ + 0.3, "eat", 7, { face: [KX + 7.4, KZ + 2], walk: 45 }), R(KX, KZ - 18.75, "sit", 40, { face: [KX, KZ - 10], seat: 0.2, walk: 45 })] },
  // guards of the castle: two at its door in the square, two beside the throne, the jailer down in the prisons
  { id: "guardia_castello1", name: "Guardia Tebaldo", role: "soldier", look: "soldier", pos: [-2.6, WZ - 29.5], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true, valdoro: true,
    routine: [R(-2.6, WZ - 29.5, "look", 12, { face: [-2.6, WZ - 20] })] },
  { id: "guardia_castello2", name: "Guardia Ivo", role: "soldier", look: "soldier", pos: [2.6, WZ - 29.5], hp: 80, dmg: 10, loot: 12, weapon: "short", guard: true, fights: true, valdoro: true,
    routine: [R(2.6, WZ - 29.5, "look", 12, { face: [2.6, WZ - 20] })] },
  { id: "guardia_reale1", name: "Guardia Reale Corrado", role: "soldier", look: "knight", pos: [KX - 2.75, KZ - 16.9], hp: 120, dmg: 14, loot: 20, weapon: "long", guard: true, fights: true, valdoro: true,
    routine: [R(KX - 2.75, KZ - 16.9, "look", 12, { face: [KX - 2.75, KZ - 8] })] },
  { id: "guardia_reale2", name: "Guardia Reale Elio", role: "soldier", look: "knight", pos: [KX + 2.75, KZ - 16.9], hp: 120, dmg: 14, loot: 20, weapon: "long", guard: true, fights: true, valdoro: true,
    routine: [R(KX + 2.75, KZ - 16.9, "look", 12, { face: [KX + 2.75, KZ - 8] })] },
  // the jailer walks up and down in front of the cells (through the bars: talk to him, pay him, or pickpocket his key)
  { id: "carceriere", name: "Carceriere Mauro", role: "soldier", look: "soldier", pos: [KX + 22.9, KZ], hp: 90, dmg: 11, loot: 15, weapon: "short", guard: true, fights: true, valdoro: true, carries: ["chiave_celle"],
    routine: [R(KX + 22.9, KZ - 4, "look", 6, { face: [KX + 26, KZ - 4] }), R(KX + 22.9, KZ, "look", 6, { face: [KX + 26, KZ] }), R(KX + 22.9, KZ + 4, "look", 6, { face: [KX + 26, KZ + 4] }),
      R(KX + 21.7, KZ + 3.1, "eat", 6, { face: [KX + 21.1, KZ + 4] }), R(KX + 22.9, KZ, "look", 5, { face: [KX + 26, KZ] }), R(KX + 21.4, KZ - 3.8, "look", 6, { face: [KX + 21.2, KZ - 5.3] })] },
];

export const OBJECTS = [
  { id: "well", x: 0, z: 0, label: "Pozzo" }, { id: "rack", x: 15.6, z: -6.2, label: "Rastrelliera spade" },
  { id: "carriage", x: 19.5, z: 17, label: "Carrozza" }, { id: "fountain", x: 0, z: WZ - 16, label: "Fontana di Valdoro" },
  // the castle's door in the back wall of the square, and its way out inside (castle_layout.js: EXIT)
  { id: "castello", x: 0, z: WZ - 30.1, label: "Entra nel castello" }, { id: "castello_uscita", x: CASTLE[0], z: CASTLE[1] + 3.0, label: "Esci dal castello" },
];
// [x, z, rotation]; index >= 6 are the stone houses of Valdoro. Roccanera's six (the user's thatched house of 28/11,
// casa.js: 11.6 x 10.9 m) round the square, 20-26 m from the well, the front door towards it (rotation atan2(-x, -z));
// the two on the west face east (turned towards the well their backs would reach x < -23.5: the mine's ground in the
// old map, which sites.js moves to the mine)
export const HOUSES = [[-17.4, 9.6, Math.PI / 2], [-17.4, -10.6, Math.PI / 2], [24, 5.5, -1.7961], [-3.8, 21.7, 2.9682], [11, -19, -0.5248], [22, -14, -1.0041], [-11, WZ - 10, 1.2], [11, WZ - 10, -1.2], [-11, WZ - 24, 0.6], [11, WZ - 24, -0.6]];
export const CHESTS = [[["pane", 2], ["patata", 3], ["oro", 8]], [["cuoio", 1], ["torcia", 1]], [["acqua", 1], ["pane", 1], ["pomodoro", 2], ["corda", 1]], [["oro", 15], ["libro", 1]], [["pozione", 1], ["cappuccio", 1]], [["spada_lunga", 1]], [["maglia", 1]], [["oro", 25], ["pozione", 1], ["gemma", 1]], [["carne", 1], ["vino", 2]], [["oro", 10], ["elmo_ferro", 1]]];
// The silver mine (mine.js): narrow tunnels from the portal in the rock face of the hill (CX + 17) going down and
// branching into dead ends. Nodes [x, z, floor height]; tunnels [from, to, width]; silver veins on the walls
// [from, to, how far along, side (1 left, -1 right)].
export const MINE_NODES = {
  E0: [CX + 17.8, CZ, 0.03], E1: [CX + 12, CZ, 0.03], J1: [CX + 4, CZ - 0.8, -2.2], N1: [CX + 2.5, CZ - 7.5, -3.4], N2: [CX - 3.5, CZ - 11, -4.6],
  J2: [CX - 4.5, CZ + 1.5, -4.6], S1: [CX - 6.5, CZ + 8.5, -6.0], S2: [CX - 11.5, CZ + 11, -7.2], W1: [CX - 10.5, CZ - 2, -6.6], W2: [CX - 11, CZ - 8, -7.8],
  T1: [CX + 5.5, CZ + 7, -3.0], T2: [CX + 2, CZ + 11.5, -3.6],
};
export const MINE_TUNNELS = [["E0", "E1", 3.0], ["E1", "J1", 2.7], ["J1", "N1", 2.5], ["N1", "N2", 2.6], ["J1", "J2", 2.7], ["J2", "S1", 2.5], ["S1", "S2", 2.6],
  ["J2", "W1", 2.5], ["W1", "W2", 2.6], ["J1", "T1", 2.4], ["T1", "T2", 2.5]];
export const MINE_ORES = [["N1", "N2", 0.8, 1], ["S1", "S2", 0.85, -1], ["W1", "W2", 0.82, 1], ["T1", "T2", 0.8, -1], ["J2", "W1", 0.45, -1], ["J1", "N1", 0.6, 1]];
export const DUMMIES = [[11, 23], [14, 23]];
// Roccanera's cage, by the soldiers' training ground: where whoever Roccanera's guards knock out wakes up (engine.js).
// The middle, half the side, half the doorway (on the north side, towards the village). While someone is in it, the
// first of Roccanera's guards alive (Gerd, who has the key; then Ulf, Ser Alaric) keeps watch: CAGE_WATCH.
export const CAGE = { x: 6.5, z: 23.5, half: 1.1, door: 0.45 };
export const CAGE_GUARDS = ["soldier1", "soldier2", "alaric"];
export const CAGE_WATCH = [R(7.6, 21.5, "look", 8, { face: [6.5, 23.5] }), R(5.0, 21.3, "look", 7, { face: [5.0, 17] }), R(8.9, 24.4, "look", 6, { face: [12, 24.4] })];
// Items lying in the world. owned => taking them in front of a witness is theft.
export const PICKUPS = [
  { id: "w1", item: "pane", x: -6.3, z: 9.6, owned: true }, { id: "w2", item: "ascia", x: 4.6, z: -12.8, owned: true },
  { id: "w3", item: "acqua", x: 1.3, z: 1.5 }, { id: "w4", item: "oro", qty: 6, x: 9.3, z: 7.4 },
  { id: "w5", item: "spada_corta", x: 2.6, z: -75.8 }, { id: "w6", item: "pane", x: -4.2, z: -45.5 }, { id: "w7", item: "cuoio", x: 3.2, z: -72.4 }, { id: "w13", item: "torcia", x: -0.6, z: -71.8 },
  { id: "w8", item: "argento", x: CX - 3.2, z: CZ - 10.4 }, { id: "w9", item: "pozione", x: CX + 2.4, z: CZ + 10.8 }, { id: "w10", item: "acqua", x: CX - 10.8, z: CZ - 7.2 }, { id: "w14", item: "gemma", x: CX - 10.9, z: CZ + 10.5 },   // at the ends of the mine's tunnels
  { id: "w11", item: "oro", qty: 12, x: 2.2, z: WZ - 18, owned: true }, { id: "w12", item: "pane", x: -6.6, z: WZ - 22, owned: true },
  { id: "chiave_tavolo", item: "chiave_celle", x: KX + 21.0, z: KZ + 3.6, gy: -4.22, owned: true },   // on the jailer's table (gy: the table top)
  { id: "w18", item: "pomodoro", x: -6.9, z: 10.1, owned: true }, { id: "w19", item: "patata", x: -6.1, z: 10.3, owned: true }, { id: "w20", item: "prosciutto", x: -9.4, z: 10.4, owned: true },
  { id: "w15", item: "pelliccia", x: -18, z: -70 }, { id: "w16", item: "mela", x: 16, z: -52 }, { id: "w17", item: "erbe", x: -20, z: -90 },
];

export const ROUTE = [
  { at: [19.5, 17], stop: 8 }, { at: [10, 12] },
  { at: [-4.5, 11], stop: 5, msg: "La carrozza scarica merci al banco di Lena." },
  { at: [-4, 3] }, { at: [-6, -7] },
  { at: [-10, -15], stop: 5, msg: "I minatori caricano casse d'argento sulla carrozza." },
  { at: [0, -12] }, { at: [11, -1] }, { at: [13, 10] },
];
// Mounted messengers ride between Ser Alaric's post and the knights at the wall, following the forest path.
export const RIDER_ROUTE = [[4, 9], [1.5, -12], ...PATH.slice(1, -1), [1.5, WZ + 9]];
