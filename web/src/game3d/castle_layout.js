// The castle of Valdoro, inside: where every piece of the interior pack goes (castle.js builds it; tools/build-castle.mjs
// keeps only the pieces used here), where one can walk (and how high the floor is), what is in the way, the lights.
// The castle's own coordinates, in metres: x east, z south, y up; 0 is the middle of the entrance hall, whose gate is on
// the south side (towards the square of Valdoro). Plain data, no imports.
//
//                      z -20 ┌────────────────────┐
//                            │   sala del trono   │  16 x 16, pillars, the throne on a dais at the north end
//   studio (+5 m)  scale su  ├──────┬──────┬──────┤  scale giù   prigioni (-5 m)
//   x -20..-12     x -12..-4 │ingr. │ banchetti   │  x 12..20    x 20..28, z -6..6
//                            └──┬───┴─────────────┘
//                         z +4  gate (the way out)
//
// Pieces: { room, id, x, y, z, q: quarter turns counter-clockwise seen from above (q 1 takes the pack's "-z side" to -x),
// s: scale (number or [x, y, z]), part: "ceiling" (only the vault of a floor tile) }.
// The pack's walls and borders stand on a tile's -z side; tiles are 4 x 4 m (the big rooms 8 x 8), centred on their
// origin; "passages" (walls with a door) are centred on the edge they stand on.

export const PIECES = [];
// Walkable areas (where a body's centre can be: already 0.4 m from the walls), first match wins for the floor:
// { x0, x1, z0, z1, y } or a ramp { ..., ramp: [axis, from, to, y0, y1] }; ceil: height of the vault above (absolute).
export const AREAS = [];
export const SOLIDS = [];   // { x, z, r } in the way (pillars, furniture)
export const LIGHTS = [];   // { x, y, z, color, intensity, distance }
export const FLAMES = [];   // { x, y, z, k } a fire's flame
export const SPAWN = { x: 0, z: -0.8, yaw: Math.PI };   // in the entrance hall, facing north (beyond the reach of the gate, 3 m)
export const EXIT = { x: 0, z: 3.0 };                   // where "Esci dal castello" is offered

const put = (room, id, x, y, z, q = 0, o = {}) => PIECES.push({ room, id, x, y, z, q, ...o });
const area = (x0, x1, z0, z1, y, ceil, ramp) => AREAS.push({ x0, x1, z0, z1, y, ceil, ramp });
const solid = (x, z, r) => SOLIDS.push({ x, z, r });
const light = (x, y, z, intensity = 6, distance = 10, color = "#ffb060") => LIGHTS.push({ x, y, z, color, intensity, distance });
const SIDE = { N: 0, W: 1, S: 2, E: 3 };
// a wall torch on the inner face of a wall (side: the wall it hangs on), its light a little out in the room
const torch = (room, x, y, z, side) => {
  put(room, "Torch_Wall", x, y, z, { W: 0, S: 1, E: 2, N: 3 }[side]);
  const [dx, dz] = { W: [0.45, 0], E: [-0.45, 0], N: [0, 0.45], S: [0, -0.45] }[side];
  light(x + dx, y + 2.2, z + dz, 3.2, 7);
};
const candle = (room, x, y, z, side) => {
  put(room, "Candle_Wall", x, y, z, { E: 0, N: 1, W: 2, S: 3 }[side]);
  const [dx, dz] = { W: [0.4, 0], E: [-0.4, 0], N: [0, 0.4], S: [0, -0.4] }[side];
  light(x + dx, y + 2.3, z + dz, 2.2, 5.5);
};

