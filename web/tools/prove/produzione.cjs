// The published build (npm run build:artifact, then npx vite preview --port 4173): it starts, no image files are
// fetched (the published page cannot serve them: they are inside the code), the map in the menu opens, no errors.
// Usage: URL=http://localhost:4173/ node tools/prove/produzione.cjs
const { open } = require('./comune.cjs');
(async () => {
  process.env.URL = process.env.URL || 'http://localhost:4173/';
  const { browser, page: p, errors, requests, shot } = await open();
  await p.waitForTimeout(3000);
  await p.click('[data-testid=village3d-menu-btn]'); await p.waitForTimeout(600);
  await p.click('[data-testid=menu-tab-map]'); await p.waitForTimeout(1500);
  await shot('produzione_mappa');
  // (every request since the page was opened: the loading too)
  const files = requests.filter((u) => !/\.(js|css|woff2?|html)$/.test(u) && !/^(data|blob):/.test(u) && u.replace(/\/$/, '') !== process.env.URL.replace(/\/$/, ''));
  console.log('file non di codice chiesti:', files.length ? files : 'nessuno');
  console.log('errori:', errors.length ? errors.slice(0, 6) : 'nessuno');
  await browser.close();
})();
