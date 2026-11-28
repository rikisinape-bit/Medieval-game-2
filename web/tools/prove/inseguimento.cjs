// Chasers (nav.js): they find the way round what is in front of them, Valdoro's guards open its gate to come and get
// you, and follow you through the castle's door. Usage: node tools/prove/inseguimento.cjs (with `npm run dev` running)
//   casa      a bandit behind a house of Roccanera, you in front of it: it goes round the house
//   porta     you outside Valdoro's shut gate, a guard inside hunting you: the gate is raised for it, it comes out
//   castello  you inside the castle, a guard in the square hunting you: it comes in through the door
//   cella     you in a shut prison cell of the castle, a guard in the corridor hunting you: it opens the cell
//   gabbia    you in Roccanera's shut cage, one of its guards behind it hunting you: round to the door, opens it
const { open } = require('./comune.cjs');
const WZ = -104;
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const go = (x, z, yaw) => p.evaluate(([x, z, yaw]) => { const P = window.__P; P.x = x; P.z = z; if (yaw != null) P.yaw = yaw; P.hp = 100; }, [x, z, yaw]);
  const hunt = (id, x, z) => p.evaluate(([id, x, z]) => { const n = window.__S.npcs[id]; Object.assign(n, { x, z, hostile: true, alive: true, hp: n.hpMax, goTo: null, alert: 0, actT: null, state: 'idle', nav: null }); }, [id, x, z]);
  const dist = (id) => p.evaluate((id) => { const n = window.__S.npcs[id], P = window.__P; return Math.hypot(n.x - P.x, n.z - P.z); }, id);
  // waits until the chaser is within 2.6 m of the player (the player kept alive and still) and, if given, on the
  // player's side of a door (there: (x, z) => bool); returns the seconds it took
  const reach = async (id, max, extra = () => null, there = null) => {
    const t0 = Date.now();
    for (;;) {
      await p.evaluate(() => { window.__P.hp = 100; });
      const d = await dist(id), e = await extra();
      const ok = d < 2.6 && (!there || (await p.evaluate(([id, f]) => { const n = window.__S.npcs[id]; return new Function('x', 'z', `return ${f}`)(n.x, n.z); }, [id, there])));
      if (ok) return `raggiunto in ${((Date.now() - t0) / 1000).toFixed(0)} s${e ? ` (${e})` : ''}`;
      if (Date.now() - t0 > max * 1000) return `NON raggiunto: a ${d.toFixed(1)} m dopo ${max} s${e ? ` (${e})` : ''}`;
      await p.waitForTimeout(700);
    }
  };
  // a house of Roccanera (world.js HOUSES[2]: the thatched T house, its front door on its local +z side, 11.6 x 10.9 m):
  // the bandit behind it, you before it
  const H = await p.evaluate(() => { const h = window.__houses[2]; return [h.x, h.z, h.r]; }), W = (lx, lz) => [H[0] + Math.cos(H[2]) * lx + Math.sin(H[2]) * lz, H[1] - Math.sin(H[2]) * lx + Math.cos(H[2]) * lz];
  const front = W(0, 7.5), back = W(0, -7.5);
  await go(...front); await hunt('bandit1', ...back); await p.waitForTimeout(500);
  console.log('casa:', await reach('bandit1', 25)); await shot('inseguimento_casa');
  await p.evaluate(() => { Object.assign(window.__S.npcs.bandit1, { hostile: false }); });
  // Valdoro's gate shut (a new game: the Crown does not know you yet), you outside, guard Hal inside after you
  const [out, ins] = await p.evaluate((WZ) => [window.__terrain.toWorld(0, WZ + 9, 'valdoro'), window.__terrain.toWorld(-2, WZ - 6, 'valdoro')], WZ);
  await go(...out); await p.waitForTimeout(1500);
  console.log('porta chiusa all\'inizio:', !(await p.evaluate(() => window.__S.gateOpen)));
  let opened = false;
  await hunt('hal', ...ins);
  console.log('porta:', await reach('hal', 30, async () => { if (await p.evaluate(() => window.__S.gateOpen)) opened = true; return opened ? 'la saracinesca si è alzata' : 'saracinesca giù'; }));
  await shot('inseguimento_porta');
  await p.evaluate(() => { Object.assign(window.__S.npcs.hal, { hostile: false }); });
  await p.waitForTimeout(4000);
  console.log('porta richiusa dopo:', !(await p.evaluate(() => window.__S.gateOpen)));
  // Hal no longer after you, outside: back to his post inside the walls (the gate raised for him again, then shut)
  const aside = await p.evaluate((WZ) => window.__terrain.toWorld(9, WZ + 14, 'valdoro'), WZ);
  await go(...aside);
  let up = false; const t1 = Date.now(), home = async () => p.evaluate((WZ) => { const n = window.__S.npcs.hal, L = window.__terrain.toLegacy(n.x, n.z); return !!L && L.site === 'valdoro' && L.z < WZ - 1.5; }, WZ);
  while (!(await home()) && Date.now() - t1 < 60000) { if (await p.evaluate(() => window.__S.gateOpen)) up = true; await p.waitForTimeout(700); }
  const rientrato = await home();
  await p.waitForTimeout(5000);
  console.log('ritorno:', rientrato ? `Hal è rientrato in ${((Date.now() - t1) / 1000 - 5).toFixed(0)} s` : 'Hal NON è rientrato', up ? '(saracinesca alzata per lui)' : '(saracinesca mai alzata)', (await p.evaluate(() => window.__S.gateOpen)) ? 'e rimasta aperta' : 'e richiusa');
  // the castle: in through its door (E), then guard Rolf in the square after you
  const door = await p.evaluate((WZ) => [window.__terrain.toWorld(0, WZ - 28.6, 'valdoro'), window.__terrain.toWorld(0, WZ - 31, 'valdoro')], WZ);
  await go(...door[0], Math.atan2(door[1][0] - door[0][0], door[1][1] - door[0][1])); await p.waitForTimeout(1200);
  await p.keyboard.press('e'); await p.waitForTimeout(6000);
  const inside = await p.evaluate(() => window.__P.x > 3000);
  console.log('dentro il castello:', inside);
  const sq = await p.evaluate((WZ) => window.__terrain.toWorld(4, WZ - 18, 'valdoro'), WZ);
  await hunt('rolf', ...sq);
  console.log('castello:', await reach('rolf', 40, async () => ((await p.evaluate(() => window.__S.npcs.rolf.x > 3000)) ? 'è entrato' : 'ancora fuori')));
  await shot('inseguimento_castello');
  // a prison cell (cell "c": its doorway at x 4024, z 0; the cell beyond it, x+), shut; Rolf in the corridor
  console.log('cella chiusa all\'inizio:', !(await p.evaluate(() => !!window.__S.flags.cells?.c)));
  await go(4025.6, 0.1, -Math.PI / 2); await hunt('rolf', 4021.4, -3.2);
  console.log('cella:', await reach('rolf', 30, async () => ((await p.evaluate(() => !!window.__S.flags.cells?.c)) ? 'la cella è stata aperta' : 'cella chiusa'), 'x > 4024.4'));
  await shot('inseguimento_cella');
  await p.evaluate(() => { Object.assign(window.__S.npcs.rolf, { hostile: false }); });
  // out of the castle, then into Roccanera's cage (6.5, 23.5; its door on the south side), shut; Ulf behind it (north)
  await go(4000, 3.4, Math.PI); await p.waitForTimeout(2500);
  await p.keyboard.press('e'); await p.waitForTimeout(7000);
  console.log('gabbia chiusa all\'inizio:', !(await p.evaluate(() => !!window.__S.flags.cageOpen)));
  await go(6.5, 23.4, Math.PI); await hunt('soldier2', 6.8, 26.6);
  console.log('gabbia:', await reach('soldier2', 30, async () => ((await p.evaluate(() => !!window.__S.flags.cageOpen)) ? 'la gabbia è stata aperta' : 'gabbia chiusa'), 'Math.abs(x - 6.5) < 0.6 && z > 21.3'));   // (in the doorway or inside)
  await shot('inseguimento_gabbia');
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
