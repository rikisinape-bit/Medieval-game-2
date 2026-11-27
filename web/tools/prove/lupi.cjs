// The wolves (wolves.js): the pack hunts you by its den, your blows hurt them, one of them gives in, a ham (bought from
// Lena at Roccanera's market) tames it; it follows you, stays and follows again on your orders (its dialog), bites a
// bandit fighting you and comes into the castle with you. Usage: node tools/prove/lupi.cjs (with `npm run dev` running)
const { open } = require('./comune.cjs');
const WZ = -104;
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const W = () => p.evaluate(() => window.__wolves.all.map((w) => ({ id: w.id, x: w.x, z: w.z, hp: Math.round(w.hp), alive: w.alive, sub: w.sub, tame: w.tame, hostile: w.hostile, yields: w.yields, cur: w.cur, down: w.down })));
  const go = (x, z, yaw) => p.evaluate(([x, z, yaw]) => { const P = window.__P; P.x = x; P.z = z; if (yaw != null) P.yaw = yaw; P.hp = 100; }, [x, z, yaw]);
  const heal = () => p.evaluate(() => { window.__P.hp = 100; });
  // (in game seconds: with SwiftShader the game runs at about a quarter of the real speed)
  const gameT = () => p.evaluate(() => window.__S.dayT * 600);
  const wait = async (s) => { const t0 = await gameT(); while ((await gameT()) - t0 < s) { await heal(); await p.waitForTimeout(500); } };
  const prompt = () => p.evaluate(() => document.querySelector('[data-testid=village3d-prompt]')?.textContent || '');
  const face = (w, d = 1.7) => p.evaluate(([wx, wz, d]) => { const P = window.__P, a = Math.atan2(P.x - wx, P.z - wz); P.x = wx + Math.sin(a) * d; P.z = wz + Math.cos(a) * d; P.yaw = Math.atan2(wx - P.x, wz - P.z); P.hp = 100; }, [w.x, w.z, d]);
  const order = async (label) => {
    await p.keyboard.press('e');
    await p.waitForSelector('[data-testid=interact-options][data-ready="1"]', { timeout: 15000 });
    await p.click(`[data-testid=interaction-dialog] button:has-text("${label}")`);
    await p.waitForTimeout(800);
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const me = () => p.evaluate(() => ({ x: window.__P.x, z: window.__P.z }));

  // 1. by the den: they notice you and come
  await go(-30, 350, 0); await wait(5);
  let w = await W();
  console.log('caccia:', w.filter((x) => x.hostile).length, 'lupi ostili, il più vicino a', Math.min(...w.map((x) => dist(x, { x: -30, z: 350 }))).toFixed(1), 'm');
  await shot('lupi_caccia');
  // 2. a real blow (J) on the nearest
  // (it may step aside before the blade comes down: up to three tries, facing it again each time)
  let t1, t1b;
  for (let k = 0; k < 3; k++) {
    w = await W(); const pos = await me(); t1 = w.filter((x) => x.alive && !x.sub).sort((a, b) => dist(a, pos) - dist(b, pos))[0];
    await face(t1); await p.waitForTimeout(200); await p.keyboard.press('j'); await wait(1);
    t1b = (await W()).find((x) => x.id === t1.id);
    if (t1b.hp < t1.hp) break;
  }
  console.log('colpo vero:', t1.id, 'vita', t1.hp, '->', t1b.hp);
  // 3. the one that gives in, the others killed
  for (const x of await W()) {
    for (let k = 0; k < 12; k++) {
      const cur = (await W()).find((y) => y.id === x.id);
      if (!cur.alive || cur.sub) break;
      await p.evaluate((id) => { const o = window.__wolves.all.find((y) => y.id === id); window.__wolves.hit(o, 9); }, x.id);
      await p.waitForTimeout(150);
    }
  }
  w = await W();
  console.log('dopo la lotta:', w.map((x) => `${x.id} ${x.alive ? (x.sub ? 'si è arreso' : 'vivo') : 'morto'}`).join(', '));
  console.log('pellicce a terra:', await p.evaluate(() => window.__S.drops.filter((d) => d.item === 'pelliccia').length));
  // 4. no ham: it wants one; a ham bought from Lena at Roccanera's market (her shop); back to it: tamed
  const sub = w.find((x) => x.sub);
  await p.evaluate(() => { delete window.__P.inv.prosciutto; });
  await face(sub, 1.6); await wait(1);
  console.log('senza prosciutto:', JSON.stringify(await prompt()));
  const lenaAt = () => p.evaluate(() => ({ x: window.__S.npcs.lena.x, z: window.__S.npcs.lena.z }));
  await face(await lenaAt(), 1.4); await wait(2);
  // (she may have taken a step; others pass by her stall, and bodies do not go through each other: from another side)
  for (let k = 0; k < 12 && !(await prompt()).includes('Lena'); k++) {
    const l = await lenaAt(), a = (k / 12) * Math.PI * 2, d = 1.1 + (k % 3) * 0.15;
    await p.evaluate(([x, z, a, d]) => { const P = window.__P; P.x = x + Math.sin(a) * d; P.z = z + Math.cos(a) * d; P.yaw = a + Math.PI; P.hp = 100; }, [l.x, l.z, a, d]);
    await p.waitForTimeout(900);
  }
  console.log('davanti a Lena:', JSON.stringify(await prompt()));
  await p.keyboard.press('e');
  await p.waitForSelector('[data-testid=interact-options][data-ready="1"]', { timeout: 15000 });
  await p.click('[data-testid=interaction-dialog] button:has-text("Commercia")');
  await p.waitForSelector('[data-testid=shop-buy-prosciutto-btn]', { timeout: 15000 });
  const gold0 = await p.evaluate(() => window.__P.gold);
  await p.click('[data-testid=shop-buy-prosciutto-btn]'); await p.waitForTimeout(600);
  await shot('lupi_negozio');
  console.log('da Lena:', await p.evaluate(() => window.__P.inv.prosciutto || 0), 'prosciutto per', gold0 - (await p.evaluate(() => window.__P.gold)), 'oro');
  await p.click('[data-testid=shop-close]'); await p.waitForTimeout(600);
  await face(sub, 1.6); await wait(1);
  console.log('con il prosciutto:', JSON.stringify(await prompt()));
  await shot('lupi_arreso');
  await p.keyboard.press('e'); await wait(3);
  w = await W(); const tame = w.find((x) => x.tame);
  console.log('addomesticato:', tame ? `${tame.id} (vita ${tame.hp})` : 'NO', '| prosciutti rimasti:', await p.evaluate(() => window.__P.inv.prosciutto || 0));
  // 5. it follows
  const start = await me();
  await go(start.x + 22, start.z - 8, Math.PI / 2); await wait(8);
  let pos2 = await me(), tw = (await W()).find((x) => x.tame);
  console.log('segue:', dist(tw, pos2).toFixed(1), 'm da te');
  await shot('lupi_segue');
  // 6. "Resta qui", then you go away
  tw = (await W()).find((x) => x.tame); await face(tw, 2.0); await wait(1);
  console.log('prompt davanti al tuo lupo:', JSON.stringify(await prompt()));
  await order('Resta qui');
  const spot = (await W()).find((x) => x.tame);
  pos2 = await me(); await go(pos2.x - 30, pos2.z + 5, -Math.PI / 2); await wait(6);
  tw = (await W()).find((x) => x.tame);
  console.log('resta:', dist(tw, spot).toFixed(1), 'm dal suo posto, a', dist(tw, await me()).toFixed(1), 'm da te, animazione', tw.cur);
  await shot('lupi_resta');
  // 7. "Seguimi"
  await face(tw, 2.0); await wait(1);
  await order('Seguimi');
  pos2 = await me(); await go(pos2.x + 18, pos2.z + 12, 0.6); await wait(7);
  tw = (await W()).find((x) => x.tame);
  console.log('di nuovo segue:', dist(tw, await me()).toFixed(1), 'm da te');
  // 8. a bandit after you: your wolf bites it
  pos2 = await me();
  await p.evaluate(([x, z]) => { const n = window.__S.npcs.bandit1; Object.assign(n, { x: x + 6, z: z + 3, hostile: true, alive: true, hp: n.hpMax, goTo: null, alert: 0, actT: null, state: 'idle', nav: null }); }, [pos2.x, pos2.z]);
  const hp0 = await p.evaluate(() => window.__S.npcs.bandit1.hp);
  await wait(8);
  const b1 = await p.evaluate(() => ({ hp: Math.round(window.__S.npcs.bandit1.hp), alive: window.__S.npcs.bandit1.alive }));
  tw = (await W()).find((x) => x.tame);
  console.log('contro il bandito:', `vita del bandito ${hp0} -> ${b1.hp}${b1.alive ? '' : ' (morto)'}`, '| il tuo lupo:', tw.hp, tw.down > 0 ? '(a terra)' : '');
  await shot('lupi_bandito');
  await p.evaluate(() => { const n = window.__S.npcs.bandit1; if (n.alive) n.hostile = false; });
  // 9. into the castle: it comes in with you
  const door = await p.evaluate((WZ) => [window.__terrain.toWorld(0, WZ - 28.6, 'valdoro'), window.__terrain.toWorld(0, WZ - 31, 'valdoro')], WZ);
  await go(...door[0], Math.atan2(door[1][0] - door[0][0], door[1][1] - door[0][1])); await wait(2);
  await p.keyboard.press('e'); await p.waitForTimeout(6000); await wait(2);
  tw = (await W()).find((x) => x.tame);
  console.log('castello:', (await me()).x > 3000 ? 'sei dentro' : 'NON sei dentro', '| il lupo', tw.x > 3000 ? `è dentro con te (a ${dist(tw, await me()).toFixed(1)} m)` : 'è rimasto fuori');
  // through the hall: it follows in the castle's rooms too
  const h0 = await me();
  await p.keyboard.down('w'); await wait(2.5); await p.keyboard.up('w'); await wait(3);
  tw = (await W()).find((x) => x.tame);
  console.log('nelle sale:', `hai fatto ${dist(h0, await me()).toFixed(1)} m, il lupo è a ${dist(tw, await me()).toFixed(1)} m da te`);
  await shot('lupi_castello');
  console.log('salvato:', JSON.stringify(await p.evaluate(() => window.__S.flags.lupi)));
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
