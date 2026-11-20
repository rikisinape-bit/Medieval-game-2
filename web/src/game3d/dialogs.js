import { SWORDS } from "./world";
import { ITEMS, SHOPS, MARKUP_REP } from "./items";
// NPC & object dialogs for the open world, with consequences.
const has = (S, id) => S.player.inv[id] || 0;
export const GATE_BRIBE = 150; // gold to bribe the knights at the gate of Valdoro
const names = (list) => list.map(([id, q]) => (id === "oro" ? `${q} oro` : q > 1 ? `${ITEMS[id].name} x${q}` : ITEMS[id].name)).join(", ");

const CHATTER = {
  happy: ["La miniera nella collina a ovest ci dà da vivere, ma il Capitano si prende tutto.", "Dicono che la carrozza di Silas porti un forziere pieno.", "Bruno il fabbro fa le spade migliori della valle.", "I banditi di Capo Morn infestano il sentiero nel bosco, a nord. Chiedono un pedaggio... o la vita.", "Ser Alaric paga una taglia per ogni bandito.", "Le porte di Valdoro si aprono solo a chi i messaggeri della Corona nominano con rispetto."],
  helped: ["Hai aiutato Torin! Che i Santi ti benedicano.", "Il figlio di Torin sta meglio, grazie a te."],
  hated: ["Vattene, ladro. Non abbiamo niente per te.", "Le guardie dovrebbero impiccarti."],
  valdoro: ["Valdoro non apre a chiunque. Qui contano le notizie che portano i messaggeri.", "Mastro Aldo forgia armature per i cavalieri del Re.", "Dicono che il Concilio si riunirà alla prossima luna."],
};

// Conversations: each choice shows up only when it makes sense (an errand once it has been offered and taken, its
// reward once it is done), questions lead to the character's answer, and the effects in CONTINUES do not end the talk:
// the character's reply (applyEffect's line) takes the place of the text and the choices follow the new state.
export const CONTINUES = new Set(["pay_tax", "flatter", "morn_quest", "morn_decline", "ask_morn", "morn_deliver", "bounty",
  "torin_give", "torin_accept", "torin_decline", "torin_tips", "forge_sword", "forge_master", "bribe_soldier", "pay_tithe", "bribe_gate"]);

// reply: the line just said by the character (instead of the greeting)
export function getDialog(id, S, reply) {
  const d = buildDialog(id, S);
  if (d && reply) d.text = reply;
  const npc = S.npcs[id];
  if (d && npc?.alive && SHOPS[id]) d.options.unshift({ label: `Commercia — ${SHOPS[id].title}`, effect: "shop" });
  return d;
}

