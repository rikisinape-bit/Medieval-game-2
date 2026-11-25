// Pictures and heights of the world: the highland and its cliffs, the river and its bridges, the great forest, the
// feet of the mountains; triangles and draws there (the cost on a phone). Usage: node tools/prove/foto.cjs
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
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
