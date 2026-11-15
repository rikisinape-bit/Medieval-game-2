# res://scripts/autoload/EventBus.gd
# Bus di segnali globale: sostituisce gli `hooks` di Village3D.jsx.
# Nessuna logica qui: solo dichiarazioni. Chi emette non conosce chi ascolta.
extends Node

# --- Giocatore ---
signal hp_changed(hp: float, max_hp: float)
signal gold_changed(gold: int)
signal player_died

# --- Inventario / equipaggiamento ---
signal inventory_changed
signal equipment_changed(slot: String, item_id: String)

# --- Reputazione (rep = verità, known = ciò che Valdoro sa) ---
signal rep_changed(faction: String, value: int)
signal known_changed(faction: String, value: int)

# --- Mondo ---
signal region_changed(region: String)
signal night_changed(is_night: bool)
signal valdoro_gates_changed(open: bool)

# --- Crimini / PNG ---
signal crime_committed(crime: String, witnesses: Array)
signal npc_died(npc_id: String)
signal corpse_found(npc_id: String, finder_id: String)

# --- UI ---
signal log_message(text: String)
signal dialog_requested(npc_id: String)
signal dialog_closed(npc_id: String, choice: String)
signal shop_requested(shop_id: String)
signal ui_pause_changed(paused: bool)

# --- Salvataggio ---
signal game_saved
signal game_loaded