// ---- Entrance hall (8 x 8): the gate south, a great arch north, doors west and east ----
{
  const r = "ingresso";
  put(r, "Dungeon_Big", 0, 0, 0);
  put(r, "Dungeon_Big_to_Custom", 0, 0, 0, SIDE.N);
  put(r, "Dungeon_Big_to_Custom", 0, 0, 0, SIDE.S);
  put(r, "DoorGate_Wooden_Left", -1.69, 0, 3.86); put(r, "DoorGate_Wooden_Right", 1.69, 0, 3.86);
  put(r, "Dungeon_Big_Passage", -4, 0, 0, 1); put(r, "Dungeon_Big_Passage", 4, 0, 0, 1);
  put(r, "Carpet_Red", 0, 0.01, 0.9);
  put(r, "WeaponRack_Big", -3.2, 0, 2.3, 1); put(r, "WeaponRack_Big", 3.2, 0, 2.3, 1);
  put(r, "Chest_Closed", 2.9, 0, -3.25); put(r, "Barrel_Closed", -3.15, 0, -3.15); put(r, "Barrel_Closed", -2.3, 0, -3.25);
  put(r, "Chandelier_Ceiling", 0, -0.05, 0); light(0, 3.2, 0, 6, 10);
  torch(r, -3.7, 0, -2.2, "W"); torch(r, -3.7, 0, 2.2, "W"); torch(r, 3.7, 0, -2.2, "E"); torch(r, 3.7, 0, 2.2, "E");
  [[-3.2, 2.3, 0.75], [3.2, 2.3, 0.75], [2.9, -3.25, 0.6], [-2.75, -3.2, 0.9]].forEach(([x, z, rr]) => solid(x, z, rr));
  area(-3.35, 3.35, -3.3, 3.35, 0, 4.4);
  area(-1.25, 1.25, -4.7, -3.0, 0, 3.3);                     // the arch to the throne room
  area(-4.6, -3.0, -0.22, 0.22, 0, 2.2);                     // door west (stairs up)
  area(3.0, 4.6, -0.22, 0.22, 0, 2.2);                       // door east (banquet)
}

// ---- Throne room (4 x 4 tiles of 4 m, x -8..8, z -20..-4): pillared borders, colonnade, the throne on a dais ----
{
  const r = "trono", xs = [-6, -2, 2, 6], zs = [-18, -14, -10, -6];
  for (const x of xs) for (const z of zs) {
    const w = x === -6, e = x === 6, n = z === -18, s = z === -6;
    if ((n || s) && (w || e)) put(r, "Dungeon_Custom_Corner_Arched", x, 0, z, n ? (w ? 0 : 3) : (w ? 1 : 2));
    else if (n) put(r, "Dungeon_Custom_Border_Arched", x, 0, z, 0);
    else if (w) put(r, "Dungeon_Custom_Border_Arched", x, 0, z, 1);
    else if (e) put(r, "Dungeon_Custom_Border_Arched", x, 0, z, 3);
    else put(r, "Dungeon_Custom_Center", x, 0, z);           // the middle, and the south side open to the entrance
  }
  const N = ["Dungeon_Wall_Window", "Dungeon_Wall_Var2", "Dungeon_Wall_Var3", "Dungeon_Wall_Window"];
  xs.forEach((x, i) => put(r, N[i], x, 0, -18, SIDE.N));
  const WE = ["Dungeon_Wall_Var1", "Dungeon_Wall_Window", "Dungeon_Wall_Window", "Dungeon_Wall_Var1"];
  zs.forEach((z, i) => { put(r, WE[i], -6, 0, z, SIDE.W); put(r, WE[i], 6, 0, z, SIDE.E); });
  put(r, "Dungeon_Wall_Var2", -6, 0, -6, SIDE.S); put(r, "Dungeon_Wall_Var2", 6, 0, -6, SIDE.S);
  // colonnade along the aisle
  for (const z of [-8, -12, -16]) for (const x of [-3.6, 3.6]) { put(r, "Pillar", x, 0, z); solid(x, z, 0.6); }
  // the dais (a stair landing, flattened), the throne (a big chair), the carpet to it
  put(r, "Stairs_Platform", 0, 0, -18, 0, { s: [1, 0.12, 1] });
  put(r, "Chair", 0, 0.3, -18.9, 0, { s: 1.3 });
  [-6.4, -10.7, -15.0].forEach((z) => put(r, "Carpet_Red", 0, 0.01, z));
  put(r, "Chandelier_Ceiling", 0, -0.35, -9.2); put(r, "Chandelier_Ceiling", 0, -0.35, -14.4);
  light(0, 2.9, -9.2, 6, 11); light(0, 2.9, -14.4, 6, 11);
  torch(r, -7.83, 0, -8, "W"); torch(r, -7.83, 0, -16, "W"); torch(r, 7.83, 0, -8, "E"); torch(r, 7.83, 0, -16, "E");
  torch(r, -3.2, 0.3, -19.83, "N"); torch(r, 3.2, 0.3, -19.83, "N");
  // a scribe's table on the west side, a chest and barrels on the east
  put(r, "Table_Small", -6.2, 0, -12); put(r, "Chair", -5.05, 0, -12, 3);
  put(r, "Book_Open", -6.25, 0.83, -12.4, 1); put(r, "Scroll_Big", -6.3, 0.83, -11.2, 1); put(r, "Inkwell", -6.0, 0.83, -12.9); put(r, "Quill", -5.95, 0.85, -12.75, 1);
  solid(-6.2, -12.7, 0.85); solid(-6.2, -11.3, 0.85);
  put(r, "Chest_Closed", 6.4, 0, -18.9); put(r, "Barrel_Closed", 6.9, 0, -5.2); put(r, "Barrel_Closed", 6.9, 0, -6.2);
  solid(6.4, -18.9, 0.6); solid(6.9, -5.7, 0.9);
  area(-2.0, 2.0, -19.4, -15.95, 0.3, 4.0);                  // on the dais
  area(-7.4, 7.4, -19.4, -4.45, 0, 4.0);
}

