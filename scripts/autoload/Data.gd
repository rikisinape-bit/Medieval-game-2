# res://scripts/autoload/Data.gd
# Carica i dati statici (ex world.js, items.js, dialogs.js) dai JSON in res://data/.
# I JSON si generano con tools/export_data.mjs dai sorgenti originali.
extends Node

# --- Costanti del mondo (da engine.js / world.js) ---
const DAY_LEN := 600.0          # secondi per ciclo giorno/notte
const NIGHT_SUN_ELEV := 0.05    # notte sotto questa elevazione solare
const FZ := -36.0               # inizio foresta (z)
const WZ := FZ - 68.0           # mura di Valdoro (-104)
const CX := -45.0               # miniera (x)
const GATE_KNOWN_CROWN := 30    # porte di Valdoro aperte se known.crown >= 30

var world: Dictionary = {}      # NPC_DEFS, HOUSES, CHESTS, PICKUPS, ROUTE...
var items: Dictionary = {}      # ITEMS, SHOPS, LOOT_OF...
var dialogs: Dictionary = {}

func _ready() -> void:
	world = _load_json("res://data/world.json")
	items = _load_json("res://data/items.json")
	dialogs = _load_json("res://data/dialogs.json")

func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_warning("Data: manca %s" % path)
		return {}
	var txt := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Data: JSON non valido in %s" % path)
		return {}
	return parsed

# --- Accesso comodo ---
func item(id: String) -> Dictionary:
	return items.get("ITEMS", {}).get(id, {})

func shop(id: String) -> Dictionary:
	return items.get("SHOPS", {}).get(id, {})

func npc_defs() -> Array:
	return world.get("NPC_DEFS", [])

# --- Conversioni Three.js -> Godot ---
# Posizioni: identiche (entrambi destrorsi, Y in alto, 1 = 1 m).
static func v3(a) -> Vector3:
	if a is Array:
		if a.size() == 2:   # [x, z] a terra
			return Vector3(a[0], 0.0, a[1])
		if a.size() >= 3:
			return Vector3(a[0], a[1], a[2])
	if a is Dictionary:
		return Vector3(a.get("x", 0.0), a.get("y", 0.0), a.get("z", 0.0))
	return Vector3.ZERO

# Yaw: in Three.js "avanti" = +Z, in Godot "avanti" = -Z.
# avanti_three = (sin y, 0, cos y); avanti_godot = (-sin r, 0, -cos r) => r = y + PI
static func yaw_to_godot(yaw: float) -> float:
	return wrapf(yaw + PI, -PI, PI)

static func yaw_from_godot(rot_y: float) -> float:
	return wrapf(rot_y - PI, -PI, PI)
