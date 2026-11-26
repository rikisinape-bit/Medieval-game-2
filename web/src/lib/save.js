// Salvataggio locale nel browser (sostituisce il backend /api/world, slot "village3d").
// (the world of Vasilad: a new key, the saves of the old, small map are not loaded)
const KEY = "vasilad.v1";

export const loadSave = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const writeSave = (state) => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* spazio pieno o privato */ }
};
export const clearSave = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