// ---- Banquet hall (8 x 8, east): the fireplace on the north wall, one long table along the south side, the way from
// door to door (z 0) left free ----
{
  const r = "banchetti";
  put(r, "Dungeon_Big", 8, 0, 0);
  put(r, "Dungeon_Big_Wall", 8, 0, 0, SIDE.N); put(r, "Dungeon_Big_Window", 8, 0, 0, SIDE.S);
  put(r, "Dungeon_Big_Passage", 12, 0, 0, 1);
  put(r, "Fireplace", 8, 0, -3.79); FLAMES.push({ x: 8, y: 0.3, z: -3.05, k: 1.5 }); light(8, 0.9, -2.5, 6, 9, "#ff8a30");
  put(r, "FirewoodStack", 10.0, 0, -3.15); put(r, "Cauldron_Full", 6.15, 0.55, -3.0);
  put(r, "Barrel_Closed", 11.3, 0, -3.3); put(r, "Barrel_Open", 11.3, 0, -2.35);
  put(r, "Table_Big", 6.6, 0, 2.0, 1); put(r, "Table_Small", 10.1, 0, 2.0, 1);
  for (const bx of [5.9, 9.7]) { put(r, "Bench", bx, 0, 0.85, 1); put(r, "Bench", bx, 0, 3.15, 3); }
  [[5.0, 1.6], [6.2, 2.4], [7.4, 1.6], [8.6, 2.4], [9.8, 1.6], [11.0, 2.4]].forEach(([x, z]) => put(r, "Plate", x, 0.83, z));
  put(r, "Jar_Big", 7.9, 0.83, 2.0); put(r, "Jar_Full", 10.5, 0.83, 2.1); put(r, "Fork", 5.0, 0.85, 1.95); put(r, "Knife", 8.6, 0.85, 2.0);
  for (const x of [5.0, 6.6, 8.2, 9.8, 11.2]) solid(x, 2.0, 1.25);
  put(r, "Chandelier_Ceiling", 8, -0.05, 0.4); light(8, 3.2, 0.4, 6, 10);
  candle(r, 5.6, 0, 3.69, "S"); candle(r, 10.4, 0, 3.69, "S");
  solid(8, -3.0, 1.25); solid(10.0, -3.15, 0.75); solid(6.15, -3.0, 0.55); solid(11.3, -2.8, 0.85);
  area(4.45, 11.55, -3.35, 3.35, 0, 4.4);
  area(11.4, 12.6, -0.22, 0.22, 0, 2.2);                     // door east (stairs down)
}

// ---- Stairs up (west): two flights rising 5 m, then the study ----
{
  const r = "scale_su";
  put(r, "Stairs_Low", -6, 0, 0, 2); put(r, "Stairs_High", -10, 0, 0, 2);
  for (const x of [-6, -10]) for (const y of [0, 5]) { put(r, "Dungeon_Wall_Var1", x, y, 0, SIDE.N); put(r, "Dungeon_Wall_Var1", x, y, 0, SIDE.S); }
  put(r, "Dungeon_Wall_Var1", -6, 5, 0, SIDE.E); put(r, "Dungeon_Wall_Var1", -10, 0, 0, SIDE.W);
  put(r, "Dungeon_Custom_Center", -6, 5, 0, 0, { part: "ceiling" }); put(r, "Dungeon_Custom_Center", -10, 5, 0, 0, { part: "ceiling" });
  torch(r, -6, 1.25, -1.83, "N"); torch(r, -10, 3.75, 1.83, "S");
  area(-12.6, -3.4, -1.4, 1.4, 0, 9.0, ["x", -4, -12, 0, 5]);
}

