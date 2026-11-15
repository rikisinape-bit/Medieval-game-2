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

## 5. Problemi rilevati nel codice attuale (letti, NON provati)

Da verificare/risolvere durante il porting:
- **Pausa assente** con zaino/negozio/dialogo aperti: il mondo continua e i nemici attaccano
- **Chiudere il dialogo di Capo Morn senza scegliere** = "close" = combattimento
- **Più PNG nello stesso `home`** (Torin/Nino=1, Lena/Marta=0, Silas/Piero=2, Aldo/Mira=6, Osric/Isolde=9) ma un solo letto per casa: probabile sovrapposizione di notte
- **Rincaro prezzi (-20 reputazione, x1.5) duplicato in 3 punti** — in Godot: unico `GameState.price_mult()`
- **Dati arma duplicati**: `ITEMS[].dmg` e `SWORD_DMG`
- **Codice morto**: effetti `buy_*`, `sell_ore_*` in dialogs; `makeMineEntrance`, `makeArmor` in models; `hide`/`grab`/`sneaking` in TouchControls; molte classi CSS
- **`forge_sword` / `steal_sword` bloccati** se non si ha equipaggiata la spada corta
- **Joystick** usa `touches[0]` invece di `targetTouches[0]` (bug multitouch)
- **Salvataggio** su `beforeunload` poco affidabile — in Godot: `NOTIFICATION_APPLICATION_PAUSED`
- **"Nuova partita"** cancella tutto senza conferma
- **Scudi** senza campo `color` nel catalogo
- **Mangiare a vita piena** consuma il cibo; "Lascia 10" fisso anche con meno oro
- **Performance**: troppi alberi e `PointLight` per mobile
- **`@import` dei font** dopo `@tailwind` in CSS

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

## 8. Convenzioni

- Un file per messaggio, con il percorso in testa
- Nomi in italiano per i contenuti di gioco, in inglese per il codice
- Dopo ogni fase: l'utente prova e riporta gli errori
