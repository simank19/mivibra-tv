// MiVibra Movimiento — efectos para todos los juegos (livianos: 3 piezas instanciadas en total)
//  · Partículas: chispas, estelas, estrellas, polvo/arena/agua, confeti, fuegos artificiales.
//  · Ondas de choque (anillos) y palabras de cómic en 3D que rebotan ("¡POW!", "¡GOL!").
//  · Cámara: sacudida, cámara lenta, golpe de zoom y destello de pantalla.
// Uso: const FX = createFX(THREE, S, cam, Q);  en el bucle:  dt = FX.time(dt);  …  FX.render(R, S, cam, dt);
export function createFX(THREE, S, cam, Q = 2) {
  const lite = Q === 0;
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // atlas 4×1: punto suave · estrella · rombo (confeti) · humo
  const atlas = canvasTex(256, 64, (g) => {
    let gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 28, a = i / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(96 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill();
    g.fillRect(140, 18, 40, 28);
    gr = g.createRadialGradient(224, 32, 4, 224, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(224, 32, 30, 0, 7); g.fill();
  });
  atlas.minFilter = THREE.LinearFilter;
  function pool(n, additive) {
    const geo = new THREE.PlaneGeometry(1, 1), cell = new Float32Array(n), col = new Float32Array(n * 3);
    geo.setAttribute('cell', new THREE.InstancedBufferAttribute(cell, 1)); geo.setAttribute('pcol', new THREE.InstancedBufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, uniforms: { map: { value: atlas } },
      vertexShader: 'attribute float cell; attribute vec3 pcol; varying vec2 vUv; varying vec3 vCol; varying float vA; void main(){ vUv = vec2((uv.x + cell) / 4., uv.y); vCol = pcol; vA = 1.; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec3 vCol; void main(){ vec4 t = texture2D(map, vUv); if (t.a < .02) discard; gl_FragColor = vec4(vCol * t.rgb, t.a);\n#include <colorspace_fragment>\n}',
    });
    const im = new THREE.InstancedMesh(geo, mat, n); im.frustumCulled = false; im.renderOrder = 5; S.add(im);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < n; i++) im.setMatrixAt(i, zero);
    const P = Array.from({ length: n }, () => ({ life: 0 })); let next = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color(), zAx = new THREE.Vector3(0, 0, 1), qr = new THREE.Quaternion();
    return {
      add(o) {
        const i = next, p = P[i]; next = (next + 1) % n;
        Object.assign(p, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, size: 0.06, grow: 0, shrink: true, spin: 0, rot: Math.random() * 6, flat: false, cell: 0, floor: 0, bounce: 0.3, burst: null }, o, { life: o.life, max: o.life });
        cell[i] = p.cell; geo.attributes.cell.needsUpdate = true;
        c.set(o.color || '#ffffff'); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; geo.attributes.pcol.needsUpdate = true;
        return p;
      },
      update(dt) {
        for (let i = 0; i < n; i++) {
          const p = P[i]; if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) { im.setMatrixAt(i, zero); if (p.burst) p.burst(p); continue; }
          p.vy -= p.grav * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.grav && p.y < p.floor) { p.y = p.floor; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; }
          p.rot += p.spin * dt;
          const a = p.life / p.max, s = p.size * (p.grow ? 1 + (1 - a) * p.grow : 1) * (p.shrink && !p.grow ? Math.min(1, a * 2.2) : 1);
          if (p.flat) { e.set(p.rot, p.rot * 0.7, p.rot * 0.31); q.setFromEuler(e); } else q.copy(cam.quaternion).multiply(qr.setFromAxisAngle(zAx, p.rot));
          im.setMatrixAt(i, m4.compose(pos.set(p.x, p.y, p.z), q, sc.set(s, s * (p.cell === 2 ? 0.6 : 1), s)));
        }
        im.instanceMatrix.needsUpdate = true;
      },
      live() { return P.filter((p) => p.life > 0).length; },
    };
  }
  const GLOW = pool(lite ? 160 : 380, true), BITS = pool(lite ? 140 : 320, false);

  // ---- Anillos (ondas de choque) ----
  const RINGS = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, lite ? 24 : 40);
  function ring(x, y, z, color = '#ffffff', size = 1.2, flat = true) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z); if (flat) m.rotation.x = -Math.PI / 2; else m.quaternion.copy(cam.quaternion); m.renderOrder = 5; S.add(m); RINGS.push({ m, t: 0, T: 0.5, size });
  }
  // ---- Palabras de cómic en 3D ----
  const WORDS = [];
  function pop(x, y, z, text, color = '#FFE600', size = 1, stroke = '#2A0A3A') {
    const t = canvasTex(512, 192, (g, w, h) => {
      g.translate(w / 2, h / 2); g.rotate(-0.08);
      // fondo de explosión
      g.fillStyle = stroke; g.beginPath(); for (let i = 0; i < 24; i++) { const r = i % 2 ? 72 : 96, a = i / 24 * Math.PI * 2; g.lineTo(Math.cos(a) * r * 2.4, Math.sin(a) * r * 0.85); } g.fill();
      let fs = 104; g.font = '900 ' + fs + 'px "Bricolage Grotesque", "Arial Black", sans-serif'; const tw = g.measureText(text).width; if (tw > 440) { fs = Math.floor(fs * 440 / tw); g.font = '900 ' + fs + 'px "Bricolage Grotesque", "Arial Black", sans-serif'; } g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 16; g.strokeStyle = stroke; g.strokeText(text, 0, 6); g.fillStyle = color; g.fillText(text, 0, 6);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(text, -3, 0); g.fillStyle = color; g.fillText(text, 0, 3);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
    sp.position.set(x, y, z); sp.renderOrder = 9; S.add(sp); WORDS.push({ sp, t: 0, T: 1.25, size, y0: y });
  }
  // ---- Cámara ----
  const st = { shake: 0, slow: 0, slowK: 0.3, punch: 0, fov0: null, off: new THREE.Vector3() };
  let flashEl = null;
  function flash(color = '#ffffff', a = 0.55) {
    if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .45s'; document.body.appendChild(flashEl); }
    flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = a; void flashEl.offsetWidth; flashEl.style.transition = 'opacity .45s'; flashEl.style.opacity = 0;
  }
  const R1 = (a, b) => a + Math.random() * (b - a), CONF = ['#FF2EA8', '#00E5FF', '#FFE600', '#7CFF4D', '#B04DFF', '#FF6A3D', '#ffffff'];
  const at = (p) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);

  const FX = {
    // velocidad del tiempo (cámara lenta): dt = FX.time(dt)
    time(dt) { if (st.slow > 0) { st.slow -= dt; return dt * st.slowK; } return dt; },
    slow(sec = 0.8, k = 0.3) { st.slow = Math.max(st.slow, sec); st.slowK = k; },
    shake(a = 0.5) { st.shake = Math.min(1.2, Math.max(st.shake, a)); },
    punch(deg = 6) { st.punch = deg; },
    get punching() { return st.punch > 0.05 || st.fov0 !== null; },
    flash, _live: () => [GLOW.live(), BITS.live()],
    ring, pop,
    trail(p, color = '#9fd0ff', size = 0.14, fire = false) { p = at(p);
      GLOW.add({ x: p.x + R1(-0.015, 0.015), y: p.y + R1(-0.015, 0.015), z: p.z, life: fire ? 0.45 : 0.28, size: fire ? size * 1.4 : size, color: fire ? (Math.random() < 0.5 ? '#FF7B00' : '#FFD166') : color, vy: fire ? R1(0.2, 0.6) : 0 }); },
    sparks(p, power = 0.6, color = '#FFE9A8') { p = at(p); const n = Math.round((lite ? 14 : 30) * (0.5 + power));
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = R1(1, 3.2) * (0.5 + power); GLOW.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: R1(0.6, 2.4), vz: Math.sin(a) * sp * 0.7, grav: 6, drag: 1.6, life: R1(0.3, 0.65), size: R1(0.04, 0.09), color: Math.random() < 0.6 ? color : '#FF9A4D', floor: 0.01 }); } },
    stars(p, n = 6, color = '#FFE600') { p = at(p); for (let i = 0; i < n; i++) { const a = i / n * 6.28; BITS.add({ cell: 1, x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 1.6, vy: R1(0.8, 1.8), vz: Math.sin(a) * 1.2, grav: 3, drag: 1.2, life: R1(0.6, 0.9), size: R1(0.12, 0.2), spin: R1(-6, 6), color }); } },
    dust(p, color = '#e8dcff', n = 10, size = 0.18) { p = at(p); for (let i = 0; i < (lite ? Math.ceil(n / 2) : n); i++) BITS.add({ cell: 3, x: p.x + R1(-0.15, 0.15), y: p.y + 0.03, z: p.z + R1(-0.15, 0.15), vx: R1(-0.5, 0.5), vy: R1(0.15, 0.6), vz: R1(-0.5, 0.5), drag: 2.2, life: R1(0.6, 1.1), size: R1(size * 0.6, size), grow: 2, color }); },
    splash(p, color = '#bde8ff') { p = at(p); for (let i = 0; i < (lite ? 10 : 22); i++) { const a = Math.random() * 6.28; BITS.add({ cell: 0, x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * R1(0.6, 1.8), vy: R1(1.5, 3.2), vz: Math.sin(a) * R1(0.6, 1.8), grav: 9, life: R1(0.5, 0.8), size: R1(0.05, 0.1), color, floor: p.y }); } },
    confetti(p, big = true, spread = 1) { p = at(p); const n = big ? (lite ? 90 : 220) : (lite ? 40 : 90);
      for (let i = 0; i < n; i++) BITS.add({ cell: 2, flat: true, x: p.x + R1(-spread, spread), y: p.y + R1(0, 0.6), z: p.z + R1(-spread * 0.6, spread * 0.6), vx: R1(-1.4, 1.4), vy: R1(0, 2.2), vz: R1(-1, 1.4), grav: 1.8, drag: 2.6, life: R1(2.2, 3.6), size: R1(0.08, 0.15), spin: R1(-10, 10), color: CONF[i % CONF.length], shrink: false }); },
    // fuegos artificiales: un cohete sube y estalla en estrellas de colores
    fireworks(p, count = 4, spread = 6, height = 7) { p = at(p);
      for (let k = 0; k < count; k++) setTimeout(() => {
        const col = CONF[(Math.random() * 6) | 0], x = p.x + R1(-spread, spread), z = p.z + R1(-spread * 0.4, spread * 0.4);
        const vy = Math.sqrt(10 * height);   // sube justo hasta «height» y estalla arriba
        GLOW.add({ x, y: p.y, z, vy, grav: 5, life: vy / 5, size: 0.14, color: '#fff3c4', burst: (r) => {
          const n = lite ? 26 : 60; for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, b = Math.acos(R1(-1, 1)), sp = R1(2.2, 3.4); GLOW.add({ x: r.x, y: r.y, z: r.z, vx: Math.sin(b) * Math.cos(a) * sp, vy: Math.cos(b) * sp, vz: Math.sin(b) * Math.sin(a) * sp, grav: 1.6, drag: 1.4, life: R1(0.9, 1.5), size: R1(0.08, 0.16), color: Math.random() < 0.8 ? col : '#ffffff' }); }
          ring(r.x, r.y, r.z, col, 2.2, false);
        } });
        for (let i = 0; i < 6; i++) GLOW.add({ x, y: p.y, z, vy: vy * R1(0.85, 1), grav: 5, life: R1(0.3, 0.6), size: 0.07, color: '#FFD166' });
      }, k * 380);
    },
    // lágrimas de cómic: dos chorritos que salen de los ojos hacia los lados (llamar seguido mientras llora)
    tears(p, fwd = [0, 0, 1]) { p = at(p); const sx = fwd[2], sz = -fwd[0];
      [-1, 1].forEach((sd) => BITS.add({ cell: 0, x: p.x + sx * sd * 0.07 + fwd[0] * 0.12, y: p.y + 0.05, z: p.z + sz * sd * 0.07 + fwd[2] * 0.12, vx: sx * sd * R1(0.8, 1.3), vy: R1(0.6, 1.1), vz: sz * sd * R1(0.8, 1.3), grav: 5, life: R1(0.6, 0.9), size: R1(0.1, 0.14), color: '#5ec8ff', floor: 0.01, bounce: 0 })); },
    // celebración completa: confeti + fuegos + destello + palabra
    party(p, word = '¡BIEN!', color = '#FFE600') { p = at(p); this.confetti({ x: p.x, y: p.y + 2.6, z: p.z + 0.5 }, true, 2); this.fireworks({ x: p.x, y: p.y, z: p.z - 4 }, 5, 3, 3.2); this.flash('#ffffff', 0.35); this.pop(p.x, p.y + 1.6, p.z, word, color, 1.3); },
    update(dt) {
      GLOW.update(dt); BITS.update(dt);
      for (let i = RINGS.length - 1; i >= 0; i--) { const r = RINGS[i]; r.t += dt; const u = r.t / r.T; if (u >= 1) { S.remove(r.m); r.m.material.dispose(); RINGS.splice(i, 1); continue; } const s = r.size * (0.2 + u * 1.1); r.m.scale.set(s, s, s); r.m.material.opacity = 0.9 * (1 - u); }
      for (let i = WORDS.length - 1; i >= 0; i--) { const w = WORDS[i]; w.t += dt; const u = w.t / w.T; if (u >= 1) { S.remove(w.sp); w.sp.material.map.dispose(); w.sp.material.dispose(); WORDS.splice(i, 1); continue; }
        // rebote: crece con resorte, flota y se desvanece
        const k = u < 0.25 ? 1 + Math.sin(u / 0.25 * Math.PI) * 0.35 - (1 - u / 0.25) * 0.6 : 1, s = w.size * 0.16 * w.sp.position.distanceTo(cam.position) * Math.max(0.05, k);   // tamaño fijo en pantalla
        w.sp.scale.set(s * 2.67, s, 1); w.sp.position.y = w.y0 + u * 0.5; w.sp.material.opacity = u > 0.75 ? (1 - u) / 0.25 : 1; w.sp.material.rotation = Math.sin(u * 12) * 0.04; }
    },
    // dibuja con la sacudida y el zoom aplicados (y los quita después, para no mover la cámara del juego)
    // antes de dibujar: aplica sacudida y zoom (para juegos con su propio compositor)
    pre(c, dt) {
      dt = dt || 0.016; this.update(dt); st.off.set(0, 0, 0);
      if (st.shake > 0.01) { st.shake *= Math.exp(-dt * 7); st.off.set((Math.random() - 0.5) * st.shake * 0.12, (Math.random() - 0.5) * st.shake * 0.09, 0); c.position.add(st.off); }
      if (st.punch > 0.05) { if (st.fov0 === null) st.fov0 = c.fov; c.fov = st.fov0 - st.punch; c.updateProjectionMatrix(); st.punch *= Math.exp(-dt * 5); }
      else if (st.fov0 !== null) { c.fov = st.fov0; st.fov0 = null; c.updateProjectionMatrix(); }
    },
    // después de dibujar: deja la cámara del juego como estaba
    post(c) { c.position.sub(st.off); },
    render(R, S2, c, dt) { this.pre(c, dt); R.render(S2, c); this.post(c); },
  };
  return FX;
}
