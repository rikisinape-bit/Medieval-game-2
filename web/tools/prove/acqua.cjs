// The water and the ice: the sea from a beach and from above, the river from its bridges, the ice fields of the north.
// Usage: node tools/prove/acqua.cjs [prefix]  (with `npm run dev` running; pictures in tools/prove/out or OUT)
const { open, mw } = require('./comune.cjs');
const pre = process.argv[2] || 'acqua', SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;   // (SOLO=a,b: only those)
(async () => {
  const { browser, page: p, errors, shot } = await open();
  const at = async (name, from, to, wait = 4500) => {
    if (SOLO && !SOLO.includes(name)) return;
    const [fx, fz] = mw(...from), [tx, tz] = mw(...to);
    await p.evaluate(([fx, fz, tx, tz]) => { window.__topcam = null; const P = window.__P; P.x = fx; P.z = fz; P.yaw = Math.atan2(tx - fx, tz - fz); }, [fx, fz, tx, tz]);
    await p.waitForTimeout(wait); await shot(`${pre}_${name}`);
    console.log(name, await p.evaluate(() => `triangoli ${window.__ri.triangles} chiamate ${window.__ri.calls}`));
  };
  // a free camera at height y above (from), looking at (to) on the water
  const above = async (name, from, y, to, wait = 4500) => {
    if (SOLO && !SOLO.includes(name)) return;
    const [fx, fz] = mw(...from), [tx, tz] = mw(...to);
    await p.evaluate(([fx, fz, tx, tz]) => { const P = window.__P; P.x = fx; P.z = fz; }, [fx, fz, tx, tz]);
    await p.waitForTimeout(1500);
    await p.evaluate(([fx, fz, y, tx, tz]) => { window.__topcam = [fx, y, fz, tx, -12.5, tz]; }, [fx, fz, y, tx, tz]);
    await p.waitForTimeout(wait); await shot(`${pre}_${name}`);
    await p.evaluate(() => { window.__topcam = null; });
  };
  await at('spiaggia_valdoro', [1176, 928], [1240, 935]);
  await at('costa_roccanera', [868, 570], [880, 500]);
  await above('mare_dall_alto', [1170, 900], 22, [1240, 960]);
  await at('ponte_nord', [1150, 1048], [1185, 1095]);
  await at('ponte_ovest', [860, 1210], [895, 1245]);
  await at('ghiaccio_torre', [470, 215], [451, 165]);
  await at('ghiaccio_centro', [855, 165], [850, 110]);
  await at('ghiaccio_est', [1354, 160], [1350, 105]);
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
