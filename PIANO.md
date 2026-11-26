# PIANO.md — Roccanera & Valdoro: da Three.js a Godot (dark fantasy)

## 0. Istruzioni da incollare nel progetto (Custom instructions)

```
Rispondi sempre in italiano. Il progetto è un gioco 3D medievale dark fantasy in prima persona,
nato in Three.js/React e da portare in Godot 4 (GDScript), pensato per telefono (touch, orizzontale).
Consulta PIANO.md e gli script caricati prima di rispondere. Non cambiare la logica di gioco esistente
(AI, reputazione, dialoghi, crimini/testimoni) se non richiesto: portala fedelmente.
Lavora a fasi, una per volta, con file completi e pronti da copiare (percorso del file in testa).
Dichiara cosa non hai potuto testare. Risposte brevi: sono su schermo di telefono.
```

## 1. Situazione attuale

Gioco funzionante in **Three.js + React** (nel browser), con backend per il salvataggio (`/api/world`, slot `village3d`).
Mobile-first: joystick, pulsanti touch, avviso "ruota il telefono".

### File sorgente (cartella `src/game3d/` + componenti)
| File | Ruolo |
|---|---|
| `engine.js` | Motore: scena, giocatore, combattimento, giorno/notte, carrozza, messaggeri, salvataggio |
| `models.js` | Modelli procedurali a blocchi (`makeHuman`, `makeHouse`, `makeTree`...), materiali in cache |
| `world.js` | Dati mondo: `NPC_DEFS` (25 PNG con routine), `HOUSES`, `CHESTS`, `PICKUPS`, `ROUTE`, regioni |
| `items.js` | `ITEMS`, `SHOPS`, `LOOT_OF`, riduzione danni, prezzi |
| `ai.js` | AI dei PNG: priorità combattimento > panico > allerta > sospetto > ordini > routine |
| `dialogs.js` | Dialoghi con opzioni + `applyEffect` (tutte le conseguenze) |
| `fx.js` | Particelle a cubetti (`burst`) |
| `audio.js` | Audio sintetizzato con Web Audio (nessun file) |
| `Village3D.jsx` | App: HUD, hooks, log, pulsanti touch, salvataggio ogni 5 s |
| `Inventory.jsx`, `Shop.jsx`, `InteractionDialog.jsx`, `TouchControls.jsx` | UI React |
| `index.css` | Tema pergamena scuro (Cinzel, IM Fell English, VT323) |

Non rilevanti: componenti `components/ui/*` di shadcn (es. accordion).

### Meccaniche già presenti
- Prima persona, movimento, schivata (i-frame), parata (perfetta = contrattacco x2), combo x3, colpo alle spalle
- Giorno/notte (600 s per ciclo), atmosfera per regione, lanterne, torcia
- PNG con routine, sonno nei letti di notte, case con porte
- Crimini con testimoni, grida, guardie che si allertano, cadaveri scoperti
- Reputazione doppia: `rep.village` e `rep.crown`; `known.crown` = ciò che Valdoro sa (portato dai messaggeri a cavallo)
- Porte di Valdoro: si aprono con `known.crown >= 30`
- Negozi, inventario, equipaggiamento (mano, corpo, testa, mano sinistra), bottino dai morti
- Imboscate dei banditi nel bosco (pedaggio, intimidazione, combattimento), Capo Morn, missione testa
- Miniera con argento, carrozza della Corona derubabile, cavalli montabili

### Costanti del mondo
- Villaggio Roccanera al centro (0,0); foresta a nord (z negativo, da `FZ = -36`); mura di Valdoro a `WZ = FZ - 68 = -104`; miniera a ovest (`CX = -45`)
- Regioni: `village`, `forest`, `mine`, `valdoro` (funzione `regionOf`)
- Unità: 1 = 1 metro. Y verso l'alto. **Lo yaw usa +Z come "avanti"** (Godot usa -Z: `rot_y = yaw + PI`, vedi `Data.yaw_to_godot`)
- Ciclo giorno: `DAY_LEN = 600` s; notte quando l'elevazione solare è sotto 0.05

## 2. Decisione presa

Porting in **Godot 4**, a strati. Si sceglie Godot (non Unreal): GDScript simile a JS, progetto leggero, export Android buono.
Si tiene la **logica e i dati**; si riscrive rendering, collisioni, input, UI.

## 3. Mappatura Three.js → Godot

