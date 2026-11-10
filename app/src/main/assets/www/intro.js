/* MiVibra TV — Intro de bienvenida: logo, secciones de la app, consolas y cierre (~11 s) con sonido sintetizado.
   Se salta con OK / Atrás / cualquier botón. Ajustes → Temas: siempre, una vez al día o nunca; con o sin sonido. */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};
  var CONS = ['nes', 'snes', 'n64', 'gba', 'psx', 'psp', 'md', 'dc', 'neogeo', 'arcade', 'gb', 'nds'];
  var CARDS = JSON.parse('"<div class=\\"sec\\" style=\\"--c:#E0447C;--i:0\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"3\\" y=\\"7\\" width=\\"18\\" height=\\"13\\" rx=\\"2\\"/><path d=\\"M8 3l4 4 4-4\\"/></svg></div><b>TV en vivo</b></div><div class=\\"sec\\" style=\\"--c:#A879FF;--i:1\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M4 9h16v11H4z\\"/><path d=\\"M4 9l2-5 4 1-2 4M10 5l4 1-2 3M14 6l4 1-1 2\\"/></svg></div><b>Pel\\u00edculas</b></div><div class=\\"sec\\" style=\\"--c:#4C8DFF;--i:2\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"3\\" y=\\"5\\" width=\\"18\\" height=\\"12\\" rx=\\"2\\"/><path d=\\"M8 21h8M10 9l5 3-5 3z\\"/></svg></div><b>Series</b></div><div class=\\"sec\\" style=\\"--c:#FF4D4D;--i:3\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"2.5\\" y=\\"5\\" width=\\"19\\" height=\\"14\\" rx=\\"4\\"/><path d=\\"M10 9l5 3-5 3z\\" fill=\\"currentColor\\"/></svg></div><b>YouTube</b></div><div class=\\"sec\\" style=\\"--c:#22C7A9;--i:4\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M9 18V5l11-2v13\\"/><circle cx=\\"6\\" cy=\\"18\\" r=\\"3\\"/><circle cx=\\"17\\" cy=\\"16\\" r=\\"3\\"/></svg></div><b>M\\u00fasica</b></div><div class=\\"sec\\" style=\\"--c:#FF9A4D;--i:5\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2v-1a4 4 0 0 1 4-4z\\"/><path d=\\"M8 11v3M6.5 12.5h3\\"/><circle cx=\\"16\\" cy=\\"12\\" r=\\".8\\" fill=\\"currentColor\\"/><circle cx=\\"18\\" cy=\\"14\\" r=\\".8\\" fill=\\"currentColor\\"/></svg></div><b>Juegos</b></div><div class=\\"sec\\" style=\\"--c:#53FC18;--i:6\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"3\\" y=\\"6\\" width=\\"13\\" height=\\"12\\" rx=\\"2\\"/><path d=\\"M16 10l5-3v10l-5-3\\"/><circle cx=\\"7\\" cy=\\"10\\" r=\\"1.2\\" fill=\\"currentColor\\"/></svg></div><b>Kick</b></div><div class=\\"sec\\" style=\\"--c:#9146FF;--i:7\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"2\\" fill=\\"currentColor\\"/><path d=\\"M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8\\"/></svg></div><b>Twitch</b></div><div class=\\"sec\\" style=\\"--c:#F5C842;--i:8\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"9\\"/><path d=\\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\\"/></svg></div><b>Navegador</b></div><div class=\\"sec\\" style=\\"--c:#9AA5B1;--i:9\\"><div class=\\"si\\"><svg viewBox=\\"0 0 24 24\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.7\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><rect x=\\"7\\" y=\\"2.5\\" width=\\"10\\" height=\\"19\\" rx=\\"2\\"/><path d=\\"M11 18h2\\"/></svg></div><b>Celular como mando</b></div>"');
  var el = null, ac = null, sound = true, endT = null, done = null;
  function mode() { var p = MV.load('prefs', {}) || {}; return p.introMode || 'daily'; }
  function soundOn() { var p = MV.load('prefs', {}) || {}; return p.introSound !== false; }
  function shouldShow() {
    var m = mode(); if (m === 'never') return false;
    if (m === 'always') return true;
    var today = new Date().toDateString();
    if (MV.load('introDay', '') === today) return false;
    MV.save('introDay', today); return true;
  }
  // ===== Banda sonora sintetizada (Web Audio): todo se genera en el navegador, sin archivos =====
  var bus=null;
  var offline=false, wavAudio=null, startedAt=0;
  function ctx(){ac=ac||new (window.AudioContext||window.webkitAudioContext)();if(!offline&&ac.state==='suspended'){try{var pr=ac.resume();if(pr&&pr.catch)pr.catch(function(){})}catch(e){}}return ac}
  // Algunos televisores no dejan sonar Web Audio sin tocar un botón: se graba la banda sonora y se reproduce como audio normal
  function toWav(buf){var ch=buf.numberOfChannels,sr=buf.sampleRate,n=buf.length,dv=new DataView(new ArrayBuffer(44+n*ch*2));
    function w(o,t){for(var i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))}
    w(0,'RIFF');dv.setUint32(4,36+n*ch*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,ch,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*ch*2,true);dv.setUint16(32,ch*2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*ch*2,true);
    var data=[];for(var c=0;c<ch;c++)data.push(buf.getChannelData(c));var o=44;for(var i=0;i<n;i++)for(c=0;c<ch;c++){var v=Math.max(-1,Math.min(1,data[c][i]));dv.setInt16(o,v<0?v*0x8000:v*0x7FFF,true);o+=2}
    return new Blob([dv],{type:'audio/wav'})}
  function fallback(){
    if(!el||!sound||(ac&&ac.state==='running'))return;
    var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OAC)return;
    var live=ac,liveBus=bus;
    try{ac=new OAC(2,22050*12,22050);bus=null;offline=true;score()}catch(e){ac=live;bus=liveBus;offline=false;return}
    var off=ac;ac=live;bus=liveBus;offline=false;
    var pr=off.startRendering();var after=function(buf){
      if(!el)return;wavAudio=new Audio(URL.createObjectURL(toWav(buf)));
      try{wavAudio.currentTime=Math.max(0,(Date.now()-startedAt)/1000)}catch(e){}
      var p=wavAudio.play();if(p&&p.catch)p.catch(function(){})};
    if(pr&&pr.then)pr.then(after);else off.oncomplete=function(e){after(e.renderedBuffer)}}
  function mkBus(){var c=ctx();if(bus)return bus;
    var comp=c.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=4;comp.connect(c.destination);
    var master=c.createGain();master.gain.value=.9;master.connect(comp);
    // reverb: respuesta de impulso hecha con ruido que se apaga
    var len=c.sampleRate*2.6,ir=c.createBuffer(2,len,c.sampleRate);for(var ch=0;ch<2;ch++){var d=ir.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2)}
    var rev=c.createConvolver();rev.buffer=ir;var revG=c.createGain();revG.gain.value=.35;rev.connect(revG);revG.connect(master);
    // eco estéreo
    var dl=c.createDelay(1);dl.delayTime.value=.375;var fb=c.createGain();fb.gain.value=.32;var dlG=c.createGain();dlG.gain.value=.22;dl.connect(fb);fb.connect(dl);dl.connect(dlG);dlG.connect(master);
    var noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate),nd=noise.getChannelData(0);for(var j=0;j<nd.length;j++)nd[j]=Math.random()*2-1;
    bus={master:master,rev:rev,dl:dl,noise:noise};return bus}
  function out(node,dry,wet,echo){var B=mkBus(),c=ctx();var g=c.createGain();g.gain.value=dry;node.connect(g);g.connect(B.master);if(wet){var w=c.createGain();w.gain.value=wet;node.connect(w);w.connect(B.rev)}if(echo){var e=c.createGain();e.gain.value=echo;node.connect(e);e.connect(B.dl)}}
  function env(g,t,a,peak,dec,sus,rel){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(Math.max(sus,.0001),t+a+dec);g.gain.setValueAtTime(Math.max(sus,.0001),t+a+dec);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec+rel)}
  // Golpe grave (sub + click)
  function hit(t,f,vol){var c=ctx(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(f*3,t);o.frequency.exponentialRampToValueAtTime(f,t+.12);env(g,t,.005,vol,.6,.0001,.1);o.connect(g);out(g,1,.15);o.start(t);o.stop(t+1);
    var n=c.createBufferSource();n.buffer=bus.noise;var hp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=2500;var ng=c.createGain();env(ng,t,.002,vol*.35,.06,.0001,.02);n.connect(hp);hp.connect(ng);out(ng,1,.3);n.start(t);n.stop(t+.2)}
  // Barrido de ruido (riser / whoosh)
  function sweep(t,dur,f1,f2,vol,q){var c=ctx(),n=c.createBufferSource();n.buffer=bus.noise;n.loop=true;var bp=c.createBiquadFilter();bp.type='bandpass';bp.Q.value=q||6;bp.frequency.setValueAtTime(f1,t);bp.frequency.exponentialRampToValueAtTime(f2,t+dur);var g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+dur*.85);g.gain.exponentialRampToValueAtTime(.0001,t+dur);n.connect(bp);bp.connect(g);out(g,.8,.5);n.start(t);n.stop(t+dur+.05)}
  // Sintetizador: varios osciladores desafinados con filtro que se abre
  function synth(t,freqs,dur,vol,type,cut1,cut2,wet,echo){var c=ctx(),f=c.createBiquadFilter();f.type='lowpass';f.Q.value=6;f.frequency.setValueAtTime(cut1,t);f.frequency.exponentialRampToValueAtTime(cut2,t+dur*.6);var g=c.createGain();env(g,t,.02,vol,dur*.5,vol*.5,dur*.5);f.connect(g);out(g,.8,wet||.4,echo||0);
    freqs.forEach(function(fr){[-7,0,7].forEach(function(dt){var o=c.createOscillator();o.type=type||'sawtooth';o.frequency.value=fr;o.detune.value=dt;o.connect(f);o.start(t);o.stop(t+dur+.1)})})}
  // Blip digital (FM): cada tarjeta que entra
  function blip(t,f,vol){var c=ctx(),car=c.createOscillator(),mod=c.createOscillator(),mg=c.createGain(),g=c.createGain();car.type='sine';car.frequency.value=f;mod.frequency.value=f*2.01;mg.gain.setValueAtTime(f*1.5,t);mg.gain.exponentialRampToValueAtTime(1,t+.18);mod.connect(mg);mg.connect(car.frequency);env(g,t,.003,vol,.16,.0001,.05);car.connect(g);out(g,.7,.35,.35);car.start(t);mod.start(t);car.stop(t+.3);mod.stop(t+.3)}
  // Campana FM brillante
  function bell(t,f,vol,dur){var c=ctx(),car=c.createOscillator(),mod=c.createOscillator(),mg=c.createGain(),g=c.createGain();car.frequency.value=f;mod.frequency.value=f*3.5;mg.gain.setValueAtTime(f*2.2,t);mg.gain.exponentialRampToValueAtTime(f*.1,t+dur);mod.connect(mg);mg.connect(car.frequency);env(g,t,.004,vol,dur,.0001,.1);car.connect(g);out(g,.6,.6,.25);car.start(t);mod.start(t);car.stop(t+dur+.2);mod.stop(t+dur+.2)}
  // Bajo pulsante (secuencia)
  function bassline(t,notes,step,vol){notes.forEach(function(n,i){if(!n)return;var c=ctx(),o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain(),tt=t+i*step;o.type='sawtooth';o.frequency.value=n;f.type='lowpass';f.Q.value=10;f.frequency.setValueAtTime(1800,tt);f.frequency.exponentialRampToValueAtTime(180,tt+step*.9);env(g,tt,.004,vol,step*.8,.0001,.03);o.connect(f);f.connect(g);out(g,1,.1);o.start(tt);o.stop(tt+step)})}
  // Glitch de datos
  function glitch(t,n,vol){for(var i=0;i<n;i++){var c=ctx(),o=c.createOscillator(),g=c.createGain(),tt=t+i*.045+Math.random()*.02;o.type='square';o.frequency.value=800+Math.random()*2600;env(g,tt,.001,vol,.025,.0001,.01);o.connect(g);out(g,.6,.2,.3);o.start(tt);o.stop(tt+.05)}}
  function sfx(){if(!sound)return;startedAt=Date.now();try{score()}catch(e){}setTimeout(fallback,350)}
  function score(){var c=ctx();mkBus();var T=c.currentTime+.05,K=1.5;
    // 1) Encendido: zumbido grave que sube + riser, golpe cuando aparece el logo, destello
    synth(T,[55,82.5],2.2,.05,'sawtooth',120,900,.5);
    sweep(T,.6*K,300,6000,.05,4);
    hit(T+.25*K,48,.9);
    bell(T+.3*K,1318.5,.06,1.6);bell(T+.42*K,1975.5,.04,1.4);
    glitch(T+.55*K,6,.03);
    // 2) Secciones: pulso de bajo + un blip por tarjeta (escala que sube) + acordes
    var A=T+1.4*K, st=.125;
    bassline(A,[55,0,55,110,55,0,82.4,110, 55,0,55,110,65.4,0,98,130.8, 55,0,55,110,55,0,82.4,110, 49,0,49,98,73.4,0,98,146.8],st,.11);
    var scale=[523.3,587.3,659.3,784,880,1046.5,1174.7,1318.5,1568,1760];
    for(var i=0;i<10;i++)blip(T+(1.65+i*.133)*K+.04,scale[i],.07);
    synth(A+.1,[220,261.6,329.6],1.2,.035,'sawtooth',300,3000,.45,.2);
    synth(A+2.1,[196,246.9,293.7],1.3,.035,'sawtooth',300,3200,.45,.2);
    for(i=0;i<10;i++)bell(T+(2.9+i*.093)*K,2093+i*110,.018,.25);
    // 3) Consolas: whoosh en espiral + arpegio rápido + glitches
    var C=T+4.2*K;
    sweep(C-.3,1.2,200,5000,.08,3);sweep(C+1.2,1.6,5000,250,.06,3);
    hit(C,55,.7);
    var arp=[440,554.4,659.3,880,1108.7,1318.5,1760,1318.5,1108.7,880,659.3,554.4];
    for(i=0;i<24;i++)blip(C+.1+i*.1,arp[i%12],.035);
    glitch(C+.9,10,.025);glitch(C+2.1,8,.02);
    bassline(C,[55,55,110,55,82.4,55,110,98, 55,55,110,55,82.4,55,130.8,123.5],st,.09);
    // 4) Cierre: riser grande, golpe, acorde amplio que se abre y campanas
    var F=T+6.0*K;
    sweep(F-1.2,1.25,150,9000,.09,2);
    hit(F+.05*K,41,1);
    synth(F+.05*K,[110,164.8,220,277.2,329.6,440],3.2,.05,'sawtooth',250,5200,.6,.25);
    synth(F+.05*K,[55],3,.08,'triangle',200,400,.2);
    bell(F+.25*K,1760,.05,2.2);bell(F+.45*K,2217.5,.04,2);bell(F+.65*K,2637,.035,2.4);
    sweep(F+1.8,1.6,6000,300,.025,8);
  }
  
  function finish() {
    if (!el) return;
    clearTimeout(endT);
    try { if (ac) ac.close(); } catch (e) {}
    if (wavAudio) { try { var wa = wavAudio; var v = 1, fade = setInterval(function () { v -= .1; if (v <= 0) { clearInterval(fade); wa.pause(); } else wa.volume = v; }, 40); } catch (e) {} wavAudio = null; }
    ac = null; bus = null;
    el.classList.add('out');
    var e = el; el = null;
    setTimeout(function () { e.remove(); }, 550);
    window.removeEventListener('keydown', onKey, true);
    if (done) done();
  }
  function onKey(e) { if (!el) return; e.preventDefault(); e.stopImmediatePropagation(); finish(); }
  MV.introShowing = function () { return !!el; };
  MV.introSkip = finish;
  MV.playIntro = function (force, cb) {
    if (el) return;
    if (!force && !shouldShow()) { if (cb) cb(); return; }
    done = cb || null;
    sound = soundOn();
    var orb = CONS.map(function (c, i) { return '<img class="cons" style="--i:' + i + ';--n:' + CONS.length + '" src="img/consoles/' + c + '.png" alt="">'; }).join('');
    el = document.createElement('div'); el.id = 'intro';
    el.innerHTML = '<div class="layer s1"><div class="ring"></div><div class="logo"><img src="img/isotipo.svg" alt=""></div></div>' +
      '<div class="layer s2"><h2>Todo en <span>un solo lugar</span></h2><div class="row">' + CARDS + '</div></div>' +
      '<div class="layer s3"><div class="center">Tus juegos<small>De cualquier consola, en cualquier equipo</small></div>' + orb + '</div>' +
      '<div class="layer s4"><div class="logo"><img src="img/isotipo.svg" alt=""></div><h1>MiVibra <span>TV</span></h1><p>Tu entretenimiento, a tu manera</p></div>' +
      '<div class="skip"><i>OK</i>Saltar</div>';
    document.body.appendChild(el);
    el.addEventListener('click', finish);
    window.addEventListener('keydown', onKey, true);
    void el.offsetWidth; el.classList.add('play');
    sfx();
    endT = setTimeout(finish, 11300);
  };
  // Atrás del control también la salta
  var origBack = MV.onBack;
  MV.onBack = function () { if (el) { finish(); return true; } return origBack ? origBack.apply(this, arguments) : false; };
  // Al abrir la app
  function boot() { MV.playIntro(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
