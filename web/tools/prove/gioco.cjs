// Playing in the world of Vasilad: walking out of Roccanera, the sea stops you, the messengers ride, the mine's tunnels,
// Valdoro's square, things lying where their place now is, everyone in their region; the castle's way out; the
// bandits' ambush in their forest. Usage: node tools/prove/gioco.cjs (with `npm run dev` running)
const { open } = require('./comune.cjs');
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const st = () => p.evaluate(() => { const P = window.__P, T = window.__terrain; return `P ${P.x.toFixed(1)},${P.z.toFixed(1)} suolo ${T.surfaceAt(P.x, P.z).toFixed(2)} regione ${T.regionOf(P.x, P.z)}`; });
  const go = (x, z, yaw) => p.evaluate(([x, z, yaw]) => { const P = window.__P; P.x = x; P.z = z; if (yaw != null) P.yaw = yaw; }, [x, z, yaw]);
  // out of Roccanera along the road to Valdoro
  await go(24, 20, Math.atan2(0.76, 0.65)); await p.waitForTimeout(800);
  await p.keyboard.down('w'); await p.waitForTimeout(5000); await p.keyboard.up('w');
  console.log('cammino:', await st());
  console.log('messaggeri:', await p.evaluate(() => ['messenger1', 'messenger2'].map((id) => { const n = window.__S.npcs[id]; return `${id} ${n.ms} ${n.x.toFixed(0)},${n.z.toFixed(0)}`; }).join(' | ')));
  // the mine: in front of the portal, walk in
  const portal = await p.evaluate(() => [window.__terrain.toWorld(-25, 0, 'miniera'), window.__terrain.toWorld(-35, 0, 'miniera')]);
  await go(portal[0][0], portal[0][1], Math.atan2(portal[1][0] - portal[0][0], portal[1][1] - portal[0][1])); await p.waitForTimeout(800);
  await p.keyboard.down('w'); await p.waitForTimeout(5000); await p.keyboard.up('w');
  console.log('miniera:', await st()); await shot('gioco_miniera');
  // Valdoro's square
  const sq = await p.evaluate(() => window.__terrain.toWorld(0, -131, 'valdoro'));
  await go(sq[0], sq[1]); await p.waitForTimeout(1000);
  console.log('piazza:', await st()); await shot('gioco_piazza');
  // the castle: stand by its way out, use it
  await go(4000, 3.4, Math.PI); await p.waitForTimeout(2500);
  await p.keyboard.press('e'); await p.waitForTimeout(7000);
  console.log('uscita dal castello:', await st());
  // the bandits' forest: run along the path, they notice
  const fp = await p.evaluate(() => [window.__terrain.toWorld(0, -40, 'bosco'), window.__terrain.toWorld(5, -46, 'bosco')]);
  await go(fp[0][0], fp[0][1], Math.atan2(fp[1][0] - fp[0][0], fp[1][1] - fp[0][1])); await p.waitForTimeout(1000);
  await p.keyboard.down('Shift'); await p.keyboard.down('w'); await p.waitForTimeout(4000); await p.keyboard.up('w'); await p.keyboard.up('Shift');
  await p.waitForTimeout(2500);
  console.log('bosco:', await st(), 'incontro', await p.evaluate(() => window.__S.enc.state));
  console.log('oggetti:', await p.evaluate(() => window.__picks.filter((k) => ['w1', 'w5', 'w8', 'w11'].includes(k.id)).map((k) => `${k.id} y ${k.y.toFixed(2)} ${window.__terrain.regionOf(k.x, k.z)}`).join(' | ')));
  console.log('persone:', await p.evaluate(() => ['torin', 'bandit3', 'brann', 'mira', 'king'].map((id) => `${id} ${window.__terrain.regionOf(window.__S.npcs[id].x, window.__S.npcs[id].z)}`).join(' | ')));
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
