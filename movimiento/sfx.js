// MiVibra Movimiento — sonidos "grabados" en vivo con síntesis (sin archivos): golpes de material (síntesis modal),
// público, silbato, campana… con reverberación de estadio, sala o aire libre generada al vuelo. Livianos para TV.
export class SFX {
  constructor() { this.vol = 0.9; this.on = true; }
  ac() {
    if (!this._ac) {
      const C = window.AudioContext || window.webkitAudioContext; const a = this._ac = new C();
      this.master = a.createGain(); this.master.gain.value = this.vol; this.out = a.createDynamicsCompressor(); this.out.connect(this.master).connect(a.destination);
      // reverberación generada (sin archivos): estadio = cola larga, sala = corta
      this.rev = {}; [['estadio', 2.6, 2.2], ['sala', .9, 3.2], ['aire', .35, 5]].forEach(([k, sec, dec]) => {
        const len = Math.floor(a.sampleRate * sec), ir = a.createBuffer(2, len, a.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, dec); }
        const cv = a.createConvolver(); cv.buffer = ir; const g = a.createGain(); g.gain.value = .55; cv.connect(g).connect(this.out); this.rev[k] = cv; });
    }
    if (this._ac.state === 'suspended' && this._ac.resume && !(this._ac instanceof (window.OfflineAudioContext || Object))) this._ac.resume();
    return this._ac;
  }
  bus(room) { const a = this.ac(), g = a.createGain(); g.connect(this.out); if (room) { const s = a.createGain(); s.gain.value = room[1]; g.connect(s).connect(this.rev[room[0]]); } return g; }
  noise(sec) { const a = this.ac(), b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * sec)), a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
  env(g, t, at, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dec); }
  hit(t, dur, peak, type, f, q, out) { const a = this.ac(), n = this.noise(dur + .05), fl = a.createBiquadFilter(), g = a.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || .8; this.env(g, t, .002, peak, dur); n.connect(fl).connect(g).connect(out); n.start(t); }
  // síntesis modal: un golpe corto excita resonancias del material (madera, metal, cuero)
  modes(t, list, peak, out, click = .004) { const a = this.ac(), n = this.noise(click + .01), ge = a.createGain(); this.env(ge, t, .0005, 1, click); n.connect(ge); n.start(t);
    list.forEach(([f, dec, gn]) => { const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (1 + (Math.random() - .5) * .03); const Q = Math.min(f * dec * 3.2, 4000); bp.Q.value = Q; const g = a.createGain(); g.gain.value = peak * gn * Math.sqrt(Q) * 1.5; ge.connect(bp).connect(g).connect(out); }); }
  ring(t, list, peak, out) { list.forEach(([f, dur, gn]) => { const a = this.ac(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = f * (1 + (Math.random() - .5) * .004); this.env(g, t, .002, peak * gn, dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + .1); }); }
  thump(t, f0, f1, dur, peak, out) { const a = this.ac(), o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); this.env(g, t, .003, peak, dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + .05); }
  // público: muchas "voces" de ruido con formantes que suben y bajan
  crowd(t, len, peak, out, cheer) { const a = this.ac();
    for (let v = 0; v < 14; v++) { const n = this.noise(len), f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain(); f1.type = f2.type = 'bandpass';
      const base = 350 + Math.random() * 500; f1.frequency.setValueAtTime(base, t); f1.frequency.linearRampToValueAtTime(base * (cheer ? 1.6 : 1.1), t + len * .4); f1.Q.value = 3; f2.frequency.value = base * 2.6; f2.Q.value = 4;
      const st = t + Math.random() * len * .2; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak / 6, st + len * .3); g.gain.exponentialRampToValueAtTime(.0001, t + len);
      n.connect(f1); n.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); n.start(t); } }
  claps(t, len, n, peak, out) { for (let i = 0; i < n; i++) { const d = t + Math.random() * len; this.hit(d, .018 + Math.random() * .02, peak * (.4 + Math.random() * .6), 'bandpass', 900 + Math.random() * 1800, 1.4, out); } }
  // extras para los juegos nuevos
  whoosh(t, dur = .25, peak = .3, f0 = 500, f1 = 2400, out) { const a = this.ac(), n = this.noise(dur + .05), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * .6); this.env(g, t, dur * .4, peak, dur * .6); n.connect(f).connect(g).connect(out); n.start(t); }
  play(name, vol = 1) {
    if (!this.on) return; const fn = this.lib()[name]; if (!fn) return;
    try { this.ac(); const k = this.master.gain; k.value = this.vol * vol; fn(); } catch (e) {}
  }
  lib() {
    if (this._lib) return this._lib;
    const now = () => this.ac().currentTime + .02;
    return (this._lib = {
    ovacion: () => { const t = now(), o = this.bus(['estadio', .7]); this.crowd(t, 4, .9, o, true); this.claps(t + .6, 3, 70, .25, o); },
    aplausos: () => { const t = now(), o = this.bus(['sala', .5]); this.claps(t, 2.4, 110, .35, o); },
    silbato: () => { const t = now(), a = this.ac(), o = this.bus(['estadio', .4]);
        [[0, .22], [.32, .9]].forEach(([d, len]) => { const os = a.createOscillator(), am = a.createOscillator(), amg = a.createGain(), g = a.createGain(), vg = a.createGain(); os.frequency.value = 2650 + Math.random() * 60; am.frequency.value = 28 + Math.random() * 6; amg.gain.value = .45; vg.gain.value = .55;
          am.connect(amg).connect(vg.gain); this.env(g, t + d, .015, .16, len); os.connect(vg).connect(g).connect(o); os.start(t + d); am.start(t + d); os.stop(t + d + len + .1); am.stop(t + d + len + .1); this.hit(t + d, len, .03, 'highpass', 4000, .7, o); }); },
    patada: () => { const t = now(), o = this.bus(['estadio', .25]); this.thump(t, 140, 55, .16, .9, o); this.modes(t, [[620, .05, 1], [1150, .03, .5]], .5, o); this.hit(t, .04, .5, 'bandpass', 2400, 1.2, o); },
    chuza: () => { const t = now(), o = this.bus(['sala', .55]); this.thump(t, 90, 60, .25, .7, o);
        for (let i = 0; i < 14; i++) this.modes(t + .03 + i * .028 + Math.random() * .05, [[480 + Math.random() * 120, .12, 1], [1320 + Math.random() * 200, .07, .6], [2650, .04, .3]], .35, o); },
    raqueta: () => { const t = now(), o = this.bus(['estadio', .3]); this.modes(t, [[340, .08, .8], [900, .06, 1], [1900, .03, .4]], .6, o); this.hit(t, .03, .4, 'bandpass', 3000, 1, o); },
    pingpong: () => { const t = now(), o = this.bus(['sala', .35]); [0, .42, .78].forEach((d, i) => this.modes(t + d, i === 1 ? [[1400, .05, 1], [3200, .03, .5]] : [[2900, .03, 1], [5100, .02, .4]], 1.1, o, .002)); },
    campana: () => { const t = now(), o = this.bus(['sala', .5]); [0, .45, .9].forEach((d) => { this.ring(t + d, [[1180, 2.2, 1], [2780, 1.4, .5], [4310, .9, .3], [610, 1.8, .35], [1730, 1.1, .25]], .22, o); this.hit(t + d, .01, .4, 'highpass', 3000, .7, o); }); },
    guante: () => { const t = now(), o = this.bus(['sala', .4]); this.thump(t, 110, 45, .14, 1, o); this.hit(t, .06, .7, 'lowpass', 1800, .7, o); this.modes(t, [[260, .06, 1]], .5, o); },
    dardo: () => { const t = now(), o = this.bus(['sala', .3]); this.hit(t, .25, .05, 'bandpass', 1800, .6, o); this.modes(t + .25, [[210, .12, 1], [480, .06, .5], [3500, .01, .4]], 1.6, o, .002); },
    batazo: () => { const t = now(), o = this.bus(['estadio', .5]); this.modes(t, [[880, .09, 1], [2150, .05, .8], [3600, .03, .5]], .7, o, .002); this.thump(t, 200, 90, .08, .5, o); },
    esqui: () => { const t = now(), a = this.ac(), o = this.bus(['aire', .3]); for (let k = 0; k < 3; k++) { const d = t + k * .7, n = this.noise(.9), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.Q.value = .9; f.frequency.setValueAtTime(900, d); f.frequency.exponentialRampToValueAtTime(3800, d + .45); f.frequency.exponentialRampToValueAtTime(1200, d + .85); this.env(g, d, .12, .45, .7); n.connect(f).connect(g).connect(o); n.start(d); } },
    disparo: () => { const t = now(), o = this.bus(['estadio', .9]); this.hit(t, .09, 1, 'lowpass', 5000, .5, o); this.thump(t, 160, 40, .2, .8, o); },
    flecha: () => { const t = now(), a = this.ac(), o = this.bus(['aire', .4]); this.modes(t, [[95, .25, 1], [190, .12, .5]], .5, o); const n = this.noise(.5), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(600, t + .05); f.frequency.exponentialRampToValueAtTime(2600, t + .4); this.env(g, t + .05, .3, .25, .1); n.connect(f).connect(g).connect(o); n.start(t + .05); this.modes(t + .55, [[330, .1, 1], [140, .2, .8]], .7, o, .003); },
    poder: () => { const t = now(), o = this.bus(['aire', .5]); [784, 988, 1175, 1568, 1976].forEach((f, i) => this.ring(t + i * .045, [[f, .5, 1], [f * 2.01, .3, .3], [f * 3.02, .15, .15]], .14, o)); },
    trampa: () => { const t = now(), a = this.ac(), o = this.bus(['aire', .3]), os = a.createOscillator(), lf = a.createOscillator(), lg = a.createGain(), g = a.createGain(); os.type = 'triangle'; os.frequency.setValueAtTime(180, t); os.frequency.exponentialRampToValueAtTime(520, t + .35); lf.frequency.value = 22; lg.gain.value = 40; lf.connect(lg).connect(os.frequency); this.env(g, t, .005, .4, .45); os.connect(g).connect(o); os.start(t); lf.start(t); os.stop(t + .55); lf.stop(t + .55); },
    perfecto: () => { const t = now(), o = this.bus(['sala', .4]); [523, 659, 784, 1047].forEach((f, i) => this.ring(t + i * .07, [[f, .6, 1], [f * 2, .4, .4], [f * 3, .2, .2]], .14, o)); this.claps(t + .25, .6, 25, .2, o); },
    ritmo: () => { const t = now(), b = .25, o = this.bus(['sala', .25]); for (let i = 0; i < 16; i++) { const d = t + i * b / 2; if (i % 2 === 0) this.thump(d, 150, 45, .18, 1, o); else this.hit(d, .03, .22, 'highpass', 8000, .7, o); if (i % 4 === 2) { this.hit(d, .12, .45, 'bandpass', 1900, .9, o); this.modes(d, [[220, .08, 1]], .3, o); } } [262, 330, 392, 330].forEach((f, i) => this.ring(t + i * b * 2, [[f, .45, 1], [f * 2, .3, .5], [f * 1.5, .3, .3]], .1, o)); },
    hoyo: () => { const t = now(), o = this.bus(['aire', .2]); this.ring(t, [[1650, .08, 1], [3900, .04, .4]], .3, o); this.ring(t + .12, [[900, .1, 1], [2300, .05, .5]], .35, o); this.ring(t + .2, [[420, .18, 1], [1050, .08, .4]], .4, o); },
    swing: () => { const t = now(); this.whoosh(t, .22, .35, 400, 2200, this.bus(['aire', .2])); },
    salto: () => { const t = now(), a = this.ac(), o = this.bus(['aire', .2]), os = a.createOscillator(), g = a.createGain(); os.type = 'triangle'; os.frequency.setValueAtTime(260, t); os.frequency.exponentialRampToValueAtTime(720, t + .18); this.env(g, t, .01, .25, .22); os.connect(g).connect(o); os.start(t); os.stop(t + .3); },
    golpe: () => { const t = now(), o = this.bus(['sala', .3]); this.thump(t, 120, 50, .16, .9, o); this.hit(t, .05, .4, 'lowpass', 1500, .7, o); },
    click: () => { const t = now(), o = this.bus(null); this.modes(t, [[1800, .02, 1]], .4, o, .001); },
    ok: () => { const t = now(), o = this.bus(['sala', .2]); [660, 880].forEach((f, i) => this.ring(t + i * .08, [[f, .25, 1], [f * 2, .12, .3]], .14, o)); },
    error: () => { const t = now(), a = this.ac(), o = this.bus(['sala', .2]), os = a.createOscillator(), g = a.createGain(); os.type = 'square'; os.frequency.setValueAtTime(220, t); os.frequency.linearRampToValueAtTime(150, t + .3); this.env(g, t, .01, .12, .3); os.connect(g).connect(o); os.start(t); os.stop(t + .4); },
    caida: () => { const t = now(), o = this.bus(['aire', .3]); this.thump(t, 90, 40, .3, 1, o); this.hit(t, .25, .5, 'lowpass', 900, .6, o); },
    ole: () => { const t = now(), o = this.bus(['estadio', .6]); this.crowd(t, 2.2, .7, o, true); },
    abucheo: () => { const t = now(), o = this.bus(['estadio', .5]); this.crowd(t, 1.8, .45, o, false); },
    });
  }
}