| Three.js / progetto | Godot |
|---|---|
| `scene.add(mesh)` | nodo figlio nella scena |
| `makeHouse()`, `makeTree()`... | scene `.tscn` riusabili, istanziate da `world.gd` |
| `frame()` | `_physics_process(delta)` nei singoli nodi |
| Giocatore `P` | `CharacterBody3D` con `player.gd` |
| Stato `S` + `hooks` | Autoload `GameState.gd` + Autoload `EventBus.gd` (segnali) |
| `collide()` / `pushOut()` | collisioni native (`CollisionShape3D`) |
| `walkTo()` / `step()` | `NavigationAgent3D` |
| `sees()` | cono di vista + `RayCast3D` |
| `regionOf()` | `Area3D` per regione |
| `NPC_DEFS`, `ITEMS`, `SHOPS`, `HOUSES` | JSON o `Resource` |
| `applyEffect` | Autoload `DialogEffects.gd` con dizionario di funzioni |
| Dialoghi | JSON (o plugin Dialogic) |
| `fx.burst` | `GPUParticles3D` / `CPUParticles3D` one-shot |
| `audio.js` | `AudioStreamPlayer3D` + file audio (vedi fase 7) |
| React HUD/Inventory/Shop/Dialog | scene `Control` + `Theme` unico + segnali |
| Backend `/api/world` | `user://savegame.json` con `FileAccess` |
| Joystick/pulsanti | `InputMap` + `TouchScreenButton` (plugin Virtual Joystick) |
| Pausa assente | `get_tree().paused = true` con UI "Process: When Paused" |

## 4. Piano a fasi (ogni fase deve essere provabile)

1. **Progetto e dati** — *in corso*: struttura, `project.godot`, Autoload fatti; JSON da generare con `tools/export_data.mjs`
2. **Giocatore**: prima persona, telecamera, joystick touch, azioni nell'InputMap
3. **Mondo**: scene riusabili (casa, albero, forgia, mura), regioni `Area3D`, giorno/notte, atmosfera dark
4. **Combattimento**: combo, parata, schivata, contrattacco, danni
5. **PNG e AI**: macchina a stati esplicita, `NavigationAgent3D`, routine, sonno, crimini e testimoni
6. **Interfaccia**: HUD, zaino, negozio, dialoghi, con pausa vera
7. **Salvataggio, audio, export Android**
8. **Contenuti dark fantasy**: nemici, magia, lore, musica

## 5. Problemi del codice Three.js — CORRETTI in `web/` (provati nel browser)

- ✅ **Pausa vera** con zaino/negozio/dialogo aperti (`setPaused` in engine)
- ✅ **Capo Morn**: il dialogo senza opzione "chiudi" non si può più chiudere per sbaglio
- ✅ **Letti**: il secondo abitante dorme su un pagliericcio (prima due PNG nello stesso letto)
- ✅ **Rincaro prezzi** in un solo punto: `buyPrice()` / `priceMarkup()` in `items.js`; Lena diceva "raddoppiati" (è x1.5)
- ✅ **Dati arma**: `SWORD_DMG` e `SWORD_ITEM` derivati da `ITEMS`
- ✅ **Codice morto** rimosso: `buy_*`, `sell_ore_*`, `price()`, `makeMineEntrance`, `makeArmor`, `hide`/`grab`, classi CSS inutili
- ✅ **Forgia/rastrelliera** sbloccate con qualsiasi arma; si equipaggia solo se migliore; rastrelliera max 3 spade
- ✅ **Joystick** con pointer events + `pointerId` (multitouch corretto)
- ✅ **Salvataggio** in `localStorage`, anche su `visibilitychange`/`pagehide` (niente backend)
- ✅ **Nuova partita** chiede conferma
- ✅ **Scudi** con `color` nel catalogo
- ✅ **Cibo a vita piena** non viene consumato; "Lascia N" mostra la quantità vera
- ✅ **Performance**: alberi fusi in poche mesh; 6 `PointLight` fisse riassegnate ai punti luce vicini (prima ~22)
- ✅ **Font** inclusi localmente (`@fontsource`), niente `@import` ignorato

## 6. Direzione dark fantasy

- Nebbia più fitta, cielo plumbeo, palette desaturata
- Nemici nuovi (lupi, non-morti, cultisti), nuovi stati AI (distanza, fuga, rianimazione)
- Magia, rarità/effetti, durata equipaggiamento
- Audio ambientale (vento, corvi, drone), musica, riverbero in miniera
- Dialoghi più cupi; struttura invariata
- Particelle: cenere, braci, nebbia bassa

## 7. Asset 3D (Meshy)

