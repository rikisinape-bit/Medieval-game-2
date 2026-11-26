// The world from above without fog (dev hooks: window.__nofog, window.__topcam): the centre of the map
const { open, mw } = require('./comune.cjs');
(async () => {
  const { browser, page: p, errors, shot } = await open(960, 540);
  await p.evaluate(() => { window.__nofog = true; const c = window.__terrain.camera; c.far = 4000; c.updateProjectionMatrix(); });
  const view = async (name, cam, pl, wait = 12000) => {
    await p.evaluate(([c, pl]) => { window.__P.x = pl[0]; window.__P.z = pl[1]; window.__topcam = c; }, [cam, pl]);
    await p.waitForTimeout(wait); await shot(name);
  };
  const c = mw(1000, 1000);
  await view('alto_centro', [c[0] + 40, 330, c[1] + 300, c[0], 0, c[1] - 20], c);
  const v = mw(1132, 940);
  await view('alto_valdoro', [v[0] + 80, 60, v[1] - 90, v[0], 0, v[1]], [v[0] - 10, v[1] - 10], 9000);
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
