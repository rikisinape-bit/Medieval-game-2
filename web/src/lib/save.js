// Salvataggio locale nel browser (sostituisce il backend /api/world, slot "village3d").
// (the world of Vasilad: a new key, the saves of the old, small map are not loaded)
// (the key written in each function, not kept in a constant: on the user's phone the game once started before that
// constant was set, "Cannot access ... before initialization", 27/11; a function needs nothing set before it)
export function loadSave() {
  try { return JSON.parse(localStorage.getItem("vasilad.v1")) || null; } catch { return null; }
}
export function writeSave(state) {
  try { localStorage.setItem("vasilad.v1", JSON.stringify(state)); } catch { /* spazio pieno o privato */ }
}
export function clearSave() {
  try { localStorage.removeItem("vasilad.v1"); } catch { /* ignore */ }
}
