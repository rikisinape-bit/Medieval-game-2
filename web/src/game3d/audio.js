// Procedural Web Audio sound effects (no audio files).
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  const unlock = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  };
  const ok = (v) => ctx && ctx.state === "running" && v > 0.02;
  const gain = (t, peak, dur, attack = 0.005) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    g.connect(master);
    return g;
  };
  const noise = (t, dur, type, f, peak, q = 1, f2) => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(flt); flt.connect(gain(t, peak, dur));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  };
  const tone = (t, type, f, peak, dur, f2) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(gain(t, peak, dur)); o.start(t); o.stop(t + dur + 0.05);
  };
  const metal = (v, partials, dur) => {
    const t = ctx.currentTime, j = 0.95 + Math.random() * 0.1;
    partials.forEach((f, i) => tone(t, i ? "sine" : "triangle", f * j, (0.25 * v) / (i + 1), dur / (1 + i * 0.4)));
    noise(t, 0.03, "highpass", 3000, 0.4 * v);
  };

  return {
    unlock,
    swing: (v = 1) => { if (ok(v)) noise(ctx.currentTime, 0.18, "bandpass", 500, 0.5 * v, 2, 2600); },
    clash: (v = 1) => { if (ok(v)) metal(v, [1850, 2640, 3920, 5100], 0.45); },
    anvil: (v = 1) => { if (ok(v)) { metal(v * 0.8, [1180, 1760, 2950], 0.6); tone(ctx.currentTime, "sine", 180, 0.3 * v, 0.08, 90); } },
    hit: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "sine", 150, 0.6 * v, 0.16, 55); noise(t, 0.1, "lowpass", 900, 0.5 * v); } },
    step: (v = 1) => { if (ok(v)) noise(ctx.currentTime, 0.06, "lowpass", 380 + Math.random() * 150, 0.35 * v, 0.8); },
    creak: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "sawtooth", 140, 0.08 * v, 0.4, 210); noise(t, 0.25, "bandpass", 700, 0.12 * v, 4, 1400); } },
    pick: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "triangle", 620, 0.2 * v, 0.08); tone(t + 0.07, "triangle", 930, 0.2 * v, 0.12); } },
    gate: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "square", 60, 0.15 * v, 1.6, 90); for (let i = 0; i < 6; i++) noise(t + i * 0.25, 0.08, "bandpass", 1500, 0.25 * v, 5); } },
    hoof: (v = 1) => {
      if (!ok(v)) return;
      const t = ctx.currentTime;
      [0, 0.09].forEach((dt, i) => { noise(t + dt, 0.04, "bandpass", 900 + i * 300, 0.5 * v, 3); tone(t + dt, "sine", 320 - i * 60, 0.2 * v, 0.05); });
    },
    // Voice-like cry: sawtooth through two formant filters with vibrato.
    scream: (v = 1, pitch = 320, dur = 0.9, fall = false) => {
      if (!ok(v)) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(pitch, t);
      if (fall) o.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + dur);
      else { o.frequency.exponentialRampToValueAtTime(pitch * 1.6, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(pitch * 1.1, t + dur); }
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 6; lg.gain.value = pitch * 0.04; lfo.connect(lg); lg.connect(o.frequency);
      const g = gain(t, 0.9 * v, dur, 0.05);
      [[850, 6], [1250, 8]].forEach(([f, q]) => { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = f; b.Q.value = q; o.connect(b); b.connect(g); });
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    },
    // The wolves (wolves.js): a howl rising and falling away, a growl, the snap of a bite, a yelp, a whine
    howl: (v = 1) => {
      if (!ok(v)) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.7);
      o.frequency.setValueAtTime(660, t + 1.5); o.frequency.exponentialRampToValueAtTime(430, t + 2.6);
      lfo.frequency.value = 5; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      const g = gain(t, 0.45 * v, 2.6, 0.35), b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = 900; b.Q.value = 1.2;
      o.connect(b); b.connect(g); o.start(t); lfo.start(t); o.stop(t + 3); lfo.stop(t + 3);
    },
    growl: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "sawtooth", 92, 0.16 * v, 0.55, 78); noise(t, 0.5, "lowpass", 320, 0.3 * v, 3); } },
    bite: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; noise(t, 0.05, "highpass", 2400, 0.55 * v); tone(t, "sine", 210, 0.3 * v, 0.07, 90); } },
    yelp: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; [0, 0.16].forEach((d) => { tone(t + d, "sawtooth", 1050, 0.12 * v, 0.13, 640); }); } },
    whine: (v = 1) => { if (ok(v)) { const t = ctx.currentTime; tone(t, "triangle", 760, 0.1 * v, 0.55, 520); tone(t + 0.6, "triangle", 700, 0.07 * v, 0.4, 560); } },
    dispose: () => { if (ctx) ctx.close(); },
  };
}
