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
  - `web/src/game3d/body.js` corpi, volti, capelli, barbe, abiti e armature: il corpo è il modello base low-poly (uomo/donna) in `assets/models/personaggi/corpo_base/`, preparato da `npm run corpi` (`convert-bodies.mjs` + `build-bodies.mjs` → `src/game3d/bodydata.json`: braccia abbassate, pugni chiusi, parti rigide con perni, punto e asse dell'impugnatura, misure del busto); i vestiti sono dipinti sul corpo o gusci che ne seguono la forma; le armi si impugnano con `inFist()` in `models.js`; pagina di prova `bodyview.html`; gambe con ginocchio (coscia + stinco); `poseHuman` ha 4 attacchi (`atk`: over, side, thrust, rise), guardia e parata, `poseDeath` 4 cadute animate; dialoghi in primo piano (`startTalk`/`updateTalk` in `engine.js`, pannello laterale `InteractionDialog.jsx`); testa suddivisa (Loop) con capelli e barbe dipinti/gonfiati sulla testa, 9 acconciature maschili, 6 femminili, 9 barbe, punti del viso (naso, occhi, bocca) trovati sul profilo; i PNG portano un inventario (`belongings` in `engine.js`: armi, armatura indossata, merce, oggetti a caso, borsa) che resta sul cadavere: si fruga con il doppio menu `LootPanel.jsx` e il corpo mostra solo ciò che gli resta (`dressBody`: armatura, elmo, scudo, spada, testa di Morn); i gusci (capelli, barbe, armature) hanno un bordo pieno verso la pelle; comandi touch ad arco (Attacca grande nell'angolo, Nasconditi sopra; verso il centro Corri/Schiva, Para, Usa/Ruba); corsa (Maiusc), parata a tempo con parata perfetta e contrattacco (K), borseggio da furtivo (rischio per oggetto, la vittima reagisce); la spada non gira mai nel pugno (filo in linea con le nocche): il filo va sul taglio girando il braccio su sé stesso (avambraccio) e piegando il polso; prima persona: pose dei colpi in `FP_CUTS` (pugno, lama, taglio) risolte da `armPose` in `engine.js`; le caselle degli oggetti mostrano il modello 3D vero (`thumbs.js`, `ItemPic.jsx`); pagina di prova volti: `lineup.html?faces=hair|beard|female`; `weapons.js` armi e scudi; `items3d.js` oggetti e attrezzi
  - una mesh unita per parte con colori nei vertici, materiali condivisi, geometrie in cache (circa 3.500 triangoli e 9–10 disegni per PNG)
  - **vegetazione** dal pacchetto natura (pini, alberi a chioma, alberi contorti e morti, cespugli, felci, erba, funghi, rocce, sassi, selciato): originali in `assets/models/natura/` (31 file, 42 MB); `web/tools/optimize-nature.mjs` (`npm run nature`) li semplifica, scurisce le texture e crea un solo `web/public/models/natura.glb` (0,55 MB); `web/src/game3d/nature.js` li fonde in una mesh per materiale per zona di 20 m
  - **edifici** dal kit "Lowpoly Medieval Asset" (FBX): gli originali NON sono nel repository (cartella `assets/sorgenti/`, esclusa da git); `npm run kit` (`convert-kit.mjs` + `build-kit.mjs`) crea `web/public/models/kit.glb`. Valdoro è composta in `engine.js` (ingresso con saracinesca, mura, torri, mastio); case di Roccanera fatte (opzione A: piano terra entrabile nostro a graticcio con texture del kit, sopra la parte alta di una casa del kit tagliata al primo solaio con `kitHouseTop` in `nature.js`, scelta in `KIT_TOPS` in `engine.js`); prossimi passi: case di Valdoro, campo dei banditi, selciato
  - i modelli GLB del pacchetto "Ultimate Modular Men" non sono più usati nel gioco; gli originali restano in `assets/models/personaggi/` (utili per Godot)

## 9. Dove siamo arrivati (per riprendere in una nuova sessione)

- **Gioco giocabile**: `web/` (React + Three.js, Vite). `cd web && npm install && npm run dev`; versione per la pagina
  pubblicata: `npm run build:artifact` (crea `web/dist`, i modelli come moduli JS). Pagina pubblicata: "Roccanera e Valdoro".
- **Pagine di prova** (con `npm run dev`): `lineup.html` (personaggi; `?eq=1` equipaggiamenti, `?faces=hair|beard|female`
  volti, `?mode=…&atk=…&k=…` pose e colpi, `?death=0..3&p=…` cadute, `?top=N` dall'alto), `bodyview.html` (corpo base),
  `kitview.html` (pezzi del kit). In sviluppo: `window.__P` (giocatore) e `window.__atk = { t, combo }` (ferma un colpo).
- **Fatto di recente**: case di Roccanera col kit; personaggi rifatti sul corpo base (ginocchia, volti, 15 acconciature,
  9 barbe, armature); 4 colpi, guardia, parata, 4 morti animate; dialoghi in primo piano; bottino a doppio menu, corpi
  spogliati di ciò che prendi, borseggio da furtivo; immagini vere degli oggetti; comandi touch ad arco con corsa e parata;
  spade impugnate con il filo verso il taglio (prima persona: braccio che ruota e polso che si piega).
- **Prossimi passi possibili**: case di Valdoro col kit (house_01, house_08, house_09); gomito nel braccio in prima persona
  (colpo dall'alto e affondo); resistenza per la corsa / rumore che allerta; campo dei banditi e selciato col kit;
  scollatura degli abiti femminili (alzarla se serve); direzione dark fantasy (sezione 6).

## 8. Convenzioni

- Un file per messaggio, con il percorso in testa
- Nomi in italiano per i contenuti di gioco, in inglese per il codice
- Dopo ogni fase: l'utente prova e riporta gli errori
