// The game saved while locked in Roccanera's cage starts again (27/11: it stopped with "Cannot access ... before
// initialization": the cage's keeper was called before his function existed). Usage: node tools/prove/gabbia.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage({ viewport: { width: 860, height: 420 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const URL = process.env.URL || 'http://localhost:5173/';
  await p.goto(URL); await p.waitForSelector('[data-testid=hud3d]', { timeout: 120000 }); await p.waitForTimeout(7000);
  const saved = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('vasilad.v1')); s.flags = { ...(s.flags || {}), cage: true, cageKeeper: null, cageOpen: false }; return JSON.stringify(s); });
  await p.close();
  const ctx = await browser.newContext({ viewport: { width: 860, height: 420 } });
  await ctx.addInitScript((s) => localStorage.setItem('vasilad.v1', s), saved);
  const q = await ctx.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(URL); const p2 = q;
  const r = await Promise.race([p2.waitForSelector('[data-testid=hud3d]', { timeout: 120000 }).then(() => 'partito'), p2.waitForSelector('[data-testid=start-failure]', { timeout: 120000 }).then(async () => 'ERRORE: ' + await p2.textContent('[data-testid=start-failure]'))]);
  console.log('salvato nella gabbia:', r, errs.slice(0, 3));
  await browser.close();
})();