// ---- The study (8 x 8, 5 m up): the court sage's books, potions and crystal ball ----
{
  const r = "studio", Y = 5;
  put(r, "Dungeon_Big", -16, Y, 0);
  put(r, "Dungeon_Big_Passage", -12, Y, 0, 1);
  put(r, "Dungeon_Big_Window", -16, Y, 0, SIDE.N); put(r, "Dungeon_Big_Window", -16, Y, 0, SIDE.S); put(r, "Dungeon_Big_Wall", -16, Y, 0, SIDE.W);
  for (const z of [-2.2, 0, 2.2]) put(r, "Shelf", -19.45, Y, z);         // (open side towards +x: the room)
  solid(-19.4, -1.1, 0.9); solid(-19.4, 1.1, 0.9);
  // books standing on the boards (0.80, 1.42, 1.86 m), in rows of a few side by side, some gaps; the middle shelf is low
  // (0.44 m): no big books there
  const thick = (id) => (/Big/.test(id) ? 0.16 : /Small/.test(id) ? 0.06 : 0.11);
  const books = ["Book_Big_Brown", "Book_Red", "Book_Green", "Book_Big_DeepRed", "Book_Brown", "Book_Small_Green", "Book_DeepRed", "Book_Big_Green", "Book_Small_Red", "Book_Small_Brown", "Book_Big_Red", "Book_Small_DeepRed"];
  let bi = 0;
  for (const sz of [-2.2, 0, 2.2]) for (const [k, by] of [0.8, 1.42, 1.86].entries()) {
    const n = 3 + ((bi * 7 + k) % 4); let z = sz - 0.75 + ((bi * 13) % 5) * 0.08;
    for (let i = 0; i < n; i++, bi++) {
      const id = k === 1 ? books[bi % books.length].replace("Big_", "") : books[bi % books.length];
      z += thick(id) / 2; put(r, id, -19.45, Y + by, z); z += thick(id) / 2 + 0.012;
    }
  }
  put(r, "Desk", -16, Y, -3.34); put(r, "Chair", -16, Y, -2.45, 2); solid(-16, -3.2, 1.0);
  put(r, "Chandelier_Triple", -15.3, Y + 0.95, -3.55); put(r, "Scroll_Stack", -16.55, Y + 0.95, -3.45);
  put(r, "Table_Small", -13.9, Y, 2.0, 1); put(r, "Stool_round", -13.9, Y, 3.1);
  put(r, "CrystalBall_Stand", -13.9, Y + 0.83, 2.0); put(r, "CrystalBall", -13.9, Y + 1.15, 2.0);
  put(r, "Beaker_Full_Var1", -14.9, Y + 0.83, 1.85); put(r, "Beaker_Full_Var2", -14.6, Y + 0.83, 2.2); put(r, "Flask", -13.1, Y + 0.83, 1.8);
  put(r, "Potion_Red", -12.8, Y + 0.83, 2.25); put(r, "Potion_Blue", -12.65, Y + 0.83, 1.95); put(r, "Potion_Green", -15.2, Y + 0.83, 2.3);
  solid(-13.9, 2.0, 1.15); solid(-15.0, 2.0, 0.8); solid(-12.8, 2.0, 0.8);
  put(r, "Cauldron_Full", -18.2, Y + 0.55, 2.9); solid(-18.2, 2.9, 0.55);
  put(r, "Carpet_Green", -16, Y + 0.01, 0.3, 1);
  put(r, "Chandelier_Ceiling", -16, Y - 0.05, 0); light(-16, Y + 3.2, 0, 6, 10);
  light(-13.9, Y + 1.6, 2.0, 2.2, 4.5, "#7ab0ff");
  candle(r, -18, Y, 3.69, "S"); candle(r, -14, Y, 3.69, "S"); candle(r, -19.79, Y, -3.3, "W"); candle(r, -19.79, Y, 3.3, "W");
  area(-19.35, -12.45, -3.35, 3.35, Y, Y + 4.4);
  area(-12.6, -11.4, -0.22, 0.22, Y, Y + 2.2);              // its door
}

