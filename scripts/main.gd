# res://scripts/main.gd
# Scena di prova Fase 1: mostra che Autoload e dati si caricano.
extends Node3D

var _label: Label

func _ready() -> void:
	var cam := Camera3D.new()
	cam.position = Vector3(0, 1.7, 0)
	add_child(cam)
	var layer := CanvasLayer.new()
	add_child(layer)
	_label = Label.new()
	_label.position = Vector2(24, 24)
	_label.add_theme_font_size_override("font_size", 28)
	layer.add_child(_label)
	EventBus.night_changed.connect(func(n): print("Notte: ", n))
	_refresh()

func _process(_d: float) -> void:
	_refresh()

func _refresh() -> void:
	_label.text = "Fase 1 OK\nPNG: %d  Oggetti: %d  Negozi: %d\nOra: %.3f  Notte: %s\nOro: %d  Rep villaggio: %d  Known corona: %d  Porte: %s" % [
		Data.npc_defs().size(), Data.items.get("ITEMS", {}).size(), Data.items.get("SHOPS", {}).size(),
		GameState.time_of_day, GameState.is_night(),
		GameState.gold, GameState.rep["village"], GameState.known["crown"],
		"aperte" if GameState.gates_open() else "chiuse"]
