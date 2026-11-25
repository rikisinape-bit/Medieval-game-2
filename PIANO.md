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
| `ai.js` | AI dei PNG: priorità combattimento > panico > allerta > sospetto > ordini > routine; `hear` (rumore) |
| `fparm.js` | Braccio della spada in prima persona: pose dei colpi risolte (pugno, lama, filo, gomito) e mescolate per articolazione |
| `mine.js` | Miniera a cunicoli: gallerie in discesa da campo di distanza + marching cubes, vene d'argento, torce; altezza del pavimento, collisioni; luce del cielo spenta solo dentro la montagna |
| `castle.js`, `castle_layout.js` | Interno del castello di Valdoro, "stanza a parte" lontana dal mondo (`CASTLE`): pezzi, aree calpestabili, ostacoli e luci (`castle_layout.js`, solo dati); caricamento dei modelli alla prima entrata, pavimenti, strade da stanza a stanza (`castle.js`) |
| `sky.js` | Sole e luna nel cielo: lo stesso arco di quelli veri (sorgono a est, alti a sud, tramontano a ovest), il sole di giorno, la luna piena opposta di notte; la luce del motore viene da quello che è alto (`sunDir`) |
| `ground.js`, `leaves.js` | Terreno con texture (`groundMat`) e foglioline 3D ai bordi tra terra e prato (`addLeaves`, `edgeSpots`) |
| `dialogs.js` | Dialoghi con opzioni + `applyEffect` (tutte le conseguenze) |
| `fx.js` | Particelle a cubetti (`burst`) |
| `audio.js` | Audio sintetizzato con Web Audio (nessun file) |
| `Village3D.jsx` | App: HUD, hooks, log, pulsanti touch, salvataggio ogni 5 s |
| `GameMenu.jsx` (schede Inventario, Reputazione, Diario, Partita), `CharacterPreview.jsx`, `Shop.jsx`, `LootPanel.jsx`, `InteractionDialog.jsx`, `TouchControls.jsx` | UI React |
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
- Regioni: `village`, `forest`, `mine`, `valdoro`, `castello` (funzione `regionOf`; `mine` = la zona dei cunicoli sotto la montagna;
  `castello` = l'interno del castello, a `CASTLE = [1000, 0]`, un chilometro a est di tutto: `x > CASTLE[0] - 100`)
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
  - `web/src/game3d/body.js` corpi, volti, capelli, barbe, abiti e armature: il corpo è il modello base low-poly (uomo/donna) in `assets/models/personaggi/corpo_base/`, preparato da `npm run corpi` (`convert-bodies.mjs` + `build-bodies.mjs` → `src/game3d/bodydata.json`: braccia abbassate, pugni chiusi, parti rigide con perni, punto e asse dell'impugnatura, misure del busto); i vestiti sono dipinti sul corpo o gusci che ne seguono la forma; le armi si impugnano con `inFist()` in `models.js`; pagina di prova `bodyview.html`; **scheletro e pelle deformabile (skinning)**: `build-bodies.mjs` aggiunge anelli di vertici alle articolazioni (gomiti, avambracci, ginocchia, sopra le caviglie, vita: tagli piani che non cambiano la forma), mette ogni triangolo in una sola parte (tranne l'anello del collo) e calcola per ogni vertice i pesi di 19 ossa (`rig.bones`, posizioni in `rig.joints`: bacino, schiena, petto, collo, testa, clavicole, omeri, avambracci, mani, cosce, stinchi, piedi; gomito e polso sull'asse vero del braccio); `body.js` unisce tutto il personaggio (pelle, vestiti, accessori, capelli) in una geometria nello spazio del personaggio con `skinIndex`/`skinWeight` (i gusci prendono i pesi del vertice del corpo sotto, gli accessori quelli dei vertici più vicini, testa/capelli/cappelli l'osso della testa, gonne/tuniche/mantelli/grembiuli le ossa d'aiuto alle anche: `garmentSkin`, davanti e dietro di ogni gamba più una al ginocchio) e i pezzi del paladino in un'altra; la prima persona (`makeViewmodel`) ha braccia proprie con tre ossa (spalla, gomito, polso: `fpJoints` da `bodyGeometries(look, v, { fp: true })`, pesi ridotti a braccio/avambraccio/mano); `makeHuman` costruisce le ossa (`userData.B`, con i vecchi nomi hipL/hipR/kneeL/kneeR/armL/armR/head) e due `SkinnedMesh`; spada e attrezzi sono figli dell'osso della mano, lo scudo dell'avambraccio; **pose in `anim.js`**: camminata, corsa e passo furtivo da curve del passo reale (anca, ginocchio, caviglia; bacino e spalle che ruotano in senso opposto, braccia che oscillano col gomito), le altre da pose chiave; cinematica inversa per le gambe (`stance`/`legIK`: piedi piantati a terra, piede in piano o sulla punta) e per le braccia (`armIK`: la mano dove serve, es. alla bocca, sulla testa, sulle cosce, sul manico dell'attrezzo con la seconda mano), limiti delle articolazioni (`LIM`), dissolvenza tra un'attività e l'altra, i piedi appoggiati a terra (`footLow`: `poseHuman` restituisce l'altezza); 4 attacchi (`atk`: over, side, thrust, rise) con carica e colpo che muovono tutto il corpo, guardia, parata, barcollare, lavori, dialogo, seduto, sonno, 4 cadute (`poseDeath`); la testa consegnata di Morn: `userData.headGone`; **memoria e velocità sui telefoni** (dopo un crash nell'app): pochi anelli alle articolazioni (ogni anello moltiplica i triangoli dei vestiti), pesi in un byte (`setSkin`), pesi degli accessori dai vertici vicini con una griglia e senza oggetti temporanei (`skinBy`), le braccia della prima persona solo per il giocatore (`bodyGeometries(look, v, { fp: true })`), i corpi dei PNG liberati dalla memoria della pagina dopo l'invio alla scheda grafica (`onUpload` in `makeHuman`; quello del giocatore no: lo disegna anche l'anteprima del menu), i PNG nascosti dalla nebbia non vengono messi in posa, rotazioni non valide azzerate prima di toccare le ossa; misura: `mem2.cjs`-style (CPU rallentata 4×): memoria JS ~65 MB, mondo pronto in ~5 s come prima; dialoghi in primo piano (`startTalk`/`updateTalk` in `engine.js`, pannello laterale `InteractionDialog.jsx`); testa suddivisa (Loop) con capelli e barbe dipinti/gonfiati sulla testa, 9 acconciature maschili, 6 femminili, 9 barbe, punti del viso (naso, occhi, bocca) trovati sul profilo; i PNG portano un inventario (`belongings` in `engine.js`: armi, armatura indossata, merce, oggetti a caso, borsa) che resta sul cadavere: si fruga con il doppio menu `LootPanel.jsx` e il corpo mostra solo ciò che gli resta (`dressBody`: armatura, elmo, scudo, spada, testa di Morn); i gusci (capelli, barbe, armature) hanno un bordo pieno verso la pelle; comandi touch ad arco (Attacca grande nell'angolo, Nasconditi sopra; verso il centro Corri/Schiva, Para, Usa/Ruba); corsa (Maiusc), parata a tempo con parata perfetta e contrattacco (K), borseggio da furtivo (rischio per oggetto, la vittima reagisce); la spada non gira mai nel pugno (filo in linea con le nocche): il filo va sul taglio girando il braccio su sé stesso (avambraccio) e piegando il polso; prima persona: colpi in `FP_BLOWS` (`engine.js`: per carica e fine colpo pugno, lama, taglio e verso dove va il gomito) risolti da `solveKey` in `fparm.js` (il pugno dove serve con la piega del gomito, il gomito verso il "polo" quanto più è piegato, torsione dell'avambraccio e piega del polso per la lama e il filo; a braccio teso il braccio gira libero su sé stesso), poi `mixPose` articolazione per articolazione; colpi: 1 fendente, 2 rovescio, 3 colpo dall'alto (terzo della combo), `thrust` affondo (furtivo = pugnalata, o contrattacco dopo una parata perfetta: portata 3 m e un passo avanti); i colpi si risolvono uno alla volta poco dopo l'avvio (`solvedBlows`); le caselle degli oggetti mostrano il modello 3D vero (`thumbs.js`, `ItemPic.jsx`); pagina di prova volti: `lineup.html?faces=hair|beard|female`; **abiti femminili**: in `baseBody` il busto della donna è rimodellato come un corpetto di stoffa (riempie la piega sotto il seno e la scollatura, seno un po' meno tondo: l'abito è dipinto sul corpo nudo del modello) e la scollatura è un girocollo alla base del collo (`neckCut`) con un orlo più scuro misurato sul collo del modello (prima: apertura larga fino alle clavicole); **pelle e capelli** (`BODY_MAT` in `body.js`, shader modificato con `onBeforeCompile`): ogni vertice ha l'attributo `surf` (0 stoffa/cuoio/metallo con facce piatte come prima, 1 pelle, 2 capelli e barbe, 3 occhi lucidi; nei pezzi `Part` si cambia con `.as(n)`); la pelle ha normali lisce "a soglia" (spigoli tenuti solo nelle pieghe nette: naso, arcate, mascella), colore per vertice da `skinTint` (guance, naso e bocca un po' rossi, occhiaie e sotto la mascella più scuri, pieghe scure e sporgenze chiare dalla curvatura del modello, macchie leggere, barba rasata come ombra) e luce "che passa" oltre il bordo d'ombra (più nel rosso); toni di pelle caldi (`SKINS`); i capelli sono lisci con ciocche disegnate nello shader: 36 ciocche intorno all'asse verticale della testa (larghezza e profondità del solco variabili, ognuna arrotondata con la normale inclinata da un lato all'altro, un po' più chiara o più scura), fili sottili dentro, riflesso allungato tipo Kajiya-Kay; da lontano sfumano (niente sfarfallio); i capelli rasati (`buzz`, `surf` 2.25) hanno solo i fili; pelle e capelli leggono l'ombra del sole qualche cm fuori lungo la normale (la mappa d'ombra è grossolana: sul viso farebbe strisce); `weapons.js` armi e scudi; `items3d.js` oggetti e attrezzi
  - una mesh unita per parte con colori nei vertici, materiali condivisi, geometrie in cache (circa 3.500 triangoli e 9–10 disegni per PNG)
  - **vegetazione** dal pacchetto natura (pini, alberi a chioma, alberi contorti e morti, cespugli, felci, erba, funghi, rocce, sassi, selciato): originali in `assets/models/natura/` (31 file, 42 MB); `web/tools/optimize-nature.mjs` (`npm run nature`) li semplifica, scurisce le texture e crea un solo `web/public/models/natura.glb` (0,55 MB); `web/src/game3d/nature.js` li fonde in una mesh per materiale per zona di 20 m
  - **edifici** dal kit "Lowpoly Medieval Asset" (FBX): gli originali NON sono nel repository (cartella `assets/sorgenti/`, esclusa da git); `npm run kit` (`convert-kit.mjs` + `build-kit.mjs`) crea `web/public/models/kit.glb`. Valdoro è composta in `engine.js` (ingresso con saracinesca, mura, torri, mastio); case di Roccanera fatte (opzione A: piano terra entrabile nostro a graticcio con texture del kit, sopra la parte alta di una casa del kit tagliata al primo solaio con `kitHouseTop` in `nature.js`, scelta in `KIT_TOPS` in `engine.js`); case di Valdoro fatte (piano terra in pietra squadrata `Wall_Tile_01` + tetti alti del kit, `KIT_TOPS` indici 6–9; in più case intere del kit non entrabili contro le mura laterali e negli angoli vicino al portone, `TOWN` in `engine.js`, con le loro collisioni); **campo dei banditi** (`CAMP` in `engine.js`, pezzi del kit: radura, 3 tende attorno al fuoco con anello di pietre, rastrelliera di lance, palizzata a nord e a est con torretta di guardia, tronchi, cassa, sacco da `makeCamp(true)`; gli alberi nella radura restano nella lista ma "tagliati" (`gone`), così il resto del bosco non cambia); **selciato** con le lastre del kit (`street_rock_1..6`, griglia di 0,8 m con gioco, ognuna girata e scalata sulla sua cella, il bordo 3 cm sopra il terreno e un po' più alta o più bassa della vicina: niente sfarfallio): attorno al pozzo di Roccanera (a Valdoro c'è il lastricato con texture, vedi terreno; senza il kit restano le pietre del pacchetto natura)
  - **armatura del paladino** (armatura e elmo più forti: `piastre`, `elmo_piastre`; la indossano i cavalieri): dal modello "paintpoly humanoid paladin knight" (`.blend`, NON nel repository: `assets/sorgenti/paladino/`). `python3 tools/convert-paladin.py` (serve `pip install bpy`) ne estrae solo i pezzi dell'armatura alleggeriti; `node tools/build-paladin.mjs` li adatta al corpo base maschile segmento per segmento (braccia sulla linea vera del braccio, gambe, busto per sezioni, elmo sulla testa) e crea `src/game3d/paladin.json`; in `body.js` `look.armor === "paladin"` / `look.head === "paladin"`; gli spallacci sono parti proprie (`padR`/`padL`) che seguono il braccio a metà. L'armatura è disegnata con la sua texture dipinta (UV del modello): `build-paladin.mjs` ne ricava `src/game3d/paladin_albedo.jpg` (1024 px) dall'originale `assets/sorgenti/paladino/textures/t_paintpoly_paladin_knight_albedo.png` (fuori dal repository); materiale proprio `PALADIN_MAT` in `body.js` (metallico, lucido, con un riflesso "da studio" fatto in CPU che segue la luce del giorno); sotto l'armatura stoffa viola scura e guanti marroni come nel modello; braccia: ogni piastra segue rigidamente il suo osso (braccio, avambraccio), sull'asse vero del braccio in posa (`rig.axis` da `build-bodies.mjs`) e sull'asse ricentrato del braccio del modello; gambe: assi ricentrati, ginocchiera un pezzo rigido sullo stinco (scala e spostamento cercati perché resti fuori dalla gamba), schinieri e scarpe spinti fuori da un profilo radiale della gamba, calzamaglia più sottile sotto le piastre (`PAL_SLIM`); la pelle del braccio sul petto, sulla schiena e nell'ascella (triangoli a `t` basso dentro il busto) sotto la corazza resta col busto (`onTrunk` in `body.js`), altrimenti girando col braccio usciva dalla corazza; la gonna e le falde (pezzo del busto sotto l'anca) sono una `SkinnedMesh` (`geo.pal.skirt`, pesi in `skirtWeights`): ossa = corpo + quattro aiutanti alle anche (davanti/dietro di ogni gamba, `followSkirt` in `models.js`: il davanti segue la coscia solo in avanti, il dietro solo all'indietro), così le cosce non bucano la gonna negli affondi, nella corsa e da seduti (dopo aver cambiato le anche a mano, es. a cavallo, richiamare `followSkirt`)
  - **oggetti del villaggio** dal pacchetto "Medieval Props Minipack 4" (GLB con un atlante di texture comune): gli originali
    NON sono nel repository (`assets/sorgenti/medieval_props_minipack_4/`); `npm run props` (`tools/build-props.mjs`) crea
    `web/public/models/props.glb` (17 oggetti, 0,15 MB: un materiale con l'atlante + il vetro del lampione `Props_Light` che
    si accende di notte); `nature.js` lo carica come il kit (`hasProps`, `kitPartBox` per la posizione del vetro); in
    `engine.js` (`prop()`): bancarelle = tettoia + tavolo da mercato + casse di mele (`stall()`), catasta di legna, lampioni
    (il lampione pende verso la piazza o la fontana), secchio al pozzo, tinozza alla forgia, fuoco del campo (pietre e legna
    del pacchetto, fiamme del kit), casse e carretto dei banditi, carretti a Roccanera
    e a Valdoro; senza il file restano gli oggetti fatti a codice; tutti uniti in poche mesh (meno disegni di prima)
  - **terreno** (`ground.js`, `groundMat`): quattro texture: prato (`terreno/Vol_42_1`), terra (la roccia `rock_05` del
    file `rocce/rocks.blend`), terra crepata (`terreno/Vol_19_4`), lastricato (`pietra_castello/`, "Stone Ground 01"):
    originali in `assets/sorgenti/`, NON nel repository; `npm run terreno` = `tools/build-ground.mjs` crea
    `src/game3d/terreno_*.jpg` (colore 512 px con l'occlusione nelle cavità e il contrasto dipinto attenuato, mappa del
    rilievo 256 px, 512 per il lastricato; le mappe "DirectX" col verde in giù dei Vol vengono girate: il gioco usa il verde
    in su) e `foglia.jpg`; inserite nel codice come i dati del paladino; posate in coordinate del mondo (continuano tra
    prato, piazza, strade e sentiero) alla loro misura vera (prato 1,9 m, terra 2,6 m, crepe 2,6 m, lastre 3,6 m); il
    rilievo è illuminato dal sole (mappa delle normali); la ripetizione è nascosta da una seconda copia più grande e girata
    (non sul lastricato: si vedrebbero due misure di pietre) e da chiazze larghe più chiare, più scure e più secche; da
    lontano sfuma nel colore medio (niente sfarfallio). Prato sul villaggio e (più scuro) nel bosco, terra su piazza,
    strade e sentiero, terra crepata nel campo dei banditi, lastricato nel cortile di Valdoro e su uno slargo davanti al
    portone (lì niente sassi sparsi). (Non più usate: la vecchia erba dipinta `assets/sorgenti/erba_dipinta/` e la terra
    con sassi `assets/sorgenti/terreno/Vol_16_2`.)
  - **foglioline ai bordi** (`leaves.js`), come quelle che crescono sulle rocce di `rocks.blend` (lì sono 10 000 particelle
    per roccia, troppe per un telefono): ciuffi di 6 rametti da tre foglie (ogni foglia un rombo di 2 triangoli piegato
    sulla nervatura, con la texture della foglia del file), 36 triangoli a ciuffo, istanziati a blocchi di 12 m; nascono
    lungo i contorni di piazza, strade, sentiero, campo dei banditi e slargo del portone dove confinano col prato
    (`edgeSpots`: una fascia da poco dentro la terra a ~0,7 m nel prato, più fitta vicino al bordo e a chiazze; niente
    dove il bordo dà su altra terra, nelle case, negli ostacoli, sulla montagna, nel campo coltivato); tra 14 e 22 m
    affondano nel terreno e oltre i blocchi non si disegnano; niente ombre proprie. Circa 3800 ciuffi (137 000 triangoli in
    tutto, 36–41 000 in vista); generati in ~45 ms. Misure (`perf3.cjs`): un prato intero fitto così anche solo nei 20 m
    attorno al giocatore aggiungerebbe 126–177 000 triangoli in vista (quasi il doppio della scena); a chiazze rade
    (3 ciuffi/m²) 32–50 000, come i bordi.
  - i modelli GLB del pacchetto "Ultimate Modular Men" non sono più usati nel gioco; gli originali restano in `assets/models/personaggi/` (utili per Godot)

## 9. Dove siamo arrivati (per riprendere in una nuova sessione)

- **Gioco giocabile**: `web/` (React + Three.js, Vite). `cd web && npm install && npm run dev`; versione per la pagina
  pubblicata: `npm run build:artifact` (crea `web/dist`, i modelli come moduli JS). Pagina pubblicata: "Roccanera e Valdoro".
  Per aggiornarla, confrontare TUTTI i file di `web/dist` con quelli pubblicati (impronte sha256) e caricare ogni file cambiato:
  anche il CSS cambia nome quando cambia il codice (una volta è rimasto quello vecchio: pagina senza stile).
- **Pagine di prova** (con `npm run dev`): `lineup.html` (personaggi; `?eq=1` equipaggiamenti, `?faces=hair|beard|female`
  volti, `?mode=…&atk=…&k=…&t=…` pose e colpi (`t` = istante dell'animazione, `walk=1` passo), `?pal=1|2|4` armatura del paladino, `?death=0..3&p=…` cadute, `?top=N` dall'alto), `?capes=1` i personaggi col mantello (`&walk=1`, `&mode=run`, `ry` per girarli), `?two=1` gli spadoni a due mani (con `globalThis.__twoDbg = []` prima del caricamento: di quanto mani e lama si scostano dal voluto), `bodyview.html` (corpo base),
  `kitview.html` (pezzi del kit). In sviluppo: `window.__P` (giocatore), `window.__S` (stato del mondo, `S.npcs`), `window.__ai`,
  `window.__atk = { t, combo, blow }` (ferma un colpo; `blow`: 1, 2, 3 o "thrust"), `window.__fp` (braccio in prima persona: `solveKey`, `FP_BLOWS`),
  `window.__equip(id)` (dà ed equipaggia un oggetto), `window.__npcs` (i personaggi), `window.__castle` (aree e porte del castello), `window.__topcam = [x,y,z, lx,ly,lz]` (telecamera libera; i pezzi lontani dal
  giocatore restano nascosti dalla nebbia: spostare anche `__P`).
- **Fatto di recente**: case di Roccanera col kit; personaggi rifatti sul corpo base (ginocchia, volti, 15 acconciature,
  9 barbe, armature); 4 colpi, guardia, parata, 4 morti animate; dialoghi in primo piano; bottino a doppio menu, corpi
  spogliati di ciò che prendi, borseggio da furtivo; immagini vere degli oggetti; comandi touch ad arco con corsa e parata;
  spade impugnate con il filo verso il taglio (prima persona: braccio che ruota e polso che si piega); armatura del
  paladino (la più forte) con texture, case di Valdoro col kit; corretti i pezzi di corpo che uscivano dalla corazza del
  paladino muovendo le braccia (petto) e le gambe (gonna che ora segue le cosce); pelle più vera (liscia, calda, con sfumature)
  e capelli/barbe con ciocche ben marcate; scheletro vero con pelle deformabile (caviglie, polsi, gomiti, busto e bacino,
  collo e testa) e tutte le pose e i movimenti rifatti (`anim.js`).
- **Fatto in questa sessione**:
  - gomito nel braccio in prima persona (`fparm.js`): il braccio si piega e si distende nei colpi; nuovi colpo dall'alto
    (terzo della combo, come in terza persona) e affondo (furtivo, o contrattacco dopo una parata perfetta);
  - resistenza (barra verde sotto la vita): la corsa a piedi la consuma in ~6 s, la schivata costa 15; torna dopo un attimo,
    più in fretta da fermi; a zero "senza fiato" (niente corsa né schivata fino al 30%); a cavallo corre il cavallo;
  - rumore (`ai.hear`, `NOISE` in `engine.js`): corsa 11 m, passo 3,5 m, furtivo quasi niente, cavallo 8/16 m, colpi e parate 14 m
    (un colpo alle spalle 3 m); chi sente si gira a guardare (e chi ti guarda ti vede: niente borseggio, niente colpo alle
    spalle, più testimoni), i muri attutiscono, le guardie che ti cercano vanno dove hanno sentito, i banditi ti sentono
    arrivare (prima scattavano a 16 m comunque; ora: vicino, se ti vedono o se ti sentono); orecchio nella barra quando ti
    hanno sentito; i passi suonano più piano da furtivo;
  - campo dei banditi e selciato col kit; scollatura e corpetto degli abiti femminili (vedi sezione 7);
  - inseguimento fino alla fine (`GIVE_UP` in `ai.js`): chi ti attacca (banditi, guardie, cavalieri) smette solo quando sei
    a più di 35 m (prima un bandito a 22 m dal suo posto girava e tornava indietro, guarito di colpo); poi torna al suo posto e
    guarisce piano (2 vita/s); il bosco non si "resetta" se rientri mentre ti inseguono; le guardie mandate dopo un crimine
    visto ti riconoscono appena ti vedono (13 m);
  - menu (`GameMenu.jsx`): scheda **Inventario** con tutti gli oggetti e basta (quelli indossati per primi, con un puntino
    d'oro; oro e argento compresi; solo immagini, il numero se più di uno) e scheda **Equipaggiamento**: personaggio grande
    che gira solo se lo trascini (`CharacterPreview.jsx`), ai lati le caselle con le sole immagini (testa e corpo a sinistra;
    arma, mano sinistra e uso rapido a destra; su uno schermo basso le caselle si rimpiccioliscono) e accanto solo le cose
    equipaggiabili (armi, armature, elmi, scudi, torcia, cibo/acqua/pozioni per l'uso rapido); toccando un oggetto si apre
    accanto una finestra con l'effetto e i pulsanti (Usa, Equipaggia o Uso rapido, Togli, Lascia a terra), ritoccandolo si
    chiude (anche toccando altrove); la finestra non copre mai l'oggetto né, se c'è posto, il personaggio; tutto più grande
    (pulsanti `inv-btn-lg`, testi 15–17 px);
  - oggetti del villaggio del pacchetto Medieval Props e terreno con texture (vedi sezione 7);
  - **miniera a cunicoli** (`mine.js`, dati in `world.js`: `MINE_NODES`, `MINE_TUNNELS`, `MINE_ORES`; prima era una stanza
    piana sotto la montagna): dal portale nella parete di roccia (`CX + 17`, telaio di legno, blocchi di roccia del colore
    della montagna a chiudere la parete) un corridoio, poi gallerie strette (2,4–2,7 m) che scendono (fino a −7,8 m) e si
    ramificano in un incrocio a quattro vie e cinque fondi ciechi. La roccia è la superficie di un campo di distanza (ogni
    galleria: pavimento in pendenza da nodo a nodo, pareti dritte e volta, ruvide di rumore; mezzo largo oltre i nodi per
    chiudere gli angoli) trasformata in triangoli con marching cubes all'avvio (~23 000 triangoli, ~0,1 s; ~0,3 s col
    processore rallentato 4×); texture della roccia di `rocks.blend` posata dai tre assi (niente uv); armature di legno
    ogni 4,5 m, torce a muro (una o due per galleria) con fiamma e luce, ~130 grappoli di minerali sulle pareti e sulle
    volte (argento che brilla un po', rame, oro), 6 vene d'argento estraibili (cristalli grandi che spariscono per 45 s).
    Camminare: `floorY` (altezza del pavimento, la più bassa dove due gallerie si sovrappongono) per giocatore, telecamera,
    PNG, oggetti a terra e particelle; `constrain` tiene i corpi dentro le gallerie (il punto più vicino), i cavalli
    restano fuori; la telecamera in terza persona resta sotto la volta (`roofY`) e lontana dalle pareti. Il prato ha un
    buco sotto la montagna (forma con foro). Le parti profonde non si disegnano da lontano (una tenda nera a 7,5 m dal
    portale). **Luce**: niente più atmosfera "miniera" per tutto il mondo; `mineSkyAt` (patch globale dei pezzi di
    shader di three.js `lights_pars_begin`/`lights_fragment_begin`/`lights_fragment_end`, per posizione nel mondo) spegne
    la luce del cielo e del sole dentro la montagna man mano che ci si allontana dal portale (minimo 8,5%), le torce
    no: da dentro si vede il fuori illuminato com'è, e le braccia del giocatore e chi è nella miniera sono al buio;
  - **nuvole: tolte** (su richiesta, dopo averle provate). Restano gli strumenti per rifarle: `tools/render-clouds.py`
    (Python di Blender: renderizza di lato le nuvole volumetriche "Cumulonimbus Field" di `assets/sorgenti/nuvole/`, fuori
    da git) e `npm run nuvole` (`tools/build-clouds.mjs`: atlante `src/game3d/nuvole.webp` + `.json`); il codice del cielo
    (`clouds.js`: banchi che scorrono col vento su un piano alto, disegnati a 185 m dalla telecamera, una mesh) è nel
    commit 0bba773, da recuperare con git se servirà;
  - **personaggi nella miniera**: stanno sul pavimento in discesa (`floorY`) e trovano la strada nelle gallerie
    (`mine.route`: le gallerie come grafo di nodi, il più breve con Dijkstra; da fuori passano davanti al portale, `OUT`;
    `step` in `ai.js` va di nodo in nodo); chi ti insegue ti segue dentro e fuori dalla miniera (prima smetteva perché
    era un'altra "zona") e non colpisce attraverso la roccia; chi rinuncia o torna ai suoi giri risale ed esce da solo
    (prove: `chasemine.cjs`, `exitmine.cjs`);
  - **dialoghi a passi** (`dialogs.js`): ogni scelta compare solo quando ha senso; le domande portano alla risposta del
    personaggio (`next`) e le scelte in `CONTINUES` non chiudono il dialogo: la risposta (la riga di `applyEffect`)
    prende il posto del testo e le scelte seguono il nuovo stato (`getDialog(id, S, reply)`, `choose` in `engine.js`; la
    riga va anche nel diario). Alaric: dazio e lusinghe solo finché non hai pagato, "Hai qualche incarico per me?" → la
    missione di Capo Morn → "Va bene, ti aiuto io" / "No, non fa per me", poi "Dove trovo Capo Morn?", "Ecco la testa"
    solo con la testa, la taglia solo con banditi uccisi da riscuotere; Torin: "Cosa ti succede?" → la febbre del figlio →
    "Te lo porterò io" (`flags.torinQuest`) → "Ecco 3 pezzi d'argento" solo con l'argento; Bruno: "Puoi forgiarmi una
    spada?" → cosa serve, le forgiature solo se hai il necessario; cavalieri del portone: la corruzione solo dopo aver
    chiesto come entrare; soldati: l'allenamento solo se non ti disprezzano;
  - **calore del telefono** (giocando un po' scaldava, anche a 60+ FPS): il gioco disegnava quante immagini permetteva lo
    schermo (fino a 120 sui telefoni a 90/120 Hz). Ora: al massimo 60 al secondo (`frame()` in `engine.js` salta le
    chiamate in più; simulato su schermi a 60/90/120/144 Hz: sempre 60), 8 al secondo a gioco in pausa dietro un menu (non
    nei dialoghi), le 6 luci puntiformi e quella della torcia spente tutte insieme quando nessuna luce è vicina (di giorno
    lontano da forgia, fuochi e miniera: `setLightsOn`, solo due stati di luci compilati all'avvio, cambiare non blocca);
    **Risparmio batteria** (menu, Partita; `localStorage` "rv-risparmio" 0/1/2, `setPower`, `POWER_FPS`): spento 60
    immagini al secondo; medio 45 con la stessa grafica (sullo schermo a 60 Hz il ritmo è irregolare, 1-1-2; a 90 Hz
    regolare); massimo 30, risoluzione 1× invece di 1,5×, ombre semplici (PCF invece di PCF morbide). Prova sul telefono:
    a 30 non scalda ma la grafica ne risente; 45 da provare;
  - **contatore FPS** (menu, scheda Partita; `FpsMeter` in `Village3D.jsx`, ricordato in `localStorage` "rv-fps"): fotogrammi al
    secondo davvero disegnati e attesa più lunga tra due nell'ultimo secondo (verde vicino al limite 60/30), per misurare il peso sul telefono vero; prova emulata (`phone2.cjs`:
    processore rallentato 4×): le foglioline ai bordi non cambiano il lavoro del processore (differenza dentro il rumore);
  - lastricato di pietra nel cortile di Valdoro e davanti al portone (al posto delle lastre del kit), terra con la texture
    della roccia di `rocks.blend`, foglioline 3D ai bordi tra terra e prato (vedi sezione 7);
  - **interno del castello di Valdoro, "stanza a parte"** (`castle.js`, `castle_layout.js`): in fondo alla piazza di Valdoro
    un portone con due guardie (Tebaldo, Ivo) e "Entra nel castello" → schermo nero "Caricamento...", poi dentro. Il castello
    sta lontano nel mondo (`CASTLE = [1000, 0]`, oltre la portata della telecamera, 220 m): dentro non si disegna niente del
    fuori e viceversa (dentro 2–19 chiamate di disegno e 40–185 mila triangoli, contro ~375 chiamate fuori nel villaggio);
    i modelli (`public/models/castello.glb`, 1,2 MB) si scaricano solo la prima volta che si entra; uscendo ("Esci dal
    castello" al portone) si torna nella piazza; ricaricando la partita dentro si resta dentro. Stanze: ingresso con
    portone, sala del trono (colonnato, pedana, trono, tappeti rossi, scrivano) con **Re Edric** (non ha più una casa
    fuori: siede sul trono, guarda la sala, va a mangiare nella sala dei banchetti e torna) tra due guardie reali
    (Corrado, Elio); sala dei banchetti (camino acceso, tavola lunga lungo il lato sud, il passaggio da porta a porta
    libero); scale su per lo studio del mago (scaffali di libri, scrivania, sfera di cristallo, pozioni, calderone); scale
    giù per le prigioni (tre celle con sbarre, carceriere Mauro). Camminare: aree rettangolari calpestabili (pavimento piano,
    pedana o rampa delle scale), il corpo resta dentro la più vicina, porte dove due aree si sovrappongono, i personaggi
    trovano la strada di stanza in stanza (`castle.route`, in ampiezza sul grafo delle aree); niente cielo né sole dentro
    (`mineSkyAt` dà 0,3), torce e candele con le 6 luci; `walk` in una routine = secondi concessi per arrivare (prima 20).
    Modelli: pacchetto "interno del castello" (FBX + palette `Mage_Room.png` 33×33, fuori da git in
    `assets/sorgenti/interno_castello/`) → `tools/castle-export.py` (Python di Blender: un oggetto per pezzo, materiali
    in palette, fiamme, cristallo) → `npm run castello` (`tools/build-castle.mjs`: solo i pezzi usati, meshopt). In gioco
    i pezzi sono fusi per stanza e materiale (12 gruppi, ~200 mila triangoli in tutto);
    alcuni oggetti del pacchetto hanno l'origine lontana dal modello (libri, calamaio, teschio, secchio...): `build-castle.mjs`
    li ricentra;
  - **prigioni del castello**: i muri tra le celle sono doppi (un muro del pacchetto ha una faccia sola: da dietro era
    trasparente); porte a sbarre delle celle (`Basement_Door_Left`, `CELLS` in `castle_layout.js`) che girano sui cardini,
    chiuse all'inizio (`S.flags.cells`, true = aperta): il passaggio di una cella è un'area calpestabile solo a porta aperta
    (anche per le strade dei personaggi); si aprono e chiudono solo con la **chiave delle celle** (oggetto `chiave_celle`):
    una sul tavolo del carceriere (`PICKUPS`, "chiave_tavolo": rubarla sotto i suoi occhi è un furto) e una in tasca al
    carceriere (`carries` nel personaggio: si può sfilare da furtivo attraverso le sbarre, o prendere dal corpo).
    **KO nel castello** (se il carceriere è vivo; altrimenti come prima, al pozzo): schermo nero "Le guardie ti hanno messo
    KO...", ti risvegli nella cella di mezzo chiusa (`S.flags.jail`), vita 60, le chiavi che avevi tornate al carceriere e
    sul tavolo; il carceriere passa avanti e indietro davanti alle celle: parlandogli attraverso le sbarre, **riscatto**
    di 30 monete (`RANSOM` in `dialogs.js`), o se non le hai si prende tutto il tuo oro e ti fa uscire; oppure gli rubi la
    chiave e apri da solo (se ti vede uscire ti attacca). Chi ce l'ha con te mentre sei in cella si calma dopo 8 s.
    Nel castello il giocatore e i personaggi si muovono a passi di 0,2 m al massimo (`castle.move`): in un fotogramma
    lento un passo lungo saltava la porta chiusa;
  - **oggetti con un peso** (`engine.js`: `addPick`, `updatePicks`, `throwPick`): ogni oggetto dell'inventario a terra è il
    suo modello vero (quello delle immagini del menu) e sta fermo appoggiato (niente più oggetti che galleggiano e
    girano); lasciato a terra dal menu cade dalla mano, gli oggetti lanciati o lasciati cadono con la gravità (9,81).
    **Corpo rigido** (`tumble.js`): ogni modello diventa i suoi punti più esterni (un involucro convesso approssimato,
    `shapeOf`), un baricentro e un'inerzia da scatola; in aria vola e gira, dove i punti toccano il terreno (a ogni
    altezza: `floorY`) l'urto lo respinge con un piccolo rimbalzo e con attrito (passi di 1/120 s, contatti risolti a
    impulsi): si ribalta su un fianco, una cosa piatta si ferma su una faccia, una tonda rotola (e su una discesa rallenta
    fino a fermarsi). **Resta esattamente com'è atterrato**, su qualunque lato: non torna più dritto; fermo quando nessun
    suo punto si muove più di 4 cm/s per 0,3 s. Non entra nei muri (rimbalza un poco). Dove e come è rimasto si salva
    (`S.flags.moved`: x, z e il quaternione; `S.drops`: `q`) e al caricamento è appoggiato sui suoi punti più bassi (`settle`).
    **Interagisci tenuto premuto** (tasto E, pulsante Usa: `interactDown`/`interactUp`): un tocco fa quello che faceva
    (raccogli, fruga, parla); tenuto 0,35 s su un oggetto lo porti davanti a te (dove guardi), su un morto lo trascini
    (più piano, un po' sollevato); un oggetto preso resta girato com'era e gira con te; lasciato, cade conservando il
    movimento (si può lanciare un poco), il corpo
    ricade a terra. I vivi non si spostano. Dove resta un oggetto del mondo si salva (`S.flags.moved`), uno lasciato da te
    in `S.drops`, un corpo in `deadX`/`deadZ`; per combattere lo lasci (attacca o para);
  - **cibi nuovi** dai modelli dell'utente (`assets/sorgenti/cibo/`, fuori da git: tre file di Blender e un pacchetto Unity):
    il **pane** nuovo (pagnotta tagliata, anche in mano a chi mangia) e tre cibi: **prosciutto** (+35, 9 oro, dalla
    locanda di Bodo), **pomodoro** (+5, 1 oro) e **patata** (+6, 1 oro, dal banco di Lena), anche nel bottino dei
    popolani e della locanda, nei bauli e tre vicino al banco di Lena. `tools/fbx-ascii-obj.py` (la patata è un FBX
    testuale, che Blender non legge), `tools/food-export.py` (Python di Blender: dimensioni vere, appoggiati come stanno
    su un tavolo, colori dei materiali, la texture della patata a 256 px), `npm run cibo` → `public/models/cibo.glb`
    (83 KB, caricato con gli altri modelli in `nature.js`; senza, restano forme semplici fatte a codice); licenza dei
    modelli da verificare;
  - **parata tenuta** (`engine.js` `GUARD`, `ai.js` `FIGHT`): la guardia resta alzata finché tieni premuto (tasto K, pulsante
    Para del telefono: `onRelease`); se il colpo arriva entro 0,2 s da quando l'hai alzata (0,28 con lo scudo) è una
    **parata perfetta** (nessun danno, il nemico barcolla 1,6 s, il tuo colpo dopo è un contrattacco doppio); altrimenti
    passa solo il 30% del colpo (15% con lo scudo). Ogni colpo parato costa resistenza: 14 (perfetta 5), ×1,5 con lo
    spadone, ×0,8 con lo scudo; senza abbastanza resistenza la **guardia si rompe** (passa il 75%, barcolli mezzo
    secondo, va rilasciata e ripremuta); dietro la guardia la resistenza torna piano e cammini a metà velocità. I
    **nemici** (`n.blocking`) alzano la guardia quando vedono partire un tuo colpo (cavalieri 50%, soldati 38%, banditi
    30%, fabbri 22%) o la tengono tra un colpo e l'altro; a volte è una parata perfetta contro di te (cavalieri 30%,
    soldati 18%...: il tuo colpo rimbalza, **barcolli** 0,8 s senza poter colpire, parare o schivare, e loro
    rispondono subito con un colpo veloce); altrimenti passa il 25% del tuo colpo e la loro guardia cede (postura:
    −25 a colpo, −45 con lo spadone, a zero si rompe: passa metà del colpo e barcollano 1 s; si ricarica quando
    abbassano la guardia);
  - **sole e luna** (`sky.js`): girano nel cielo col ciclo del giorno (`S.dayT`) come quelli veri qui al nord: sorgono a
    est, a mezzogiorno sono alti a sud (latitudine ~25°: il sole a 65°), tramontano a ovest; la luna, piena, è sempre
    opposta al sole: sorge al tramonto e cala all'alba. Disegnati a 180 m dalla telecamera (oltre la nebbia, che non li
    tocca; case, montagna, muri li nascondono): il sole un disco luminoso in un grande alone (arancione e più largo vicino
    all'orizzonte), la luna il modello dell'utente (la scena di 3ds Max "Moon 001", una sfera con i crateri scolpiti),
    illuminata dal sole un po' di lato (i crateri si vedono), luminosa, in un alone azzurrino; spariscono sotto
    l'orizzonte. La luce del motore ora viene da loro: di giorno dal sole (le ombre seguono il sole), di notte dalla
    luna, azzurra e debole (ombre leggere al chiaro di luna). La luna dal file .max (formato chiuso, niente 3ds Max):
    `tools/max-mesh.py` legge la mesh dell'Editable Poly dallo stream "Scene" (blocchi annidati: vertici 0x0100, facce
    0x011A), `tools/moon-export.py` (Python di Blender) la centra, raggio 1, ~2400 triangoli, `npm run luna`
    (`tools/build-moon.mjs`) → `public/models/luna.glb` (11 KB); sorgente in `assets/sorgenti/luna/` (fuori da git);
    licenza del modello da verificare;
  - **KO dalle guardie**: tutte le guardie e i cavalieri di Valdoro (`valdoro` e `guard`: anche Brann e Oswin fuori dalle
    mura) portano in una cella del castello (il castello si carica dietro lo schermo nero "Le guardie ti hanno messo
    KO..."); le guardie di Roccanera (Gerd, Ulf, Ser Alaric) in una **gabbia** accanto al campo d'addestramento
    (`CAGE` in `world.js`, `makeCage` in `models.js`: pali e telaio di legno, sbarre e fasce di ferro, tetto di assi, porta a
    sbarre col lucchetto che gira sul cardine). Chiuso dentro (`S.flags.cage`, la porta `S.flags.cageOpen`; il corpo resta
    nella gabbia anche in un fotogramma lento) la prima guardia viva fa la guardia accanto (`CAGE_WATCH`, poi torna ai
    suoi giri); le si parla attraverso le sbarre: riscatto di 20 monete (`RANSOM_CAGE`), o tutto l'oro se ne hai meno;
    oppure le rubi la chiave (`chiave_gabbia`, ce l'ha Gerd) e apri da solo (se una guardia ti vede uscire ti attacca);
    le chiavi che avevi te le tolgono. Gli altri KO (banditi, popolani) come prima: al pozzo;
  - **mantelli veri** (`body.js`, `anim.js capeMove`): al posto della tavola dritta un telo curvo a due facce (9 file per 8
    colonne, con i bordi) che parte dalle spalle (due pezzi sopra le spalle e un fermaglio davanti), si allarga in basso,
    gira un po' intorno alla schiena e non entra mai nel corpo né nell'armatura (scende dritto dalle scapole e passa
    dietro i fianchi); tre ossa sue (`capeU`, `capeM`, `capeL` dopo quelle della gonna, pesi per altezza) che `capeMove`
    gira all'indietro: fermo pende (anche col busto piegato in avanti), camminando si alza un po' dietro, correndo di più
    (a cavallo un po' di vento), seguendo il passo con calma, e un'onda scende lungo il telo, più ampia più si va veloci.
    Lo hanno il giocatore senza armatura, i cavalieri, i nobili, i banditi, i messaggeri e il re;
  - **spadoni a due mani** (`two` in `ITEMS`, `TWO_HANDED`): la Spada lunga è diventata lo **Spadone** (danno 34, prima 24;
    impugnatura per due mani e lama più lunga in `weapons.js`, la mano destra vicino all'elsa, la sinistra `LEFT_BELOW`
    = 11 cm più in basso) e lo **Spadone di Valdoro** (danno 42, prima 30) è a due mani anche lui. Colpi più lenti
    (`SLOW_2H` = 0,62: un colpo dura ~0,73 s invece di 0,45), più difficili da parare (×0,6) e il nemico colpito barcolla
    (0,3 s, spinta doppia). Niente scudo né torcia con lo spadone: equipaggiandolo tornano nello zaino, e il menu non li
    fa equipaggiare finché lo hai in mano. I cavalieri restano con spada a una mano e scudo (scelta dell'utente: il
    loro "long" è lo stesso modello, tenuto con una mano). Testi di Bruno e della rastrelliera: "spadone".
    **Prima persona** (`engine.js`, `FP_HOLD2`, `FP_BLOWS2`): pose del braccio destro risolte come gli altri colpi
    (guardia davanti al petto, parata con la lama di traverso, colpi caricati sopra la spalla / sopra la testa), quelle del
    sinistro risolte dalla destra (pugno sull'impugnatura, `fparm.js fistFrame`); ogni fotogramma il braccio sinistro è
    rimesso esattamente sull'impugnatura (`reach`) e la spalla sinistra segue quando l'impugnatura è troppo lontana (come il
    busto che gira); risolte una volta sola (~0,16 s, al primo uso). **Terza persona** (`anim.js`, `TWO`, `attack2`):
    entrambe le mani sull'impugnatura con `armIK` (la mano girata sulla lama, l'avambraccio che ruota su sé stesso per
    aiutare il polso), a riposo la punta in avanti e in basso, guardia, parata, e ogni colpo caricato prima (`TWO_WIND`)
    con il busto che gira e si piega col colpo; anche nell'anteprima del menu;
  - **uso rapido** (`P.eq.quick`): una casella dell'equipaggiamento per un cibo, l'acqua o una pozione; resta nello zaino
    (la casella indica solo cosa usare e quanti ne restano); il tasto rotondo a sinistra di Corri (o Q) ne consuma uno
    se non hai la vita piena; finito, il tasto resta sbiadito finché non ne trovi altri.
- **Pubblicare come app (idee, non fatto)**: subito una PWA (manifest, icona, offline; sito gratuito: GitHub Pages / Netlify /
  itch.io); poi Android con Capacitor (APK costruito da GitHub Actions, Google Play 25 $ una tantum); iPhone con Capacitor + Mac/Xcode
  (99 $/anno). Prima: verificare le licenze del kit "Lowpoly Medieval Asset", del modello del paladino, del corpo base, del
  pacchetto "Medieval Props Minipack 4", del pacchetto dell'interno del castello (licenza non indicata nei file), delle texture del terreno (Vol_42_1, Vol_19_4) e della foglia di `rocks.blend`
  (uso commerciale, attribuzione; `rock_05` è di Poly Haven, CC0; il lastricato "Stone Ground 01" di Game industry veteran,
  skfb.ly/6VGCp, è CC BY 4.0: citato nel menu, scheda Partita), salvataggi più sicuri (Capacitor Preferences), informativa privacy, prove su un telefono economico.
- **Prossimi passi possibili**: direzione dark fantasy (sezione 6); pubblicare come app (sopra). Piccole idee: i dormienti
  che si svegliano ai rumori forti; la resistenza consumata anche dai colpi; selciato anche sulle strade di Roccanera.

## 8. Convenzioni

- Un file per messaggio, con il percorso in testa
- Nomi in italiano per i contenuti di gioco, in inglese per il codice
- Dopo ogni fase: l'utente prova e riporta gli errori

## 10. Il mondo intero: Vasilad

Mappa dell'utente: `assets/mappa/vasilad.jpg` (con disegni e nomi) e `assets/mappa/vasilad_pulita.jpg` (solo terreno),
2048 × 1536, allineate. Scala decisa con l'utente: **1 pixel = 1 metro** (mondo ~2 × 1,5 km). Luoghi sulla mappa (pixel):
Roccanera (860, 708), castello di Valdoro (1132, 940), montagna della miniera (1170, 615), Sulus (1188, 1150), Dimirot
(949, 1332), Varan (1837, 1033), torre nei ghiacci (457, 184), ponti (1141, 1064) e (861, 1239), grotte (949, 237),
(1258, 183). Fasi: 1) mondo intero spoglio — **fatta**; 2) centro (dintorni, crepacci, fiume e due ponti); 3) sud
(Sulus, Dimirot, grande foresta); 4) est (accampamento, montagne e grotte, Varan e traghetto); 5) nord (neve, ghiacci,
torre, grotte; poi il serpente marino).

**Fase 1, fatta:**
- `web/tools/world-layers.py` (Python, numpy + Pillow): dalle due mappe ricava gli strati in `web/src/game3d/mondo/`:
  `costa.png` (1024 × 768, 2 m/pixel: 128 + distanza dalla costa in metri, + all'interno; jump flooding), `rilievo.png`
  (512 × 384: R montagne, G colline, B foreste) e `suolo.png` (R neve, G terreno secco/marrone, B ghiaccio). Le montagne e
  gli alberi sono i disegni (differenza tra le due mappe; alberi = verde scuro, il resto rilievo), tolti luoghi, nomi,
  ponti, torre, legenda, crepacci, montagna della miniera (rettangoli `NOT_RELIEF`); foresta innevata a nord-ovest, colline
  e dune, montagne basse (a ovest di Sulus) in rettangoli; ghiaccio solo nelle tre coste ghiacciate (`ICE_AREAS`). Da
  rilanciare se la mappa cambia (`python3 tools/world-layers.py anteprima.png`).
- `sites.js`: il mondo ha origine nel pozzo di Roccanera (= pixel `MAP.ox, MAP.oz`), x verso est, z verso sud. Il vecchio
  mondo compatto resta scritto com'era ("coordinate legacy", `world.js`); ogni luogo si sposta come un pezzo rigido
  (`SITES`): **valdoro** (bosco dei banditi + Valdoro insieme: il sentiero arriva ancora alla porta; la piazza sul castello
  della mappa, la porta verso Roccanera, il mastio verso il mare) e **miniera** (la montagna su quella della mappa, il
  portale verso Roccanera). Roccanera non si muove; il castello interno è ora a `CASTLE = [4000, 0]` (fuori dalla mappa).
  `toWorld`/`toLegacy`, `regionOf`/`zoneOf` (nuova regione **"wild"**: la campagna, HUD "Vasilad", nebbia 40–130 m),
  `FLATS` (terreno piano a quota 0 sotto i luoghi, raccordato in 24–30 m), `MINE_HOLE`, `ROADS` (pixel della mappa).
- `terrain.js`: altezza = costa (fondale, spiaggia fino a quota 0) + pianura ondulata + colline (10 m) + montagne (fino a
  ~80 m, creste da rumore), smorzate verso il mare e spianate sotto i luoghi; griglia di 2 m calcolata a pezzi quando
  serve; **pezzi da 64 m** costruiti entro 190 m dal giocatore (2 per fotogramma; tutti insieme all'avvio e all'uscita dal
  castello), tolti oltre 260 m, nascosti oltre la nebbia; `surfaceAt` = l'altezza dei triangoli disegnati (piedi
  sopra); buco sopra le gallerie della miniera. Materiale: erba e terreno secco secondo la mappa, roccia sui pendii,
  neve, ghiaccio, sabbia sulla riva, più scuro sott'acqua e sotto le foreste. **Mare**: piano a `SEA_Y = -1.3` che segue
  la telecamera, increspato; nascosto in miniera e nel castello. **Strade**: strisce di terra battuta sul terreno
  (Roccanera → bosco/Valdoro, Roccanera → miniera); a Roccanera due nuove uscite (sud-est dalla fermata della carrozza,
  est), tolta quella verso ovest, cartelli spostati.
- `engine.js`: tutto il vecchio mondo si costruisce come prima, poi "**The places move**": i figli della scena aggiunti
  dopo `preBuild` si spostano e girano col loro luogo (per posizione), così ostacoli e rettangoli, porte/bauli/letti delle
  case; i pezzi dei pacchetti (`addNatureL`), le foglie e gli alberi si spostano prima di essere uniti. La miniera è in un
  gruppo spostato e girato (`mineRoot`), interrogata con coordinate del mondo (involucro `mine`); la sua luce (GLSL in
  `mine.js`) usa le coordinate della miniera. Persone (`DEFS`: posizioni e giornate), oggetti a terra (`pickW`), cose
  usabili (`OBJS`), messaggeri (`RIDERS`: viottolo, strada, sentiero del bosco, porta), uscita dal castello (`placeWorld`).
  Controlli rimasti in coordinate legacy (`toLegacy`): l'agguato dei banditi lungo il sentiero, il ritorno nel bosco, la
  piazza dentro le mura. Valdoro ora è chiusa tutto intorno (rettangoli per mura laterali, retro, mastio, estremità delle
  mura). Niente più recinto del vecchio mondo; l'acqua profonda (più di ~0,5 m) non si attraversa. Cavalli e cavalieri
  alla quota del terreno (`saddleY + floorY`).
- Menu: scheda **Mappa** (`GameMenu.jsx` `MapTab`): il disegno della mappa (`mondo/mappa.jpg`, 1152 × 864) con un segno
  rosso dove sei e una freccia dove guardi (nel castello: alla sua porta). HUD: `map` = pixel della mappa e direzione.
- Salvataggi: nuova chiave `vasilad.v1` (quelli del vecchio mondo compatto non si caricano più). Pagina pubblicata: le
  immagini di `mondo/` sono dentro il codice (vite.config.js), come le texture del terreno.

**Fase 2, fatta:**
- **Bosco dei banditi** staccato da Valdoro (richiesta dell'utente: non più davanti al castello): è un luogo a sé
  (`SITES.bosco`, legacy z da -29 a WZ + 10) nella **grande foresta** a sud-ovest di Valdoro (centro al pixel 902, 1000),
  il sentiero percorso verso sud. `SITES.valdoro` ora è solo la città e il prato davanti alla porta (cavalieri, lastricato:
  regione "wild"). Gli alberi del vecchio bosco che cadrebbero davanti alla porta non si piantano. Agguato e pedaggio come
  prima; alla fine del sentiero i banditi smettono di inseguire ("si fermano al limitare del bosco"; un cavaliere vicino
  dice la sua battuta). Messaggeri: Roccanera → strada diretta → porta di Valdoro.
- **Strade** (`sites.js ROADS`, pixel della mappa): Roccanera → Valdoro diretta sulle colline; da lì una diramazione nella
  foresta fino al sentiero dei banditi (`bosco_n`), dal suo fondo al **ponte ovest** (`bosco_s`); dalla porta di Valdoro
  intorno alle mura al **ponte nord** (`ponte_nord`); dopo i ponti un tratto verso Sulus e verso Dimirot (fase 3).
- **Ponti** (`BRIDGES`, `terrain.js`): dove il fiume è più stretto vicino ai disegni (calcolato dalla distanza dalla
  costa): nord 44 m (1164.9, 1060.2)–(1182.9, 1100.8), ovest 49,5 m (875.4, 1227.6)–(914.6, 1257.9); impalcato di pietra
  (materiale del kit) che sale di 2 m al centro, parapetti, piloni nel fiume. `groundAt` = l'impalcato sopra l'acqua
  (`floorY` lo usa), `onDeck`/`bridgeKeep`: sul ponte si resta tra i parapetti.
- **Crepacci** (`RAVINES`): i tre disegnati (ovest di Valdoro con la sua crepa sottile, sud-ovest di Roccanera), gole di
  6–14 m con pareti ripide (roccia dal pendio) profonde 4–9 m, percorribili; il mare non si disegna dentro (maschera
  `sDry` nel materiale del mare: sono sotto il suo livello ma all'interno). L'acqua profonda ora si decide dalla distanza
  dalla costa (`coastAt < -4.5`), non dall'altezza.
- **Alberi della campagna** (`vegetation.js`): per pezzi di 64 m, celle di 6,4 m, densità dallo strato foreste (fino a un
  albero ogni ~55 m² nelle foreste, rari in pianura), mai nei luoghi (`treeFree`, `FLATS.trees`), sulle strade
  (`nearRoad`), in acqua o sulla spiaggia, sui pendii ripidi, nei crepacci; nella neve pini e alberi morti. Entro 48 m i
  modelli del pacchetto natura (istanziati, quelli entro 30 m fanno ombra), oltre fino alla nebbia alberi semplici (pino a
  palchi di coni, chioma a sfere, tronco secco) con tinta variata. I tronchi fermano chi cammina (`veg.push` in
  `pushOut`) e la telecamera. Nella grande foresta la luce e la nebbia diventano da bosco (`SELVA`, `wildF`), HUD
  "Grande foresta".
- Il sole e le sue ombre seguono il giocatore anche in quota (montagne).
- Da fare: fase 3 (Sulus, Dimirot, resto della grande foresta), fase 4, fase 5; montagne più varie; erba e cespugli nella
  campagna.
