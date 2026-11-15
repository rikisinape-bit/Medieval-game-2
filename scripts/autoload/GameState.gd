# res://scripts/autoload/GameState.gd
# Stato di gioco mutabile (ex oggetto `S` di engine.js) + salvataggio locale.
# Tutto ciò che va salvato sta qui; i nodi leggono/scrivono tramite le funzioni.
extends Node

const SAVE_PATH := "user://savegame.json"
const SAVE_VERSION := 1
const AUTOSAVE_EVERY := 5.0     # come Village3D.jsx

# --- Giocatore ---
var hp: float = 100.0
var max_hp: float = 100.0
var gold: int = 0
var player_pos: Vector3 = Vector3.ZERO
var player_yaw: float = 0.0     # yaw in convenzione Godot

# --- Inventario: { item_id: quantità } ; equip: slot -> item_id ---
var inventory: Dictionary = {}
var equip: Dictionary = {"hand": "", "body": "", "head": "", "offhand": ""}

# --- Reputazione ---
var rep: Dictionary = {"village": 0, "crown": 0}   # verità
var known: Dictionary = {"crown": 0}               # ciò che Valdoro sa

# --- Mondo ---
var time_of_day: float = 0.3    # 0..1 sul ciclo DAY_LEN (come dayT in engine.js)
var region: String = "village"
var flags: Dictionary = {}      # missioni, scelte dei dialoghi
var dead_npcs: Array = []       # id dei PNG morti
var opened_chests: Array = []
var taken_pickups: Array = []

var _autosave_t := 0.0
var _was_night := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_game()

func _process(delta: float) -> void:
	if get_tree().paused:
		return
	time_of_day = fposmod(time_of_day + delta / Data.DAY_LEN, 1.0)
	var night := is_night()
	if night != _was_night:
		_was_night = night
		EventBus.night_changed.emit(night)
	_autosave_t += delta
	if _autosave_t >= AUTOSAVE_EVERY:
		_autosave_t = 0.0
		save_game()

# Salva quando l'app va in background (sostituisce beforeunload/visibilitychange).
func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED \
	or what == NOTIFICATION_APPLICATION_FOCUS_OUT \
	or what == NOTIFICATION_WM_CLOSE_REQUEST:
		save_game()

# --- Tempo ---
func sun_elevation() -> float:
	return -cos(time_of_day * TAU)  # come engine.js: 0 = mezzanotte, 0.5 = mezzogiorno

func is_night() -> bool:
	return sun_elevation() < Data.NIGHT_SUN_ELEV

# --- Giocatore ---
func set_hp(v: float) -> void:
	hp = clampf(v, 0.0, max_hp)
	EventBus.hp_changed.emit(hp, max_hp)
	if hp <= 0.0:
		EventBus.player_died.emit()

func add_gold(n: int) -> bool:
	if gold + n < 0:
		return false
	gold += n
	EventBus.gold_changed.emit(gold)
	return true

# --- Inventario ---
func add_item(id: String, qty: int = 1) -> void:
	inventory[id] = int(inventory.get(id, 0)) + qty
	EventBus.inventory_changed.emit()

func remove_item(id: String, qty: int = 1) -> bool:
	var have := int(inventory.get(id, 0))
	if have < qty:
		return false
	if have == qty:
		inventory.erase(id)
		for s in equip:
			if equip[s] == id:
				unequip(s)
	else:
		inventory[id] = have - qty
	EventBus.inventory_changed.emit()
	return true

func has_item(id: String, qty: int = 1) -> bool:
	return int(inventory.get(id, 0)) >= qty

func equip_item(slot: String, id: String) -> void:
	if not equip.has(slot) or not has_item(id):
		return
	equip[slot] = id
	EventBus.equipment_changed.emit(slot, id)

func unequip(slot: String) -> void:
	equip[slot] = ""
	EventBus.equipment_changed.emit(slot, "")

# --- Reputazione ---
func add_rep(faction: String, n: int) -> void:
	rep[faction] = int(rep.get(faction, 0)) + n
	EventBus.rep_changed.emit(faction, rep[faction])

# Chiamata dai messaggeri quando arrivano a Valdoro.
func set_known(faction: String, value: int) -> void:
	var was_open := gates_open()
	known[faction] = value
	EventBus.known_changed.emit(faction, value)
	if gates_open() != was_open:
		EventBus.valdoro_gates_changed.emit(gates_open())

func gates_open() -> bool:
	return int(known.get("crown", 0)) >= Data.GATE_KNOWN_CROWN

# Rincaro prezzi: UNICO punto (prima duplicato in Shop.jsx, shopPrice, price).
func price_mult() -> float:
	return 1.5 if int(rep.get("village", 0)) < -20 else 1.0

func price_of(item_id: String) -> int:
	return int(round(float(Data.item(item_id).get("price", 0)) * price_mult()))

# --- PNG ---
func kill_npc(npc_id: String) -> void:
	if npc_id in dead_npcs:
		return
	dead_npcs.append(npc_id)
	EventBus.npc_died.emit(npc_id)

func is_dead(npc_id: String) -> bool:
	return npc_id in dead_npcs

# --- Salvataggio ---
func to_dict() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"hp": hp, "max_hp": max_hp, "gold": gold,
		"player_pos": [player_pos.x, player_pos.y, player_pos.z],
		"player_yaw": player_yaw,
		"inventory": inventory, "equip": equip,
		"rep": rep, "known": known,
		"time_of_day": time_of_day, "region": region,
		"flags": flags, "dead_npcs": dead_npcs,
		"opened_chests": opened_chests, "taken_pickups": taken_pickups,
	}

func from_dict(d: Dictionary) -> void:
	hp = float(d.get("hp", 100.0))
	max_hp = float(d.get("max_hp", 100.0))
	gold = int(d.get("gold", 0))
	var p: Array = d.get("player_pos", [0, 0, 0])
	player_pos = Vector3(p[0], p[1], p[2])
	player_yaw = float(d.get("player_yaw", 0.0))
	inventory = d.get("inventory", {})
	for k in inventory:              # JSON restituisce float
		inventory[k] = int(inventory[k])
	equip.merge(d.get("equip", {}), true)
	rep.merge(d.get("rep", {}), true)
	known.merge(d.get("known", {}), true)
	time_of_day = float(d.get("time_of_day", 0.3))
	region = String(d.get("region", "village"))
	flags = d.get("flags", {})
	dead_npcs = d.get("dead_npcs", [])
	opened_chests = d.get("opened_chests", [])
	taken_pickups = d.get("taken_pickups", [])
	_was_night = is_night()

func save_game() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Salvataggio fallito: %s" % FileAccess.get_open_error())
		return
	f.store_string(JSON.stringify(to_dict()))
	f.close()
	EventBus.game_saved.emit()

func load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var d = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(d) != TYPE_DICTIONARY:
		push_warning("Salvataggio illeggibile, ignorato")
		return false
	from_dict(d)
	EventBus.game_loaded.emit()
	return true

# "Nuova partita": la UI deve chiedere conferma PRIMA di chiamarla.
func new_game() -> void:
	from_dict({})
	inventory = {}
	equip = {"hand": "", "body": "", "head": "", "offhand": ""}
	rep = {"village": 0, "crown": 0}
	known = {"crown": 0}
	save_game()
	EventBus.game_loaded.emit()