function buildDialog(id, S) {
  const p = S.player;
  const npc = S.npcs[id];
  if (npc && !npc.alive) {
    if (npc.looted) return null;
    return { title: `Il corpo di ${npc.name}`, text: npc.boss ? "Il capo dei banditi giace nel fango. Ser Alaric vorrà una prova." : "Giace immobile nella polvere. Potresti frugargli le tasche.", options: [{ label: npc.boss ? "Fruga il corpo e prendi la testa" : "Fruga il corpo", effect: "loot" }, { label: "Lascia stare", effect: "close" }] };
  }
  if (npc && npc.role === "messenger") return { title: npc.name, text: npc.news != null ? `"Porto a Valdoro le ultime notizie da Roccanera. Dicono che la Corona ti ${npc.news >= 30 ? "stimi" : npc.news < -10 ? "cerchi" : "ignori"}."` : `"Cavalco tra Ser Alaric e le mura di Valdoro. Senza di noi, laggiù nessuno saprebbe nulla di te."`, options: [{ label: "Buon viaggio", effect: "close" }] };
  if (npc && npc.id === "cocchiere") return { title: npc.name, text: `"Guido la carrozza della Corona da vent'anni. Il forziere dietro? Non ti riguarda."`, options: [{ label: "Vai", effect: "close" }] };
  if (npc && npc.role === "villager") {
    const pool = S.rep.village < MARKUP_REP ? CHATTER.hated : S.flags.torinHelped ? CHATTER.helped : CHATTER.happy;
    return { title: npc.name, text: `"${pool[(npc.name.length + Math.floor(Date.now() / 8000)) % pool.length]}"`, options: [{ label: "Saluta e vai", effect: "close" }] };
  }
  if (npc && npc.role === "bandit") {
    const boss = S.npcs.bandit3;
    if (!boss.alive) return { title: npc.name, text: `"Il capo è morto... ma noi no!"`, options: [{ label: "Combatti", effect: "fight_bandits", danger: true }, { label: "Allontanati", effect: "close" }] };
    if (S.enc?.state === "paid") return { title: npc.name, text: `"Hai pagato il pedaggio. Passa, e non guardarti indietro."`, options: [{ label: "Vai", effect: "close" }] };
    const toll = Math.min(30, p.gold);
    return {
      title: boss.name,
      text: `Capo Morn ti sbarra la strada, i suoi uomini escono dagli alberi.\n"Bella spada, viandante. Ma questo sentiero è nostro. ${toll > 0 ? `Lascia ${toll} monete e nessuno si fa male."` : `Non hai un soldo? Allora lasciaci la pelle."`}`,
      options: [
        { label: `Paga il pedaggio (${toll} oro)`, effect: "toll_pay", disabled: toll <= 0 },
        { label: "Minaccialo con la spada", effect: "toll_intimidate" },
        { label: "Rifiuta e combatti", effect: "toll_refuse", danger: true },
      ],
    };
  }
  if (id.startsWith("chest")) {
    const i = +id.slice(5), items = S.chests[i];
    if (S.flags.chests?.[i]) return { title: "Baule", text: "Vuoto. L'hai già svuotato.", options: [{ label: "Chiudi", effect: "close" }] };
    return { title: "Baule", text: `Il baule di casa contiene: ${names(items)}.\nNon è roba tua: se qualcuno ti vede, sarà un furto.`, options: [{ label: "Prendi tutto", effect: "chest_take", danger: true }, { label: "Lascia stare", effect: "close" }] };
  }
  const bounty = Object.values(S.npcs).filter((n) => n.role === "bandit" && !n.boss && !n.alive).length - (S.flags.bountyClaimed || 0);
  const morn = S.npcs.bandit3;
  switch (id) {
    case "torin": {
      const title = "Torin — Minatore anziano", f = S.flags, give = { label: "Ecco 3 pezzi d'argento per tuo figlio", effect: "torin_give" };
      const tail = [{ label: "Chiedi consigli", effect: "torin_tips" }, ...(f.torinRobbed ? [] : [{ label: "Ruba i suoi risparmi mentre non guarda", effect: "torin_steal", danger: true }]), { label: "Addio", effect: "close" }];
      if (f.torinHelped) return { title, text: `"Mio figlio respira meglio. Non dimenticherò ciò che hai fatto."`, options: tail };
      return {
        title,
        text: !f.torinQuest ? `"Straniero... hai un momento per un vecchio?"` : p.ore >= 3 ? `"Hai trovato l'argento? Sono i Santi che ti mandano!"` : `"Hai trovato l'argento? La miniera è nella collina a ovest... ti prego, fai presto."`,
        options: [
          ...(f.torinQuest && p.ore >= 3 ? [give] : []),
          ...(f.torinQuest ? [] : [{ label: "Cosa ti succede?", next: {
            title, text: `"Mio figlio ha la febbre alta. Il guaritore vuole 3 pezzi d'argento, e io sono troppo vecchio per scendere in miniera. Nella collina a ovest l'argento c'è... ma non per me."`,
            options: [p.ore >= 3 ? { label: "Ho dell'argento: eccone 3 per tuo figlio", effect: "torin_give" } : { label: "Te lo porterò io, l'argento", effect: "torin_accept" }, { label: "Mi dispiace, non posso aiutarti", effect: "torin_decline" }],
          } }]),
          ...tail,
        ],
      };
    }
    case "bruno": {
      const title = "Bruno — Fabbro", master = p.sword === "di Roccanera" || has(S, "spada_roccanera");
      const forge = [...(p.ore >= 3 ? [{ label: "Forgiami una spada lunga (3 argento)", effect: "forge_sword" }] : []), ...(!master && p.ore >= 6 && p.gold >= 20 ? [{ label: "Forgiami la Lama di Roccanera (6 argento + 20 oro)", effect: "forge_master" }] : [])];
      return {
        title,
        text: `"Il ferro non mente. Portami argento e ti forgio una lama degna, oppure compra al banco."`,
        options: [
          { label: "Puoi forgiarmi una spada?", next: {
            title, text: `"Con 3 pezzi d'argento ti faccio una spada lunga.${master ? "" : " Con 6 d'argento e 20 monete, la Lama di Roccanera: la migliore mai uscita da questa forgia."} ${forge.length ? "Hai quello che serve: cosa forgio?" : `Tu ne hai ${p.ore}: torna quando ne avrai abbastanza. La miniera è nella collina a ovest.`}"`,
            options: [...forge, { label: forge.length ? "Ci penso" : "Tornerò con l'argento", effect: "close" }],
          } },
          { label: "Esci dalla forgia", effect: "close" },
        ],
      };
    }
    case "lena": return {
      title: "Lena — Mercante",
      text: S.rep.village < MARKUP_REP ? `"Per te i prezzi sono più alti della metà. Sappiamo cosa hai fatto."` : `"Pane fresco, acqua di fonte, torce e pozioni. Compro argento e roba usata."`,
      options: [
        { label: "Arrivederci", effect: "close" },
      ],
    };
    case "alaric": {
      const title = "Ser Alaric — Capitano dei Cavalieri", f = S.flags, head = has(S, "testa_morn");
      const hunting = f.mornQuest && morn.alive && !head, offer = !f.mornQuest && morn.alive && !f.mornDone && !head;
      return {
        title,
        text: !f.taxPaid ? `"Ogni forestiero paga 10 monete di dazio. Paghi, o assaggi l'acciaio?"`
          : hunting ? `"Capo Morn è ancora vivo. Portami la sua testa e avrai la tua ricompensa."`
          : f.mornDone ? `"Il sentiero è tranquillo, grazie a te. La valle non lo dimentica."` : `"Sei in regola con la Corona. Ti serve qualcosa?"`,
        options: [
          ...(head ? [{ label: "Ecco la testa di Capo Morn", effect: "morn_deliver" }] : []),
          ...(bounty > 0 ? [{ label: `Ho ucciso ${bounty === 1 ? "un bandito" : `${bounty} banditi`}: riscuoto la taglia`, effect: "bounty" }] : []),
          ...(f.taxPaid ? [] : [{ label: "Pago il dazio (10 oro)", effect: "pay_tax", disabled: p.gold < 10 }, { label: "Lusingalo per evitare il dazio", effect: "flatter" }]),
          ...(offer ? [{ label: "Hai qualche incarico per me?", next: {
            title, text: `"Sì. Capo Morn e i suoi tagliagole infestano il sentiero del bosco, a nord: chiedono un pedaggio ai viandanti, e chi non paga lo sgozzano. Portami la sua testa e ti darò 40 monete, il doppio della taglia."`,
            options: [{ label: "Va bene, ti aiuto io", effect: "morn_quest" }, { label: "No, non fa per me", effect: "morn_decline" }],
          } }] : []),
          ...(hunting ? [{ label: "Dove trovo Capo Morn?", effect: "ask_morn" }] : []),
          { label: "Sfidalo a duello", effect: "duel_alaric", danger: true },
          { label: "Congedati", effect: "close" },
        ],
      };
    }
    case "soldier1": case "soldier2": case "hal": case "rolf": case "guardia_castello1": case "guardia_castello2": case "guardia_reale1": case "guardia_reale2": case "carceriere": {
      const rep = npc.valdoro ? S.known.crown : S.rep.crown;
      return {
        title: `${npc.name} — ${npc.valdoro ? "Guardia di Valdoro" : "Soldato"}`,
        text: rep < -10 ? `"Ti teniamo d'occhio, canaglia."` : npc.valdoro ? `"Benvenuto a Valdoro. I messaggeri hanno parlato bene di te."` : `"Turno lungo. Il Capitano vuole il dazio da tutti."`,
        options: [
          ...(rep < -10 ? [] : [{ label: "Allenati con lui (duello di prova)", effect: "spar" }]),
          { label: "Corrompilo (5 oro)", effect: "bribe_soldier", disabled: p.gold < 5 },
          { label: "Insultalo", effect: "insult_soldier", danger: true },
          { label: "Vai", effect: "close" },
        ],
      };
    }
    case "silas": return {
      title: "Silas — Esattore della Corona",
      text: `"Il Re esige la decima sull'argento. Il mio forziere è sulla carrozza — e le mie guardie sono attente."`,
      options: [
        { label: "Pago la decima (15 oro)", effect: "pay_tithe", disabled: p.gold < 15 },
        { label: "Minaccialo", effect: "threaten_silas", danger: true },
        { label: "Inchinati e vai", effect: "close" },
      ],
    };
    case "aldo": return {
      title: "Mastro Aldo — Armaiolo di Valdoro",
      text: `"Acciaio di Valdoro, il migliore del regno. Elmi, cotte, piastre e scudi: una cotta ti salva la vita, le piastre ti rendono un muro."`,
      options: [
        { label: "Vai", effect: "close" },
      ],
    };
    case "garrick": return { title: "Garrick — Fabbro d'armi di Valdoro", text: `"Lame temprate nel sangue dei tornei. Lo spadone di Valdoro spacca gli scudi."`, options: [{ label: "Vai", effect: "close" }] };
    case "mira": return { title: "Mira — Speziale", text: `"Erbe, pozioni e torce per chi viaggia di notte. Il bosco è pieno di ombre."`, options: [{ label: "Vai", effect: "close" }] };
    case "bodo": return { title: "Bodo — Locandiere", text: `"Carne arrosto e vino di Valdoro! Un uomo sazio combatte meglio."`, options: [{ label: "Vai", effect: "close" }] };
    case "osric": return { title: "Osric — Mercante", text: `"Compro di tutto, vendo di tutto. Pelli, gemme, libri... e non faccio domande."`, options: [{ label: "Vai", effect: "close" }] };
    case "king": return {
      title: "Re Edric di Valdoro",
      text: S.known.crown >= 30 ? `"I messaggeri mi parlano di te, viandante. Valdoro ha bisogno di spade fedeli: non deludermi."`
        : S.known.crown < -10 ? `"Tu... il nome che i messaggeri sussurrano con disprezzo. Le mie guardie hanno gli occhi su di te."`
        : `"${CHATTER.valdoro[Math.floor(Date.now() / 8000) % CHATTER.valdoro.length]} E tu chi saresti, per parlare al tuo Re?"`,
      options: [{ label: "Inchinati e vai", effect: "close" }],
    };
    case "carriage": return {
      title: "Carrozza della Corona",
      text: "La carrozza della Corona gira per il villaggio. Il forziere è legato dietro: se il cocchiere guarda avanti, forse non ti vedrà.",
      options: [{ label: "Scassina il forziere (+60 oro, la Corona ti darà la caccia)", effect: "rob_carriage", danger: true, disabled: S.flags.carriageRobbed }, { label: "Lascia stare", effect: "close" }],
    };
    case "rack": return {
      title: "Rastrelliera del fabbro",
      text: (S.flags.rackTaken || 0) >= 3 ? "La rastrelliera è vuota." : `${["Tre spade lunghe", "Due spade lunghe", "Una spada lunga"][S.flags.rackTaken || 0]} appena affilat${(S.flags.rackTaken || 0) === 2 ? "a brilla" : "e brillano"} alla luce della forgia.`,
      options: [{ label: "Ruba una spada", effect: "steal_sword", danger: true, disabled: (S.flags.rackTaken || 0) >= 3 }, { label: "Lascia stare", effect: "close" }],
    };
    case "brann": case "oswin": {
      const left = Object.values(S.npcs).filter((n) => n.role === "bandit" && n.alive).length;
      const known = S.known.crown, open = S.gateOpen, bribed = !!S.flags.gateBribed;
      return {
        title: npc.name,
        text: bribed ? `"L'oro è stato contato. Passa, e ricorda: noi due non ci siamo mai parlati."`
          : open ? `"I messaggeri della Corona portano buone notizie sul tuo conto. Le porte di Valdoro sono aperte per te."`
          : known < -25 ? `"Sappiamo cosa hai fatto a Roccanera. Sparisci, o ti arrestiamo. Non c'è oro che basti per uno come te."`
          : `"Alt! Le mura di Valdoro sono chiuse ai vagabondi. Qui sappiamo solo ciò che i messaggeri a cavallo riferiscono da Roccanera: finora, il tuo nome non dice nulla. Torna quando la Corona ti conoscerà... a meno che la tua borsa non parli per te."`,
        options: [
          { label: "Chiedi dei banditi", next: { title: npc.name, text: left ? `"Capo Morn e i suoi tagliagole infestano il sentiero. A volte chiedono un pedaggio, a volte sgozzano e basta."` : `"Il sentiero è sicuro grazie a te. Ser Alaric saprà ricompensarti."`, options: [{ label: "Grazie", effect: "close" }] } },
          ...(open || bribed ? [] : [{ label: "Chiedi come entrare", next: { title: npc.name, text: `"Paga il dazio e la decima, riscuoti taglie, allenati con i soldati: ogni gesto arriva qui con i messaggeri a cavallo. Quando il tuo nome varrà abbastanza (Corona ≥ 30), le porte si apriranno.${known < -25 ? "" : `" Abbassa la voce: "Oppure... ${GATE_BRIBE} monete, e quella notte non ti abbiamo visto.`}"`,
            options: [...(known < -25 ? [] : [{ label: `Ecco ${GATE_BRIBE} monete: aprite`, effect: "bribe_gate", disabled: p.gold < GATE_BRIBE }]), { label: "Capito", effect: "close" }] } }]),
          { label: "Sfida il cavaliere", effect: "duel_knight", danger: true },
          { label: "Vai", effect: "close" },
        ],
      };
    }
    case "well": return { title: "Pozzo", text: "Acqua fresca e limpida.", options: [{ label: "Bevi (+10 vita)", effect: "drink" }, { label: "Vai", effect: "close" }] };
    case "fountain": return { title: "Fontana di Valdoro", text: "Acqua di montagna scorre dalla vasca di pietra.", options: [{ label: "Bevi (+10 vita)", effect: "drink" }, { label: "Vai", effect: "close" }] };
    default: return null;
  }
}

