'use strict';

/* ============================== 3D СЦЕНА ============================== */
let renderer, scene, camera;
const T = { decks: {}, disc: {}, anims: [], fx: [], tiles: [] };
const cam = { az: 0, el: 0.8, dist: 19.5, userAz: 0, userEl: 0, zoom: 1 };
const CARD_W = 1.2, CARD_H = 1.68, CARD_T = 0.025, TABLE_Y = 0.3, FELT_R = 8.6;
const DECK_POS = { door: [-2.75, -1.45], treasure: [2.75, -1.45] };
const DISC_POS = { door: [-2.75, 1.05], treasure: [2.75, 1.05] };

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function animate(dur, fn, e = ease) { return new Promise(res => T.anims.push({ t0: performance.now(), dur: Math.max(1, dur * AF), fn, e, res })); }

function canvasTex(w, h, drawFn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); drawFn(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.userData = { canvas: c, g };
  return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapText(g, text, x, y, maxW, lh, maxLines, center = maxLines <= 2) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '…');
  const y0 = y - (out.length - 1) * lh / 2 * (center ? 1 : 0);
  out.forEach((l, i) => g.fillText(l, x, y0 + i * lh));
  return out.length;
}

/* --- текстури --- */
/* --- скіни столу --- */
const SKINS = {
  tavern: { name: 'Таверна', desc: 'Зелене сукно, мідь і тепла лампа.', felt: ['#1d4a3b', '#143428'], line: '224,169,59', pat: 'rosette', ring: 0xc9922f, wood: ['#53301c', '#3d2213'], floor: 0x1a1210, bg: 0x0e0a09, hemi: [0xffe4c0, 0x2a1a10, .6], amb: .05, spot: [0xffd49a, 1.6, 4.4, .6], warm: [0xff9244, .4], rim: [0x86a8ff, .26], exp: 1, dust: { c: 0xffd9a0, o: .4, s: .07, mode: 'rise' }, glow: .1, extra: null },
  newyear: { name: 'Новорічний', desc: 'Червоне сукно, сніжинки, гірлянда й сніг.', felt: ['#8c1b2a', '#5a0e19'], line: '255,236,190', pat: 'snow', ring: 0xe8c46a, wood: ['#2f4a33', '#1b2e20'], floor: 0x0e1626, bg: 0x0a1020, hemi: [0xdce8ff, 0x1a1020, .58], amb: .05, spot: [0xfff0d8, 1.5, 4.3, .6], warm: [0xff5a3a, .35], rim: [0x9fc4ff, .38], exp: 1, dust: { c: 0xffffff, o: .9, s: .14, mode: 'snow' }, glow: .1, extra: 'garland' },
  lamp: { name: 'Лампова ніч', desc: 'Навколо темно — світить лише лампа над столом.', felt: ['#1b4436', '#0f2a20'], line: '224,169,59', pat: 'rosette', ring: 0xb8862b, wood: ['#4a2a18', '#2a170b'], floor: 0x040302, bg: 0x020101, hemi: [0xffe4c0, 0x000000, .06], amb: 0, spot: [0xffdcaa, 3.2, 4.0, .45], warm: [0xff9244, 0], rim: [0x86a8ff, .03], exp: 1, dust: { c: 0xffe2b0, o: .75, s: .06, mode: 'cone' }, glow: .06, extra: null },
  dungeon: { name: 'Підземелля', desc: 'Камінь, смолоскипи й фіолетовий оксамит.', felt: ['#37284f', '#211633'], line: '205,190,255', pat: 'runes', ring: 0x8d8f9c, wood: ['#55555c', '#2c2c32'], stone: true, floor: 0x0d0c10, bg: 0x07060a, hemi: [0xcfc6ff, 0x100c14, .34], amb: .04, spot: [0xffe6c8, 1.15, 4.4, .6], warm: [0xff7a2a, 0], rim: [0x8070ff, .2], exp: 1, dust: { c: 0xffa860, o: .55, s: .06, mode: 'rise' }, glow: .1, extra: 'torches' },
  space: { name: 'Космос', desc: 'Зоряне сукно, неонове кільце й тиша.', felt: ['#15214f', '#090f2c'], line: '90,225,255', pat: 'stars', ring: 0x46e0ff, ringGlow: .6, wood: ['#1d2134', '#0c0e18'], floor: 0x03040a, bg: 0x02030a, hemi: [0xb0ccff, 0x0a0a20, .5], amb: .05, spot: [0xd6e8ff, 1.45, 4.4, .6], warm: [0xb36bff, .45], rim: [0x46e0ff, .32], exp: 1, dust: { c: 0x9fd8ff, o: .6, s: .07, mode: 'float' }, glow: .1, extra: 'stars' }
};
let SKIN_ID = 'tavern'; try { const sv = localStorage.getItem('pdsv-skin'); if (sv && SKINS[sv]) SKIN_ID = sv; } catch (e) { /* сховище недоступне */ }
let SKIN = SKINS[SKIN_ID];
function woodTex(S = SKIN) {
  return canvasTex(1024, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, S.wood[0]); grd.addColorStop(1, S.wood[1]);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    if (S.stone) {
      for (let y = 0, row = 0; y < h; y += 96, row++) for (let x = -(row % 2) * 80; x < w; x += 160) {
        g.fillStyle = `rgba(${rnd(2) ? '255,255,255' : '0,0,0'},${.03 + Math.random() * .07})`; g.fillRect(x + 3, y + 3, 154, 90);
        g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 5; g.strokeRect(x + 2, y + 2, 156, 92);
      }
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      return;
    }
    for (let i = 0; i < 240; i++) {
      const y = Math.random() * h, a = 0.08 + Math.random() * 0.22;
      g.strokeStyle = Math.random() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,220,180,${a * .25})`;
      g.lineWidth = 1 + Math.random() * 3; g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / 90 + i) * 7 + Math.sin(x / 23 + i * 1.7) * 2);
      g.stroke();
    }
  });
}
function feltTex(S = SKIN) {
  const SZ = 2048;
  return canvasTex(SZ, SZ, (g) => {
    const c = SZ / 2; const k = SZ / (2 * FELT_R); const L = a => `rgba(${S.line},${a})`;
    const px = (x, z) => [(x / FELT_R + 1) / 2 * SZ, (z / FELT_R + 1) / 2 * SZ];
    g.fillStyle = S.felt[0]; g.fillRect(0, 0, SZ, SZ);
    for (let i = 0; i < 26000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.035)'; g.fillRect(Math.random() * SZ, Math.random() * SZ, 2, 2); }
    const vg = g.createRadialGradient(c, c, SZ * .1, c, c, SZ * .5); vg.addColorStop(0, 'rgba(255,255,255,.07)'); vg.addColorStop(.62, 'rgba(0,0,0,0)'); vg.addColorStop(1, S.felt[1]);
    g.fillStyle = vg; g.fillRect(0, 0, SZ, SZ);
    if (S.pat === 'snow') {
      const flake = (x, y, r, a) => { g.strokeStyle = L(a); g.lineWidth = Math.max(2, r / 12); for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3; const ex = x + Math.cos(an) * r, ey = y + Math.sin(an) * r; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke(); for (const t of [.45, .7]) { const bx = x + Math.cos(an) * r * t, by = y + Math.sin(an) * r * t; for (const d of [-.6, .6]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(an + d) * r * .28, by + Math.sin(an + d) * r * .28); g.stroke(); } } } };
      for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, r = 330 + Math.random() * 620; flake(c + Math.cos(a) * r, c + Math.sin(a) * r, 18 + Math.random() * 34, .12 + Math.random() * .14); }
      flake(c, c, 230, .3);
    } else if (S.pat === 'runes') {
      g.strokeStyle = L(.3); g.lineWidth = 4;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, x = c + Math.cos(a) * 5.3 * k, y = c + Math.sin(a) * 5.3 * k;
        g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 26);
        for (let j = 0; j < 2; j++) { const yy = -20 + rnd(30); g.moveTo(0, yy); g.lineTo((rnd(2) ? 1 : -1) * (12 + rnd(8)), yy + (rnd(2) ? 12 : -12)); }
        g.stroke(); g.restore();
      }
      g.beginPath(); for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; const x = c + Math.cos(a) * 230, y = c + Math.sin(a) * 230; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.beginPath(); g.arc(c, c, 250, 0, Math.PI * 2); g.stroke();
    } else if (S.pat === 'stars') {
      for (let i = 0; i < 3; i++) { const x = Math.random() * SZ, y = Math.random() * SZ, r = 300 + Math.random() * 400; const ng = g.createRadialGradient(x, y, 0, x, y, r); ng.addColorStop(0, i % 2 ? 'rgba(180,90,255,.16)' : 'rgba(60,200,255,.13)'); ng.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ng; g.fillRect(0, 0, SZ, SZ); }
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${.2 + Math.random() * .6})`; const r = Math.random() < .93 ? 1.5 : 3; g.beginPath(); g.arc(Math.random() * SZ, Math.random() * SZ, r, 0, 6.28); g.fill(); }
      g.strokeStyle = L(.55); g.lineWidth = 3;
      for (let i = 0; i < 28; i++) { const x = Math.random() * SZ, y = Math.random() * SZ, r = 8 + Math.random() * 12; g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }
      g.strokeStyle = L(.3); g.beginPath(); g.arc(c, c, 250, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(c, c, 5.3 * k, 0, Math.PI * 2); g.stroke();
    } else {
      g.strokeStyle = L(.18); g.lineWidth = 3; g.beginPath(); g.arc(c, c, 5.3 * k, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = L(.28);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 60, c + Math.sin(a) * 60); g.lineTo(c + Math.cos(a) * (i % 2 ? 150 : 230), c + Math.sin(a) * (i % 2 ? 150 : 230)); g.stroke(); }
      g.beginPath(); g.arc(c, c, 250, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = L(.55); g.lineWidth = 6; g.beginPath(); g.arc(c, c, SZ * .485, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(c, c, SZ * .47, 0, Math.PI * 2); g.stroke();
    const slot = (pos, label) => {
      const [x, y] = px(pos[0], pos[1]); const w = CARD_W * k * 1.12, h = CARD_H * k * 1.12;
      g.setLineDash([14, 10]); g.strokeStyle = L(.5); g.lineWidth = 4; rr(g, x - w / 2, y - h / 2, w, h, 16); g.stroke(); g.setLineDash([]);
      g.fillStyle = L(.65); g.font = '44px Underdog, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + h / 2 + 34);
    };
    slot(DECK_POS.door, 'ДВЕРІ'); slot(DISC_POS.door, 'СКИД');
    slot(DECK_POS.treasure, 'СКАРБИ'); slot(DISC_POS.treasure, 'СКИД');
  });
}
function buildExtras(type) {
  if (T.extras) { scene.remove(T.extras); T.extras.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); }
  T.extras = new THREE.Group(); scene.add(T.extras);
  T.garlandMats = null; T.torches = []; T.stars = null;
  if (type === 'garland') {
    const cols = [0xff3b3b, 0x3bff6a, 0xffd23b, 0x3bb4ff];
    T.garlandMats = cols.map(c => { const m = new THREE.MeshBasicMaterial({ color: c }); m.userData.base = new THREE.Color(c); return m; });
    const geo = new THREE.SphereGeometry(.09, 10, 8);
    for (let i = 0; i < 84; i++) { const a = i / 84 * Math.PI * 2; const b = new THREE.Mesh(geo, T.garlandMats[i % 4]); b.position.set(Math.sin(a) * 9.43, TABLE_Y + .06 + Math.abs(Math.sin(i * 1.7)) * .04, Math.cos(a) * 9.43); T.extras.add(b); }
    const wire = new THREE.Mesh(new THREE.TorusGeometry(9.43, .015, 6, 160), new THREE.MeshBasicMaterial({ color: 0x1f3a22 })); wire.rotation.x = Math.PI / 2; wire.position.y = TABLE_Y + .05; T.extras.add(wire);
  }
  if (type === 'torches') {
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const x = Math.sin(a) * 11.4, z = Math.cos(a) * 11.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: .9 })); pole.position.set(x, -1.2, z); T.extras.add(pole);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(.25, .12, .35, 10), new THREE.MeshStandardMaterial({ color: 0x55555c, metalness: .6, roughness: .5 })); cup.position.set(x, 1.4, z); T.extras.add(cup);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, color: 0xff8a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); flame.position.set(x, 1.85, z); flame.scale.setScalar(1.1); T.extras.add(flame);
      const light = new THREE.PointLight(0xff7a2a, 1.1, 18, 1.4); light.position.set(x, 2.1, z); T.extras.add(light);
      light.visible = QUALITY[QUAL].torchLights; T.torches.push({ light, flame });
    }
  }
  if (type === 'stars') {
    const N = 900, P = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = Math.random() * 6.28, v = Math.acos(Math.random() * 1.4 - .4), r = 70 + Math.random() * 20; P[i * 3] = Math.sin(v) * Math.cos(u) * r; P[i * 3 + 1] = Math.cos(v) * r; P[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r; }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    T.stars = new THREE.Points(gg, new THREE.PointsMaterial({ size: .55, map: T.dot, color: 0xcfe6ff, transparent: true, opacity: .8, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    T.extras.add(T.stars);
  }
}
function applySkin(id) {
  SKIN_ID = SKINS[id] ? id : 'tavern'; SKIN = SKINS[SKIN_ID]; const S = SKIN;
  try { localStorage.setItem('pdsv-skin', SKIN_ID); } catch (e) { /* сховище недоступне */ }
  if (!renderer || !T.feltMat) return;
  const oldF = T.feltMat.map, oldW = T.woodMat.map;
  T.feltMat.map = feltTex(S); T.feltMat.needsUpdate = true; if (oldF) oldF.dispose();
  const w = woodTex(S); w.wrapS = w.wrapT = THREE.RepeatWrapping; T.woodMat.map = w; T.woodMat.needsUpdate = true; if (oldW) oldW.dispose();
  T.brass.color.setHex(S.ring); T.brass.emissive.setHex(S.ringGlow ? S.ring : 0); T.brass.emissiveIntensity = S.ringGlow || 0;
  T.floorMat.color.setHex(S.floor);
  scene.background.setHex(S.bg); scene.fog.color.setHex(S.bg);
  T.hemi.color.setHex(S.hemi[0]); T.hemi.groundColor.setHex(S.hemi[1]); T.hemi.intensity = S.hemi[2];
  T.amb.intensity = S.amb;
  T.spot.color.setHex(S.spot[0]); T.spot.intensity = S.spot[1]; T.spot.angle = Math.PI / S.spot[2]; T.spot.penumbra = S.spot[3];
  T.bulb.material.color.setHex(S.spot[0]);
  T.warm.color.setHex(S.warm[0]); T.warmBase = S.warm[1];
  T.rim.color.setHex(S.rim[0]); T.rim.intensity = S.rim[1];
  renderer.toneMappingExposure = S.exp;
  T.dust.material.color.setHex(S.dust.c); T.dust.material.opacity = S.dust.o; T.dust.material.size = S.dust.s; T.dustMode = S.dust.mode;
  scene.traverse(o => { if (o.isMesh && Array.isArray(o.material)) o.material.forEach(m => { if (m.emissiveMap) m.emissiveIntensity = m.userData.back ? S.glow * .6 : S.glow; }); });
  buildExtras(S.extra);
}
function openSkins(back) {
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  showModal(`<h2>Стіл і графіка</h2><p>Вибір зберігається лише на цьому пристрої й не впливає на інших гравців.</p>
    <div class="skins">${Object.entries(SKINS).map(([id, S]) => `<button type="button" class="skin" data-skin="${id}" aria-pressed="${id === SKIN_ID}"><span class="sw" style="background:radial-gradient(circle at 50% 45%, ${S.felt[0]} 0 50%, ${S.felt[1]} 51% 60%, ${hex(S.ring)} 61% 66%, ${S.wood[0]} 67%)"></span><b>${S.name}</b><small>${S.desc}</small></button>`).join('')}</div>
    <h3>Якість графіки</h3>
    <div class="seg" role="group" aria-label="Якість графіки">${Object.entries(QUALITY).map(([id, q]) => `<button type="button" data-q="${id}" aria-pressed="${id === QUAL}">${q.name}</button>`).join('')}</div>
    <p class="hint" id="qDesc" style="margin-top:8px">${QUALITY[QUAL].desc}</p>
    <div class="row end"><button class="btn primary" type="button" id="skDone">Готово</button></div>`);
  $('#sheet').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { applyQuality(b.dataset.q); $('#sheet').querySelectorAll('[data-q]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#qDesc').textContent = QUALITY[QUAL].desc; });
  $('#sheet').querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { applySkin(b.dataset.skin); $('#sheet').querySelectorAll('[data-skin]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('#skDone').onclick = () => { closeModal(); if (back) back(); };
}
function backTex(kind) {
  return canvasTex(360, 504, (g, w, h) => {
    const door = kind === 'door';
    const grd = g.createLinearGradient(0, 0, w, h);
    if (door) { grd.addColorStop(0, '#6e1d40'); grd.addColorStop(1, '#3d0f24'); } else { grd.addColorStop(0, '#b4801f'); grd.addColorStop(1, '#6d4610'); }
    rr(g, 0, 0, w, h, 26); g.fillStyle = grd; g.fill();
    g.save(); rr(g, 0, 0, w, h, 26); g.clip();
    g.strokeStyle = door ? 'rgba(255,200,220,.07)' : 'rgba(255,240,200,.1)'; g.lineWidth = 10;
    for (let i = -h; i < w + h; i += 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.restore();
    g.strokeStyle = '#e0a93b'; g.lineWidth = 6; rr(g, 16, 16, w - 32, h - 32, 18); g.stroke();
    g.lineWidth = 2; rr(g, 28, 28, w - 56, h - 56, 12); g.stroke();
    const cx = w / 2, cy = h / 2 - 20;
    g.lineWidth = 6; g.strokeStyle = '#1b1512';
    if (door) {
      g.fillStyle = '#8c5a2b'; g.beginPath(); g.moveTo(cx - 70, cy + 95); g.lineTo(cx - 70, cy - 30); g.arc(cx, cy - 30, 70, Math.PI, 0); g.lineTo(cx + 70, cy + 95); g.closePath(); g.fill(); g.stroke();
      g.lineWidth = 3; for (const dx of [-35, 0, 35]) { g.beginPath(); g.moveTo(cx + dx, cy - (dx ? 88 : 100)); g.lineTo(cx + dx, cy + 95); g.stroke(); }
      g.fillStyle = '#e0a93b'; g.beginPath(); g.arc(cx + 45, cy + 25, 9, 0, Math.PI * 2); g.fill(); g.stroke();
    } else {
      g.fillStyle = '#7a4a1e'; rr(g, cx - 85, cy - 10, 170, 100, 10); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 85, cy - 10); g.quadraticCurveTo(cx, cy - 90, cx + 85, cy - 10); g.closePath(); g.fillStyle = '#93602a'; g.fill(); g.stroke();
      g.fillStyle = '#e0a93b'; rr(g, cx - 16, cy - 20, 32, 40, 6); g.fill(); g.stroke();
      g.fillStyle = '#f5d27a'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(cx - 60 + i * 20, cy - 34 - Math.sin(i / 6 * Math.PI) * 26, 10, 0, Math.PI * 2); g.fill(); g.lineWidth = 3; g.stroke(); }
    }
    g.fillStyle = '#f6e7c8'; g.font = '60px Underdog, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = '#1b1512'; g.lineWidth = 8; g.strokeText(door ? 'ДВЕРІ' : 'СКАРБИ', cx, h - 92); g.fillText(door ? 'ДВЕРІ' : 'СКАРБИ', cx, h - 92);
  });
}
const faceCache = new Map();
function faceTex(c) {
  if (faceCache.has(c.uid)) return faceCache.get(c.uid);
  const t = canvasTex(360, 504, (g, W, H) => drawCardFace(g, c, W, H));
  faceCache.set(c.uid, t); return t;
}
function drawCardFace(g, c, W, H) {
  const i = cardInfo(c), door = c.deck === 'door', band = door ? '#8a2650' : '#a8741a';
  rr(g, 0, 0, W, H, 26); g.fillStyle = '#efe8dc'; g.fill();
  for (let n = 0; n < 700; n++) { g.fillStyle = `rgba(90,65,40,${Math.random() * .06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  g.lineWidth = 7; g.strokeStyle = '#1b1512'; rr(g, 12, 12, W - 24, H - 24, 18); g.stroke();
  g.fillStyle = band; rr(g, 24, 24, W - 48, 52, 10); g.fill();
  g.fillStyle = '#fff4e0'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '700 21px Rubik, sans-serif';
  g.fillText(i.type.toUpperCase(), 38, 51);
  g.textAlign = 'right'; g.font = '36px Underdog, cursive'; g.fillText(String(i.corner), W - 38, 52);
  g.fillStyle = '#1b1512'; g.textAlign = 'center'; g.font = '32px Underdog, cursive';
  wrapText(g, c.name, W / 2, 114, W - 56, 32, 2);
  g.fillStyle = door ? 'rgba(138,38,80,.13)' : 'rgba(168,116,26,.18)';
  g.beginPath(); g.arc(W / 2, 210, 58, 0, Math.PI * 2); g.fill();
  g.setLineDash([8, 7]); g.lineWidth = 3; g.strokeStyle = 'rgba(27,21,18,.45)'; g.stroke(); g.setLineDash([]);
  const im = artFor(c);
  if (im) g.drawImage(im, W / 2 - 66, 204 - 68, 132, 132);
  else { g.font = '84px ' + EMOJI_FONT; g.fillStyle = '#1b1512'; g.fillText(c.art, W / 2, 215); }
  const bdg = typeBadge(c);
  if (bdg) {
    const lab = bdg.t.toUpperCase();
    g.font = '700 19px Rubik, sans-serif'; const tw = g.measureText(lab).width + (bdg.e ? 64 : 34), bx = W / 2 - tw / 2, by = 249;
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    rr(g, bx, by, tw, 32, 16); g.fillStyle = bdg.bg; g.fill(); g.restore();
    g.lineWidth = 3; g.strokeStyle = bdg.bd; rr(g, bx, by, tw, 32, 16); g.stroke();
    g.fillStyle = bdg.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (bdg.e) { g.fillText(lab, W / 2 + 13, by + 17); g.font = '20px ' + EMOJI_FONT; g.fillText(bdg.e, bx + 24, by + 17); }
    else g.fillText(lab, W / 2, by + 17);
  }
  const ty = bdg ? 298 : 294;
  g.font = '20px Pangolin, cursive'; g.fillStyle = '#1b1512';
  const nl = wrapText(g, i.text, W / 2, ty, W - 56, 23, i.flavor ? 4 : 6, false);
  if (i.flavor) { g.font = 'italic 17px Pangolin, cursive'; g.fillStyle = '#4a3a2d'; wrapText(g, i.flavor, W / 2, ty + nl * 23 + 8, W - 64, 19, Math.max(1, Math.min(3, 6 - nl)), false); }
  g.setLineDash([6, 6]); g.strokeStyle = 'rgba(27,21,18,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(32, H - 58); g.lineTo(W - 32, H - 58); g.stroke(); g.setLineDash([]);
  g.font = '700 19px Rubik, sans-serif'; g.textAlign = 'left'; g.fillText(i.foot[0], 34, H - 36);
  g.textAlign = 'right'; g.fillText(i.foot[1], W - 34, H - 36);
}
function dieFaceTex(v) {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#f2ead9'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 6; rr(g, 4, 4, w - 8, w - 8, 18); g.stroke();
    const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] }[v];
    g.fillStyle = v === 1 ? '#a3202f' : '#1b1512';
    P.forEach(([x, y]) => { g.beginPath(); g.arc(x * w, y * w, v === 1 ? 15 : 11, 0, Math.PI * 2); g.fill(); });
  });
}
function dotTex() { return canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.4, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }

/* --- карти-меші --- */
let cardGeo, edgeMat, BACKS;
function cardMesh(c) {
  const ft = faceTex(c);
  const front = new THREE.MeshStandardMaterial({ map: ft, roughness: .62, emissive: 0xffffff, emissiveMap: ft, emissiveIntensity: SKIN.glow });
  const back = new THREE.MeshStandardMaterial({ map: BACKS[c.deck], roughness: .62, emissive: 0xffffff, emissiveMap: BACKS[c.deck], emissiveIntensity: SKIN.glow * .6 }); back.userData.back = true;
  const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, front, back, edgeMat, edgeMat]);
  m.castShadow = true; m.receiveShadow = true; m.userData.card = c; m.userData.own = [front, back];
  return m;
}
function backMesh(deck) {
  const back = new THREE.MeshStandardMaterial({ map: BACKS[deck], roughness: .62, emissive: 0xffffff, emissiveMap: BACKS[deck], emissiveIntensity: SKIN.glow * .6 }); back.userData.back = true;
  const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, back, back, edgeMat, edgeMat]); m.castShadow = true; m.userData.own = [back]; return m;
}
function disposeMesh(m) { if (!m) return; if (m.parent) m.parent.remove(m); (m.userData.own || []).forEach(x => x.dispose()); }
function applyPose(m, p) { m.position.set(p.x, p.y, p.z); m.rotation.set(p.tilt, p.yaw, p.flip, 'YXZ'); m.scale.setScalar(p.s); m.userData.pose = p; }
function poseOf(m) { const t = m.userData.pose; if (t && t.tag && Math.abs(t.x - m.position.x) < .01 && Math.abs(t.z - m.position.z) < .01) return { ...t }; return { x: m.position.x, y: m.position.y, z: m.position.z, yaw: m.rotation.y, tilt: m.rotation.x, flip: m.rotation.z, s: m.scale.x }; }
function lerpAng(a, b, t) { let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + d * t; }
function fly(m, from, to, dur = 700, lift = 1.5, meta = {}, raw = false) {
  if (!raw) dur *= ANIM;
  playSfx('whoosh');
  if (NET.role === 'host' && m.userData.card) netFly(m.userData.card, from, to, dur, lift, meta);
  applyPose(m, from);
  return animate(dur, t => {
    applyPose(m, {
      x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t,
      y: from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * lift,
      yaw: lerpAng(from.yaw, to.yaw, t), tilt: from.tilt + (to.tilt - from.tilt) * t,
      flip: from.flip + (to.flip - from.flip) * t, s: from.s + (to.s - from.s) * t
    });
  }).then(() => applyPose(m, to));
}

/* --- пози --- */
const seatAngle = i => i * Math.PI * 2 / Math.max(1, G.players.length);
function rotY(lx, ly, lz, az) { const c = Math.cos(az), s = Math.sin(az); return { x: lx * c + lz * s, y: ly, z: -lx * s + lz * c }; }
function deckTopY(kind) { const n = (kind === 'door' ? G.doorDeck : G.treasureDeck).length; return TABLE_Y + n * 0.014 + 0.02; }
const deckPose = kind => ({ x: DECK_POS[kind][0], y: deckTopY(kind), z: DECK_POS[kind][1], yaw: 0, tilt: 0, flip: Math.PI, s: 1 });
const discardPose = kind => ({ x: DISC_POS[kind][0], y: TABLE_Y + 0.05, z: DISC_POS[kind][1], yaw: 0, tilt: 0, flip: 0, s: 1 });
const monScale = n => n >= 3 ? 1.12 : n === 2 ? 1.3 : 1.5;
function centerPose(i = 0, n = 1) { const s = monScale(n), sp = CARD_W * s + .18; return { ...rotY((i - (n - 1) / 2) * sp, 1.6 - (1.5 - s) * .9, -0.25, cam.az), yaw: cam.az, tilt: 1.2, flip: 0, s, tag: { k: 'c', i, n } }; }
function sidePose(right, i, n = (G.combat ? G.combat.mons.length : 1)) { const sx = right ? 1 : -1, s0 = monScale(n), base = n * (CARD_W * s0 + .18) / 2 + .55; return { ...rotY(sx * (base + i * 0.42), 0.95 + i * 0.05, 0.3 + i * 0.06, cam.az), yaw: cam.az - sx * 0.22, tilt: 1.15, flip: 0, s: 0.7, tag: { k: 's', r: right, i, n } }; }
function seatPose(i, faceUp = false) { const a = seatAngle(i); return { ...rotY(0, 0.4, 7.6, a), yaw: a, tilt: 0, flip: faceUp ? 0 : Math.PI, s: 0.55, tag: { k: 'p', who: i } }; }
function handPose() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const p = camera.position.clone().addScaledVector(dir, 5.5).addScaledVector(up, -2.0);
  return { x: p.x, y: p.y, z: p.z, yaw: cam.az + cam.userAz, tilt: Math.PI / 2 - clamp(cam.el + cam.userEl, .25, 1.35), flip: 0, s: 0.85, tag: { k: 'h', who: G.viewer } };
}
const isViewerHuman = p => p.type === 'human' && p.idx === G.viewer;
const fromHandOf = p => isViewerHuman(p) ? handPose() : seatPose(p.idx, false);
const toHandOf = p => isViewerHuman(p) ? handPose() : seatPose(p.idx, false);
function seatAnchor(i) { const w = rotY(0, TABLE_Y, 7.55, seatAngle(i)); return new THREE.Vector3(w.x, w.y, w.z); }

/* --- якість графіки: менше пікселів і кадрів, коли нічого не рухається, — ноутбук не гріється --- */
const QUALITY = {
  eco: { name: 'Економна', desc: 'Найменше нагріву й шуму: 30 кадрів у русі, 20 у спокої, звичайна чіткість.', dpr: 1, fpsActive: 30, fpsIdle: 20, shadow: 512, live: false, sway: false, torchLights: false },
  bal: { name: 'Збалансована', desc: 'Плавно, коли щось рухається, і вдвічі менше кадрів у спокої. Підходить більшості.', dpr: 1.5, fpsActive: 60, fpsIdle: 30, shadow: 1024, live: false, sway: false, torchLights: true },
  high: { name: 'Максимальна', desc: 'Повна чіткість і 60 кадрів завжди. Найгарніше, але ноутбук гріється.', dpr: 2, fpsActive: 60, fpsIdle: 60, shadow: 2048, live: true, sway: true, torchLights: true }
};
let QUAL = (() => { try { const q = localStorage.getItem('pdsv-quality'); return QUALITY[q] ? q : 'bal'; } catch (e) { return 'bal'; } })();
function applyQuality(id) {
  if (!QUALITY[id]) return; QUAL = id; const Q = QUALITY[id];
  try { localStorage.setItem('pdsv-quality', id); } catch (e) { }
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  viewW = 0; resize();
  if (T.spot && T.spot.shadow.mapSize.x !== Q.shadow) { T.spot.shadow.mapSize.set(Q.shadow, Q.shadow); if (T.spot.shadow.map) { T.spot.shadow.map.dispose(); T.spot.shadow.map = null; } }
  renderer.shadowMap.autoUpdate = Q.live; renderer.shadowMap.needsUpdate = true;
  if (!Q.sway && T.lamp) T.lamp.rotation.set(0, 0, 0);
  if (T.torches) T.torches.forEach(t => { t.light.visible = Q.torchLights; });
}

/* --- побудова сцени --- */
function init3D() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: QUAL === 'high' ? 'high-performance' : QUAL === 'eco' ? 'low-power' : 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[QUAL].dpr));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  $('#scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Ігровий стіл');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0a09);
  scene.fog = new THREE.Fog(0x0e0a09, 30, 80);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  T.hemi = new THREE.HemisphereLight(0xffe4c0, 0x22150e, 0.6); scene.add(T.hemi); T.amb = new THREE.AmbientLight(0xfff0dc, 0.05); scene.add(T.amb);
  const lamp = new THREE.Group(); lamp.position.set(0, 21, 0); scene.add(lamp);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 6, 6), new THREE.MeshStandardMaterial({ color: 0x111111 })); cord.position.y = -3; lamp.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.1, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b3a2e, metalness: .6, roughness: .4, side: THREE.DoubleSide })); shade.position.y = -6.4; lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.32, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); bulb.position.y = -6.9; lamp.add(bulb); T.bulb = bulb;
  const spot = new THREE.SpotLight(0xffcf8a, 2.3, 50, Math.PI / 4.4, 0.55, 1.2);
  spot.position.y = -6.9; spot.castShadow = true; spot.shadow.mapSize.set(QUALITY[QUAL].shadow, QUALITY[QUAL].shadow); spot.shadow.bias = -0.0005; spot.shadow.camera.near = 4; spot.shadow.camera.far = 30;
  lamp.add(spot); spot.target.position.set(0, 0, 0); scene.add(spot.target); T.spot = spot;
  T.lamp = lamp;
  const rim = new THREE.DirectionalLight(0x86a8ff, 0.32); rim.position.set(-10, 7, -12); scene.add(rim); T.rim = rim;
  T.warm = new THREE.PointLight(0xff9244, 0.7, 34); T.warm.position.set(10, 4, 9); scene.add(T.warm);
  T.flash = new THREE.PointLight(0xff3020, 0, 14); T.flash.position.set(0, 3, 0); scene.add(T.flash);

  const wood = woodTex(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: .5, metalness: .05 }); T.woodMat = woodMat;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 9.1, 0.6, 80), woodMat); table.receiveShadow = true; scene.add(table);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.6, 7, 28), woodMat); ped.position.y = -3.8; scene.add(ped);
  T.feltMat = new THREE.MeshStandardMaterial({ map: feltTex(), roughness: .95 });
  const felt = new THREE.Mesh(new THREE.CircleGeometry(FELT_R, 120), T.feltMat);
  felt.rotation.x = -Math.PI / 2; felt.position.y = TABLE_Y + 0.002; felt.receiveShadow = true; scene.add(felt);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9922f, metalness: .85, roughness: .3 }); T.brass = brass;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(FELT_R + .02, .07, 10, 140), brass); ring.rotation.x = Math.PI / 2; ring.position.y = TABLE_Y + .02; scene.add(ring);
  T.floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), T.floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -7.3; floor.receiveShadow = true; scene.add(floor);

  cardGeo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
  edgeMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: .8 });
  BACKS = { door: backTex('door'), treasure: backTex('treasure') };

  const stackEdge = canvasTex(64, 64, (g) => { g.fillStyle = '#e6dccb'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(80,60,40,.35)'; for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 64, 1); });
  for (const kind of ['door', 'treasure']) {
    const top = new THREE.MeshStandardMaterial({ map: BACKS[kind], roughness: .6, emissive: 0x000000 });
    const side = new THREE.MeshStandardMaterial({ map: stackEdge, roughness: .8 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), [side, side, top, side, side, side]);
    m.position.set(DECK_POS[kind][0], TABLE_Y, DECK_POS[kind][1]); m.castShadow = true; m.receiveShadow = true;
    m.userData.deck = kind; m.userData.topMat = top; scene.add(m); T.decks[kind] = m;
    const d = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, new THREE.MeshStandardMaterial({ roughness: .62 }), new THREE.MeshStandardMaterial({ map: BACKS[kind], roughness: .62 }), edgeMat, edgeMat]);
    applyPose(d, discardPose(kind)); d.position.y = TABLE_Y + .02; d.visible = false; d.castShadow = true; d.receiveShadow = true; scene.add(d); T.disc[kind] = d;
  }

  // кубик
  const dmats = [3, 4, 1, 6, 2, 5].map(v => new THREE.MeshStandardMaterial({ map: dieFaceTex(v), roughness: .35 }));
  T.die = new THREE.Mesh(new THREE.BoxGeometry(.56, .56, .56), dmats); T.die.castShadow = true; T.die.visible = false; scene.add(T.die);

  // маркер ходу
  T.marker = new THREE.Mesh(new THREE.TorusGeometry(.62, .09, 12, 56), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .95 }));
  T.marker.rotation.x = Math.PI / 2; T.marker.visible = false; scene.add(T.marker);
  const beamTex = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.75, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  T.beam = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, 5.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd36b, map: beamTex, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  T.beam.visible = false; scene.add(T.beam);
  T.disc = T.disc || {};
  T.glow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ color: 0xffd36b, map: T.dot || dotTex(), transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  T.glow.rotation.x = -Math.PI / 2; T.glow.visible = false; scene.add(T.glow);

  // пил у світлі лампи
  T.dot = dotTex();
  const N = 520, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = Math.random() * 12, a = Math.random() * 6.28; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.6 + Math.random() * 12; pos[i * 3 + 2] = Math.sin(a) * r; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  T.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: .07, map: T.dot, color: 0xffd9a0, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(T.dust);

  applySkin(SKIN_ID);
  syncDeck('door'); syncDeck('treasure');
  bindPointer();
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe($('#dock'));
  resize();
  applyQuality(QUAL);
  requestAnimationFrame(loop);
}

function syncDeck(kind) {
  const m = T.decks[kind]; if (!m) return;
  const n = (kind === 'door' ? G.doorDeck : G.treasureDeck).length;
  const h = Math.max(.001, n * .014); m.scale.y = h; m.position.y = TABLE_Y + h / 2; m.visible = n > 0;
}
function syncDiscardTop(kind) {
  const m = T.disc[kind]; if (!m) return;
  const pile = kind === 'door' ? G.doorDiscard : G.treasureDiscard;
  if (!pile.length) { m.visible = false; return; }
  const top = pile[pile.length - 1];
  m.material[2].map = faceTex(top); m.material[2].needsUpdate = true; m.userData.card = top;
  m.position.y = TABLE_Y + .015 + Math.min(pile.length, 30) * .004; m.rotation.y = (top.uid % 7 - 3) * .03; m.visible = true;
}

/* --- місця гравців --- */
function plateDraw(p) {
  const t = p.seat.plateTex, g = t.userData.g, c = t.userData.canvas, w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  rr(g, 6, 14, w - 12, h - 28, 46); g.fillStyle = 'rgba(16,11,9,.86)'; g.fill();
  g.lineWidth = 4; g.strokeStyle = p.idx === G.cur ? '#e0a93b' : 'rgba(224,169,59,.35)'; g.stroke();
  g.fillStyle = p.color; g.beginPath(); g.arc(62, h / 2, 40, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#15100d'; g.font = '50px Underdog, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(p.level), 62, h / 2 + 3);
  g.fillStyle = '#f3e9d8'; g.textAlign = 'left'; g.font = '700 40px Rubik, sans-serif';
  let name = p.name; while (g.measureText(name).width > w - 140 && name.length > 3) name = name.slice(0, -2) + '…';
  g.fillText(name, 118, h / 2 + 2);
  t.needsUpdate = true;
}
function buildSeat(p) {
  const grp = new THREE.Group(); grp.rotation.y = seatAngle(p.idx); scene.add(grp);
  const equipG = new THREE.Group(); grp.add(equipG);
  const plateTex = canvasTex(512, 128, () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: plateTex, transparent: true, depthWrite: false }));
  sprite.userData.player = p.idx; sprite.scale.set(3.2, .8, 1); sprite.position.set(0, 1.05, 8.35); grp.add(sprite);
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false });
  const arc = new THREE.Mesh(new THREE.RingGeometry(7.95, 8.18, 40, 1, -Math.PI / 2 - .38, .76), arcMat);
  arc.rotation.x = -Math.PI / 2; arc.position.y = TABLE_Y + .006; grp.add(arc);
  p.seat = { grp, equipG, plateTex, sprite, arc, arcMat, anchor: seatAnchor(p.idx) };
  plateDraw(p); syncSeat(p);
}
function destroySeat(p) {
  if (!p.seat) return;
  [...p.seat.equipG.children].forEach(disposeMesh);
  scene.remove(p.seat.grp);
  p.seat.plateTex.dispose(); p.seat.arcMat.dispose();
}
function syncSeat(p) {
  if (!p.seat) return;
  const grp = p.seat.equipG; [...grp.children].forEach(disposeMesh);
  const items = [p.raceCard, p.clsCard, ...p.gear].filter(Boolean); const n = items.length;
  const gap = Math.min(.8, 5.4 / Math.max(1, n));
  items.forEach((c, i) => {
    const m = cardMesh(c); m.scale.setScalar(.62);
    m.position.set((i - (n - 1) / 2) * gap, TABLE_Y + .03 + i * .003, 6.4); m.rotation.set(-.06, 0, 0); grp.add(m);
  });
  plateDraw(p);
}
function levelFx(p, up) {
  const a = p.seat.anchor; sfx(up ? 'levelUp' : 'levelDown');
  ringFx(a, up ? 0xffd36b : 0xff4a3a);
  if (up) burst(a.clone().setY(.8), [p.color, '#ffd36b', '#ffffff'], 70, 3.5, 1.1);
  else flashAt(a.clone().setY(2), 2.5, 600);
}
async function changeLevel(p, delta, allowWin = false) {
  const before = p.level;
  const cap = allowWin ? G.goal : Math.max(before, G.goal - 1);
  p.level = clamp(before + delta, 1, cap);
  if (p.level !== before) {
    log(`${nameTag(p)} ${p.level > before ? 'піднімається' : 'падає'} на ${p.level}-й рівень.`);
    levelFx(p, p.level > before); renderUI(); await wait(550);
  } else if (delta > 0 && !allowWin && before >= G.goal - 1) log(`${nameTag(p)} не може отримати ${G.goal}-й рівень так — лише перемогою над монстром.`);
  plateDraw(p);
  if (p.level >= G.goal) await gameOver(p);
  else if (G.goal > 10 && before < EPIC_AT && p.level >= EPIC_AT) { say(`${p.name} в епічній зоні: монстри для нього тепер ×2!`, 2800); log(`${nameTag(p)} входить в епічну зону: рівні монстрів для нього подвоюються.`); }
}

/* --- ефекти --- */
function emitFx(type, a) { if (NET.role === 'host') netAll({ t: 'fx', type, a }); }
function flashAt(pos, i = 2.5, dur = 600, color = 0xff3020, quiet = false) {
  if (!quiet) emitFx('flash', { x: pos.x, y: pos.y, z: pos.z, i, dur, color });
  T.flash.color.setHex(color); T.flash.position.copy(pos); animate(dur, t => { T.flash.intensity = i * Math.sin(Math.PI * Math.min(1, t * 1.6 + .37)); });
}
function ringFx(pos, color, dur = 900, quiet = false) {
  if (!quiet) emitFx('ring', { x: pos.x, z: pos.z, color, dur });
  const m = new THREE.Mesh(new THREE.RingGeometry(.3, .44, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, TABLE_Y + .16, pos.z); scene.add(m);
  animate(dur, t => { m.scale.setScalar(1 + t * 3.5); m.material.opacity = 1 - t; }, easeOut).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
}
function burst(pos, colors, n = 150, speed = 5.5, life = 1.4, gravity = -7, size = .16, additive = true, spread = 1, quiet = false) {
  if (!quiet) emitFx('burst', { x: pos.x, y: pos.y, z: pos.z, colors, n, speed, life, gravity, size, additive, spread });
  const geo = new THREE.BufferGeometry(); const P = new Float32Array(n * 3), C = new Float32Array(n * 3), V = [];
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.x + (Math.random() - .5) * spread; P[i * 3 + 1] = pos.y + (Math.random() - .5) * spread * .5; P[i * 3 + 2] = pos.z + (Math.random() - .5) * spread;
    V.push(new THREE.Vector3(Math.random() - .5, Math.random() * .9 + .2, Math.random() - .5).normalize().multiplyScalar(speed * (.35 + Math.random() * .8)));
    col.set(colors[rnd(colors.length)]); C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const mat = new THREE.PointsMaterial({ size, map: T.dot, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  T.fx.push({ pts, V, t: 0, life, gravity });
}
function hitFx(p) { sfx('hit'); ringFx(p.seat.anchor, 0xff4a3a); flashAt(p.seat.anchor.clone().setY(2), 3, 600); }
async function roar(m) {
  playSfx('roar');
  if (m.userData.card) emitFx('roar', { uid: m.userData.card.uid });
  const p0 = poseOf(m); m.userData.anim = true;
  T.flash.color.setHex(0xff3020); T.flash.position.set(m.position.x, 2.5, m.position.z);
  await animate(650, t => {
    const k = Math.sin(t * Math.PI);
    applyPose(m, { ...p0, s: p0.s * (1 + k * .12), flip: Math.sin(t * Math.PI * 9) * .06 * (1 - t), y: p0.y + k * .25 });
    T.flash.intensity = k * 2.2;
  });
  applyPose(m, p0); T.flash.intensity = 0; m.userData.anim = false;
}
async function lunge(m) {
  if (!m) return; if (m.userData.card) emitFx('lunge', { uid: m.userData.card.uid });
  const p0 = poseOf(m); const w = rotY(0, 0, 1.4, cam.az); m.userData.anim = true;
  await animate(380, t => { const k = Math.sin(t * Math.PI); applyPose(m, { ...p0, x: p0.x + w.x * k, z: p0.z + w.z * k, y: p0.y + k * .3 }); });
  applyPose(m, p0); m.userData.anim = false;
}
async function defeatAnim(m) {
  playSfx('defeat');
  if (m.userData.card) emitFx('defeat', { uid: m.userData.card.uid });
  const p0 = poseOf(m); m.userData.anim = true;
  await animate(300, t => applyPose(m, { ...p0, flip: Math.sin(t * Math.PI * 8) * .12, s: p0.s * (1 + t * .1) }));
  burst(m.position, ['#ffd36b', '#ff9a3c', '#fff1c4', '#ef6b5d'], 190, 6.5, 1.5, -7, .16, true, 1, true);
  await animate(420, t => applyPose(m, { ...p0, s: p0.s * (1.1 - t * 1.1) + .001, yaw: p0.yaw + t * 4, y: p0.y + t * .6 }), easeOut);
  disposeMesh(m);
}
async function rollDie(q, forced = 0) {
  const v = forced || 1 + rnd(6);
  playSfx('dice');
  emitFx('die', { who: q.idx, v, ok: v + fleeBonus(q) >= 5 });
  const FACE = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] }[v];
  const qFinal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(FACE[0], FACE[1], FACE[2])));
  const axis = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
  const spins = Math.PI * 2 * (3 + Math.random() * 2);
  const from = rotY(0, 3, 6.4, seatAngle(q.idx)); const to = rotY((Math.random() - .5) * 1.2, TABLE_Y + .28, 2.3, cam.az);
  T.die.visible = true;
  await animate(1150, (e, t) => {
    T.die.position.set(from.x + (to.x - from.x) * e, to.y + (from.y - to.y) * Math.pow(1 - e, 2) + Math.pow(1 - t, 1.5) * Math.abs(Math.sin(t * Math.PI * 3)) * 1.4, from.z + (to.z - from.z) * e);
    T.die.quaternion.copy(qFinal).multiply(new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - e)));
  }, easeOut);
  T.die.position.set(to.x, to.y, to.z); T.die.quaternion.copy(qFinal);
  ringFx(T.die.position, v + fleeBonus(q) >= 5 ? 0x7fd081 : 0xff4a3a, 700, true);
  await wait(450);
  return v;
}
function confetti(color) {
  emitFx('confetti', { color });
  for (let i = 0; i < 4; i++) setTimeout(() => burst(new THREE.Vector3((Math.random() - .5) * 8, 9, (Math.random() - .5) * 8), [color, '#ffd36b', '#ffffff', '#ef6b5d', '#5aa9e2', '#86cf6e'], 260, 5, 4.5, -2.6, .22, false, 6, true), i * 450);
}
function camTo(az) {
  const a0 = cam.az; let d = ((az - a0) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (Math.abs(d) < .001) return Promise.resolve();
  const u0 = cam.userAz, e0 = cam.userEl;
  return animate(1100, t => { cam.az = a0 + d * t; cam.userAz = u0 * (1 - t); cam.userEl = e0 * (1 - t); });
}

/* --- цикл --- */
let lastT = performance.now(), lastShadow = 0, camSig = '', modalEl = null;
T.lastInput = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const Q = QUALITY[QUAL];
  const sig = (cam.az + cam.userAz).toFixed(4) + '|' + (cam.el + cam.userEl).toFixed(4) + '|' + cam.zoom.toFixed(4) + '|' + Math.round(cam.offK || 0) + '|' + Math.round(cam.offTarget || 0);
  const moving = T.anims.length > 0 || T.fx.length > 0 || sig !== camSig || now - T.lastInput < 700;
  modalEl = modalEl || $('#modal');
  const fps = moving ? Q.fpsActive : !modalEl.hidden ? 10 : Q.fpsIdle;
  if (now - lastT < 1000 / fps - 4) return;
  camSig = sig;
  const dt = Math.min(.1, (now - lastT) / 1000); lastT = now;
  if (!Q.live && (T.anims.length || T.fx.length || now - lastShadow > 1000)) { renderer.shadowMap.needsUpdate = true; lastShadow = now; }
  for (let i = T.anims.length - 1; i >= 0; i--) {
    const a = T.anims[i]; const t = Math.min(1, (now - a.t0) / a.dur);
    a.fn(a.e(t), t);
    if (t >= 1) { T.anims.splice(i, 1); a.res(); }
  }
  for (let i = T.fx.length - 1; i >= 0; i--) {
    const f = T.fx[i]; f.t += dt; const P = f.pts.geometry.attributes.position.array;
    for (let j = 0; j < f.V.length; j++) {
      const v = f.V[j]; v.y += f.gravity * dt;
      P[j * 3] += v.x * dt; P[j * 3 + 1] += v.y * dt; P[j * 3 + 2] += v.z * dt;
      if (P[j * 3 + 1] < TABLE_Y + .03) { P[j * 3 + 1] = TABLE_Y + .03; v.y *= -.3; v.x *= .6; v.z *= .6; }
    }
    f.pts.geometry.attributes.position.needsUpdate = true;
    f.pts.material.opacity = Math.max(0, 1 - Math.pow(f.t / f.life, 2));
    if (f.t >= f.life) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); T.fx.splice(i, 1); }
  }
  const s = now / 1000;
  if (!reduceMotion) {
    if (Q.sway) { T.lamp.rotation.z = Math.sin(s * .55) * .035; T.lamp.rotation.x = Math.cos(s * .41) * .025; }
    T.warm.intensity = (T.warmBase || 0) * (1 + Math.sin(s * 7.3) * .08 + Math.sin(s * 13.1) * .06);
    const P = T.dust.geometry.attributes.position.array, mode = T.dustMode;
    for (let i = 0; i < P.length; i += 3) {
      if (mode === 'snow') { P[i + 1] -= dt * (.7 + (i % 7) * .06); P[i] += Math.sin(s * .8 + i) * dt * .25; if (P[i + 1] < TABLE_Y + .05) { P[i + 1] = 14; } }
      else if (mode === 'float') { P[i + 1] += Math.sin(s * .5 + i) * dt * .08; P[i] += Math.cos(s * .3 + i) * dt * .06; }
      else { P[i + 1] += dt * .12; P[i] += Math.sin(s * .3 + i) * dt * .05; if (P[i + 1] > 12.6) P[i + 1] = .6; }
    }
    T.dust.geometry.attributes.position.needsUpdate = true;
    if (mode === 'cone') T.dust.scale.set(.5, 1, .5); else T.dust.scale.set(1, 1, 1);
    if (T.garlandMats) T.garlandMats.forEach((m, i) => m.color.copy(m.userData.base).multiplyScalar(.3 + .7 * (.5 + .5 * Math.sin(s * 2.6 + i * 1.6))));
    if (T.torches) T.torches.forEach((t, i) => { const f = .85 + Math.sin(s * 9 + i) * .1 + Math.sin(s * 23 + i * 2) * .07; t.light.intensity = 1.1 * f; t.flame.scale.setScalar(1.15 * f); });
    if (T.stars) T.stars.material.opacity = .7 + Math.sin(s * 1.3) * .2;
  }
  // маркер ходу + підсвітка колоди
  const p = cur();
  if (p && p.seat && !G.over) {
    if (T.markerFor !== p) { T.markerFor = p; [T.marker, T.beam, T.glow].forEach(o => o.material.color.set(p.color)); }
    T.marker.visible = T.beam.visible = T.glow.visible = true;
    T.marker.position.copy(p.seat.anchor).setY(TABLE_Y + .05);
    T.marker.scale.setScalar(1 + Math.sin(s * 4) * .1); T.marker.material.opacity = .75 + Math.sin(s * 4) * .25;
    T.beam.position.copy(p.seat.anchor).setY(TABLE_Y + 2.75); T.beam.material.opacity = .32 + Math.sin(s * 3) * .14; T.beam.rotation.y = s * .5;
    T.glow.position.copy(p.seat.anchor).setY(TABLE_Y + .012); T.glow.material.opacity = .55 + Math.sin(s * 4) * .2;
  } else { T.marker.visible = false; if (T.beam) T.beam.visible = T.glow.visible = false; }
  for (const q of G.players) if (q.seat) q.seat.arcMat.opacity = q === p ? .55 + Math.sin(s * 3) * .3 : .22;
  const kickable = canKickNow();
  T.decks.door && T.decks.door.userData.topMat.emissive.setRGB(kickable ? .25 + Math.sin(s * 4) * .2 : 0, kickable ? .14 + Math.sin(s * 4) * .1 : 0, 0);
  // камера
  if (cam.offK != null && Math.abs(cam.offK - cam.offTarget) > .5) { cam.offK += (cam.offTarget - cam.offK) * Math.min(1, dt * 4); applyView(); }
  const az = cam.az + cam.userAz, el = clamp(cam.el + cam.userEl, .25, 1.35), d = cam.dist * cam.zoom;
  camera.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d + .5, Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(0, .5, 0);
  scene.fog.near = d + 6; scene.fog.far = d + 48;
  renderer.render(scene, camera);
}
let viewW = 0, viewH = 0;
function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  const dock = $('#dock').getBoundingClientRect().height, top = $('#topbar').getBoundingClientRect().height;
  cam.offTarget = Math.round(dock - top);
  if (w !== viewW || h !== viewH || cam.offK == null) {
    viewW = w; viewH = h; renderer.setSize(w, h);
    cam.offK = cam.offTarget;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (w / (h + Math.abs(cam.offK)));
    cam.dist = clamp(9.2 / tanH * .92, 19.5, 32);
    cam.el = w / h < 1 ? 1.0 : .8;
    applyView();
  }
}
function applyView() {
  const w = viewW, h = viewH, k = Math.round(cam.offK);
  const fullH = h + Math.abs(k);
  camera.aspect = w / fullH;
  camera.setViewOffset(w, fullH, 0, k > 0 ? k : 0, w, h);
  camera.updateProjectionMatrix();
}

/* --- підказка-збільшення карти на столі --- */
const canHover = matchMedia('(hover: hover)').matches;
let peekUid = 0;
function showPeek(c, e) {
  const el = $('#peek'); if (peekUid !== c.uid) { el.innerHTML = cardHTML(c, 'big'); peekUid = c.uid; }
  el.hidden = false; const w = el.offsetWidth, h = el.offsetHeight;
  let x = e.clientX + 18, y = e.clientY - h / 2; if (x + w > innerWidth - 8) x = e.clientX - w - 18;
  el.style.left = Math.max(8, x) + 'px'; el.style.top = clamp(y, 8, innerHeight - h - 8) + 'px';
}
function hidePeek() { const el = $('#peek'); if (el) el.hidden = true; peekUid = 0; }
function combatMeshes() {
  if (NET.role === 'client') return [...NET.mirror.values()];
  const cb = G.combat; if (!cb) return [];
  return [...cb.mons.map(x => x.m).filter(Boolean), ...cb.meshes.values()];
}

/* --- вказівник: обертання, масштаб, клік --- */
function bindPointer() {
  const el = renderer.domElement; const ptrs = new Map(); let down = null, pinch0 = 0, zoom0 = 1;
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  const pick = (e) => {
    const r = el.getBoundingClientRect(); v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v2, camera);
    const objs = [T.decks.door, T.decks.treasure, T.disc.door, T.disc.treasure];
    objs.push(...combatMeshes());
    G.players.forEach(p => p.seat && objs.push(...p.seat.equipG.children, p.seat.sprite));
    const hit = ray.intersectObjects(objs.filter(o => o && o.visible), false)[0];
    return hit ? hit.object : null;
  };
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); down = { x: e.clientX, y: e.clientY, moved: 0 }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = cam.zoom; } });
  el.addEventListener('pointermove', e => { T.lastInput = performance.now();
    const prev = ptrs.get(e.pointerId);
    if (!prev) { const o = pick(e); el.style.cursor = o && (o.userData.card || o.userData.player != null || (o === T.decks.door && canKickNow())) ? 'pointer' : 'grab'; if (o && o.userData.card && canHover) showPeek(o.userData.card, e); else hidePeek(); return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y; prev.x = e.clientX; prev.y = e.clientY;
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) cam.zoom = clamp(zoom0 * pinch0 / d, .55, 1.6); return; }
    cam.userAz -= dx * .006; cam.userEl = clamp(cam.userEl + dy * .004, -.45, .55);
    el.style.cursor = 'grabbing';
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (down && down.moved < 7 && ptrs.size === 0) {
      const o = pick(e);
      if (o === T.decks.door && canKickNow()) dispatch({ k: 'kick' });
      else if (o && o.userData.player != null) openCharSheet(o.userData.player);
      else if (o && o.userData.card) openCardMenu(o.userData.card, 'view');
    }
    if (ptrs.size === 0) down = null;
    el.style.cursor = 'grab';
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', hidePeek); el.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; });
  el.addEventListener('wheel', e => { e.preventDefault(); T.lastInput = performance.now(); cam.zoom = clamp(cam.zoom * (1 + e.deltaY * .0012), .55, 1.6); }, { passive: false });
  el.addEventListener('dblclick', () => animate(500, (t) => { cam.userAz *= (1 - t); cam.userEl *= (1 - t); cam.zoom += (1 - cam.zoom) * t; }));
}
