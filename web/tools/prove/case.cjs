// Roccanera's houses (28/11, the user's thatched house): the village from above, two houses from the square, inside one
// (from the door to the hearth, along the wing), walking in through the front door and against a wall, a villager
// walking home to her bed at night and out in the morning, only what is under the central dot looked at (first and
// third person), the people of a house asleep in its beds at night.
// Usage: node tools/prove/case.cjs   (SOLO=alto,fuori,dentro,muri,cammino,mira,notte: only those)
const { open } = require('/home/user/Medieval-game-2/web/tools/prove/comune.cjs');
const ONLY = process.env.SOLO ? process.env.SOLO.split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
(async () => {
  const { browser, page: p, errors, shot } = await open(1000, 620);
  await p.evaluate(() => { window.__S.dayT = 0.45; });
  // a house's own metres -> world (as engine.js toWorld)
  const W = (h, lx, lz) => [h.x + Math.cos(h.r) * lx + Math.sin(h.r) * lz, h.z - Math.sin(h.r) * lx + Math.cos(h.r) * lz];
  const H = await p.evaluate(() => window.__houses.slice(0, 6).map((h) => ({ i: h.i, x: h.x, z: h.z, r: h.r, casa: !!h.casa })));
  console.log('case di Roccanera:', H.map((h) => `${h.i}${h.casa ? ' (paglia)' : ''} ${h.x.toFixed(1)},${h.z.toFixed(1)}`).join(' | '));
  const cam = async (name, from, to, player, wait = 6000) => {
    await p.evaluate(([c, pl]) => { window.__P.x = pl[0]; window.__P.z = pl[1]; window.__topcam = c; }, [[...from, ...to], player || [from[0], from[2]]]);
    await p.waitForTimeout(wait); await shot(name);
  };
  const ri = () => p.evaluate(() => ({ tris: window.__ri.triangles, calls: window.__ri.calls }));
  if (want('alto')) {
    await p.evaluate(() => { window.__nofog = true; const c = window.__terrain.camera; c.far = 4000; c.updateProjectionMatrix(); });
    await cam('case_alto', [0, 80, 0.01], [0, 0, 0], [0, 40], 14000);
    await p.evaluate(() => { window.__nofog = false; });
  }
  if (want('fuori')) {
    const h = H[3], [ox, oz] = W(h, 1.5, 15), [tx, tz] = W(h, 0, 0);
    await cam('case_fuori', [ox, 1.7, oz], [tx, 2.6, tz], null, 9000); console.log('fuori:', await ri());
    const g = H[0], [ax, az] = W(g, 9, 9), [bx, bz] = W(g, 0, -0.5);
    await cam('case_fuori2', [ax, 2.2, az], [bx, 2.0, bz]);
    const [cx, cz] = W(g, 0, 7.2), [dx, dz] = W(g, 0, 3);
    await cam('case_porta', [cx, 1.65, cz], [dx, 1.4, dz]);
  }
  if (want('dentro')) {
    const h = H[3];
    const [ax, az] = W(h, 0.3, 4.2), [bx, bz] = W(h, 0, -4.4);
    await cam('case_dentro', [ax, 1.65, az], [bx, 1.0, bz]); console.log('dentro:', await ri());
    const [cx, cz] = W(h, -4.2, -2.2), [dx, dz] = W(h, 4.6, -3.6);
    await cam('case_ala', [cx, 1.65, cz], [dx, 0.9, dz]);
    const [ex, ez] = W(h, 4.3, -2.0), [fx, fz] = W(h, -2.2, 1.2);
    await cam('case_ala2', [ex, 1.65, ez], [fx, 1.1, fz]);
  }
  await p.evaluate(() => { window.__topcam = null; });
  if (want('muri')) {
    // in through the front door of house 3, then on against the far wall of its stem (its side, local +x)
    const h = H[3], [sx, sz] = W(h, 0, 7.5);
    await p.evaluate(([x, z, yaw]) => { Object.assign(window.__P, { x, z, yaw }); }, [sx, sz, h.r + Math.PI]);
    await p.waitForTimeout(1500);
    await p.keyboard.down('w'); await p.waitForTimeout(9000); await p.keyboard.up('w');
    const inside = await p.evaluate(() => window.__houseOf(window.__P.x, window.__P.z));
    const loc = await p.evaluate((h) => { const P = window.__P, dx = P.x - h.x, dz = P.z - h.z; return [Math.cos(h.r) * dx - Math.sin(h.r) * dz, Math.sin(h.r) * dx + Math.cos(h.r) * dz]; }, h);
    console.log('entrato dalla porta:', inside === h.i ? 'sì' : `no (${inside})`, 'posto nella casa', loc.map((v) => v.toFixed(2)).join(', '));
    // from the stem (by the front door, past the table) towards local +x: the stem's side wall (inner face 1.47)
    const [mx, mz] = W(h, -0.8, 3.4);
    await p.evaluate(([x, z, yaw]) => { Object.assign(window.__P, { x, z, yaw }); }, [mx, mz, h.r + Math.PI / 2]);
    await p.keyboard.down('w'); await p.waitForTimeout(5000); await p.keyboard.up('w');
    const loc2 = await p.evaluate((h) => { const P = window.__P, dx = P.x - h.x, dz = P.z - h.z; return [Math.cos(h.r) * dx - Math.sin(h.r) * dz, Math.sin(h.r) * dx + Math.cos(h.r) * dz]; }, h);
    console.log('contro il muro del corpo della T (x della casa < 1.25):', loc2[0].toFixed(2), loc2[0] < 1.25 ? 'fermo' : 'PASSATO');
  }
  if (want('cammino')) {
    // Elsa (house 3) walks home by herself at night (outside the front door, along the stem, into the wing, to her
    // bed's side), and out again in the morning; game seconds (dayT * 600)
    const gameT = () => p.evaluate(() => window.__S.dayT * 600);
    const h = H[3], [sx, sz] = W(h, 2.5, 9);
    await p.evaluate(([x, z]) => { const n = window.__S.npcs.elsa; Object.assign(n, { x, z, sleepAt: null, exitTo: null, actT: null }); window.__S.dayT = 0.86; window.__P.x = x + 6; window.__P.z = z + 6; }, [sx, sz]);
    const t0 = await gameT(); let got = null, stuck = 0, last = null;
    while ((await gameT()) - t0 < 60) {
      await p.waitForTimeout(1500);
      const e = await p.evaluate(() => { const n = window.__S.npcs.elsa; return { x: n.x, z: n.z, at: n.sleepAt && Math.hypot(n.x - n.sleepAt[0], n.z - n.sleepAt[1]), via: n.viaI, home: window.__houseOf(n.x, n.z) }; });
      if (last && Math.hypot(e.x - last.x, e.z - last.z) < 0.05 && !(e.at < 0.4)) stuck++; last = e;
      if (e.at != null && e.at < 0.4) { got = (await gameT()) - t0; break; }
    }
    console.log('Elsa a letto da sola:', got != null ? `sì, in ${got.toFixed(0)} s di gioco` : `NO (ferma ${stuck} volte, ultimo punto ${last && [last.x.toFixed(1), last.z.toFixed(1), 'via', last.via, 'casa', last.home].join(' ')})`);
    await p.evaluate(() => { window.__S.dayT = 0.3; });
    const t1 = await gameT(); let out = null;
    while ((await gameT()) - t1 < 50) {
      await p.waitForTimeout(1500);
      const e = await p.evaluate(() => { const n = window.__S.npcs.elsa; return { home: window.__houseOf(n.x, n.z), exit: !!n.exitTo }; });
      if (e.home < 0 && !e.exit) { out = (await gameT()) - t1; break; }
    }
    console.log('Elsa uscita di casa al mattino:', out != null ? `sì, in ${out.toFixed(0)} s di gioco` : 'NO');
  }
  if (want('mira')) {
    // only what is under the central dot is looked at (28/11): the chest of house 3 from 1.3 m, looking straight on
    // (over it) and then down at it; turned away. Third person (nearer, from behind and above): Elsa 2.2 m ahead (within reach), then aside
    await p.evaluate(() => { window.__S.dayT = 0.45; });
    const prompt = () => p.evaluate(() => document.querySelector('[data-testid=village3d-prompt]')?.textContent || '');
    const h = H[3], [cx, cz] = W(h, 2.15, -3.0);
    const stand = (x, z, yaw, pitch) => p.evaluate(([x, z, yaw, pitch]) => { Object.assign(window.__P, { x, z, yaw }); window.__pitch(pitch); }, [x, z, yaw, pitch]);
    await stand(cx, cz, h.r + Math.PI, 0); await p.waitForTimeout(2500);
    const a = await prompt();
    await stand(cx, cz, h.r + Math.PI, Math.atan2(0.4 - 1.62, 1.3)); await p.waitForTimeout(2500);
    const b = await prompt();
    await stand(cx, cz, h.r + Math.PI / 2, Math.atan2(0.4 - 1.62, 1.3)); await p.waitForTimeout(2500);
    const c = await prompt();
    console.log('baule: dritto', JSON.stringify(a), '| giù sul baule', JSON.stringify(b), '| girato', JSON.stringify(c));
    await p.click('[data-testid=village3d-camera-btn]'); await p.waitForTimeout(500);
    const elsa = async (dyaw) => {
      await p.evaluate((dyaw) => { const n = window.__S.npcs.elsa, P = window.__P, a = 0.6; n.actT = 99; n.goTo = null; P.x = n.x + Math.sin(a) * 2.2; P.z = n.z + Math.cos(a) * 2.2; P.yaw = Math.atan2(n.x - P.x, n.z - P.z) + dyaw; window.__pitch(0); }, dyaw);   // (Elsa stays where she is)
      await p.waitForTimeout(2500); return prompt();
    };
    const e1 = await elsa(0); await shot('case_terza');
    const cam = await p.evaluate(() => { const c = window.__terrain.camera.position, P = window.__P; return [Math.hypot(c.x - P.x, c.z - P.z), c.y - window.__terrain.surfaceAt(P.x, P.z)]; });
    const e2 = await elsa(0.6);
    console.log('terza persona: telecamera a', cam[0].toFixed(2), 'm dietro, alta', cam[1].toFixed(2), 'm | Elsa sotto il punto', JSON.stringify(e1), '| di lato', JSON.stringify(e2));
    await p.click('[data-testid=village3d-camera-btn]'); await p.waitForTimeout(500);
  }
  if (want('notte')) {
    // night: the people of Roccanera go home; they are brought to their beds' side, and lie down
    await p.evaluate(() => { window.__S.dayT = 0.9; });
    await p.waitForTimeout(2500);
    const n = await p.evaluate(() => { let k = 0; window.__npcs.forEach((n) => { if (n.home != null && n.home < 6 && n.sleepAt) { n.x = n.sleepAt[0]; n.z = n.sleepAt[1]; n.viaI = n.sleepVia.length; k++; } }); return k; });
    await p.waitForTimeout(3000);
    const asleep = await p.evaluate(() => window.__npcs.filter((n) => n.home != null && n.home < 6).map((n) => `${n.id}:${n.home}:${n.sleepAt ? 'letto' : '-'}`).join(' '));
    console.log('a letto', n, '|', asleep);
    const h = H[0], [ax, az] = W(h, 0.6, -2.0), [bx, bz] = W(h, 4.4, -4.3);
    await cam('case_notte', [ax, 1.75, az], [bx, 0.5, bz]);
    const [cx, cz] = W(h, -0.6, -2.0), [dx, dz] = W(h, -4.4, -4.3);
    await cam('case_notte2', [cx, 1.75, cz], [dx, 0.5, dz]);
  }
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
