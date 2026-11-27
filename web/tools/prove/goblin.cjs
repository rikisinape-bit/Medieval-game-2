// The goblin (goblin.js): not out by day; at nightfall it comes out by its lair (the forest under snow of the
// north-west); it sees you and attacks; your blows hurt it; killed, it drops gold and does not come back that night;
// the next night it is out again; at dawn, not fighting, it leaves. Usage: node tools/prove/goblin.cjs (`npm run dev`)
const { open } = require('./comune.cjs');
const LAIR = [-230, -193];
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const G = () => p.evaluate(() => { const g = window.__goblin.g; return { x: g.x, z: g.z, out: g.out, alive: g.alive, hostile: g.hostile, hp: Math.round(g.hp), cur: g.cur, visible: !!g.mesh?.visible }; });
  const gameT = () => p.evaluate(() => window.__S.dayT * 600);
  const wait = async (s, keep = true) => { const t0 = await gameT(); while ((await gameT()) - t0 < s) { if (keep) await p.evaluate(() => { window.__P.hp = Math.max(window.__P.hp, 60); }); await p.waitForTimeout(400); } };
  const dayT = (t) => p.evaluate((t) => { window.__S.dayT = t; }, t);
  const night = () => p.evaluate(() => window.__S.night);
  const dist = (a, b) => Math.hypot(a.x - b[0], a.z - b[1]);
  // 1. by day, by its lair: nobody
  await p.evaluate(([x, z]) => { Object.assign(window.__P, { x: x + 40, z: z + 30 }); }, LAIR);
  await dayT(0.4); await wait(2);
  let g = await G();
  console.log('di giorno:', g.out ? 'il goblin è FUORI' : 'nessun goblin', '| notte?', await night());
  // 2. nightfall: it comes out by its lair
  await dayT(0.93); await wait(4);
  g = await G();
  console.log('di notte:', g.out ? `è uscito a ${dist(g, LAIR).toFixed(0)} m dalla tana` : 'NON è uscito', '| notte?', await night(), '| notti contate', await p.evaluate(() => window.__S.flags.goblin.nights));
  // 3. you 12 m from it, facing it: it comes for you and claws
  await p.evaluate(([x, z]) => { const P = window.__P, a = Math.atan2(P.x - x, P.z - z); P.x = x + Math.sin(a) * 12; P.z = z + Math.cos(a) * 12; P.yaw = Math.atan2(x - P.x, z - P.z); P.hp = 100; P.sneak = false; }, [g.x, g.z]);
  const hp0 = 100; let hurt = false;
  for (let k = 0; k < 24 && !hurt; k++) { await p.waitForTimeout(500); hurt = (await p.evaluate(() => window.__P.hp)) < hp0; }
  g = await G();
  console.log('attacco:', g.hostile ? 'ti caccia' : 'NON ti caccia', '|', hurt ? `ti ha colpito (vita ${await p.evaluate(() => Math.round(window.__P.hp))})` : 'non ti ha colpito', '| animazione', g.cur);
  await p.evaluate(() => { window.__P.hp = 100; });
  // a picture: the free camera beside it
  g = await G();
  await p.evaluate(([x, z]) => { const s = window.__terrain.surfaceAt, P = window.__P; window.__topcam = [x + (P.x - x) * 0.4 + 1.6, s(x, z) + 1.6, z + (P.z - z) * 0.4 + 1.2, x, s(x, z) + 0.8, z]; }, [g.x, g.z]);
  await p.waitForTimeout(1500); await shot('goblin_notte'); await p.evaluate(() => { window.__topcam = null; });
  // 4. your blows (J), up to three tries as it moves
  let g0 = await G(), g1 = g0;
  for (let k = 0; k < 4 && g1.hp >= g0.hp; k++) {
    g0 = await G();
    await p.evaluate(([x, z]) => { const P = window.__P, a = Math.atan2(P.x - x, P.z - z); P.x = x + Math.sin(a) * 1.6; P.z = z + Math.cos(a) * 1.6; P.yaw = Math.atan2(x - P.x, z - P.z); P.hp = 100; }, [g0.x, g0.z]);
    await p.waitForTimeout(150); await p.keyboard.press('j'); await wait(1);
    g1 = await G();
  }
  console.log('colpo vero:', `vita ${g0.hp} -> ${g1.hp}`);
  // 5. killed: gold on the ground, not back that night
  const drops0 = await p.evaluate(() => window.__S.drops.length);
  for (let k = 0; k < 20; k++) { const a = await G(); if (!a.alive) break; await p.evaluate(() => window.__goblin.hit(20)); await p.waitForTimeout(100); }
  await wait(2);
  g = await G();
  const gold = await p.evaluate((n) => window.__S.drops.slice(n).filter((d) => d.item === 'oro').map((d) => d.qty), drops0);
  console.log('ucciso:', !g.alive ? `sì (animazione ${g.cur})` : 'NO', '| oro a terra:', gold.join(', ') || 'niente', '| salvato', JSON.stringify(await p.evaluate(() => window.__S.flags.goblin)));
  await wait(6);
  g = await G();
  console.log('stessa notte:', g.alive ? 'è TORNATO' : 'non torna');
  // 6. day, then the next night: out again
  await dayT(0.4); await wait(35);
  g = await G();
  console.log('il giorno dopo:', g.out ? 'il corpo è ANCORA lì' : 'sparito');
  await dayT(0.93); await wait(4);
  g = await G();
  console.log('la notte dopo:', g.alive && g.out ? `è di nuovo fuori (a ${dist(g, LAIR).toFixed(0)} m dalla tana)` : 'NON è uscito', '| notti contate', await p.evaluate(() => window.__S.flags.goblin.nights));
  // 7. dawn, you far: it leaves
  await p.evaluate(([x, z]) => { Object.assign(window.__P, { x: x + 120, z: z + 120 }); }, LAIR);
  await dayT(0.3); await wait(25);
  g = await G();
  console.log("all'alba:", g.out ? 'è ANCORA fuori' : 'se n\'è andato');
  // 8. a picture by day (summoned for the test), close up
  await p.evaluate(([x, z]) => { Object.assign(window.__P, { x: x + 6, z: z + 6, sneak: true }); }, LAIR);
  await wait(2);
  await p.evaluate(([x, z]) => window.__goblin.summon(x, z), LAIR); await wait(1.5, false);
  g = await G();
  await p.evaluate(([x, z]) => { const s = window.__terrain.surfaceAt; window.__topcam = [x + 2.2, s(x, z) + 1.3, z - 2.2, x, s(x, z) + 0.75, z]; }, [g.x, g.z]);
  await p.waitForTimeout(2500); await shot('goblin_giorno');
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