export function applyEffect(e, S, api) {
  const p = S.player;
  const rep = (k, d) => { S.rep[k] += d; };
  switch (e) {
    case "shop": api.shop(api.targetId); return null;
    case "loot": { const n = S.npcs[api.targetId]; const g = n.loot || 5; p.gold += g; n.looted = true; if (n.boss) { api.give("testa_morn", 1); return `Frughi ${n.name}: +${g} oro. Tagli la testa di Capo Morn come prova per Ser Alaric.`; } return `Frughi ${n.name}: +${g} oro.`; }
    case "chest_take": {
      const i = +api.targetId.slice(5), items = S.chests[i];
      S.flags.chests = { ...(S.flags.chests || {}), [i]: true };
      items.forEach(([id, q]) => api.give(id, q));
      if (api.crime(true)) { rep("village", -15); return `Svuoti il baule (${names(items)})... ma qualcuno ti ha visto!`; }
      return `Svuoti il baule: ${names(items)}. Nessuno se n'è accorto.`;
    }
    case "torin_give": p.ore -= 3; rep("village", 20); S.flags.torinHelped = true; p.gold += 5; return `Torin stringe l'argento e piange di gioia: "Che i Santi ti benedicano! Prendi queste monete, è tutto quello che ho." (+5 oro; il villaggio ti guarda con rispetto)`;
    case "torin_accept": S.flags.torinQuest = true; return `"Davvero? Che i Santi ti benedicano! Le vene d'argento brillano d'azzurro, nella grotta della collina a ovest. Ne bastano 3. Ti aspetto qui."`;
    case "torin_decline": return `Torin abbassa lo sguardo: "Capisco... chi aiuterebbe un vecchio minatore?"`;
    case "torin_tips": return `"Le vene d'argento brillano d'azzurro, nella grotta a ovest. Schiva quando il nemico alza la spada, e di notte muoviti furtivo: ti vedranno meno."`;
    case "torin_steal": {
      p.gold += 40; S.flags.torinRobbed = true;
      if (Math.random() < 0.35) { rep("village", -35); api.scream("torin", "Al ladro! I miei risparmi!"); return "Prendi 40 monete... ma Torin se ne accorge!"; }
      if (api.crime(true)) { rep("village", -35); return "Prendi 40 monete, ma qualcuno ti ha visto."; }
      return "Prendi 40 monete. Nessuno se n'è accorto.";
    }
    case "forge_sword": p.ore -= 3; api.give("spada_lunga", 1); api.equipIfBetter("spada_lunga"); rep("village", 3); return `Il martello canta per un'ora. Bruno ti porge una spada lunga ancora calda: "Ecco. Bilanciata come si deve."`;
    case "forge_master": p.ore -= 6; p.gold -= 20; api.give("spada_roccanera", 1); api.equip("spada_roccanera"); rep("village", 5); return `Bruno lavora tutta la notte. All'alba ti porge la Lama di Roccanera, che brilla d'azzurro: "Non ne farò mai una migliore."`;
    case "bounty": { const n = Object.values(S.npcs).filter((x) => x.role === "bandit" && !x.boss && !x.alive).length - (S.flags.bountyClaimed || 0); p.gold += n * 20; S.flags.bountyClaimed = (S.flags.bountyClaimed || 0) + n; rep("crown", n * 5); return `"Ben fatto. La valle è più sicura grazie a te. Ecco la taglia: ${n * 20} monete." (+${n * 20} oro)`; }
    case "morn_quest": S.flags.mornQuest = true; rep("crown", 2); return `"Bene. Il suo campo è nel bosco a nord, oltre i primi alberi, accanto al sentiero. Quando avrai la sua testa, torna da me."`;
    case "morn_decline": return `"Come vuoi. L'incarico resta valido, se cambi idea."`;
    case "ask_morn": return `"Nel bosco a nord, poco oltre i primi alberi, accanto al sentiero: un campo con tende e una palizzata. Ha tre tagliagole con sé, e di notte i suoi colpiscono più duro."`;
    case "morn_deliver": api.take("testa_morn", 1); p.gold += 40; rep("crown", 15); S.flags.mornDone = true; return `Alaric solleva la testa davanti ai soldati: "Per tutti i Santi, è Capo Morn! Il flagello del sentiero è finito. Ben fatto, viandante: ecco la tua ricompensa." (+40 oro, la Corona ti è grata)`;
    case "spar": api.spar(api.targetId); return `${S.npcs[api.targetId].name} sguaina la spada: "In guardia! Il primo che cede perde."`;
    case "fight_bandits": api.hostile(Object.values(S.npcs).filter((x) => x.role === "bandit" && Math.hypot(x.x - p.x, x.z - p.z) < 15).map((x) => x.id)); return "I banditi sguainano le lame!";
    case "pay_tax": p.gold -= 10; rep("crown", 10); S.flags.taxPaid = true; return `Alaric conta le monete e annuisce: "Sei in regola con la Corona. Ti serve qualcosa?" (−10 oro)`;
    case "flatter":
      if (Math.random() < 0.45) { S.flags.taxPaid = true; rep("crown", 2); return `Alaric ride: "Lingua d'argento! Per oggi passi senza pagare."`; }
      rep("crown", -5); return `Alaric ti guarda storto: "Le lusinghe non pagano il dazio."`;
    case "duel_alaric": api.hostile(["alaric"]); rep("crown", -15); return "Alaric sguaina la spada: \"Che sia l'acciaio a decidere!\"";
    case "bribe_soldier": p.gold -= 5; rep("crown", 4); return `Il soldato intasca la moneta e chiude un occhio: "Non ti ho visto." (−5 oro)`;
    case "insult_soldier": api.hostile([api.targetId]); rep("crown", -10); return "\"Come osi?!\" Il soldato ti attacca!";
    case "pay_tithe": p.gold -= 15; rep("crown", 12); return `Silas registra il tuo nome nel libro della Corona: "Il Re ricorderà la tua lealtà." (−15 oro)`;
    case "threaten_silas": rep("crown", -25); api.scream("silas", "Guardie! Mi minacciano!"); return "Silas scappa strillando.";
    case "rob_carriage": p.gold += 60; S.flags.carriageRobbed = true;
      if (api.robCarriage()) { rep("crown", -40); return "Scassini il forziere: +60 oro! Ti hanno visto: il corno d'allarme suona."; }
      rep("crown", -5); return "Scassini il forziere senza un rumore: +60 oro. Nessuno ti ha visto.";
    case "steal_sword": S.flags.rackTaken = (S.flags.rackTaken || 0) + 1; api.give("spada_lunga", 1); api.equipIfBetter("spada_lunga");
      if (api.crime(true, "bruno")) { rep("village", -15); return "Afferri una spada lunga... ma qualcuno ti ha visto!"; }
      return "Afferri una spada lunga. Nessuno se n'è accorto.";
    case "drink": api.heal(10); return "Bevi. +10 vita.";
    case "toll_pay": p.gold -= Math.min(30, p.gold); api.forest("paid"); return `Capo Morn intasca le monete: "Passa pure. Per oggi."`;
    case "toll_intimidate": {
      if (Math.random() < [0.25, 0.5, 0.8][SWORDS[p.sword].tier]) { api.forest("paid"); return `Capo Morn guarda la tua lama e indietreggia: "Va bene, va bene... passa."`; }
      api.forest("fight"); return `Capo Morn ride: "Mi fai il solletico! Addosso!"`;
    }
    case "toll_refuse": api.forest("fight"); return `"Allora prenderemo tutto dal tuo cadavere!" I banditi attaccano!`;
    case "bribe_gate": p.gold -= GATE_BRIBE; S.flags.gateBribed = true; return `${S.npcs[api.targetId].name} soppesa la borsa e fa un cenno al compagno: "Aprite. Questo viandante è atteso." Le porte di Valdoro sono tue, per sempre.`;
    case "duel_knight": api.hostile([api.targetId]); rep("crown", -20); return `${S.npcs[api.targetId].name} abbassa la visiera: "Che sia un duello, allora."`;
    default: return null;
  }
}
