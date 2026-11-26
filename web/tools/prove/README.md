# Prove nel browser (Playwright, SwiftShader)

Script usati per provare il mondo di Vasilad. Con il server di sviluppo acceso (`cd web && npm run dev`, porta 5173):

- `node tools/prove/gioco.cjs` — si cammina fuori da Roccanera, i messaggeri, la miniera, la piazza di Valdoro, l'uscita
  dal castello, l'agguato nel bosco dei banditi, oggetti e persone nella loro regione.
- `node tools/prove/foto.cjs` — altezze dei luoghi e foto: scarpata di Valdoro, ponti, foresta, piedi delle montagne,
  colline; triangoli e chiamate di disegno in ognuna (il peso sul telefono).
- `node tools/prove/alto.cjs` — il centro della mappa dall'alto senza nebbia.
- `URL=http://localhost:4173/ node tools/prove/produzione.cjs` — la versione pubblicata (`npm run build:artifact`, poi
  `npx vite preview --port 4173`): parte, non chiede file immagine, la mappa del menu si apre.

Le foto finiscono in `tools/prove/out/` (non salvata in git; altrove con `OUT=...`). SwiftShader è lento (pochi
fotogrammi al secondo): i tempi di attesa sono larghi apposta. Agganci di sviluppo usati (solo con `npm run dev`):
`window.__P` (giocatore), `window.__S` (stato), `window.__picks`, `window.__terrain` (`surfaceAt`, `toWorld`,
`toLegacy`, `regionOf`, `camera`, `terrain`), `window.__veg` (alberi: `counts`), `window.__ri` (triangoli e chiamate
dell'ultimo fotogramma), `window.__topcam = [x,y,z, lx,ly,lz]` (telecamera libera), `window.__nofog = true`.
