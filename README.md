# Roccanera & Valdoro — porting Godot 4

Piano completo: [PIANO.md](PIANO.md). Stato: **Fase 1** (progetto, dati, Autoload).

## Provare
1. Apri la cartella con Godot 4.3+ e premi Play: deve comparire "Fase 1 OK" con ora che avanza.
2. Copia `src/game3d/` del gioco Three.js e lancia:
   `node tools/export_data.mjs percorso/src/game3d`
   → riempie `data/*.json` e elenca le funzioni da riscrivere in GDScript.

## Struttura
- `scripts/autoload/` — `EventBus` (segnali), `Data` (JSON + costanti), `GameState` (stato + salvataggio `user://savegame.json`)
- `data/` — dati statici esportati
- `scenes/{world,actors,ui}` — fasi successive
- `assets/models/{natura,architetture,personaggi}` — GLB da Meshy