// ---- Stairs down (east of the banquet): two flights going down 5 m to the prisons ----
{
  const r = "scale_giu";
  put(r, "Stairs_High", 14, -5, 0, 2); put(r, "Stairs_Low", 18, -5, 0, 2);
  for (const x of [14, 18]) for (const y of [-5, 0]) { put(r, "Dungeon_Wall_Var1", x, y, 0, SIDE.N); put(r, "Dungeon_Wall_Var1", x, y, 0, SIDE.S); }
  put(r, "Dungeon_Wall_Var1", 18, 0, 0, SIDE.E); put(r, "Dungeon_Wall_Var1", 14, -5, 0, SIDE.W);
  put(r, "Dungeon_Custom_Center", 14, 0, 0, 0, { part: "ceiling" }); put(r, "Dungeon_Custom_Center", 18, 0, 0, 0, { part: "ceiling" });
  torch(r, 14, -1.25, -1.83, "N"); torch(r, 18, -3.75, 1.83, "S");
  area(11.4, 20.6, -1.4, 1.4, 0, 4.0, ["x", 12, 20, 0, -5]);
}

// ---- The prisons (5 m down): a corridor and three cells behind bars ----
{
  const r = "prigioni", Y = -5;
  [["Basement_Var1", 22, -4, 0], ["Basement_Var2", 22, 0, 0], ["Basement_Var3", 22, 4, 0], ["Basement_Var4", 26, -4, 0], ["Basement_Var1", 26, 0, 2], ["Basement_Var2", 26, 4, 1]]
    .forEach(([id, x, z, q]) => put(r, id, x, Y, z, q));
  put(r, "Basement_Passage", 20, Y, 0, 1);
  put(r, "Basement_Wall_Var1", 22, Y, -4, SIDE.W); put(r, "Basement_Wall_Var2", 22, Y, 4, SIDE.W);
  put(r, "Basement_Wall_Var3", 22, Y, -4, SIDE.N); put(r, "Basement_Wall_Var1", 26, Y, -4, SIDE.N);
  put(r, "Basement_Wall_Var1", 22, Y, 4, SIDE.S); put(r, "Basement_Wall_Var3", 26, Y, 4, SIDE.S);
  put(r, "Basement_Wall_Var2", 26, Y, -4, SIDE.E); put(r, "Basement_Wall_Var1", 26, Y, 0, SIDE.E); put(r, "Basement_Wall_Var2", 26, Y, 4, SIDE.E);
  for (const z of [-4, 0, 4]) put(r, "Basement_Passage_Prison", 24, Y, z, 1);      // bars between corridor and cells
  put(r, "Basement_Wall_Var1", 26, Y, 0, SIDE.N); put(r, "Basement_Wall_Var1", 26, Y, 4, SIDE.N);   // between the cells
  // the wooden posts of the ceilings (at the tiles' corners)
  for (const x of [20.25, 23.75, 24.25, 27.75]) for (const z of [-5.75, -2.25, 2.25, 5.75]) solid(x, z, 0.25);
  put(r, "Table_Small", 21.1, Y, 4.0); put(r, "Stool_square", 22.1, Y, 4.0); put(r, "Key_Rusty", 21.0, Y + 0.84, 3.6, 1);
  put(r, "Chest_Closed", 21.2, Y, -5.25); solid(21.1, 4.0, 1.0); solid(21.2, -5.25, 0.6);
  put(r, "Bucket", 27.2, Y, -5.2); put(r, "Skull", 26.6, Y, 0.6); put(r, "Bone", 27.0, Y, -0.4, 1); put(r, "Bag", 27.1, Y, 5.0);
  torch(r, 20.2, Y, -3.2, "W"); torch(r, 20.2, Y, 3.2, "W"); torch(r, 27.8, Y, 0, "E");
  const ceil = Y + 3.3;
  area(19.4, 20.6, -0.22, 0.22, Y, Y + 2.2);                // the door from the stairs
  area(20.45, 23.6, -5.55, 5.55, Y, ceil);                   // corridor
  for (const z of [-4, 0, 4]) area(23.4, 24.6, z - 0.2, z + 0.2, Y, ceil);   // gaps in the bars
  area(24.4, 27.55, -5.55, -2.4, Y, ceil); area(24.4, 27.55, -1.4, 1.6, Y, ceil); area(24.4, 27.55, 2.6, 5.55, Y, ceil);
}
