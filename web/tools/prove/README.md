# Prove nel browser (Playwright, SwiftShader)

Script usati per provare il mondo di Vasilad. Con il server di sviluppo acceso (`cd web && npm run dev`, porta 5173):

- `node tools/prove/gioco.cjs` — si cammina fuori da Roccanera, i messaggeri, la miniera, la piazza di Valdoro, l'uscita
  dal castello, l'agguato nel bosco dei banditi, oggetti e persone nella loro regione.
- `node tools/prove/foto.cjs` — altezze dei luoghi e foto: scarpata di Valdoro, ponti, foresta, piedi delle montagne,
  colline, la grande foresta dal bordo al cuore (altezza media dei suoi alberi, il cielo nel cuore), il bosco innevato
  del nord-ovest (da dentro, il cielo sopra, da 150 m); triangoli e chiamate di disegno in ognuna (il peso sul
  telefono).
- `node tools/prove/alto.cjs` — il centro della mappa dall'alto senza nebbia.
- `node tools/prove/inseguimento.cjs` — gli inseguitori trovano la strada (`nav.js`) e le porte si aprono per chi ha il
  diritto: un bandito dietro una casa di Roccanera; una guardia dentro Valdoro con la saracinesca chiusa e tu fuori (la
  saracinesca si alza, poi si richiude); una guardia nella piazza e tu nel castello (entra dalla porta); tu in una cella
  chiusa (la guardia la apre); tu nella gabbia di Roccanera chiusa (una sua guardia gira fino alla porta e la apre).
  I tempi sono in secondi veri: con SwiftShader il gioco va a ~1/4 della velocità.
- `node tools/prove/lupi.cjs` — i lupi: il branco ti caccia vicino alla tana, un colpo vero (J) ne ferisce uno, uno si
  arrende e gli altri muoiono (pellicce a terra), il messaggio senza prosciutto, il prosciutto comprato da Lena al
  mercato di Roccanera (il suo negozio), il messaggio con il prosciutto, l'addomesticamento, il
  lupo che ti segue, "Resta qui" (resta seduto mentre ti allontani) e "Seguimi" dal suo dialogo, il lupo che morde un
  bandito che ti attacca, il lupo che entra con te nel castello. I tempi in secondi di gioco.
- `node tools/prove/goblin.cjs` — il goblin: di giorno non c'è; di notte esce vicino alla sua tana (bosco innevato del
  nord-ovest); ti vede, ti caccia e ti artiglia; un colpo vero (J) lo ferisce; ucciso lascia l'oro e quella notte non
  torna; il giorno dopo il corpo sparisce, la notte dopo esce di nuovo; all'alba, se non combatte, se ne va.
- `node tools/prove/acqua.cjs [prefisso]` — foto dell'acqua e del ghiaccio: il mare da una spiaggia vicino a Valdoro e
  dalla costa di Roccanera, il fiume dai due ponti, i tre campi di ghiaccio del nord (`SOLO=nome1,nome2` solo quelle).
- `node tools/prove/gabbia.cjs` — il gioco salvato mentre sei chiuso nella gabbia di Roccanera riparte (la guardia torna a
  sorvegliare); `URL=...` per provarlo sulla versione pubblicata.
- `URL=http://localhost:4173/ node tools/prove/produzione.cjs` — la versione pubblicata (`npm run build:artifact`, poi
  `npx vite preview --port 4173`): parte, non chiede file immagine, la mappa del menu si apre.

Le foto finiscono in `tools/prove/out/` (non salvata in git; altrove con `OUT=...`). SwiftShader è lento (pochi
fotogrammi al secondo): i tempi di attesa sono larghi apposta. Agganci di sviluppo usati (solo con `npm run dev`):
`window.__P` (giocatore), `window.__S` (stato), `window.__picks`, `window.__terrain` (`surfaceAt`, `toWorld`,
`toLegacy`, `regionOf`, `camera`, `terrain`), `window.__veg` (alberi: `counts`, `trunksIn`), `window.__nav` (`path`),
`window.__npcs`, `window.__ai`, `window.__wolves` (`all`, `hit`, `order`), `window.__goblin` (`g`, `hit`, `summon`), `window.__veg.rocksNear`,
`window.__veg.treesNear`, `window.__veg.heightOf` (altezza di un albero), `window.__veg.addFixed` (alberi in più per
una prova), `window.__impostors` (atlante delle sagome: misura, millisecondi per farlo, i suoi due bersagli), `window.__ri` (triangoli e chiamate
dell'ultimo fotogramma), `window.__topcam = [x,y,z, lx,ly,lz]` (telecamera libera), `window.__nofog = true`.
