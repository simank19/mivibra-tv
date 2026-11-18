// MiVibra Movimiento — sonido compartido por todos los juegos.
// Grabaciones reales (público, aplausos, ovación, aves, fuegos) + efectos cortos "grabados" una sola vez al empezar.
// Todo a 44,1 kHz (antes los efectos iban a 22 kHz y sonaban apagados, "como TV antigua").
export function makeSound(opts = {}) {
  let ac = null, out = null, on = true, ready = null;
  const B = {}, loops = new Map(), FX = opts.fx || {};
  const SR = 44100, base = opts.base || '../sonidos/';
  function noiseBuf(c, sec = 2) { const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  // Ayudas para dibujar efectos dentro de un OfflineAudioContext
  const H = {
    nz(c, t, dur, type, freq, gain, attack = 0.005, q = 0.7, sweep) { const s = c.createBufferSource(); s.buffer = noiseBuf(c, Math.max(0.2, dur + 0.1)); const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur * 0.9); f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur + 0.05); },
    tn(c, t, freq, dur, type = 'sine', gain = 0.2, sweepTo, attack = 0.008) { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur * 0.6); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); let n = o; if (type !== 'sine') { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200; o.connect(f); n = f; } n.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05); },
  };
  async function render(name) { const [dur, fn] = FX[name]; const oc = new OfflineAudioContext(1, Math.ceil(dur * SR), SR); fn(oc, H); B[name] = await oc.startRendering(); }
  async function fetchBuf(name) { try { const r = await fetch(base + name + '.mp3'); if (!r.ok) return; B[name] = await ac.decodeAudioData(await r.arrayBuffer()); } catch (e) {} }
  const S = {
    get on() { return on; }, get ctx() { return ac; },
    init() {
      if (ac) return ready; const AC = window.AudioContext || window.webkitAudioContext;
      try { ac = new AC({ latencyHint: 'playback', sampleRate: SR }); } catch (e) { try { ac = new AC(); } catch (e2) { return null; } }
      out = ac.createGain(); out.gain.value = opts.volume || 0.9;
      // un compresor suave evita que el público y los golpes juntos distorsionen
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      out.connect(comp); comp.connect(ac.destination);
      ready = (async () => {
        await Promise.all((opts.files || []).map(fetchBuf));
        for (const n in FX) { try { await render(n); } catch (e) {} await new Promise((r) => setTimeout(r, 0)); }
      })();
      return ready;
    },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },
    toggle() { on = !on; loops.forEach((l) => l.g.gain.setTargetAtTime(on ? l.v : 0, ac.currentTime, 0.1)); return on; },
    has(n) { return !!B[n]; },
    play(name, gain = 1, rate = 1, when = 0) {
      if (!ac || !on || !B[name]) return null; S.resume();
      const s = ac.createBufferSource(); s.buffer = B[name]; s.playbackRate.value = rate; const g = ac.createGain(); g.gain.value = gain; s.connect(g); g.connect(out); s.start(ac.currentTime + when); return { s, g };
    },
    // bucle continuo con volumen ajustable (público, aplausos, olas…)
    loop(name, vol = 0.5) {
      if (!ac) return null; let L = loops.get(name);
      const start = () => { if (L && L.s) return; if (!B[name]) return; const s = ac.createBufferSource(); s.buffer = B[name]; s.loop = true; s.loopStart = 0.03; s.loopEnd = Math.max(0.1, B[name].duration - 0.06); const g = ac.createGain(); g.gain.value = on ? vol : 0; s.connect(g); g.connect(out); s.start(); L = { s, g, v: vol }; loops.set(name, L); };
      if (B[name]) start(); else if (ready) ready.then(start);
      return { set: (v, tc = 0.4) => { const l = loops.get(name); if (!l) return; l.v = v; l.g.gain.setTargetAtTime(on ? v : 0, ac.currentTime, tc); }, stop: () => { const l = loops.get(name); if (!l) return; try { l.s.stop(); } catch (e) {} loops.delete(name); } };
    },
    stopLoop(name) { const l = loops.get(name); if (!l) return; try { l.s.stop(); } catch (e) {} loops.delete(name); },
    setLoop(name, v, tc = 0.4) { const l = loops.get(name); if (!l || !ac) return; l.v = v; l.g.gain.setTargetAtTime(on ? v : 0, ac.currentTime, tc); },
  };
  return S;
}
