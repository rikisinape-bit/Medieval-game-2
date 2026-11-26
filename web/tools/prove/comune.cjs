// Shared bits of the browser tests (Playwright with SwiftShader, the dev server on http://localhost:5173)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const OUT = process.env.OUT || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.URL || 'http://localhost:5173/';
// map pixel → world (the world's origin is Roccanera's well, map pixel 860, 708; 1 pixel = 1 metre)
const mw = (px, py) => [px - 860, py - 708];
async function open(width = 860, height = 420) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid=hud3d]', { timeout: 120000 });
  return { browser, page, errors, shot: (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }) };
}
module.exports = { open, mw, OUT };
