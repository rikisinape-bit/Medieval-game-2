// Reputation by place / faction. To add a new village: add an entry here and its key in S.rep (engine.js),
// then use rep("<key>", ...) in dialogs. The menu and the top bar read everything from this list.
export const REP_PLACES = [
  { id: "village", name: "Roccanera", kind: "Villaggio", src: "rep", key: "village",
    note: "Come ti vedono i paesani di Roccanera.",
    effects: (v) => [v < -20 ? "Prezzi più alti del 50% e i paesani ti scacciano" : "Prezzi normali nelle botteghe", v >= 20 ? "I paesani parlano bene di te" : null] },
  { id: "crown", name: "La Corona", kind: "Fazione", src: "rep", key: "crown", face: true,
    note: "Come ti giudicano i soldati e i cavalieri del Re. I messaggeri a cavallo portano questa voce fino a Valdoro.",
    effects: (v) => [v < -25 ? "Le guardie ti attaccano a vista" : v < -10 ? "Le guardie in allerta ti riconoscono subito" : "Le guardie ti lasciano passare", v < -10 ? "Niente allenamenti con i soldati" : null] },
  { id: "valdoro", name: "Valdoro", kind: "Città", src: "known", key: "crown",
    note: "Ciò che a Valdoro sanno di te: si aggiorna solo quando arriva un messaggero.",
    effects: (v, S) => [v >= 30 ? "Le porte della città sono aperte" : S.flags?.gateBribed ? "Porte aperte: hai pagato le guardie" : `Porte chiuse: servono 30 (ne mancano ${30 - v}) oppure 150 monete alle guardie`, v < -25 ? "I cavalieri alle mura minacciano di arrestarti" : null] },
];

// Level and mood (-2..2) of a reputation value, used for the face icon.
export const repLevel = (v) =>
  v <= -50 ? { label: "Odiato", mood: -2 } :
  v < -10 ? { label: "Malvisto", mood: -1 } :
  v < 10 ? { label: "Sconosciuto", mood: 0 } :
  v < 30 ? { label: "Rispettato", mood: 1 } : { label: "Onorato", mood: 2 };

export const repSummary = (S) => REP_PLACES.map((p) => {
  const value = S[p.src]?.[p.key] ?? 0;
  return { id: p.id, name: p.name, kind: p.kind, note: p.note, face: !!p.face, value, ...repLevel(value), effects: p.effects(value, S).filter(Boolean) };
});
