// Pictures and heights of the world: the highland and its cliffs, the river and its bridges, the great forest, the
// feet of the mountains, the great southern forest from outside to its heart (its trees' heights, the sky at its heart),
// the snowy forest of the north-west (inside, looking up, from 150 m); triangles and draws there (the cost on a phone).
// Usage: node tools/prove/foto.cjs
const { open, mw } = require('./comune.cjs');
(async () => {
  const { browser, page: p, errors, shot } = await open();
  console.log(await p.evaluate(() => {
    const t = window.__terrain, h = (px, py) => t.surfaceAt(px - 860, py - 708).toFixed(1);
    return `Roccanera ${h(860, 708)} | Valdoro ${h(1132, 940)} | miniera ${h(1170, 640)} | sopra la scarpata ${h(1010, 945)} sotto ${h(1000, 985)} | foresta ${h(800, 1000)} | fiume ${h(1175, 1083)} | Sulus ${h(1188, 1150)} | Dimirot ${h(949, 1332)}`;
  }));
  const at = async (name, from, to, wait = 4500) => {
    const [fx, fz] = mw(...from), [tx, tz] = mw(...to);
    await p.evaluate(([fx, fz, tx, tz]) => { const P = window.__P; P.x = fx; P.z = fz; P.yaw = Math.atan2(tx - fx, tz - fz); }, [fx, fz, tx, tz]);
    await p.waitForTimeout(wait); await shot(name);
    console.log(name, await p.evaluate(() => `triangoli ${window.__ri.triangles} chiamate ${window.__ri.calls} alberi ${window.__veg.counts.near}/${window.__veg.counts.far} sottobosco ${window.__veg.counts.under}`));
  };
  await at('foto_scarpata_valdoro', [1000, 1010], [1060, 940]);
  await at('foto_ponte_nord', [1150, 1048], [1185, 1095]);
  await at('foto_ponte_ovest', [860, 1210], [895, 1245]);
  await at('foto_foresta', [780, 1000], [760, 1060], 6000);
  await at('foto_piedi_nord', [1050, 640], [1060, 470]);
  await at('foto_colline', [930, 760], [1030, 850]);
  // the great southern forest from outside to its heart: the deeper, the taller its trees (vegetation.js growth)
  const tall = [];
  for (const [name, px, py] of [['fuori', 960, 1040], ['bordo', 900, 1040], ['metà', 840, 1040], ['cuore', 780, 1040]]) {
    const [x, z] = mw(px, py);
    await p.evaluate(([x, z]) => { const P = window.__P; P.x = x; P.z = z; P.yaw = -Math.PI / 2; }, [x, z]);
    await p.waitForTimeout(3000);
    tall.push(`${name} ${await p.evaluate(([x, z]) => { const v = window.__veg, l = v.treesNear(x, z, 30).filter((t) => t.id.startsWith('albero')); return l.length ? (l.reduce((s, t) => s + v.heightOf(t), 0) / l.length).toFixed(1) : '-'; }, [x, z])} m`);
  }
  console.log('foresta dal bordo al cuore (altezza media degli alberi del kit entro 30 m):', tall.join(', '));
  await p.evaluate(() => { const P = window.__P, s = window.__terrain.surfaceAt(P.x, P.z); window.__topcam = [P.x, s + 1.7, P.z, P.x - 3, s + 9, P.z]; });
  await p.waitForTimeout(2500); await shot('foto_foresta_cuore_cielo'); await p.evaluate(() => { window.__topcam = null; });
  // the snowy forest (the user's pines and snowy trees of 27/11): inside, the sky above it, and from 150 m away
  await at('foto_bosco_neve', [450, 450], [470, 520], 6000);
  await p.evaluate(() => { const P = window.__P, s = window.__terrain.surfaceAt(P.x, P.z); window.__topcam = [P.x, s + 1.7, P.z, P.x + Math.sin(P.yaw) * 4, s + 9, P.z + Math.cos(P.yaw) * 4]; });
  await p.waitForTimeout(2500); await shot('foto_bosco_neve_cielo'); await p.evaluate(() => { window.__topcam = null; });
  await at('foto_bosco_neve_150m', [450, 300], [450, 450], 5000);
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