- Formato **GLB**, nomi senza spazi/accenti, in `assets/models/{natura,architetture,personaggi}/`
- Ridurre poligoni (5–10k per personaggio) e texture (1K)
- Casa entrabile = scena con collisioni e interno
- Personaggi rigati: servono animazioni idle, walk, attack, hit, death
- Controllare la licenza del piano Meshy
- Servono screenshot ed elenco (nome file, tipo, peso, rigato sì/no)

- **Grafica attuale (gioco web)**: tutto fatto a codice, low-poly, stesso stile per tutti (opzione A):
  - `web/src/game3d/body.js` corpi, volti, capelli, barbe, abiti e armature: il corpo è il modello base low-poly (uomo/donna) in `assets/models/personaggi/corpo_base/`, preparato da `npm run corpi` (`convert-bodies.mjs` + `build-bodies.mjs` → `src/game3d/bodydata.json`: braccia abbassate, pugni chiusi, parti rigide con perni, punto e asse dell'impugnatura, misure del busto); i vestiti sono dipinti sul corpo o gusci che ne seguono la forma; le armi si impugnano con `inFist()` in `models.js`; pagina di prova `bodyview.html`; **scheletro e pelle deformabile (skinning)**: `build-bodies.mjs` aggiunge anelli di vertici alle articolazioni (gomiti, avambracci, ginocchia, sopra le caviglie, vita: tagli piani che non cambiano la forma), mette ogni triangolo in una sola parte (tranne l'anello del collo) e calcola per ogni vertice i pesi di 19 ossa (`rig.bones`, posizioni in `rig.joints`: bacino, schiena, petto, collo, testa, clavicole, omeri, avambracci, mani, cosce, stinchi, piedi; gomito e polso sull'asse vero del braccio); `body.js` unisce tutto il personaggio (pelle, vestiti, accessori, capelli) in una geometria nello spazio del personaggio con `skinIndex`/`skinWeight` (i gusci prendono i pesi del vertice del corpo sotto, gli accessori quelli dei vertici più vicini, testa/capelli/cappelli l'osso della testa, gonne/tuniche/mantelli/grembiuli le ossa d'aiuto alle anche: `garmentSkin`, davanti e dietro di ogni gamba più una al ginocchio) e i pezzi del paladino in un'altra; le braccia rigide restano solo per la prima persona (`makeViewmodel`); `makeHuman` costruisce le ossa (`userData.B`, con i vecchi nomi hipL/hipR/kneeL/kneeR/armL/armR/head) e due `SkinnedMesh`; spada e attrezzi sono figli dell'osso della mano, lo scudo dell'avambraccio; **pose in `anim.js`**: camminata, corsa e passo furtivo da curve del passo reale (anca, ginocchio, caviglia; bacino e spalle che ruotano in senso opposto, braccia che oscillano col gomito), le altre da pose chiave; cinematica inversa per le gambe (`stance`/`legIK`: piedi piantati a terra, piede in piano o sulla punta) e per le braccia (`armIK`: la mano dove serve, es. alla bocca, sulla testa, sulle cosce, sul manico dell'attrezzo con la seconda mano), limiti delle articolazioni (`LIM`), dissolvenza tra un'attività e l'altra, i piedi appoggiati a terra (`footLow`: `poseHuman` restituisce l'altezza); 4 attacchi (`atk`: over, side, thrust, rise) con carica e colpo che muovono tutto il corpo, guardia, parata, barcollare, lavori, dialogo, seduto, sonno, 4 cadute (`poseDeath`); la testa consegnata di Morn: `userData.headGone`; **memoria e velocità sui telefoni** (dopo un crash nell'app): pochi anelli alle articolazioni (ogni anello moltiplica i triangoli dei vestiti), pesi in un byte (`setSkin`), pesi degli accessori dai vertici vicini con una griglia e senza oggetti temporanei (`skinBy`), le braccia rigide della prima persona solo per il giocatore (`bodyGeometries(look, v, { fp: true })`), i corpi dei PNG liberati dalla memoria della pagina dopo l'invio alla scheda grafica (`onUpload` in `makeHuman`; quello del giocatore no: lo disegna anche l'anteprima del menu), i PNG nascosti dalla nebbia non vengono messi in posa, rotazioni non valide azzerate prima di toccare le ossa; misura: `mem2.cjs`-style (CPU rallentata 4×): memoria JS ~65 MB, mondo pronto in ~5 s come prima; dialoghi in primo piano (`startTalk`/`updateTalk` in `engine.js`, pannello laterale `InteractionDialog.jsx`); testa suddivisa (Loop) con capelli e barbe dipinti/gonfiati sulla testa, 9 acconciature maschili, 6 femminili, 9 barbe, punti del viso (naso, occhi, bocca) trovati sul profilo; i PNG portano un inventario (`belongings` in `engine.js`: armi, armatura indossata, merce, oggetti a caso, borsa) che resta sul cadavere: si fruga con il doppio menu `LootPanel.jsx` e il corpo mostra solo ciò che gli resta (`dressBody`: armatura, elmo, scudo, spada, testa di Morn); i gusci (capelli, barbe, armature) hanno un bordo pieno verso la pelle; comandi touch ad arco (Attacca grande nell'angolo, Nasconditi sopra; verso il centro Corri/Schiva, Para, Usa/Ruba); corsa (Maiusc), parata a tempo con parata perfetta e contrattacco (K), borseggio da furtivo (rischio per oggetto, la vittima reagisce); la spada non gira mai nel pugno (filo in linea con le nocche): il filo va sul taglio girando il braccio su sé stesso (avambraccio) e piegando il polso; prima persona: pose dei colpi in `FP_CUTS` (pugno, lama, taglio) risolte da `armPose` in `engine.js`; le caselle degli oggetti mostrano il modello 3D vero (`thumbs.js`, `ItemPic.jsx`); pagina di prova volti: `lineup.html?faces=hair|beard|female`; **pelle e capelli** (`BODY_MAT` in `body.js`, shader modificato con `onBeforeCompile`): ogni vertice ha l'attributo `surf` (0 stoffa/cuoio/metallo con facce piatte come prima, 1 pelle, 2 capelli e barbe, 3 occhi lucidi; nei pezzi `Part` si cambia con `.as(n)`); la pelle ha normali lisce "a soglia" (spigoli tenuti solo nelle pieghe nette: naso, arcate, mascella), colore per vertice da `skinTint` (guance, naso e bocca un po' rossi, occhiaie e sotto la mascella più scuri, pieghe scure e sporgenze chiare dalla curvatura del modello, macchie leggere, barba rasata come ombra) e luce "che passa" oltre il bordo d'ombra (più nel rosso); toni di pelle caldi (`SKINS`); i capelli sono lisci con ciocche disegnate nello shader: 36 ciocche intorno all'asse verticale della testa (larghezza e profondità del solco variabili, ognuna arrotondata con la normale inclinata da un lato all'altro, un po' più chiara o più scura), fili sottili dentro, riflesso allungato tipo Kajiya-Kay; da lontano sfumano (niente sfarfallio); i capelli rasati (`buzz`, `surf` 2.25) hanno solo i fili; pelle e capelli leggono l'ombra del sole qualche cm fuori lungo la normale (la mappa d'ombra è grossolana: sul viso farebbe strisce); `weapons.js` armi e scudi; `items3d.js` oggetti e attrezzi
  - una mesh unita per parte con colori nei vertici, materiali condivisi, geometrie in cache (circa 3.500 triangoli e 9–10 disegni per PNG)
  - **vegetazione**: gli **alberi** vengono dal kit gratuito "Shapespark low-poly plants kit" (uso libero anche commerciale, sorgente: github.com/shapespark/shapespark-assets; originale in `assets/models/natura/piante_shapespark.glb`, 30 oggetti: per ora usati i 12 alberi, 3 specie × 4 grandezze, id `albero_a1`…`albero_c4`, 370–650 triangoli, alti 4,6–7,9 m); dal pacchetto natura restano gli alberi contorti (punti di riferimento con foglie rosso sangue) e morti, cespugli, felci, erba, funghi, rocce, sassi, selciato (originali in `assets/models/natura/`; i vecchi pini e alberi a chioma non sono più usati); `web/tools/optimize-nature.mjs` (`npm run nature`) semplifica, scurisce le texture (la corteccia grigia del kit è scaldata verso il marrone), mette le 6 texture delle foglie del kit in un atlante (una sola mesh di foglie per zona: gli alberi costano 2 disegni per zona invece di 7) e crea `web/public/models/natura.glb` (1,05 MB); `web/src/game3d/nature.js` li fonde in una mesh per materiale per zona di 20 m; le chiome del kit sono "carte" di foglie: normali che escono dalla chioma (`crownNormals`, luce morbida come un volume, niente strisce scure), nessuna ombra ricevuta (dentro la chioma diventava tutto nero) e taglio dell'alfa che si allenta con la distanza (`crownShading`: le chiome lontane non si spelano)
  - **terreno**: un unico piano con la foto dell'erba (`web/src/game3d/ground.js`, texture `src/game3d/terreno_erba.jpg` 1024 px, messa nel codice come il paladino); viene dal materiale "Grass" di `grass.blend` (immagine impacchettata `grass-1_diffuse.jpg`, 2048 px, senza giunture; dal percorso interno sembra di BlenderKit: verificarne la licenza prima di vendere il gioco), NON nel repository: `assets/sorgenti/terreno/grass.blend`; `npm run terreno` (`tools/build-ground.mjs`) la estrae direttamente dal .blend, la schiarisce/desatura e la riduce; nello shader: coordinate del mondo (2,5 m per ripetizione), due copie a scala e angolo diversi mescolate da un rumore largo (la ripetizione non si vede), chiazze più secche, nel bosco più scura e bruna con bordo morbido (prima c'era una scatola verde scuro); sentieri, piazza e strade sono ancora a tinta unita. In `grass.blend` c'è anche altro, non usato: due ciuffi d'erba 3D (6.700–8.300 triangoli l'uno, troppo pesanti) e texture di tulipani senza il modello. I file `SM_Prop_Grass1` (obj/dae/fbx) sono solo un quadrato di 1 cm senza texture
  - **edifici** dal kit "Lowpoly Medieval Asset" (FBX): gli originali NON sono nel repository (cartella `assets/sorgenti/`, esclusa da git); `npm run kit` (`convert-kit.mjs` + `build-kit.mjs`) crea `web/public/models/kit.glb`. Valdoro è composta in `engine.js` (ingresso con saracinesca, mura, torri, mastio); case di Roccanera fatte (opzione A: piano terra entrabile nostro a graticcio con texture del kit, sopra la parte alta di una casa del kit tagliata al primo solaio con `kitHouseTop` in `nature.js`, scelta in `KIT_TOPS` in `engine.js`); case di Valdoro fatte (piano terra in pietra squadrata `Wall_Tile_01` + tetti alti del kit, `KIT_TOPS` indici 6–9; in più case intere del kit non entrabili contro le mura laterali e negli angoli vicino al portone, `TOWN` in `engine.js`, con le loro collisioni); prossimi passi: campo dei banditi, selciato
  - **armatura del paladino** (armatura e elmo più forti: `piastre`, `elmo_piastre`; la indossano i cavalieri): dal modello "paintpoly humanoid paladin knight" (`.blend`, NON nel repository: `assets/sorgenti/paladino/`). `python3 tools/convert-paladin.py` (serve `pip install bpy`) ne estrae solo i pezzi dell'armatura alleggeriti; `node tools/build-paladin.mjs` li adatta al corpo base maschile segmento per segmento (braccia sulla linea vera del braccio, gambe, busto per sezioni, elmo sulla testa) e crea `src/game3d/paladin.json`; in `body.js` `look.armor === "paladin"` / `look.head === "paladin"`; gli spallacci sono parti proprie (`padR`/`padL`) che seguono il braccio a metà. L'armatura è disegnata con la sua texture dipinta (UV del modello): `build-paladin.mjs` ne ricava `src/game3d/paladin_albedo.jpg` (1024 px) dall'originale `assets/sorgenti/paladino/textures/t_paintpoly_paladin_knight_albedo.png` (fuori dal repository); materiale proprio `PALADIN_MAT` in `body.js` (metallico, lucido, con un riflesso "da studio" fatto in CPU che segue la luce del giorno); sotto l'armatura stoffa viola scura e guanti marroni come nel modello; braccia: ogni piastra segue rigidamente il suo osso (braccio, avambraccio), sull'asse vero del braccio in posa (`rig.axis` da `build-bodies.mjs`) e sull'asse ricentrato del braccio del modello; gambe: assi ricentrati, ginocchiera un pezzo rigido sullo stinco (scala e spostamento cercati perché resti fuori dalla gamba), schinieri e scarpe spinti fuori da un profilo radiale della gamba, calzamaglia più sottile sotto le piastre (`PAL_SLIM`); la pelle del braccio sul petto, sulla schiena e nell'ascella (triangoli a `t` basso dentro il busto) sotto la corazza resta col busto (`onTrunk` in `body.js`), altrimenti girando col braccio usciva dalla corazza; la gonna e le falde (pezzo del busto sotto l'anca) sono una `SkinnedMesh` (`geo.pal.skirt`, pesi in `skirtWeights`): ossa = corpo + quattro aiutanti alle anche (davanti/dietro di ogni gamba, `followSkirt` in `models.js`: il davanti segue la coscia solo in avanti, il dietro solo all'indietro), così le cosce non bucano la gonna negli affondi, nella corsa e da seduti (dopo aver cambiato le anche a mano, es. a cavallo, richiamare `followSkirt`)
  - i modelli GLB del pacchetto "Ultimate Modular Men" non sono più usati nel gioco; gli originali restano in `assets/models/personaggi/` (utili per Godot)

## 9. Dove siamo arrivati (per riprendere in una nuova sessione)

- **Gioco giocabile**: `web/` (React + Three.js, Vite). `cd web && npm install && npm run dev`; versione per la pagina
  pubblicata: `npm run build:artifact` (crea `web/dist`, i modelli come moduli JS). Pagina pubblicata: "Roccanera e Valdoro".
  Per aggiornarla, confrontare TUTTI i file di `web/dist` con quelli pubblicati (impronte sha256) e caricare ogni file cambiato:
  anche il CSS cambia nome quando cambia il codice (una volta è rimasto quello vecchio: pagina senza stile).
- **Pagine di prova** (con `npm run dev`): `lineup.html` (personaggi; `?eq=1` equipaggiamenti, `?faces=hair|beard|female`
  volti, `?mode=…&atk=…&k=…&t=…` pose e colpi (`t` = istante dell'animazione, `walk=1` passo), `?pal=1|2|4` armatura del paladino, `?death=0..3&p=…` cadute, `?top=N` dall'alto), `bodyview.html` (corpo base),
  `kitview.html` (pezzi del kit). In sviluppo: `window.__P` (giocatore), `window.__atk = { t, combo }` (ferma un colpo), `window.__topcam = [x,y,z, lx,ly,lz]` (telecamera libera).
- **Fatto di recente**: case di Roccanera col kit; personaggi rifatti sul corpo base (ginocchia, volti, 15 acconciature,
  9 barbe, armature); 4 colpi, guardia, parata, 4 morti animate; dialoghi in primo piano; bottino a doppio menu, corpi
  spogliati di ciò che prendi, borseggio da furtivo; immagini vere degli oggetti; comandi touch ad arco con corsa e parata;
  spade impugnate con il filo verso il taglio (prima persona: braccio che ruota e polso che si piega); armatura del
  paladino (la più forte) con texture, case di Valdoro col kit; corretti i pezzi di corpo che uscivano dalla corazza del
  paladino muovendo le braccia (petto) e le gambe (gonna che ora segue le cosce); pelle più vera (liscia, calda, con sfumature)
  e capelli/barbe con ciocche ben marcate; scheletro vero con pelle deformabile (caviglie, polsi, gomiti, busto e bacino,
  collo e testa) e tutte le pose e i movimenti rifatti (`anim.js`); alberi nuovi (kit Shapespark) al posto di pini e alberi
  a chioma; terreno con la foto dell'erba (bosco più scuro).
- **Pubblicare come app (idee, non fatto)**: subito una PWA (manifest, icona, offline; sito gratuito: GitHub Pages / Netlify /
  itch.io); poi Android con Capacitor (APK costruito da GitHub Actions, Google Play 25 $ una tantum); iPhone con Capacitor + Mac/Xcode
  (99 $/anno). Prima: verificare le licenze del kit "Lowpoly Medieval Asset", del modello del paladino, della texture dell'erba e del corpo base (uso
  commerciale, attribuzione), salvataggi più sicuri (Capacitor Preferences), informativa privacy, prove su un telefono economico.
- **Prossimi passi possibili**: texture per terra battuta (piazza, strade, sentiero del bosco) e selciato, ora a tinta
  unita accanto all'erba vera; sottobosco dal kit Shapespark (cespugli, siepe, ciuffi d'erba, trifoglio, margherite: le
  texture di Bush-01/02/05 sono già quelle degli alberi) al posto di quello stilizzato; gomito nel braccio in prima persona
  (colpo dall'alto e affondo); resistenza per la corsa / rumore che allerta; campo dei banditi e selciato col kit;
  scollatura degli abiti femminili (alzarla se serve); direzione dark fantasy (sezione 6).

## 8. Convenzioni

- Un file per messaggio, con il percorso in testa
- Nomi in italiano per i contenuti di gioco, in inglese per il codice
- Dopo ogni fase: l'utente prova e riporta gli errori
