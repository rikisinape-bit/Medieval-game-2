// Bodies (27/11, the user: nobody walks through anybody): three knights fighting you surround you (their bearings round
// you, the gaps between them), nobody inside anybody;
// you cannot walk through a person standing still. Usage: node tools/prove/corpi.cjs
const { open } = require('/home/user/Medieval-game-2/web/tools/prove/comune.cjs');
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const gameT = () => p.evaluate(() => window.__S.dayT * 600);
  const wait = async (s, f) => { const t0 = await gameT(); while ((await gameT()) - t0 < s) { if (f) await f(); await p.waitForTimeout(300); } };
  // an open place west of Roccanera
  const X = -40, Z = 40;
  await p.evaluate(([X, Z]) => { const P = window.__P; P.x = X; P.z = Z; P.yaw = 0; P.hp = 100; window.__S.dayT = 0.42; }, [X, Z]);
  await p.waitForTimeout(2000);
  const ids = ['alaric', 'brann', 'oswin'];
  // all three come from the same side (north), 6-8 m away
  await p.evaluate(([X, Z, ids]) => ids.forEach((id, i) => { const n = window.__S.npcs[id]; Object.assign(n, { x: X - 1 + i, z: Z - 7 - i * 0.6, hostile: true, alive: true, hp: n.hpMax, goTo: null, alert: 0, actT: null, state: 'idle', nav: null, riding: false }); }), [X, Z, ids]);
  const look = () => p.evaluate((ids) => { const P = window.__P; return ids.map((id) => { const n = window.__S.npcs[id]; return { id, a: Math.atan2(n.x - P.x, n.z - P.z) * 180 / Math.PI, d: Math.hypot(n.x - P.x, n.z - P.z), x: n.x, z: n.z }; }); }, ids);
  let minPair = 9, minP = 9;
  await wait(12, async () => {
    await p.evaluate(() => { window.__P.hp = 100; });
    const k = await look();
    for (let i = 0; i < 3; i++) { minP = Math.min(minP, k[i].d); for (let j = i + 1; j < 3; j++) minPair = Math.min(minPair, Math.hypot(k[i].x - k[j].x, k[i].z - k[j].z)); }
  });
  const k = await look();
  const angs = k.map((o) => o.a).sort((a, b) => a - b), gaps = angs.map((a, i) => ((i ? a - angs[i - 1] : a - angs[2] + 360)));
  console.log('cavalieri:', k.map((o) => `${o.id} ${o.a.toFixed(0)}° a ${o.d.toFixed(1)} m`).join(' | '));
  console.log('spazi tra loro attorno a te:', gaps.map((g) => g.toFixed(0) + '°').join(', '), '| più vicini tra loro:', minPair.toFixed(2), 'm | a te:', minP.toFixed(2), 'm');
  await p.evaluate(([X, Z]) => { const s = window.__terrain.surfaceAt; window.__topcam = [X + 0.5, s(X, Z) + 7, Z + 3.5, X, s(X, Z), Z]; }, [X, Z]);
  await p.waitForTimeout(1500); await shot('corpi_cavalieri'); await p.evaluate(() => { window.__topcam = null; });
  await p.evaluate((ids) => ids.forEach((id) => { const n = window.__S.npcs[id]; n.hostile = false; }), ids);
  // walking into a person standing still: Mira? any calm person; you push into it for 2 s
  const who = await p.evaluate(() => { const P = window.__P, n = window.__S.npcs.torin; Object.assign(n, { x: P.x, z: P.z - 3, goTo: [P.x, P.z - 3], actT: null }); return n.id; });
  await wait(1.5);
  await p.evaluate(() => { const P = window.__P; P.yaw = Math.PI; });
  await p.keyboard.down('w'); let minW = 9;
  await wait(2.5, async () => { minW = Math.min(minW, await p.evaluate(() => { const P = window.__P, n = window.__S.npcs.torin; return Math.hypot(n.x - P.x, n.z - P.z); })); });
  await p.keyboard.up('w');
  console.log('contro', who, 'fermo: la distanza più piccola', minW.toFixed(2), 'm (corpi: 0.6)');
  console.log('errori:', errors.length ? errors.slice(0, 5) : 'nessuno');
  await browser.close();
})();
